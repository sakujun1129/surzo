'use strict';
// Render build/icon.svg into build/icon.iconset/*.png using headless Electron.
// Then: iconutil -c icns build/icon.iconset -o build/icon.icns

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const SVG     = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');
const OUT_DIR = path.join(ROOT, 'build', 'icon.iconset');

const ICONSET = [
  { name: 'icon_16x16.png',      size: 16   },
  { name: 'icon_16x16@2x.png',   size: 32   },
  { name: 'icon_32x32.png',      size: 32   },
  { name: 'icon_32x32@2x.png',   size: 64   },
  { name: 'icon_128x128.png',    size: 128  },
  { name: 'icon_128x128@2x.png', size: 256  },
  { name: 'icon_256x256.png',    size: 256  },
  { name: 'icon_256x256@2x.png', size: 512  },
  { name: 'icon_512x512.png',    size: 512  },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

let sharedWin = null;

function ensureWin(size) {
  if (sharedWin && !sharedWin.isDestroyed()) {
    sharedWin.setContentSize(size, size);
    return sharedWin;
  }
  sharedWin = new BrowserWindow({
    width: size, height: size,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: false, sandbox: true },
  });
  return sharedWin;
}

async function renderAt(size) {
  const tmpHtml = path.join(ROOT, 'build', `.icon-render-${size}.html`);
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;}
    svg{display:block;width:${size}px;height:${size}px;}
  </style></head><body>${SVG}</body></html>`;
  fs.writeFileSync(tmpHtml, html);

  const w = ensureWin(size);
  const loaded = new Promise((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onFail = (_e, code, desc) => { cleanup(); reject(new Error(`${code} ${desc}`)); };
    const cleanup = () => {
      w.webContents.removeListener('did-finish-load', onDone);
      w.webContents.removeListener('did-fail-load', onFail);
    };
    w.webContents.on('did-finish-load', onDone);
    w.webContents.on('did-fail-load', onFail);
  });
  w.loadFile(tmpHtml);
  await loaded;
  await new Promise(r => setTimeout(r, 250));
  const img = await w.webContents.capturePage();
  const png = img.toPNG();
  try { fs.unlinkSync(tmpHtml); } catch {}
  return png;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const uniqueSizes = [...new Set(ICONSET.map(i => i.size))].sort((a, b) => a - b);
  const cache = new Map();
  for (const sz of uniqueSizes) {
    cache.set(sz, await renderAt(sz));
    console.log('rendered', sz);
  }
  for (const { name, size } of ICONSET) {
    fs.writeFileSync(path.join(OUT_DIR, name), cache.get(size));
  }
  // Also write a single 512px PNG for runtime dock-icon use in dev
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), cache.get(512));
  try { fs.unlinkSync(TMP_HTML); } catch {}
  console.log('done. next: iconutil -c icns', OUT_DIR);
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });
