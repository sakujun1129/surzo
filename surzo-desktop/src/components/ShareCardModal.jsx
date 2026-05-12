import { useState, useEffect, useRef } from 'react';
import { fmtMin, fmtScore, scoreColor } from '../utils/format.js';

function calcTotal(s) {
  const avg = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  const raw = s.totalWorkScore;
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}

function getZoneLabel(s) {
  if (s >= 85) return 'DEEP FOCUS';
  if (s >= 70) return 'ON TRACK';
  if (s >= 55) return 'FOCUSED';
  if (s >= 38) return 'DRIFTING';
  if (s >= 20) return 'OFF TASK';
  return 'DISTRACTED';
}

// Canvas-based share image (1080x1920, story format)
async function generateShareImage(session, photoUrl) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const pts = calcTotal(session);
  const c = scoreColor(session.averageWorkScore);
  const zone = getZoneLabel(session.averageWorkScore);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  let usedPhoto = false;
  if (photoUrl) {
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = photoUrl;
      });
      const ar = img.width / img.height;
      let dw = W, dh = W / ar;
      if (dh < H) { dh = H; dw = H * ar; }
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      usedPhoto = true;
    } catch (_e) {}
  }

  if (!usedPhoto) {
    const rg = ctx.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H * 0.45, W);
    rg.addColorStop(0, c.replace('rgb(', 'rgba(').replace(')', ',0.32)'));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Dark gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,    'rgba(0,0,0,0.45)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.10)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.40)');
  g.addColorStop(1,    'rgba(0,0,0,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const PAD = 64;

  // Logo
  ctx.font = '900 56px Inter, system-ui';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText('sur', PAD, PAD);
  const sw = ctx.measureText('sur').width;
  ctx.fillStyle = '#d4f57a';
  ctx.fillText('z', PAD + sw, PAD);
  const szw = ctx.measureText('z').width;
  ctx.fillStyle = '#fff';
  ctx.fillText('o', PAD + sw + szw, PAD);

  // Date
  const dateStr = new Date(session.endedAt || session.startedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.font = '600 28px Inter, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - PAD, PAD + 14);
  ctx.textAlign = 'left';

  // Score circle for no-photo
  if (!usedPhoto) {
    const cx = W / 2, cy = H * 0.40, r = 220;
    ctx.lineWidth = 28;
    ctx.strokeStyle = c.replace('rgb(', 'rgba(').replace(')', ',0.14)');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    const pct = Math.min(session.averageWorkScore / 100, 1);
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke();
  }

  let y = H - PAD;
  ctx.font = '700 24px Inter, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.40)';
  ctx.fillText('YOUR FOCUS, MEASURED.', PAD, y - 24);
  y -= 80;

  ctx.font = '600 30px Inter, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${session.category} · ${fmtMin(session.durationMinutes)}`, PAD, y - 30);
  y -= 70;

  ctx.font = '800 50px Inter, system-ui';
  ctx.fillStyle = '#fff';
  const title = session.title.length > 30 ? session.title.slice(0, 30) + '…' : session.title;
  ctx.fillText(title, PAD, y - 52);
  y -= 100;

  ctx.font = '900 280px Inter, system-ui';
  ctx.fillStyle = c;
  const scoreStr = String(session.averageWorkScore);
  ctx.fillText(scoreStr, PAD - 10, y - 240);
  const scoreW = ctx.measureText(scoreStr).width;

  ctx.font = '900 32px Inter, system-ui';
  ctx.fillStyle = c;
  ctx.fillText(zone, PAD + scoreW + 20, y - 200);

  ctx.font = '700 26px Inter, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('WORK SCORE', PAD + scoreW + 20, y - 160);

  ctx.font = '900 60px Inter, system-ui';
  ctx.fillStyle = '#fff';
  const ptsStr = fmtScore(pts);
  ctx.fillText(ptsStr, PAD + scoreW + 20, y - 100);
  ctx.font = '700 22px Inter, system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('PTS', PAD + scoreW + 20 + ctx.measureText(ptsStr).width + 10, y - 70);

  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
}

function ShareCard({ session, photoUrl }) {
  const pts = calcTotal(session);
  const c = scoreColor(session.averageWorkScore);
  const zone = getZoneLabel(session.averageWorkScore);
  const dateStr = new Date(session.endedAt || session.startedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="relative rounded-3xl overflow-hidden shadow-2xl" style={{ aspectRatio: '9/16', background: '#0a0a0a' }}>
      {photoUrl ? (
        <img src={photoUrl} className="absolute inset-0 w-full h-full object-cover" alt="" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: `radial-gradient(circle at 50% 40%, ${c}50 0%, transparent 70%)` }}>
          <svg viewBox="0 0 240 240" width="60%" height="60%">
            <circle cx="120" cy="120" r="100" fill="none" stroke={c} strokeWidth="14" strokeOpacity="0.14" />
            <circle cx="120" cy="120" r="100" fill="none" stroke={c} strokeWidth="14"
              strokeDasharray={`${Math.min(session.averageWorkScore / 100, 1) * 2 * Math.PI * 100} ${2 * Math.PI * 100}`}
              strokeLinecap="round" transform="rotate(-90 120 120)" />
          </svg>
        </div>
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.92) 100%)' }} />

      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-5">
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.06em', color: '#fff' }}>
          sur<span style={{ color: '#d4f57a' }}>z</span>o
        </span>
        <span className="text-white/55 text-[11px] font-semibold mt-0.5">{dateStr}</span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5">
        <div className="text-white font-bold text-base truncate mb-0.5">{session.title}</div>
        <div className="text-white/55 text-xs mb-3">{session.category} · {fmtMin(session.durationMinutes)}</div>
        <div className="flex items-end gap-3 mb-3">
          <div className="font-black tabular-nums" style={{ fontSize: 88, lineHeight: 0.85, letterSpacing: '-0.05em', color: c }}>
            {session.averageWorkScore}
          </div>
          <div className="pb-2">
            <div className="text-[10px] font-extrabold tracking-[3px] mb-1.5" style={{ color: c }}>{zone}</div>
            <div className="text-white/55 text-[9px] font-bold tracking-widest">WORK SCORE</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-black tabular-nums" style={{ fontSize: 22, color: '#fff' }}>{fmtScore(pts)}</span>
              <span className="text-white/45 text-[9px] font-bold tracking-widest">PTS</span>
            </div>
          </div>
        </div>
        <div className="text-white/40 text-[10px] font-bold tracking-[2.5px]">YOUR FOCUS, MEASURED.</div>
      </div>
    </div>
  );
}

export default function ShareCardModal({ session, photoUrl, onClose }) {
  const [generating, setGenerating] = useState(true);
  const [blob, setBlob] = useState(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    let mounted = true;
    setGenerating(true);
    generateShareImage(session, photoUrl)
      .then(b => { if (mounted) setBlob(b); })
      .finally(() => { if (mounted) setGenerating(false); });
    return () => { mounted = false; };
  }, [session.id, photoUrl]);

  const handleSave = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `surzo-${session.id}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const buildShareText = () => {
    const pts = calcTotal(session);
    return `${session.title} · スコア ${session.averageWorkScore} · ${fmtScore(pts)} pts · ${fmtMin(session.durationMinutes)}\n— Surzo`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {}
  };

  const openExternal = (url) => window.electronAPI?.openExternal(url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md mx-4 max-h-[92vh] flex flex-col fadein">

        <button onClick={onClose}
          className="absolute -top-1 -right-1 z-10 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18 }}>×</button>

        <div className="flex-1 overflow-y-auto px-1 py-1">
          <ShareCard session={session} photoUrl={photoUrl} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={handleSave} disabled={generating || !blob}
            className="rounded-2xl py-3.5 font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
            {generating ? '生成中…' : saved ? '✓ 保存しました' : '画像を保存'}
          </button>
          <button onClick={handleCopy}
            className="rounded-2xl py-3.5 font-bold text-sm transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
            {copied ? '✓ コピー完了' : 'テキストをコピー'}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button onClick={() => openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText())}`)}
            className="rounded-2xl py-3 font-bold text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>X</button>
          <button onClick={() => openExternal(`https://www.threads.net/intent/post?text=${encodeURIComponent(buildShareText())}`)}
            className="rounded-2xl py-3 font-bold text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>Threads</button>
          <button onClick={() => openExternal(`https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(buildShareText())}`)}
            className="rounded-2xl py-3 font-bold text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>LINE</button>
        </div>
      </div>
    </div>
  );
}
