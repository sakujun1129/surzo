'use strict';

const { app, BrowserWindow, ipcMain, powerMonitor, systemPreferences, screen, clipboard, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { execFile } = require('child_process');
const { loadConfig, saveConfig } = require('./config.cjs');
const { captureScreen, analyzeScreen } = require('./ai-analyzer.cjs');

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
const KNOWN_SITES = {
  // Hard distractions (0-14)
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
  // Communication (moderate)
  slack: 55, teams: 55, zoom: 60,
  // Clearly not work
  spotify: 30, 'apple music': 30, vlc: 20, quicktime: 20,
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
  Programming:    ['code', 'visual studio code', 'xcode', 'terminal', 'iterm', 'cursor', 'nova', 'intellij', 'webstorm', 'pycharm', 'android studio', 'zed', 'sublime'],
  Writing:        ['word', 'pages', 'notion', 'obsidian', 'bear', 'ulysses', 'scrivener', 'typora', 'ia writer'],
  Design:         ['figma', 'sketch', 'photoshop', 'illustrator', 'affinity', 'canva', 'xd'],
  Research:       ['safari', 'chrome', 'firefox', 'arc', 'brave', 'edge', 'opera'],
  'Video Editing':['final cut', 'davinci', 'premiere', 'imovie', 'after effects', 'resolve'],
  Study:          ['anki', 'notion', 'obsidian', 'bear', 'preview', 'kindle', 'goodreader'],
  'Admin / Email':['mail', 'outlook', 'spark', 'slack', 'teams', 'zoom', 'calendar', 'numbers', 'excel', 'sheets'],
  'Free Work':    [],
};

const DISTRACTION_KEYWORDS = ['youtube', 'netflix', 'twitter', 'instagram', 'tiktok', 'facebook', 'reddit', 'twitch'];

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
    0.22 * focusConsistency +
    0.18 * taskAlignment +
    0.15 * deepWorkRatio +
    0.10 * recoveryReturn +
    0.20 * activitySignal -
    0.15 * distractionPenalty;

  // Small bonuses for exceptional performance
  let bonus = 0;
  if (focusConsistency >= 90 && taskAlignment >= 90) bonus += 5;
  if (activitySignal >= 85)                          bonus += 4;
  if (deepWorkRatio >= 50)                           bonus += 4;
  if (distractionPenalty === 0)                      bonus += 2;

  const avg = Math.round(Math.max(0, base + bonus + sustainBonus - inactivePenalty - phonePenalty));
  const total = Math.round(totalSecs * avg);

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
    score = 22;
  } else if (isDist) {
    // P02 Distraction site, passive watching/scrolling
    score = 8;
  } else if (currentIdleSecs >= 25) {
    // P03 Medium idle — taking a break (after distraction check)
    score = 22;
  } else if (typingRatio > 0.55 && isInTask) {
    // P04 Deep focus — sustained typing in correct app
    score = Math.round(82 + typingRatio * 18);
  } else if (typingRatio > 0.25 && isInTask) {
    // P05 Focused work — moderate typing in correct app
    score = Math.round(62 + typingRatio * 35 + mouseRatio * 8);
  } else if (mouseRatio > 0.5 && isInTask && typingRatio < 0.1) {
    // P06 Design / reading — heavy mouse, no typing, correct app
    score = Math.round(55 + mouseRatio * 18);
  } else if (mouseRatio > 0.3 && isInTask && typingRatio < 0.1) {
    // P07 Browsing research in correct category
    score = Math.round(45 + mouseRatio * 20);
  } else if (typingRatio > 0.45 && !isInTask) {
    // P08 Typing in wrong app (side notes, unrelated work)
    score = Math.round(42 + typingRatio * 18);
  } else if (activeRatio > 0.5 && isInTask) {
    // P09 Active but unclear input, correct app
    score = Math.round(50 + activeRatio * 18);
  } else if (typingRatio > 0.15 && isInTask) {
    // P10 Light typing in correct app
    score = Math.round(48 + typingRatio * 25);
  } else if (mouseRatio > 0.3 && !isInTask) {
    // P11 Mouse activity in wrong app
    score = Math.round(32 + mouseRatio * 12);
  } else if (currentIdleSecs >= 15) {
    // P12 Pause 15-25s — thinking or reading
    score = 28;
  } else if (currentIdleSecs >= 10) {
    // P13 Pause 10-15s — short stop
    score = 33;
  } else if (currentIdleSecs >= 5) {
    // P14 Micro-pause 5-10s — brief hands-off
    score = 40;
  } else if (currentIdleSecs >= 2) {
    // P15 Tiny pause 2-5s — momentary rest
    score = 46;
  } else if (activeRatio > 0.3 && !isInTask) {
    // P16 Some activity but wrong app
    score = Math.round(35 + activeRatio * 12);
  } else {
    // P17 Minimal activity — present but not doing much
    score = Math.round(30 + activeRatio * 18 + (isInTask ? 10 : 0));
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

function generateReasons(score, category, windowEvents, phoneCount) {
  const pos = [];
  const neg = [];

  if (score.averageWorkScore >= 80)      pos.push("Your focus was exceptionally strong this session.");
  else if (score.averageWorkScore >= 70) pos.push("You maintained solid momentum throughout.");
  else                                   pos.push("You showed up and put in the work — that always counts.");

  if (score.scoreBreakdown.focusConsistency >= 75)
    pos.push(`You stayed within ${category} apps for most of the session.`);
  else if (score.scoreBreakdown.taskAlignment >= 80)
    pos.push("Your active work time was high — minimal idle drift.");

  if (phoneCount === 0)      pos.push("You stayed completely phone-free. That's rare and valuable.");
  else if (phoneCount <= 2)  pos.push("You returned to work after each phone check — good recovery.");
  else                       pos.push("Noticing your phone habits is the first step to changing them.");

  if (score.scoreBreakdown.deepWorkRatio >= 40)
    pos.push("You hit deep focus blocks — the most valuable kind of work.");

  if (score.scoreBreakdown.focusConsistency < 55)
    neg.push(`You spent significant time outside ${category} apps. Try to stay in your chosen category.`);
  if (score.scoreBreakdown.distractionPenalty > 15)
    neg.push("Frequent app switching may have fragmented your focus. Try longer stretches in one app.");
  if (phoneCount >= 3)
    neg.push("Phone interruptions may have reduced your focus rhythm. Next time, try a 15-minute phone-free block.");
  if (score.scoreBreakdown.taskAlignment < 65)
    neg.push("You had notable idle time. Shorter, more intense sessions might work better.");

  return {
    positiveReasons: pos.slice(0, 3),
    negativeReasons: neg.slice(0, 2),
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
let postAlertSlowUntil  = 0;   // timestamp: enforce slow rise after alert/idle-return
let wasIdle             = false;
let permissionOk    = false;
let lastCursorPos   = { x: 0, y: 0 };
let lastAppName     = '';
let emaScore        = null;

const ALERT_MESSAGES = [
  '少し気が散っているかも。タスクに戻ってみませんか？',
  '今やるべきことは何でしょう？',
  '一度深呼吸して、作業に戻りませんか。',
  '集中のリズムを取り戻しませんか。',
  '水でも飲んで、リセットしてみませんか。',
];

// ─── Floating Widget Window ───────────────────────────────────────────────────

function repositionWidget() {
  if (!widgetWindow) return;
  const { workArea } = screen.getPrimaryDisplay();
  widgetWindow.setPosition(
    Math.floor((workArea.width - 220) / 2),
    workArea.y + workArea.height - 130 - 10  // 10px gap above Dock; 130 = widget height
  );
}

function createWidget() {
  if (widgetWindow) return;

  widgetWindow = new BrowserWindow({
    width: 220,
    height: 130,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

      const analysis = knownSite || nativeScore
        || await analyzeScreen(null, sessionState.sessionData.category, config.apiKey, windowContext);
      sessionState.aiAnalyses.push({ timestamp: Date.now(), ...analysis });
      console.log('[AI]', JSON.stringify({ ms: Date.now()-t0, topApp: analysis.topApp, focusScore: analysis.focusScore, distraction: analysis.distraction }));
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
  trackingTimer = setInterval(async () => {
    if (!sessionState || !mainWindow) return;

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

    // Compute live score and send to renderer
    const scoreData = computeScoreFromEvents(sessionState);
    const elapsed   = Math.floor((now - sessionState.sessionData.startedAt) / 1000);
    const currentApp = sessionState.windowEvents[sessionState.windowEvents.length - 1];

    const _dbgWin = sessionState.windowEvents[sessionState.windowEvents.length - 1];
    console.log('[DBG]', JSON.stringify({ app: _dbgWin?.app, title: _dbgWin?.title?.slice(0,60), idleSecs }));

    // Track idle transitions to enforce slow recovery after returning
    const nowIsIdle = idleSecs >= 30;
    if (!nowIsIdle && wasIdle) {
      // Just returned from idle — keep recovery slow for 50s
      postAlertSlowUntil = Math.max(postAlertSlowUntil, now + 50_000);
    }
    wasIdle = nowIsIdle;

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
      emaScore = rawScore; // snap immediately on hard distraction
    } else if (rawScore < emaScore) {
      emaScore = emaScore * 0.45 + rawScore * 0.55; // fast fall
    } else {
      // Rising: very slow after alert/idle, normal otherwise
      const w = now < postAlertSlowUntil ? 0.07 : 0.25;
      emaScore = emaScore * (1 - w) + rawScore * w;
    }
    const liveScore = Math.round(emaScore);

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
      phoneCount: sessionState.phoneEvents.filter(e => e.endedAt).length +
                  (sessionState.activePhoneEvent ? 1 : 0),
    };
    mainWindow.webContents.send('session:update', update);
    widgetWindow?.webContents.send('session:update', update);

    // Alert when entering red zone
    const nowZone = liveScore < 20 ? 'red' : 'ok';
    if (nowZone === 'red' && prevLiveZone !== 'red' && Date.now() > alertCooldownUntil) {
      showAlert(liveScore);
      alertCooldownUntil = Date.now() + 90_000; // 90s cooldown
    }
    prevLiveZone = nowZone;
  }, 2000);
}

function stopTracking() {
  if (trackingTimer) { clearInterval(trackingTimer); trackingTimer = null; }
  stopAiAnalysis();
  destroyWidget();
  destroyAlert();
  prevLiveZone = null;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('session:start', async (_, data) => {
  lastCursorPos      = screen.getCursorScreenPoint();
  lastAppName        = '';
  emaScore           = null;
  postAlertSlowUntil = 0;
  wasIdle            = false;
  sessionState = {
    sessionData:      { ...data, startedAt: Date.now() },
    windowEvents:     [],
    idleEvents:       [],
    phoneEvents:      [],
    activePhoneEvent: null,
    aiAnalyses:       [],
    activityLog:      [],
    scoreSeries:      [],
    lastSeriesMinute: -1,
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

  const completed = {
    ...sessionState.sessionData,
    endedAt,
    durationMinutes: durMin,
    ...score,
    positiveReasons,
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

ipcMain.handle('clipboard:write', (_, text) => { clipboard.writeText(text); return { ok: true }; });
ipcMain.handle('shell:open',      (_, url)  => { shell.openExternal(url);   return { ok: true }; });

// ─── App Lifecycle ────────────────────────────────────────────────────────────

function createWindow() {
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

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  // Warm up permission check after a short delay
  setTimeout(probePermission, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
