'use strict';

const { app, BrowserWindow, ipcMain, powerMonitor, systemPreferences, screen, clipboard, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const { execFile, spawn } = require('child_process');
const { loadConfig, saveConfig } = require('./config.cjs');
const { captureScreen, analyzeScreen } = require('./ai-analyzer.cjs');
const QRCode = require('qrcode');

const isDev     = process.env.NODE_ENV === 'development';
const DATA_FILE = path.join(app.getPath('userData'), 'surzo_sessions.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Load / save sessions from ~/Library/Application Support/surzo-desktop/
function loadSessions() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function persistSessions(sessions) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

// ─── Window Tracker (AppleScript) ────────────────────────────────────────────
// Requires Accessibility permission: System Settings → Privacy & Security → Accessibility

const CHROME_LIKE = new Set(['Google Chrome', 'Brave Browser', 'Microsoft Edge', 'Chromium', 'Arc']);

function getActiveWindow() {
  return new Promise((resolve) => {
    // Step 1: get frontmost app name
    execFile('osascript', [
      '-e', 'tell application "System Events"',
      '-e', 'set fp to first application process whose frontmost is true',
      '-e', 'return name of fp',
      '-e', 'end tell',
    ], { timeout: 3000 }, (err, appOut) => {
      if (err || !appOut) { resolve(null); return; }
      const appName = appOut.trim();

      // Step 2: get tab title for browsers, window name otherwise
      let script2;
      if (CHROME_LIKE.has(appName)) {
        script2 = [
          '-e', `tell application "${appName}"`,
          '-e', 'return title of active tab of front window',
          '-e', 'end tell',
        ];
      } else if (appName === 'Safari' || appName === 'Safari Technology Preview') {
        script2 = [
          '-e', 'tell application "Safari"',
          '-e', 'return name of current tab of front window',
          '-e', 'end tell',
        ];
      } else {
        script2 = [
          '-e', 'tell application "System Events"',
          '-e', `set fp to first application process whose name is "${appName}"`,
          '-e', 'if (count windows of fp) > 0 then return name of first window of fp',
          '-e', 'return ""',
          '-e', 'end tell',
        ];
      }

      execFile('osascript', script2, { timeout: 3000 }, (err2, titleOut) => {
        const title = (!err2 && titleOut) ? titleOut.trim() : '';
        resolve({ app: appName, title });
      });
    });
  });
}

// ─── Window Context Builder ───────────────────────────────────────────────────

const BROWSERS = new Set(['Google Chrome','Safari','Firefox','Arc','Brave Browser','Microsoft Edge','Chromium']);

// Sites with deterministic scores — AI not needed, saves time and avoids hallucination
// Order matters: more specific keys (e.g. 'google scholar') must precede looser ones.
const KNOWN_SITES = {
  // ─── Productive: docs, dev, research, learning (70-90) ───
  'developer.mozilla': { focusScore: 88, distraction: 'none', isOnTask: true },
  mdn:                 { focusScore: 88, distraction: 'none', isOnTask: true },
  'stack overflow':    { focusScore: 85, distraction: 'none', isOnTask: true },
  stackoverflow:       { focusScore: 85, distraction: 'none', isOnTask: true },
  'github.com':        { focusScore: 85, distraction: 'none', isOnTask: true },
  github:              { focusScore: 82, distraction: 'none', isOnTask: true },
  gitlab:              { focusScore: 82, distraction: 'none', isOnTask: true },
  'developer.apple':   { focusScore: 85, distraction: 'none', isOnTask: true },
  'learn.microsoft':   { focusScore: 85, distraction: 'none', isOnTask: true },
  'react.dev':         { focusScore: 85, distraction: 'none', isOnTask: true },
  'nextjs.org':        { focusScore: 85, distraction: 'none', isOnTask: true },
  'vercel.com':        { focusScore: 80, distraction: 'none', isOnTask: true },
  'supabase':          { focusScore: 82, distraction: 'none', isOnTask: true },
  'docs.':             { focusScore: 82, distraction: 'none', isOnTask: true },
  'npmjs':             { focusScore: 80, distraction: 'none', isOnTask: true },
  pypi:                { focusScore: 80, distraction: 'none', isOnTask: true },
  'crates.io':         { focusScore: 80, distraction: 'none', isOnTask: true },
  arxiv:               { focusScore: 85, distraction: 'none', isOnTask: true },
  'google scholar':    { focusScore: 85, distraction: 'none', isOnTask: true },
  pubmed:              { focusScore: 85, distraction: 'none', isOnTask: true },
  'researchgate':      { focusScore: 82, distraction: 'none', isOnTask: true },
  wikipedia:           { focusScore: 78, distraction: 'none', isOnTask: true },
  zenn:                { focusScore: 82, distraction: 'none', isOnTask: true },
  qiita:               { focusScore: 82, distraction: 'none', isOnTask: true },
  'docs.google':       { focusScore: 80, distraction: 'none', isOnTask: true },
  'notion.so':         { focusScore: 78, distraction: 'none', isOnTask: true },
  notion:              { focusScore: 78, distraction: 'none', isOnTask: true },
  // AI tools (treated as productive assistants)
  chatgpt:             { focusScore: 75, distraction: 'none', isOnTask: true },
  'claude.ai':         { focusScore: 78, distraction: 'none', isOnTask: true },
  gemini:              { focusScore: 75, distraction: 'none', isOnTask: true },
  perplexity:          { focusScore: 82, distraction: 'none', isOnTask: true },
  'anthropic':         { focusScore: 75, distraction: 'none', isOnTask: true },
  // ─── Hard distractions (0-14) ───
  youtube: { focusScore: 8,  distraction: 'high',   isOnTask: false },
  netflix: { focusScore: 5,  distraction: 'high',   isOnTask: false },
  tiktok:  { focusScore: 5,  distraction: 'high',   isOnTask: false },
  twitch:  { focusScore: 7,  distraction: 'high',   isOnTask: false },
  'amazon prime': { focusScore: 5, distraction: 'high', isOnTask: false },
  'disney+': { focusScore: 5, distraction: 'high',  isOnTask: false },
  hulu:    { focusScore: 5,  distraction: 'high',   isOnTask: false },
  // Social media (5-14)
  twitter: { focusScore: 10, distraction: 'high',   isOnTask: false },
  'x.com': { focusScore: 10, distraction: 'high',   isOnTask: false },
  instagram:{ focusScore: 8, distraction: 'high',   isOnTask: false },
  facebook:{ focusScore: 8,  distraction: 'high',   isOnTask: false },
  reddit:  { focusScore: 12, distraction: 'high',   isOnTask: false },
  tiktok:  { focusScore: 5,  distraction: 'high',   isOnTask: false },
  linkedin:{ focusScore: 18, distraction: 'medium', isOnTask: false },
  // Shopping (off task)
  amazon:    { focusScore: 18, distraction: 'medium', isOnTask: false },
  rakuten:   { focusScore: 18, distraction: 'medium', isOnTask: false },
  mercari:   { focusScore: 18, distraction: 'medium', isOnTask: false },
  yahoo:     { focusScore: 22, distraction: 'medium', isOnTask: false },
  // Maps / utility (loosely related)
  'google マップ': { focusScore: 30, distraction: 'medium', isOnTask: false },
  'google maps':   { focusScore: 30, distraction: 'medium', isOnTask: false },
  // News / semi-distraction
  'hacker news': { focusScore: 28, distraction: 'medium', isOnTask: false },
  ycombinator:   { focusScore: 28, distraction: 'medium', isOnTask: false },
  // Email (context-dependent, treat as medium)
  gmail:   { focusScore: 35, distraction: 'low', isOnTask: false },
  outlook: { focusScore: 35, distraction: 'low', isOnTask: false },
};

function extractSiteName(title) {
  if (!title) return '';
  const SKIP = new Set(['google chrome','safari','firefox','arc','brave','edge','chromium','microsoft edge']);
  // Try splitting on " - " or " | " or " – ", take last non-browser segment
  const parts = title.split(/\s[-|–]\s|\s\|\s/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = parts[i].trim();
    if (c && !SKIP.has(c.toLowerCase())) return c;
  }
  return parts[0].trim();
}

function lookupKnownSite(siteName, title) {
  const text = `${siteName} ${title}`.toLowerCase();
  // Pass 1: distractions/penalties win first (so "GitHub Tutorial - YouTube" → YouTube)
  for (const [key, val] of Object.entries(KNOWN_SITES)) {
    if (val.distraction !== 'none' && text.includes(key)) {
      return { ...val, topApp: key, note: `Known: ${key}` };
    }
  }
  // Pass 2: productive matches
  for (const [key, val] of Object.entries(KNOWN_SITES)) {
    if (text.includes(key)) return { ...val, topApp: key, note: `Known: ${key}` };
  }
  return null;
}

// Native apps with known purpose — skip AI entirely
const NATIVE_APP_SCORES = {
  // Code editors / IDEs
  cursor: 88, 'visual studio code': 88, code: 88, xcode: 88, zed: 88,
  sublime: 85, nova: 85, intellij: 88, webstorm: 88, pycharm: 88,
  'android studio': 88, terminal: 82, iterm: 82, iterm2: 82,
  // Design
  figma: 85, sketch: 85, photoshop: 85, illustrator: 85, 'affinity designer': 85,
  // Writing / notes
  notion: 78, obsidian: 78, bear: 78, word: 80, pages: 80, ulysses: 80,
  // Video editing
  'final cut pro': 85, davinci: 85, 'davinci resolve': 85, premiere: 85,
  // Productivity
  excel: 75, numbers: 75, keynote: 75, powerpoint: 75,
  // AI tools (treated as work tools)
  chatgpt: 70,
  // Communication (moderate — work context)
  slack: 55, teams: 55, zoom: 60,
  // Messaging apps — personal, off-task
  line: 18, 'line app': 18, whatsapp: 18, telegram: 20, signal: 20,
  messages: 22, imessage: 22, discord: 30,
  // Clearly not work
  spotify: 30, 'apple music': 30, vlc: 20, quicktime: 20,
  // Games
  steam: 10, 'game center': 10,
};

function scoreNativeApp(appName, category) {
  const key = appName.toLowerCase();
  // Check exact match first
  for (const [k, score] of Object.entries(NATIVE_APP_SCORES)) {
    if (key.includes(k)) {
      const distraction = score >= 65 ? 'none' : score >= 40 ? 'low' : 'medium';
      return { focusScore: score, distraction, isOnTask: score >= 55, topApp: appName, note: 'native app' };
    }
  }
  // Category-matched app → assume on task
  if (appMatchesCategory(appName, category)) {
    return { focusScore: 80, distraction: 'none', isOnTask: true, topApp: appName, note: 'category match' };
  }
  return null; // unknown native app → let AI decide
}

function buildWindowContext(app, title) {
  if (BROWSERS.has(app) && title) {
    const site = extractSiteName(title);
    // Give AI the site name prominently, then page title for context
    return `site="${site}", page="${title.slice(0, 80)}"`;
  }
  return `app="${app}"` + (title ? `, window="${title.slice(0, 80)}"` : '');
}

// ─── Scoring (inline — mirrors src/utils/scoring.js for main-process use) ────

const CATEGORY_APPS = {
  Programming:    ['code', 'visual studio code', 'xcode', 'terminal', 'iterm', 'cursor', 'nova', 'intellij', 'webstorm', 'pycharm', 'android studio', 'zed', 'sublime', 'safari', 'chrome', 'firefox', 'arc', 'brave', 'edge'],
  Writing:        ['word', 'pages', 'notion', 'obsidian', 'bear', 'ulysses', 'scrivener', 'typora', 'ia writer'],
  Design:         ['figma', 'sketch', 'photoshop', 'illustrator', 'affinity', 'canva', 'xd'],
  Research:       ['safari', 'chrome', 'firefox', 'arc', 'brave', 'edge', 'opera'],
  'Video Editing':['final cut', 'davinci', 'premiere', 'imovie', 'after effects', 'resolve'],
  Study:          ['anki', 'notion', 'obsidian', 'bear', 'preview', 'kindle', 'goodreader', 'safari', 'chrome', 'firefox', 'arc', 'brave', 'edge'],
  'Admin / Email':['mail', 'outlook', 'spark', 'slack', 'teams', 'zoom', 'calendar', 'numbers', 'excel', 'sheets'],
  'Free Work':    [],
};

const DISTRACTION_KEYWORDS = ['youtube', 'netflix', 'twitter', 'instagram', 'tiktok', 'facebook', 'reddit', 'twitch', 'line', 'whatsapp', 'telegram', 'messages'];

function appMatchesCategory(appName, category) {
  if (category === 'Free Work') return true;
  const keywords = CATEGORY_APPS[category] || [];
  const lower = appName.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function isDistraction(appName, title) {
  const text = (appName + ' ' + title).toLowerCase();
  return DISTRACTION_KEYWORDS.some(d => text.includes(d));
}

function computeScoreFromEvents(state) {
  const { sessionData, windowEvents, idleEvents, phoneEvents, activePhoneEvent, aiAnalyses, activityLog } = state;
  const totalSecs = Math.max(1, (Date.now() - sessionData.startedAt) / 1000);
  const category  = sessionData.category;

  // ── Focus Consistency ──
  const matchCount = windowEvents.filter(e => appMatchesCategory(e.app, category)).length;
  let focusConsistency = windowEvents.length > 0
    ? Math.round((matchCount / windowEvents.length) * 100)
    : 50;

  // ── Task Alignment (non-idle %) ──
  const totalIdleSecs = idleEvents.reduce((sum, e) => {
    const dur = e.endedAt
      ? (e.endedAt - e.startedAt) / 1000
      : (Date.now() - e.startedAt) / 1000;
    return sum + Math.min(dur, totalSecs);
  }, 0);
  let taskAlignment = Math.round(Math.max(0, Math.min(100,
    ((totalSecs - totalIdleSecs) / totalSecs) * 100
  )));

  // ── AI Score Blending (primary driver when available) ──
  if (aiAnalyses && aiAnalyses.length >= 1) {
    const recent = aiAnalyses.slice(-4);
    const avgAiFocus  = Math.round(recent.reduce((s, a) => s + (a.focusScore || 0), 0) / recent.length);
    const onTaskRatio = recent.filter(a => a.isOnTask).length / recent.length;
    focusConsistency = Math.round(focusConsistency * 0.20 + avgAiFocus * 0.80);
    taskAlignment    = Math.round(taskAlignment    * 0.20 + onTaskRatio * 100 * 0.80);
  }

  // ── Deep Work Ratio (longest uninterrupted focused block) ──
  const POLL_INTERVAL = 2; // seconds between window events
  let maxStreak = 0, streak = 0;
  for (const e of windowEvents) {
    if (appMatchesCategory(e.app, category) && e.idleSecs < 30) {
      streak += POLL_INTERVAL;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }
  const deepWorkRatio = Math.round(Math.min(100, (maxStreak / totalSecs) * 100));

  // ── Recovery & Return ──
  const longIdleCount = idleEvents.filter(e => {
    const dur = e.endedAt ? (e.endedAt - e.startedAt) / 1000 : 60;
    return dur > 60;
  }).length;
  const recoveryReturn = longIdleCount === 0 ? 65 : Math.max(15, 65 - longIdleCount * 18);

  // ── Distraction Penalty ──
  const uniqueApps   = new Set(windowEvents.map(e => e.app)).size;
  const switchRate   = uniqueApps / Math.max(1, totalSecs / 60);
  const distractHits = windowEvents.filter(e => isDistraction(e.app, e.title)).length;
  const distractPct  = windowEvents.length > 0 ? distractHits / windowEvents.length : 0;
  const distractionPenalty = Math.min(30, Math.round(switchRate * 3 + distractPct * 40));

  // ── Phone Penalty ──
  const phoneCount    = phoneEvents.filter(e => e.endedAt).length + (activePhoneEvent ? 1 : 0);
  const phoneMins     = phoneEvents.reduce((s, e) => s + (e.durationSeconds || 0) / 60, 0);
  const phonePenalty  = Math.min(15, phoneCount * 2 + phoneMins * 0.5);

  const activitySignal = computeActivitySignal(activityLog || []);

  const nowMs = Date.now();

  // Inactivity penalty: scales with duration
  const recent60  = (activityLog || []).filter(e => e.ts > nowMs - 62000);
  const recent120 = (activityLog || []).filter(e => e.ts > nowMs - 122000);
  let inactivePenalty = 0;
  if (recent120.length >= 10 && !recent120.some(e => e.isActive)) inactivePenalty = 35;
  else if (recent60.length >= 5 && !recent60.some(e => e.isActive))  inactivePenalty = 25;

  // Sustained activity bonus
  const recent5min = (activityLog || []).filter(e => e.ts > nowMs - 5 * 60000);
  const sustainBonus = recent5min.length >= 10
    ? (recent5min.filter(e => e.isActive).length / recent5min.length >= 0.85 ? 6 : 0)
    : 0;

  const base =
    0.26 * focusConsistency +
    0.22 * taskAlignment +
    0.18 * deepWorkRatio +
    0.12 * recoveryReturn +
    0.22 * activitySignal -
    0.18 * distractionPenalty;

  // Bonuses for exceptional performance
  let bonus = 0;
  if (focusConsistency >= 90 && taskAlignment >= 90) bonus += 8;
  if (activitySignal >= 85)                          bonus += 5;
  if (deepWorkRatio >= 50)                           bonus += 6;
  if (distractionPenalty === 0)                      bonus += 4;

  const raw = Math.max(0, Math.min(100, base + bonus + sustainBonus - inactivePenalty - phonePenalty));

  // Stretch distribution: compress toward center, require sustained effort for high scores
  const stretched = raw <= 55
    ? raw * 0.78
    : 55 + (raw - 55) * 1.25;
  const avg = Math.round(Math.max(0, Math.min(100, stretched)));
  // pts = avg × minutes (not inflated by 60×)
  const total = Math.round((totalSecs / 60) * avg);

  return {
    scoreBreakdown: {
      focusConsistency,
      taskAlignment,
      deepWorkRatio,
      recoveryReturn,
      activitySignal,
      distractionPenalty,
      phoneDistractionPenalty: Math.round(phonePenalty * 10) / 10,
    },
    averageWorkScore:     avg,
    totalWorkScore:       total,
    bestFocusMinutes:     Math.round(maxStreak / 60),
    deepWorkBlocks:       Math.floor(maxStreak / 600), // blocks of 10+ min
    phoneDistractionCount: phoneCount,
    totalPhoneDistractionMinutes: Math.round(phoneMins * 10) / 10,
  };
}

// ─── Live Window Score (snapshot of RIGHT NOW, last 60s only) ────────────────

function computeLiveWindowScore(activityLog, windowEvents, sessionData, currentIdleSecs, aiAnalyses) {
  const now      = Date.now();
  const category = sessionData.category;
  const currentWin = windowEvents[windowEvents.length - 1];
  const isDist    = currentWin ? isDistraction(currentWin.app, currentWin.title) : false;
  const isInTask  = currentWin ? appMatchesCategory(currentWin.app, category) : false;

  // ── Immediate overrides ──
  if (currentIdleSecs >= 90) return { score: 7,  hardDist: false };
  if (currentIdleSecs >= 45) return { score: 15, hardDist: false };

  // ── 8-second rolling window (4 ticks) ──
  const recent = activityLog.filter(e => e.ts > now - 8000);
  const n = recent.length || 1;
  const typingRatio = recent.filter(e => e.likelyTyping).length / n;
  const mouseRatio  = recent.filter(e => e.cursorMoved).length / n;
  const activeRatio = recent.filter(e => e.isActive).length / n;

  // ── Fresh AI override (within 8s) ──
  const freshAi = (aiAnalyses || []).filter(a => a.timestamp > now - 8000);
  const ai = freshAi.length > 0 ? freshAi[freshAi.length - 1] : null;

  // ── Pattern recognition (17 patterns) ──
  // Distraction checked BEFORE idle: watching YouTube without moving = distraction, not break
  let score;

  if (isDist && typingRatio > 0.4) {
    // P01 Distraction site but actively typing (comments, DMs)
    score = 18;
  } else if (isDist) {
    // P02 Distraction site, passive watching/scrolling
    score = 6;
  } else if (currentIdleSecs >= 25) {
    // P03 Medium idle — taking a break (after distraction check)
    score = 18;
  } else if (typingRatio > 0.55 && isInTask) {
    // P04 Deep focus — sustained typing in correct app (base ~70, time bonus needed to reach 90)
    score = Math.round(64 + typingRatio * 10);
  } else if (typingRatio > 0.25 && isInTask) {
    // P05 Focused work — moderate typing in correct app
    score = Math.round(50 + typingRatio * 20 + mouseRatio * 5);
  } else if (mouseRatio > 0.5 && isInTask && typingRatio < 0.1) {
    // P06 Design / reading — heavy mouse, no typing, correct app
    score = Math.round(42 + mouseRatio * 12);
  } else if (mouseRatio > 0.3 && isInTask && typingRatio < 0.1) {
    // P07 Browsing research in correct category
    score = Math.round(33 + mouseRatio * 14);
  } else if (typingRatio > 0.45 && !isInTask) {
    // P08 Typing in wrong app (side notes, unrelated work)
    score = Math.round(32 + typingRatio * 11);
  } else if (activeRatio > 0.5 && isInTask) {
    // P09 Active but unclear input, correct app
    score = Math.round(40 + activeRatio * 13);
  } else if (typingRatio > 0.15 && isInTask) {
    // P10 Light typing in correct app
    score = Math.round(37 + typingRatio * 18);
  } else if (mouseRatio > 0.3 && !isInTask) {
    // P11 Mouse activity in wrong app
    score = Math.round(22 + mouseRatio * 10);
  } else if (currentIdleSecs >= 15) {
    // P12 Pause 15-25s — thinking or reading
    score = 22;
  } else if (currentIdleSecs >= 10) {
    // P13 Pause 10-15s — short stop
    score = 27;
  } else if (currentIdleSecs >= 5) {
    // P14 Micro-pause 5-10s — brief hands-off
    score = 32;
  } else if (currentIdleSecs >= 2) {
    // P15 Tiny pause 2-5s — momentary rest
    score = 38;
  } else if (activeRatio > 0.3 && !isInTask) {
    // P16 Some activity but wrong app
    score = Math.round(25 + activeRatio * 10);
  } else {
    // P17 Minimal activity — present but not doing much
    score = Math.round(20 + activeRatio * 12 + (isInTask ? 8 : 0));
  }

  // AI sets the range; activity-based pattern score provides variation within that range
  let hardDist = isDist && !ai;
  if (ai) {
    // Blend: AI 75% (relevance) + pattern 25% (activity level) → continuous 100-level variation
    score = Math.round(ai.focusScore * 0.75 + score * 0.25);
    if (ai.distraction === 'high' || ai.distraction === 'medium') hardDist = true;
  }

  return { score: Math.round(Math.max(5, Math.min(100, score))), hardDist };
}

// ─── Activity Signal (cursor + keyboard inference) ───────────────────────────
// Each entry: { ts, isActive, likelyTyping, cursorMoved, appSwitched }
// Logged every 2s. Covers last 5 minutes.

function computeActivitySignal(log) {
  const n = log.length;
  if (n < 3) return 50;

  const now = Date.now();

  // 1-min rule: no mouse AND no keyboard → near-zero signal
  const last1min = log.filter(e => e.ts > now - 60000);
  if (last1min.length >= 5 && !last1min.some(e => e.isActive)) return 5;

  const active  = log.filter(e => e.isActive).length;
  const typing  = log.filter(e => e.likelyTyping).length;
  const moving  = log.filter(e => e.cursorMoved).length;
  const switches = log.filter(e => e.appSwitched).length;

  const activeRatio = active / n;
  const typingRatio = typing / n;
  const mouseRatio  = moving / n;
  const windowMins  = Math.max(1, (n * 2) / 60);
  const switchPenalty = Math.min(15, (switches / windowMins) * 4);

  // Sustained engagement bonus (last 5 min)
  const last5min = log.filter(e => e.ts > now - 5 * 60000);
  let sustainedBonus = 0;
  if (last5min.length >= 10) {
    const r = last5min.filter(e => e.isActive).length / last5min.length;
    if (r >= 0.85) sustainedBonus = 20;
    else if (r >= 0.70) sustainedBonus = 10;
    else if (r >= 0.55) sustainedBonus = 4;
  }

  const raw = activeRatio * 45 + typingRatio * 25 + mouseRatio * 15 - switchPenalty + sustainedBonus;
  return Math.round(Math.max(0, Math.min(110, raw)));
}

async function generateAINote(sessionData, score, apiKey) {
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{
          role: 'user',
          content: `集中セッションのデータ:
タスク="${sessionData.title}", カテゴリ=${sessionData.category}, 時間=${score.durationMinutes}分, スコア=${score.averageWorkScore}/100, 深い集中ブロック=${score.deepWorkBlocks}回, スマホチェック=${score.phoneDistractionCount}回, 集中の一貫性=${score.scoreBreakdown.focusConsistency}/100。

このユーザーへの具体的で個別最適化されたコーチングコメントを1文で日本語で書いてください。
- スコアが低ければ辛口で（甘やかさない）
- スコアが高ければ簡潔に讃える
- 20文字〜45文字
- 「素晴らしい」「お疲れ様」のような定型句は禁止
- データの具体的な数字を引いて指摘する
- 行動につながる助言にする`,
        }],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, '');
    return text && text.length > 12 && text.length < 140 ? text : null;
  } catch { return null; }
}

function generateReasons(score, category, windowEvents, phoneCount) {
  const avg  = score.averageWorkScore;
  const mins = score.durationMinutes || 1;
  const fc   = score.scoreBreakdown.focusConsistency;
  const ta   = score.scoreBreakdown.taskAlignment;
  const dw   = score.scoreBreakdown.deepWorkRatio;
  const dp   = score.scoreBreakdown.distractionPenalty;
  const phoneMins = score.totalPhoneDistractionMinutes || 0;
  const phoneRatio = mins > 0 ? phoneMins / mins : 0;
  const deepBlocks = score.deepWorkBlocks || 0;
  const bestFocus = score.bestFocusMinutes || 0;
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 11;
  const isAfternoon = hour >= 12 && hour < 17;
  const isEvening = hour >= 17 && hour < 22;
  const isLate = hour >= 22 || hour < 5;
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pos = [];
  const neg = [];

  // ── POSITIVES (data-driven, specific) ──────────────────────────────────────

  // P1: about the score with specific stretch reference
  if (avg >= 85) {
    pos.push(rnd([
      `平均スコア${avg}は上位5%レベル。${mins}分の中で${bestFocus}分の最長連続集中を出した。`,
      `スコア${avg}でフィニッシュ。${category}に意識が向き続けていた証拠。`,
      `${mins}分でavg${avg}は文句なし。同じ条件をテンプレ化して再現を狙おう。`,
    ]));
  } else if (avg >= 70) {
    pos.push(rnd([
      `安定したavg${avg}。前半・後半で大崩れせずに走り切れた。`,
      `${mins}分中、最長連続集中${bestFocus}分。良いリズムが出ていた。`,
      `スコア${avg}は実用レベル。明日もこの土台があれば充分積み上がる。`,
    ]));
  } else if (avg >= 55) {
    pos.push(rnd([
      `avg${avg}で着地。${bestFocus}分の最長集中は悪くない。ここを伸ばすのが次の課題。`,
      `${mins}分続けたこと自体に価値あり。スコアは伸びしろ。`,
    ]));
  } else if (avg >= 40) {
    pos.push(rnd([
      `${mins}分の作業を完走した。スコア${avg}は環境のノイズが大きかった可能性。`,
      `avg${avg}でも記録した意味はある。原因の特定が次のステップ。`,
    ]));
  } else {
    pos.push(rnd([
      `スコア${avg}でも記録できたこと自体が次への材料。`,
      `データを残したことが今日の収穫。明日の比較対象になる。`,
    ]));
  }

  // P2: deep work / focus consistency (specific number)
  if (deepBlocks >= 3) {
    pos.push(`深い集中ブロック${deepBlocks}回。これは10分以上の連続集中で、最も価値が高い時間帯。`);
  } else if (deepBlocks >= 1) {
    pos.push(`深い集中ブロック${deepBlocks}回 (10分以上連続)。次は${deepBlocks + 1}回を目標にしてみよう。`);
  } else if (bestFocus >= 15 && fc >= 70) {
    pos.push(`${bestFocus}分の連続集中を達成。あと数分粘ればdeep workブロックの認定圏内。`);
  }

  // P3: task alignment / phone (specific)
  if (fc >= 80) {
    pos.push(`${category}のアプリ内で時間の${fc}%を過ごした。軸ブレが少ない高品質な時間。`);
  }
  if (phoneCount === 0 && mins >= 20) {
    pos.push(`${mins}分間スマホ触らずに完走。これが標準になればスコアは自然と上がる。`);
  } else if (phoneCount === 1) {
    pos.push(`スマホは${phoneCount}回だけ。すぐ戻った復元力は評価できる。`);
  }

  // Morning bonus
  if (isMorning && avg >= 70) {
    pos.push("朝イチでこのスコア。1日の波を作る上で理想的な滑り出し。");
  }

  // ── NEGATIVES (specific data + concrete action) ───────────────────────────

  // Phone-related (priority 1 if dominant)
  if (phoneCount >= 5) {
    neg.push(`スマホ${phoneCount}回・合計${Math.round(phoneMins)}分。次回はスマホを別の部屋／引き出しに物理的に隔離してみよう。机に置いてあるだけで集中力は20%落ちる研究データもある。`);
  } else if (phoneCount >= 3) {
    neg.push(`スマホ${phoneCount}回 (約${Math.round(phoneMins)}分)。次回は25分のphone-freeブロックを1本作ることから始めよう。`);
  } else if (phoneRatio > 0.15) {
    neg.push(`セッション時間の${Math.round(phoneRatio * 100)}%をスマホに使った。1回あたり${Math.round(phoneMins / Math.max(phoneCount, 1))}分の中断は、戻ってきても集中の立ち上げに3-5分かかる。`);
  }

  // Duration too short
  if (mins < 15) {
    neg.push(`${mins}分のセッションは深い集中が立ち上がる前。脳の集中モードに入るには10-15分かかるので、最低でも25分は粘りたい。`);
  } else if (mins >= 15 && mins < 25 && deepBlocks === 0) {
    neg.push(`${mins}分で深いブロックなし。あと10分粘れば1ブロック達成できた可能性が高い。次は最低25分。`);
  }

  // Task alignment too low
  if (fc < 50 && phoneCount < 3) {
    neg.push(`${category}以外のアプリで${100 - fc}%の時間を過ごしている。開始前に関係ないアプリ・タブを物理的に閉じ、Cmd+TabもCmd+~も使わない縛りを試そう。`);
  } else if (fc < 70 && phoneCount < 3) {
    neg.push(`${category}周辺の集中率が${fc}%。SlackやSafariなど別カテゴリのアプリを1つでも閉じれば、次回は${Math.min(95, fc + 15)}%まで上がる見込み。`);
  }

  // Activity / distraction switching
  if (dp > 25 && mins >= 15) {
    neg.push(`アプリ切替コストが大きい。20分間は1つのアプリだけ開いて、それ以外を意識的に閉じる「シングルアプリチャレンジ」を試そう。`);
  } else if (ta < 55 && mins >= 20) {
    neg.push(`アイドル時間が${100 - ta}%。手が止まる時間が長い。25分タイマーを引いて「次の20分でこれを終わらせる」という具体的なマイクロゴールを置こう。`);
  }

  // Time of day
  if (isLate && avg < 60) {
    neg.push("22時以降のセッションは平均スコアが下がりがち。同じ作業を翌朝6-10時に動かすと、データ的にはスコアが10-20上がる人が多い。試してみる価値あり。");
  }

  return {
    positiveReasons: pos.slice(0, 3).filter(Boolean),
    negativeReasons: neg.slice(0, 2).filter(Boolean),
  };
}

// ─── Session State ────────────────────────────────────────────────────────────

let sessionState = null;
/*
  sessionState = {
    sessionData:       { id, title, category, plannedMinutes, trackPhone, startedAt },
    windowEvents:      [{ app, title, timestamp, idleSecs }],
    idleEvents:        [{ startedAt, endedAt? }],
    phoneEvents:       [{ id, startedAt, endedAt?, durationSeconds? }],
    activePhoneEvent:  { id, startedAt } | null,
  }
*/

let trackingTimer       = null;
let aiTimer             = null;
let mainWindow          = null;
let widgetWindow        = null;
let alertCooldownUntil  = 0;
let prevLiveZone        = null;
let targetScore         = null;
let postAlertSlowUntil  = 0;   // timestamp: enforce slow rise after alert/idle-return
let wasIdle             = false;
let permissionOk    = false;
let lastCursorPos   = { x: 0, y: 0 };
let lastAppName     = '';
let emaScore        = null;
let liveAuth        = null;   // { url, anonKey, userId } for direct Supabase writes
let lastLiveWrite   = 0;
let nowPlayingPollTimer = null;
let lastNowPlayingSig   = null;

const ALERT_MESSAGES = [
  '少し気が散っているかも。タスクに戻ってみませんか？',
  '今やるべきことは何でしょう？',
  '一度深呼吸して、作業に戻りませんか。',
  '集中のリズムを取り戻しませんか。',
  '水でも飲んで、リセットしてみませんか。',
];

// ─── Floating Widget Window ───────────────────────────────────────────────────

function isPositionOnScreen(pos) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
  return screen.getAllDisplays().some(d => {
    const b = d.bounds;
    return pos.x >= b.x - 60 && pos.x < b.x + b.width - 40 &&
           pos.y >= b.y - 20 && pos.y < b.y + b.height - 30;
  });
}

function migrateSavedWidgetPosIfNeeded() {
  // Old layout used a 130-tall window with the pill anchored 4px from the top.
  // New layout uses 200-tall with the pill anchored 70px from the top.
  // Saved positions from the old layout now place the pill ~66px too low.
  const cfg = loadConfig();
  if (cfg.widgetPos && !cfg.widgetPosLayoutV2) {
    saveConfig({
      widgetPos: { x: cfg.widgetPos.x, y: cfg.widgetPos.y - 66 },
      widgetPosLayoutV2: true,
    });
  }
}

function repositionWidget() {
  if (!widgetWindow) return;
  migrateSavedWidgetPosIfNeeded();
  const saved = loadConfig().widgetPos;
  if (saved && isPositionOnScreen(saved)) {
    widgetWindow.setPosition(Math.round(saved.x), Math.round(saved.y));
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  // Window is 280×200. Pill anchored 70px from window top via CSS.
  // Park the pill just above the dock with only a tiny visual gap.
  // workArea_bottom - 102 puts the pill bottom ~4px above the dock.
  widgetWindow.setPosition(
    Math.floor((workArea.width - 280) / 2),
    workArea.y + workArea.height - 102
  );
}

// ─── Widget tap / long-press-drag ─────────────────────────────────────────────

let widgetIsDragging   = false;
let widgetDragInterval = null;

function startWidgetDrag() {
  if (!widgetWindow || widgetIsDragging) return;
  const startCur = screen.getCursorScreenPoint();
  const [wx, wy] = widgetWindow.getPosition();
  widgetIsDragging = true;
  widgetWindow.setIgnoreMouseEvents(false, { forward: true });
  if (widgetDragInterval) clearInterval(widgetDragInterval);
  widgetDragInterval = setInterval(() => {
    if (!widgetWindow) return;
    const cur = screen.getCursorScreenPoint();
    widgetWindow.setPosition(
      Math.round(wx + (cur.x - startCur.x)),
      Math.round(wy + (cur.y - startCur.y))
    );
  }, 16);
}

function endWidgetDrag() {
  if (widgetDragInterval) { clearInterval(widgetDragInterval); widgetDragInterval = null; }
  if (!widgetIsDragging) return;
  widgetIsDragging = false;
  if (widgetWindow) {
    const [wx, wy] = widgetWindow.getPosition();
    saveConfig({ widgetPos: { x: wx, y: wy } });
  }
}

function focusMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (app.dock?.show) app.dock.show();
  } else {
    createWindow();
  }
}

function createWidget() {
  if (widgetWindow) return;

  widgetWindow = new BrowserWindow({
    width: 280,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    focusable: false,  // prevents widget from stealing focus from other apps
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWindow.setIgnoreMouseEvents(true, { forward: true }); // transparent area click-through
  repositionWidget();

  // Reposition when Dock shows/hides or display changes
  screen.on('display-metrics-changed', repositionWidget);
  if (mainWindow) {
    mainWindow.on('enter-full-screen', repositionWidget);
    mainWindow.on('leave-full-screen', repositionWidget);
  }

  if (isDev) {
    widgetWindow.loadURL('http://localhost:5173/#widget');
  } else {
    widgetWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'widget' });
  }

  widgetWindow.on('closed', () => {
    screen.off('display-metrics-changed', repositionWidget);
    widgetWindow = null;
  });
}

function destroyWidget() {
  if (widgetWindow) { widgetWindow.close(); widgetWindow = null; }
}

function showAlert(score) {
  widgetWindow?.webContents.send('alert:data', { score });
  mainWindow?.webContents.send('alert:mobile', { score });
  postAlertSlowUntil = Date.now() + 75_000;
}

function destroyAlert() {
  widgetWindow?.webContents.send('alert:clear', {});
}

async function probePermission() {
  const result = await getActiveWindow();
  permissionOk = result !== null;
  return permissionOk;
}

let aiRunning = false;

function startAiAnalysis() {
  if (aiTimer) return;
  aiTimer = setInterval(async () => {
    console.log('[AI:TICK]', { hasSession: !!sessionState, aiRunning });
    if (!sessionState || !mainWindow) return;
    const config = loadConfig();
    if (config.aiEnabled === false) return; // default ON; only skip if explicitly disabled
    if (aiRunning) return; // skip if previous analysis still running

    aiRunning = true;
    const t0 = Date.now();
    try {
      const currentWin = sessionState.windowEvents[sessionState.windowEvents.length - 1];
      const windowContext = currentWin ? buildWindowContext(currentWin.app, currentWin.title) : '';

      // 1) Known distracting/shopping sites → instant low score
      const siteName = currentWin && BROWSERS.has(currentWin.app) ? extractSiteName(currentWin.title) : '';
      const knownSite = siteName ? lookupKnownSite(siteName, currentWin.title) : null;

      // 2) Native productive apps → instant high score, no AI needed
      const nativeScore = currentWin && !BROWSERS.has(currentWin.app)
        ? scoreNativeApp(currentWin.app, sessionState.sessionData.category) : null;

      let analysis = knownSite || nativeScore;
      if (!analysis) {
        // Fall back to vision AI — capture screen so the model can judge content,
        // not just the window title
        const image = await captureScreen();
        analysis = await analyzeScreen(image, sessionState.sessionData.category, config.apiKey, windowContext);
      }
      sessionState.aiAnalyses.push({ timestamp: Date.now(), ...analysis });
      console.log('[AI]', JSON.stringify({ ms: Date.now()-t0, topApp: analysis.topApp, focusScore: analysis.focusScore, distraction: analysis.distraction, note: analysis.note }));
      mainWindow.webContents.send('ai:analysis', analysis);
    } catch (err) {
      console.log('[AI:ERR]', err.message);
      mainWindow.webContents.send('ai:error', err.message);
    } finally {
      aiRunning = false;
    }
  }, 4000);
}

function stopAiAnalysis() {
  if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
}

function startTracking() {
  if (trackingTimer) return;
  createWidget();
  startAiAnalysis();
  startNowPlayingPoller();
  let tickCount = 0;
  trackingTimer = setInterval(async () => {
    if (!sessionState) return;
    tickCount++;

    const idleSecs  = powerMonitor.getSystemIdleTime();
    const now       = Date.now();
    const cursorPos = screen.getCursorScreenPoint();
    const cursorMoved   = cursorPos.x !== lastCursorPos.x || cursorPos.y !== lastCursorPos.y;
    const isActive      = idleSecs < 3;
    const likelyTyping  = isActive && !cursorMoved;

    let win = null;
    if (idleSecs < 30) {
      const lastIdle = sessionState.idleEvents[sessionState.idleEvents.length - 1];
      if (lastIdle && !lastIdle.endedAt) lastIdle.endedAt = now;

      win = await getActiveWindow();
      if (!sessionState) return;
      // Skip our own Electron windows — prevents widget/alert focus from inflating score
      if (win && win.app !== 'Electron') sessionState.windowEvents.push({ ...win, timestamp: now, idleSecs });
    } else {
      const lastIdle = sessionState.idleEvents[sessionState.idleEvents.length - 1];
      if (!lastIdle || lastIdle.endedAt) {
        sessionState.idleEvents.push({ startedAt: now - idleSecs * 1000 });
      }
    }

    const appSwitched = !!(win && win.app && win.app !== lastAppName && lastAppName !== '');
    sessionState.activityLog.push({ ts: now, isActive, likelyTyping, cursorMoved, appSwitched });

    // Keep only last 5 minutes
    const cutoff = now - 5 * 60 * 1000;
    if (sessionState.activityLog.length > 150) {
      sessionState.activityLog = sessionState.activityLog.filter(e => e.ts > cutoff);
    }

    lastCursorPos = cursorPos;
    if (win?.app) lastAppName = win.app;

    const elapsed    = Math.floor((now - sessionState.sessionData.startedAt) / 1000);
    const currentApp = sessionState.windowEvents[sessionState.windowEvents.length - 1];

    const _dbgWin = sessionState.windowEvents[sessionState.windowEvents.length - 1];
    console.log('[DBG]', JSON.stringify({ app: _dbgWin?.app, title: _dbgWin?.title?.slice(0,60), idleSecs }));

    // Track idle transitions to enforce slow recovery after returning
    const nowIsIdle = idleSecs >= 30;
    if (!nowIsIdle && wasIdle) {
      postAlertSlowUntil = Math.max(postAlertSlowUntil, now + 50_000);
    }
    wasIdle = nowIsIdle;

    // Compute work score every 2 ticks (2s), update timer every tick (1s)
    if (tickCount % 2 === 0) {
      const { score: rawScore, hardDist } = computeLiveWindowScore(
        sessionState.activityLog,
        sessionState.windowEvents,
        sessionState.sessionData,
        idleSecs,
        sessionState.aiAnalyses,
      );
      if (emaScore === null) {
        emaScore = rawScore;
      } else if (hardDist) {
        emaScore = rawScore;
      } else if (rawScore < emaScore) {
        emaScore = emaScore * 0.42 + rawScore * 0.58;
      } else {
        const w = now < postAlertSlowUntil ? 0.05 : 0.09;
        emaScore = emaScore * (1 - w) + rawScore * w;
      }

      // Sustained focus bonus: accumulates when EMA stays high, evaporates on distraction
      if (emaScore >= 55) {
        sessionState.sustainedFocusTicks = Math.min(480, (sessionState.sustainedFocusTicks || 0) + 1);
      } else {
        sessionState.sustainedFocusTicks = Math.max(0, (sessionState.sustainedFocusTicks || 0) - 5);
      }
    }
    const sustainBonus = Math.min(22, (sessionState.sustainedFocusTicks || 0) / 22);
    // Phone active penalty — applied to displayed score only (not EMA)
    const liveScore = (() => {
      let s = Math.min(95, Math.round((emaScore ?? 50) + sustainBonus));
      if (sessionState.activePhoneEvent) {
        const phoneActiveSecs = (now - sessionState.activePhoneEvent.startedAt) / 1000;
        const penalty = Math.min(40, 12 + phoneActiveSecs / 5);
        s = Math.max(5, s - Math.round(penalty));
      }
      return s;
    })();

    const elapsedMin = Math.floor(elapsed / 60);
    if (elapsedMin > sessionState.lastSeriesMinute) {
      sessionState.scoreSeries.push({ t: elapsedMin, s: liveScore });
      sessionState.lastSeriesMinute = elapsedMin;
    }

    const update = {
      elapsed,
      liveScore,
      currentApp:   currentApp?.app   || '',
      currentTitle: currentApp?.title || '',
      idleSecs,
      targetScore,
      phoneActive: !!sessionState.activePhoneEvent,
      phoneCount: sessionState.phoneEvents.filter(e => e.endedAt).length +
                  (sessionState.activePhoneEvent ? 1 : 0),
    };
    mainWindow?.webContents.send('session:update', update);
    widgetWindow?.webContents.send('session:update', update);

    // Push live session to Supabase ~1Hz so mobile sees fresh seconds/score even
    // when the main window is closed or the renderer is on a different screen.
    if (liveAuth && now - lastLiveWrite >= 1000) {
      lastLiveWrite = now;
      writeLiveSession({
        user_id:     liveAuth.userId,
        session_id:  sessionState.sessionData.id,
        score:       liveScore,
        elapsed,
        current_app: update.currentApp,
        phone_count: update.phoneCount,
        updated_at:  new Date().toISOString(),
      });
    }

    // Alert when entering red zone or dropping below target (check every 2s)
    if (tickCount % 2 === 0) {
      const threshold = targetScore ?? 20;
      const nowZone = liveScore < threshold ? 'red' : 'ok';
      if (nowZone === 'red' && prevLiveZone !== 'red' && Date.now() > alertCooldownUntil) {
        showAlert(liveScore);
        alertCooldownUntil = Date.now() + 90_000;
      }
      prevLiveZone = nowZone;
    }
  }, 1000);
}

function stopTracking() {
  if (trackingTimer) { clearInterval(trackingTimer); trackingTimer = null; }
  stopAiAnalysis();
  stopNowPlayingPoller();
  destroyWidget();
  destroyAlert();
  prevLiveZone = null;
  targetScore  = null;
  // Delete the live_sessions row so mobile clears immediately.
  if (liveAuth) {
    const auth = liveAuth;
    liveAuth = null;
    fetch(`${auth.url}/rest/v1/live_sessions?user_id=eq.${auth.userId}`, {
      method: 'DELETE',
      headers: {
        'apikey':        auth.anonKey,
        'Authorization': `Bearer ${auth.anonKey}`,
      },
    }).catch(() => {});
  }
}

// ─── Now Playing (Music / Spotify) ────────────────────────────────────────────

const NOW_PLAYING_SCRIPTS = {
  Music: `
tell application "Music"
  if it is running then
    try
      set ps to (player state as string)
      if ps is "playing" or ps is "paused" then
        set t to current track
        return ps & "\\n" & (name of t as string) & "\\n" & (artist of t as string) & "\\n" & (album of t as string)
      end if
    end try
  end if
end tell`,
  Spotify: `
tell application "Spotify"
  if it is running then
    try
      set ps to (player state as string)
      if ps is "playing" or ps is "paused" then
        return ps & "\\n" & (name of current track as string) & "\\n" & (artist of current track as string) & "\\n" & (album of current track as string)
      end if
    end try
  end if
end tell`,
};

function osa(script, timeout = 1200) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve((stdout || '').trim());
    });
  });
}

async function detectNowPlaying() {
  for (const [app, script] of Object.entries(NOW_PLAYING_SCRIPTS)) {
    try {
      const out = await osa(script);
      if (out && out.includes('\n')) {
        const [state, title, artist, album] = out.split('\n');
        if (state === 'playing' || state === 'paused') {
          return { app, state, title: title || '', artist: artist || '', album: album || '' };
        }
      }
    } catch (_e) {}
  }
  return null;
}

async function pollNowPlaying() {
  const np = await detectNowPlaying();
  const sig = np ? `${np.app}|${np.state}|${np.title}|${np.artist}` : null;
  if (sig === lastNowPlayingSig) return;
  lastNowPlayingSig = sig;
  widgetWindow?.webContents.send('nowPlaying:update', np);
}

function startNowPlayingPoller() {
  if (nowPlayingPollTimer) return;
  pollNowPlaying();
  nowPlayingPollTimer = setInterval(pollNowPlaying, 4000);
}

function stopNowPlayingPoller() {
  if (nowPlayingPollTimer) { clearInterval(nowPlayingPollTimer); nowPlayingPollTimer = null; }
  lastNowPlayingSig = null;
}

ipcMain.handle('nowplaying:command', async (_, app, cmd) => {
  if (!['Music', 'Spotify'].includes(app)) return;
  const map = { playpause: 'playpause', next: 'next track', previous: 'previous track' };
  const verb = map[cmd];
  if (!verb) return;
  try { await osa(`tell application "${app}" to ${verb}`); } catch (_e) {}
  // Refresh after a short delay (state may change)
  setTimeout(pollNowPlaying, 350);
});

ipcMain.handle('nowplaying:open', async (_, app) => {
  if (!['Music', 'Spotify'].includes(app)) return;
  try {
    await new Promise((resolve) => execFile('open', ['-a', app], () => resolve()));
  } catch (_e) {}
});

async function writeLiveSession(payload) {
  if (!liveAuth) return;
  try {
    await fetch(`${liveAuth.url}/rest/v1/live_sessions`, {
      method: 'POST',
      headers: {
        'apikey':        liveAuth.anonKey,
        'Authorization': `Bearer ${liveAuth.anonKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
  } catch (_e) {}
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('session:start', async (_, data) => {
  lastCursorPos      = screen.getCursorScreenPoint();
  lastAppName        = '';
  emaScore           = null;
  postAlertSlowUntil = 0;
  wasIdle            = false;
  targetScore        = data.targetScore ?? null;
  liveAuth           = data.liveAuth || null;
  lastLiveWrite      = 0;
  sessionState = {
    sessionData:         { ...data, startedAt: Date.now() },
    windowEvents:        [],
    idleEvents:          [],
    phoneEvents:         [],
    activePhoneEvent:    null,
    aiAnalyses:          [],
    activityLog:         [],
    scoreSeries:         [],
    lastSeriesMinute:    -1,
    sustainedFocusTicks: 0,
  };
  startTracking();
  return { ok: true };
});

ipcMain.handle('session:end', async () => {
  stopTracking();
  if (!sessionState) return null;

  const endedAt = Date.now();

  // Close open idle event if any
  const lastIdle = sessionState.idleEvents[sessionState.idleEvents.length - 1];
  if (lastIdle && !lastIdle.endedAt) lastIdle.endedAt = endedAt;

  // Close open phone event if any
  if (sessionState.activePhoneEvent) {
    const dur = Math.round((endedAt - sessionState.activePhoneEvent.startedAt) / 1000);
    sessionState.phoneEvents.push({
      ...sessionState.activePhoneEvent,
      endedAt,
      durationSeconds: dur,
    });
    sessionState.activePhoneEvent = null;
  }

  const durMin = Math.max(1, Math.round((endedAt - sessionState.sessionData.startedAt) / 60000));
  const score  = computeScoreFromEvents(sessionState);
  const { positiveReasons, negativeReasons } = generateReasons(
    score,
    sessionState.sessionData.category,
    sessionState.windowEvents,
    score.phoneDistractionCount,
  );

  // AI-generated personalized note (Anthropic API, non-blocking)
  const config  = loadConfig();
  const aiNote  = await generateAINote(
    sessionState.sessionData,
    { ...score, durationMinutes: durMin },
    config.apiKey,
  ).catch(() => null);

  const completed = {
    ...sessionState.sessionData,
    endedAt,
    durationMinutes: durMin,
    ...score,
    positiveReasons: aiNote ? [aiNote, ...positiveReasons].slice(0, 3) : positiveReasons,
    negativeReasons,
    phoneDistractionEvents: sessionState.phoneEvents,
    scoreSeries: sessionState.scoreSeries,
  };

  // Persist
  const sessions = loadSessions();
  sessions.push(completed);
  persistSessions(sessions);

  sessionState = null;
  return completed;
});

ipcMain.handle('phone:start', () => {
  if (!sessionState || sessionState.activePhoneEvent) return { ok: false };
  sessionState.activePhoneEvent = { id: genId(), startedAt: Date.now() };
  return { ok: true };
});

ipcMain.handle('phone:end', () => {
  if (!sessionState || !sessionState.activePhoneEvent) return { ok: false };
  const now = Date.now();
  const dur = Math.round((now - sessionState.activePhoneEvent.startedAt) / 1000);
  sessionState.phoneEvents.push({ ...sessionState.activePhoneEvent, endedAt: now, durationSeconds: dur });
  sessionState.activePhoneEvent = null;
  return { ok: true };
});

ipcMain.handle('sessions:get', () => loadSessions());

ipcMain.handle('sessions:save', (_, session) => {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  persistSessions(sessions);
  return { ok: true };
});

ipcMain.handle('permissions:accessibility', async () => {
  const ok = await probePermission();
  return { ok };
});

ipcMain.handle('config:get', () => loadConfig());

ipcMain.handle('config:set', (_, data) => {
  saveConfig(data);
  return { ok: true };
});

ipcMain.handle('permissions:screen', () => {
  const status = systemPreferences.getMediaAccessStatus('screen');
  return { status };
});

ipcMain.handle('context:detect', async () => {
  const win = await getActiveWindow();
  if (!win) return null;
  const appLower = win.app.toLowerCase();
  let category = 'General Work';
  for (const [cat, keywords] of Object.entries(CATEGORY_APPS)) {
    if (cat === 'Free Work') continue;
    if (keywords.some(k => appLower.includes(k))) { category = cat; break; }
  }
  // Derive a clean title: use window title if short and meaningful, else app name
  const rawTitle = win.title?.trim() || '';
  const title = rawTitle.length > 0 && rawTitle.length < 60 ? rawTitle : win.app;
  return { app: win.app, title, category };
});

ipcMain.handle('clipboard:write', (_, text) => { clipboard.writeText(text); return { ok: true }; });
ipcMain.handle('shell:open',      (_, url)  => { shell.openExternal(url);   return { ok: true }; });
ipcMain.handle('qr:generate',     (_, url)  => QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: '#06060a', light: '#ffffff' } }));
ipcMain.on('widget:mouse', (_, ignore) => {
  if (widgetIsDragging) return; // keep mouse captured during drag
  widgetWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('widget:tap',        () => focusMainWindow());
ipcMain.on('widget:drag-start', () => startWidgetDrag());
ipcMain.on('widget:drag-end',   () => endWidgetDrag());

// Theme forwarding: main window → widget window
ipcMain.on('theme:set', (_, theme) => {
  widgetWindow?.webContents.send('theme:change', theme);
});

// ─── Auto-updater (self-rolled, no Apple signing) ────────────────────────────

let downloadedUpdatePath    = null;
let downloadedUpdateVersion = null;
let downloadedUpdateKind    = null; // 'zip' | 'dmg'
let downloadingUpdate       = false;

function pickUpdateAsset(assets) {
  const arch = process.arch;
  const usable = (assets || []).filter(a => {
    const n = (a.name || '').toLowerCase();
    if (!n) return false;
    if (n.endsWith('.blockmap') || n.endsWith('.yml')) return false;
    return n.endsWith('.zip') || n.endsWith('.dmg');
  });
  // Prefer ZIP — smaller, faster to download AND no hdiutil dance
  const archZip = usable.find(a => a.name.toLowerCase().includes(arch) && a.name.toLowerCase().endsWith('.zip'));
  if (archZip) return { ...archZip, kind: 'zip' };
  const anyZip = usable.find(a => a.name.toLowerCase().endsWith('.zip'));
  if (anyZip) return { ...anyZip, kind: 'zip' };
  const archDmg = usable.find(a => a.name.toLowerCase().endsWith(`-${arch}.dmg`));
  if (archDmg) return { ...archDmg, kind: 'dmg' };
  const anyDmg = usable.find(a => a.name.toLowerCase().endsWith('.dmg'));
  if (anyDmg) return { ...anyDmg, kind: 'dmg' };
  return null;
}

function downloadToFile(url, destPath, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'surzo-desktop' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
        res.resume();
        return downloadToFile(res.headers.location, destPath, onProgress, redirectsLeft - 1)
          .then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total && onProgress) onProgress(received / total);
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (e) => { try { fs.unlinkSync(destPath); } catch {} ; reject(e); });
    });
    req.on('error', reject);
  });
}

async function checkForUpdates() {
  if (process.platform !== 'darwin') return;
  if (downloadingUpdate || downloadedUpdatePath) return;
  try {
    const config = loadConfig();
    const repoSlug = config.githubRepo || 'sakujun1129/surzo';
    if (!repoSlug) return;
    const res = await fetch(`https://api.github.com/repos/${repoSlug}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'surzo-desktop' },
    });
    if (!res.ok) return;
    const data = await res.json();
    const latestTag = (data.tag_name || '').replace(/^v/, '');
    if (!latestTag) return;
    const current = app.getVersion();
    if (latestTag === current) return;

    const asset = pickUpdateAsset(data.assets || []);
    const fallbackUrl = data.html_url || `https://github.com/${repoSlug}/releases/latest`;

    mainWindow?.webContents.send('update:available', {
      version: latestTag,
      url: fallbackUrl,
      notes: (data.body || '').slice(0, 280),
      autoApply: !!asset,
    });

    if (!asset) return;

    downloadingUpdate = true;
    const ext  = asset.kind === 'zip' ? 'zip' : 'dmg';
    const dest = path.join(app.getPath('temp'), `surzo-update-${latestTag}.${ext}`);
    try { fs.unlinkSync(dest); } catch {}
    await downloadToFile(asset.browser_download_url, dest, (p) => {
      mainWindow?.webContents.send('update:progress', { percent: Math.round(p * 100) });
    });
    downloadedUpdatePath    = dest;
    downloadedUpdateVersion = latestTag;
    downloadedUpdateKind    = asset.kind;
    downloadingUpdate       = false;
    mainWindow?.webContents.send('update:downloaded', { version: latestTag });
  } catch (_e) {
    downloadingUpdate = false;
  }
}

function applyDownloadedUpdate() {
  if (process.platform !== 'darwin') return false;
  if (!downloadedUpdatePath || !fs.existsSync(downloadedUpdatePath)) return false;

  // /Applications/Surzo.app/Contents/MacOS/Surzo → /Applications/Surzo.app
  const exePath = app.getPath('exe');
  const appBundle = path.dirname(path.dirname(path.dirname(exePath)));
  if (!appBundle.endsWith('.app')) return false;

  const stamp        = Date.now();
  const scriptPath   = path.join(app.getPath('temp'), `surzo-apply-update-${stamp}.sh`);
  const logPath      = path.join(app.getPath('temp'), 'surzo-update.log');
  const pid          = process.pid;
  const download     = downloadedUpdatePath;
  const isZip        = downloadedUpdateKind === 'zip';

  const acquireSrc = isZip
    ? `EXTRACT=$(mktemp -d -t surzo-upd-extract)
echo "[$(date)] extracting ZIP ${download} into $EXTRACT"
unzip -q "${download}" -d "$EXTRACT" || { echo "unzip failed"; exit 1; }
SRC=$(find "$EXTRACT" -maxdepth 3 -name "*.app" -type d | head -n 1)
CLEANUP() { rm -rf "$EXTRACT"; }`
    : `MOUNT=$(mktemp -d -t surzo-upd-mount)
echo "[$(date)] mounting DMG ${download} at $MOUNT"
hdiutil attach "${download}" -nobrowse -noautoopen -mountpoint "$MOUNT" >/dev/null || { echo "mount failed"; exit 1; }
SRC=$(find "$MOUNT" -maxdepth 2 -name "*.app" -type d | head -n 1)
CLEANUP() { hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true; rm -rf "$MOUNT"; }`;

  const script = `#!/bin/bash
exec > "${logPath}" 2>&1
echo "[$(date)] waiting for pid ${pid}"
for i in $(seq 1 100); do
  kill -0 ${pid} 2>/dev/null || break
  sleep 0.2
done
sleep 0.5

${acquireSrc}

if [ -z "$SRC" ]; then
  echo "no .app found in archive"
  CLEANUP
  exit 1
fi

BACKUP="${appBundle}.old-${stamp}"
echo "[$(date)] replacing ${appBundle} (backup: $BACKUP)"
mv "${appBundle}" "$BACKUP" || { echo "backup move failed"; CLEANUP; exit 1; }
if cp -R "$SRC" "${appBundle}"; then
  rm -rf "$BACKUP"
else
  echo "copy failed — rolling back"
  rm -rf "${appBundle}"
  mv "$BACKUP" "${appBundle}"
  CLEANUP
  exit 1
fi
xattr -dr com.apple.quarantine "${appBundle}" 2>/dev/null || true

CLEANUP
rm -f "${download}"

echo "[$(date)] launching ${appBundle}"
open "${appBundle}"
rm -f "$0"
`;

  try {
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  } catch (_e) {
    return false;
  }

  const child = spawn('/bin/bash', [scriptPath], { detached: true, stdio: 'ignore' });
  child.unref();

  // Quit so the script can replace this bundle.
  setTimeout(() => app.quit(), 300);
  return true;
}

ipcMain.handle('update:apply', () => applyDownloadedUpdate());
ipcMain.handle('update:check', () => { checkForUpdates(); return true; });

// ─── App Lifecycle ────────────────────────────────────────────────────────────

function createWindow() {
  if (!sessionState) destroyWidget(); // only clean up orphan widget if no active session
  mainWindow = new BrowserWindow({
    width:  460,
    height: 580,
    minWidth:  380,
    minHeight: 480,
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    if (!sessionState) destroyWidget(); // keep widget alive during active session
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Auto-launch at login so the app is always listening for remote start commands from mobile
  try {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
  } catch (_e) {}
  // Force dock icon to latest build/icon.png (also overrides macOS icon cache in prod)
  try {
    if (app.dock) {
      const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
      if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
    }
  } catch (_e) {}
  createWindow();
  setTimeout(probePermission, 1500);
  setTimeout(checkForUpdates, 6000);
  setInterval(checkForUpdates, 60 * 1000); // re-check every minute
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
