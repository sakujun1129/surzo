'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getConfigFile() {
  return path.join(app.getPath('userData'), 'surzo_config.json');
}

function loadConfig() {
  try {
    const f = getConfigFile();
    if (!fs.existsSync(f)) return {};
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return {}; }
}

function saveConfig(updates) {
  const current = loadConfig();
  fs.writeFileSync(getConfigFile(), JSON.stringify({ ...current, ...updates }, null, 2));
}

module.exports = { loadConfig, saveConfig };
