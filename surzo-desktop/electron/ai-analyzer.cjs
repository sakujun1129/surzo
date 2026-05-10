'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function captureScreen() {
  const tmpFile = path.join(os.tmpdir(), `surzo_${Date.now()}.png`);
  return new Promise((resolve) => {
    // Capture full screen silently (-x = no sound)
    execFile('screencapture', ['-x', tmpFile], (err) => {
      if (err) { resolve(null); return; }
      // Resize to max 1024px wide to reduce token cost
      execFile('sips', ['-Z', '512', tmpFile], () => {
        try {
          const data = fs.readFileSync(tmpFile);
          try { fs.unlinkSync(tmpFile); } catch {}
          resolve(data.toString('base64'));
        } catch { resolve(null); }
      });
    });
  });
}

// Map classification letter → score/distraction
const CLASS_MAP = {
  A: { focusScore: 90, distraction: 'none',   isOnTask: true  }, // directly on task
  B: { focusScore: 72, distraction: 'none',   isOnTask: true  }, // relevant reference
  C: { focusScore: 50, distraction: 'low',    isOnTask: false }, // loosely related
  D: { focusScore: 25, distraction: 'medium', isOnTask: false }, // off task
  E: { focusScore: 8,  distraction: 'high',   isOnTask: false }, // clear distraction
};

async function analyzeScreen(_imageBase64, sessionCategory, _apiKey, windowContext = '') {
  const taskDesc = (sessionCategory === 'Free Work' || sessionCategory === 'General Work')
    ? 'productive work (any professional or creative task — NOT entertainment, shopping, or social media)'
    : sessionCategory;
  const prompt = `Task: "${taskDesc}". Current window: ${windowContext}.

How relevant is this window to the task? Reply with ONLY one letter:
A = Directly working on task (correct app/site actively used)
B = Useful reference (docs, tutorials, tools related to task)
C = Loosely related (adjacent topic, might be useful)
D = Off task (unrelated browsing, wrong app, email during deep work)
E = Clear distraction (social media, entertainment, shopping, news)`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      model: 'llama3.2-vision',
      prompt,
      stream: false,
      options: { temperature: 0.1, num_predict: 4 },
    }),
  });
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const letter = (data.response || '').trim().toUpperCase().charAt(0);
  const result = CLASS_MAP[letter] || CLASS_MAP['D'];
  const siteMatch = windowContext.match(/site="([^"]+)"/);
  const appMatch  = windowContext.match(/app="([^"]+)"/);
  const topApp = (siteMatch || appMatch || [])[1] || '';
  return { ...result, topApp, note: `Class ${letter}` };
}

module.exports = { captureScreen, analyzeScreen };
