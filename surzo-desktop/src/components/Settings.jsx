import { useState, useEffect } from 'react';
import { Card } from './ui.jsx';
import { generatePairingCode } from '../utils/storage.js';

export default function Settings({ onBack, theme, onToggleTheme }) {
  const [aiEnabled,    setAiEnabled]    = useState(false);
  const [screenStatus, setScreenStatus] = useState('unknown');
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const [saved,        setSaved]        = useState(false);
  const [pairCode,     setPairCode]     = useState(null);
  const [pairLoading,  setPairLoading]  = useState(false);

  useEffect(() => {
    window.electronAPI?.getConfig().then(cfg => {
      if (cfg.aiEnabled != null) setAiEnabled(cfg.aiEnabled);
    });
    window.electronAPI?.checkScreen().then(({ status }) => setScreenStatus(status));
    checkOllama();
  }, []);

  const checkOllama = async () => {
    setOllamaStatus('checking');
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.ok) {
        const data = await res.json();
        const hasVision = data.models?.some(m => m.name.includes('llama3.2-vision'));
        setOllamaStatus(hasVision ? 'ready' : 'no-model');
      } else {
        setOllamaStatus('offline');
      }
    } catch {
      setOllamaStatus('offline');
    }
  };

  const handleSave = async () => {
    await window.electronAPI?.setConfig({ aiEnabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const screenGranted = screenStatus === 'granted';
  const ollamaReady   = ollamaStatus === 'ready';

  const ollamaLabel = {
    checking:  'Checking…',
    ready:     'llama3.2-vision ready',
    'no-model':'Model not found — run: ollama pull llama3.2-vision',
    offline:   'Ollama not running — run: ollama serve',
  }[ollamaStatus] ?? '';

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 fadein">
        <div className="pt-2 mb-6">
          <button onClick={onBack} className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>
        <h2 className="text-2xl font-black mb-1">Settings</h2>
        <p className="text-stone-400 dark:text-zinc-600 text-sm mb-6">Configure AI-powered work monitoring.</p>

        {/* Appearance */}
        <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Appearance</div>
        <Card className="p-4 mb-5">
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-1 py-1"
          >
            <div className="text-left">
              <div className="font-semibold text-sm">Theme</div>
              <div className="text-stone-400 dark:text-zinc-500 text-xs mt-0.5">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</div>
            </div>
            <div className="text-xl">{theme === 'dark' ? '☾' : '☀'}</div>
          </button>
        </Card>

        {/* AI Monitoring */}
        <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">AI Monitoring</div>
        <Card className="p-4 mb-3">
          <p className="text-stone-500 dark:text-zinc-400 text-sm leading-relaxed mb-4">
            Screenshots are taken every 30s and analyzed locally by <span className="text-stone-800 dark:text-zinc-200 font-semibold">llama3.2-vision</span> via Ollama. Nothing leaves your Mac.
          </p>

          <div className="flex items-center justify-between mb-4 px-3 py-2.5 bg-stone-100 dark:bg-zinc-800/60 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                ollamaStatus === 'checking' ? 'bg-stone-300 dark:bg-zinc-500 animate-pulse' :
                ollamaReady ? 'bg-lime-400' : 'bg-orange-400'
              }`} />
              <div>
                <div className="text-sm font-semibold">Ollama</div>
                <div className="text-stone-400 dark:text-zinc-500 text-xs mt-0.5">{ollamaLabel}</div>
              </div>
            </div>
            <button onClick={checkOllama} className="text-xs text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0 ml-3">
              Refresh
            </button>
          </div>

          <button
            onClick={() => { if (ollamaReady) { setAiEnabled(e => !e); setSaved(false); } }}
            disabled={!ollamaReady}
            className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-colors ${
              ollamaReady ? 'hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer' : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="text-left">
              <div className="font-semibold text-sm">Enable AI Monitoring</div>
              <div className="text-stone-400 dark:text-zinc-500 text-xs mt-0.5">
                {ollamaReady ? 'Analyzes each screenshot for focus scoring' : 'Requires Ollama to be running'}
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${aiEnabled && ollamaReady ? 'bg-lime-300' : 'bg-stone-200 dark:bg-zinc-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${aiEnabled && ollamaReady ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </Card>

        {/* Screen Recording */}
        <Card className="p-4 mb-6">
          <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Screen Recording Permission</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${screenGranted ? 'bg-lime-400' : 'bg-orange-400'}`} />
              <div>
                <div className="text-sm font-semibold">
                  {screenGranted ? 'Granted' : screenStatus === 'denied' ? 'Denied' : 'Not granted'}
                </div>
                <div className="text-stone-400 dark:text-zinc-600 text-xs mt-0.5">
                  {screenGranted ? 'Screenshots can be captured' : 'Required for AI analysis'}
                </div>
              </div>
            </div>
            {!screenGranted && (
              <button
                onClick={() => window.open('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')}
                className="text-xs text-lime-600 dark:text-lime-400 hover:text-lime-500 transition-colors flex-shrink-0 ml-3"
              >
                Open Settings
              </button>
            )}
          </div>
        </Card>

        {/* Link Phone */}
        <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Mobile App</div>
        <Card className="p-4 mb-6">
          <div className="text-sm font-semibold mb-1">スマホと連携</div>
          <div className="text-stone-400 dark:text-zinc-500 text-xs mb-4">6桁のコードをスマホアプリに入力してください。10分間有効です。</div>
          {pairCode ? (
            <div className="text-center">
              <div className="text-4xl font-black tracking-[0.3em] text-lime-400 mb-2">{pairCode}</div>
              <div className="text-stone-400 dark:text-zinc-500 text-xs">スマホアプリで上記コードを入力</div>
            </div>
          ) : (
            <button
              onClick={async () => {
                setPairLoading(true);
                const code = await generatePairingCode();
                setPairCode(code);
                setPairLoading(false);
                setTimeout(() => setPairCode(null), 10 * 60 * 1000);
              }}
              disabled={pairLoading}
              className="w-full py-3 rounded-2xl bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950 font-bold text-sm transition-all disabled:opacity-50"
            >
              {pairLoading ? 'Generating…' : 'コードを生成'}
            </button>
          )}
        </Card>

        <button onClick={handleSave}
          className={`w-full py-4 rounded-3xl font-black text-lg transition-all mb-3 ${
            saved ? 'bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 cursor-default'
                  : 'bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950'
          }`}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>

        <button onClick={onBack}
          className="w-full bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-white font-bold text-lg py-4 rounded-3xl transition-colors">
          Back
        </button>
      </div>
    </div>
  );
}
