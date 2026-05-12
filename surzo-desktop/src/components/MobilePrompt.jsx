import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

const MOBILE_URL = 'https://surzo-app.vercel.app';

export default function MobilePrompt({ onDone }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    QRCode.toString(MOBILE_URL, { type: 'svg', width: 180, margin: 2 })
      .then(svg => setQrDataUrl('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)))
      .catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (window.electronAPI?.writeToClipboard) {
      await window.electronAPI.writeToClipboard(MOBILE_URL);
    } else {
      await navigator.clipboard.writeText(MOBILE_URL).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onDone}
    >
      {/* card */}
      <div
        className="w-full max-w-xs rounded-3xl p-7 fadein flex flex-col items-center text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-3xl mb-3">📱</div>
        <h2 className="text-lg font-black mb-1.5" style={{ color: 'var(--fg-base)', letterSpacing: '-0.3px' }}>
          スマホ版と連携しよう
        </h2>
        <p className="text-xs leading-relaxed mb-5" style={{ color: 'var(--text-sub)' }}>
          QRを読み込むかURLをコピーして<br />スマホのブラウザで開いてください
        </p>

        {qrDataUrl && (
          <div className="rounded-2xl overflow-hidden mb-3" style={{ background: '#fff', padding: 10 }}>
            <img src={qrDataUrl} alt="QR" style={{ width: 140, height: 140, display: 'block' }} />
          </div>
        )}

        <button
          onClick={handleCopy}
          className="w-full text-xs font-mono px-3 py-2 rounded-xl mb-5 hover:opacity-70 transition-opacity text-left truncate"
          style={{ background: 'var(--track-bg)', color: 'var(--text-sub)' }}
        >
          {copied ? '✓ コピーしました' : MOBILE_URL}
        </button>

        <button
          onClick={onDone}
          className="w-full py-3 rounded-2xl font-bold text-sm mb-2.5"
          style={{ background: 'var(--accent)', color: '#06060a' }}
        >
          はじめる
        </button>
        <button
          onClick={onDone}
          className="text-xs hover:opacity-60 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          スキップ
        </button>
      </div>
    </div>
  );
}
