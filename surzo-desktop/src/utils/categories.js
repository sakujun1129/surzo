export const CATEGORY_APPS = {
  Programming:    ['code', 'visual studio code', 'xcode', 'terminal', 'iterm', 'cursor', 'nova', 'intellij', 'webstorm', 'pycharm', 'android studio', 'zed', 'sublime'],
  Writing:        ['word', 'pages', 'notion', 'obsidian', 'bear', 'ulysses', 'scrivener', 'typora', 'ia writer'],
  Design:         ['figma', 'sketch', 'photoshop', 'illustrator', 'affinity', 'canva', 'xd'],
  Research:       ['safari', 'chrome', 'firefox', 'arc', 'brave', 'edge', 'opera'],
  'Video Editing':['final cut', 'davinci', 'premiere', 'imovie', 'after effects', 'resolve'],
  Study:          ['anki', 'notion', 'obsidian', 'bear', 'preview', 'kindle', 'goodreader'],
  'Admin / Email':['mail', 'outlook', 'spark', 'slack', 'teams', 'zoom', 'calendar', 'numbers', 'excel', 'sheets'],
  'Free Work':    [],
};

export const CAT_ICON = {
  Writing: '✍️', Programming: '💻', Design: '🎨', Research: '🔍',
  'Video Editing': '🎬', Study: '📚', 'Admin / Email': '📧', 'Free Work': '⚡',
};

export const CATEGORIES = Object.keys(CAT_ICON);

export function appMatchesCategory(appName, category) {
  if (category === 'Free Work') return true;
  const keys = CATEGORY_APPS[category] || [];
  const lower = appName.toLowerCase();
  return keys.some(k => lower.includes(k));
}

export function inferCategory(appName) {
  const lower = appName.toLowerCase();
  for (const [cat, keys] of Object.entries(CATEGORY_APPS)) {
    if (keys.some(k => lower.includes(k))) return cat;
  }
  return null;
}
