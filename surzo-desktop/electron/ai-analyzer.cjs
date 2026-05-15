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

async function analyzeScreen(imageBase64, sessionCategory, _apiKey, windowContext = '') {
  // Fallback: capture if caller didn't supply one
  const image = imageBase64 || await captureScreen();

  const taskDesc = (sessionCategory === 'Free Work' || sessionCategory === 'General Work')
    ? 'productive work (any professional, study, research, or creative task — NOT entertainment, shopping, or social media)'
    : sessionCategory;

  const prompt = image ? `Task: "${taskDesc}". Window context: ${windowContext}.

Look at the actual screen content and judge how relevant it is to the task.
A = Directly working on task (editing code/doc, the target tool actively in use)
B = Useful reference (docs, tutorials, search results, articles, AI chats, research papers, code on GitHub — anything that supports the task)
C = Loosely related (adjacent topic, might be useful)
D = Off task (unrelated browsing, wrong app, personal email during deep work)
E = Clear distraction (social media, video entertainment, shopping, news, gaming)

Be generous with B: research, reading docs, learning material, AI assistants, and code repos all count as productive even when the title is unfamiliar. Only pick C–E if the content clearly isn't task-related. Reply with ONLY one letter.` : `Task: "${taskDesc}". Current window: ${windowContext}.

How relevant is this window to the task? Reply with ONLY one letter:
A = Directly working on task
B = Useful reference (docs, tutorials, research, AI chat, code repo)
C = Loosely related
D = Off task
E = Clear distraction (social, entertainment, shopping)`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), image ? 45000 : 12000);
  const body = {
    model: 'llama3.2-vision',
    prompt,
    stream: false,
    options: { temperature: 0.1, num_predict: 4 },
  };
  if (image) body.images = [image];

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify(body),
  });
  clearTimeout(timeout);

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const letter = (data.response || '').trim().toUpperCase().charAt(0);
  const result = CLASS_MAP[letter] || CLASS_MAP['D'];
  const siteMatch = windowContext.match(/site="([^"]+)"/);
  const appMatch  = windowContext.match(/app="([^"]+)"/);
  const topApp = (siteMatch || appMatch || [])[1] || '';
  return { ...result, topApp, note: `Class ${letter}${image ? ' (vision)' : ''}` };
}

module.exports = { captureScreen, analyzeScreen };
