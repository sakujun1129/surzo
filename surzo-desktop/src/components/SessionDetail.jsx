import { useState, useEffect, useRef } from 'react';
import { fmtMin, fmtScore, scoreTextColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card } from './ui.jsx';
import { getSessionPhoto, subscribeSessionPhoto, getSessionPhotos, setCoverPhoto, uploadPhotoFromFile } from '../utils/storage.js';

function buildShareText(session) {
  const icon = session.averageWorkScore >= 90 ? '🔥' : session.averageWorkScore >= 75 ? '⚡' : session.averageWorkScore >= 60 ? '💪' : '📊';
  return `${icon} Work Session — surzo\n\n"${session.title}"\n${fmtMin(session.durationMinutes)} · Score: ${session.averageWorkScore}\nDeep work: ${session.deepWorkBlocks ?? 0} blocks · Phone: ${session.phoneDistractionCount ?? 0}x\n\n#surzo #focusmode`;
}

function scoreColor(s) {
  return s >= 70 ? '#d4f57a' : s >= 40 ? '#ffd60a' : '#ff453a';
}

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  const raw  = s.totalWorkScore;
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  const segs = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    segs.push(`C${(p1.x+(p2.x-p0.x)/6).toFixed(1)},${(p1.y+(p2.y-p0.y)/6).toFixed(1)} ${(p2.x-(p3.x-p1.x)/6).toFixed(1)},${(p2.y-(p3.y-p1.y)/6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
  }
  return segs.join(' ');
}

function ScoreLine({ series }) {
  if (!series || series.length < 2) {
    return <div className="text-zinc-600 text-xs text-center py-5">記録データなし（次回のセッションから計測）</div>;
  }
  const W = 300, H = 80, PAD = 6;
  const maxT = series[series.length - 1].t || 1;
  const pts = series.map(({ t, s }) => ({
    x: PAD + (t / maxT) * (W - PAD * 2),
    y: PAD + (1 - s / 100) * (H - PAD * 2),
  }));
  const d    = smoothPath(pts);
  const area = `${d} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  const last  = series[series.length - 1].s;
  const color = scoreColor(last);
  const y40   = (PAD + (1 - 0.4) * (H - PAD * 2)).toFixed(1);
  const y70   = (PAD + (1 - 0.7) * (H - PAD * 2)).toFixed(1);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
        <line x1={PAD} y1={y70} x2={W - PAD} y2={y70} stroke="#d4f57a" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3,3" />
        <line x1={PAD} y1={y40} x2={W - PAD} y2={y40} stroke="#ffd60a" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3,3" />
        <path d={area} fill={color} fillOpacity="0.08" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-xs text-zinc-700 mt-1 px-0.5">
        <span>0m</span>
        <span>{maxT}m</span>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-stone-100 dark:border-zinc-800 last:border-0">
      <span className="text-sm text-stone-500 dark:text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold ${highlight || 'text-stone-900 dark:text-white'}`}>{value}</span>
    </div>
  );
}

export default function SessionDetail({ session, onBack }) {
  const [showShare, setShowShare] = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [photoUrl,  setPhotoUrl]  = useState(
    session.photoUri?.startsWith('https://') ? session.photoUri : null
  );
  const [photos,    setPhotos]    = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!session.id) return;
    getSessionPhoto(session.id).then(url => { if (url?.startsWith('https://')) setPhotoUrl(url); });
    getSessionPhotos(session.id).then(setPhotos);
    return subscribeSessionPhoto(session.id, url => {
      if (url?.startsWith('https://')) {
        setPhotoUrl(url);
        getSessionPhotos(session.id).then(setPhotos);
      }
    });
  }, [session.id]);

  const handleSetCover = async (url) => {
    setPhotoUrl(url);
    await setCoverPhoto(session.id, url);
    getSessionPhotos(session.id).then(setPhotos);
  };

  const handleAddPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    const url = await uploadPhotoFromFile(session.id, file);
    if (url) {
      const list = await getSessionPhotos(session.id);
      setPhotos(list);
      if (!photoUrl) setPhotoUrl(url);
    }
    setUploading(false);
  };

  const handleShareCopy = async () => {
    await window.electronAPI?.writeToClipboard(buildShareText(session));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const score = session.averageWorkScore ?? 0;
  const sb    = session.scoreBreakdown ?? {};
  const date  = new Date(session.startedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const breakdown = [
    { label: 'Focus',     value: sb.focusConsistency ?? 0,  color: '#d4f57a' },
    { label: 'Task',      value: sb.taskAlignment ?? 0,      color: '#38bdf8' },
    { label: 'Deep Work', value: sb.deepWorkRatio ?? 0,      color: '#a78bfa' },
    { label: 'Activity',  value: sb.activitySignal ?? 0,     color: '#fb923c' },
    { label: 'Recovery',  value: sb.recoveryReturn ?? 0,     color: '#34d399' },
  ];
  const hasBreakdown = Object.keys(sb).length > 0;

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-8 pb-10 fadein">
        <div className="flex items-center justify-between mb-6 window-drag">
          <button onClick={onBack} style={{ WebkitAppRegion: 'no-drag' }}
            className="text-sm text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors flex items-center gap-1">
            ← 戻る
          </button>
          <div className="relative" style={{ WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => setShowShare(v => !v)}
              className="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 font-bold text-sm px-4 py-2 rounded-2xl transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              共有
            </button>
            {showShare && (
              <div className="absolute top-full right-0 mt-2 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-3xl p-2 shadow-2xl w-52 z-50">
                <button onClick={() => { handleShareCopy(); setShowShare(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-stone-100 dark:hover:bg-zinc-800 text-sm font-semibold text-stone-700 dark:text-zinc-200 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  {copied ? '✓ コピー完了' : 'テキストをコピー'}
                </button>
                <button onClick={() => { window.electronAPI?.openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText(session))}`); setShowShare(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-stone-100 dark:hover:bg-zinc-800 text-sm font-semibold text-stone-700 dark:text-zinc-200 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 5.923zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  X でシェア
                </button>
                <button onClick={() => { window.electronAPI?.openExternal(`https://www.threads.net/intent/post?text=${encodeURIComponent(buildShareText(session))}`); setShowShare(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-stone-100 dark:hover:bg-zinc-800 text-sm font-semibold text-stone-700 dark:text-zinc-200 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 192 192" fill="currentColor">
                    <path d="M141.537 88.988a66.667 66.667 0 00-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.23c8.249.054 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.372-39.134 15.265-38.105 34.569.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.318-11.319 11.24-24.955 16.109-45.488 16.256-22.788-.169-40.041-7.478-51.285-21.75C35.238 139.939 29.92 120.007 29.712 96c.208-24.007 5.526-43.939 15.791-59.249 11.244-14.271 28.497-21.58 51.285-21.75 22.748.17 40.56 7.514 53.04 21.836 6.253 7.001 10.609 15.93 13.203 26.498l16.168-4.312C176.65 48.25 171.04 37.04 163.07 28.018 148.002 11.274 126.31 2.15 96.1 2 65.96 2.15 44.002 11.299 28.74 28.086 15.266 43.054 8.344 63.966 8.1 96v.12c.244 32.034 7.166 52.946 20.64 67.914C44.002 180.821 65.96 190 96.1 190c27.736-.18 47.451-7.568 63.182-23.85 21.286-21.82 20.681-49.357 13.617-66.186-5.011-11.682-14.714-21.326-31.362-10.976z"/>
                  </svg>
                  Threads でシェア
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Photo section */}
        <div className="mb-4">
          {photoUrl && (
            <div className="rounded-2xl overflow-hidden mb-2" style={{ aspectRatio: '3/4', maxHeight: 300 }}>
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map(p => (
              <button key={p.photo_url} onClick={() => handleSetCover(p.photo_url)}
                className="relative flex-shrink-0 rounded-xl overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ width: 72, height: 96 }}>
                <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                {p.photo_url === photoUrl && (
                  <div className="absolute inset-0 ring-2 ring-lime-400 rounded-xl" />
                )}
                <div className="absolute top-1 right-1 text-[9px]">
                  {p.photo_url === photoUrl ? '★' : '☆'}
                </div>
              </button>
            ))}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="relative flex-shrink-0 rounded-xl flex items-center justify-center bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 transition-colors"
              style={{ width: 72, height: 96 }}>
              {uploading
                ? <div className="w-4 h-4 border-2 border-stone-300 border-t-lime-400 rounded-full animate-spin" />
                : <span className="text-2xl text-stone-400 dark:text-zinc-500">+</span>}
            </button>
          </div>
          {photos.length > 1 && (
            <p className="text-[10px] text-stone-400 dark:text-zinc-600 mt-1">★ でトップに使う写真を選択</p>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
        </div>

        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-stone-400 dark:text-zinc-600 text-sm">
            <span>{CAT_ICON[session.category]}</span>
            <span>{session.category}</span>
            <span>·</span>
            <span>{date}</span>
          </div>
          <h2 className="text-2xl font-black mb-4 leading-tight">{session.title}</h2>
          <div className="flex items-end gap-4">
            <div className={`text-[80px] font-black tabular-nums leading-none ${scoreTextColor(score)}`}>
              {fmtScore(calcTotal(session))}
            </div>
            <div className="pb-3 text-stone-400 dark:text-zinc-600 text-sm">
              <div className="font-semibold">{fmtMin(session.durationMinutes)}</div>
              <div className="text-xs">avg {score}</div>
            </div>
          </div>
        </div>

        {/* Score line graph */}
        <Card className="p-4 mb-3">
          <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Focus Timeline</div>
          <ScoreLine series={session.scoreSeries} />
        </Card>

        {/* Stats */}
        <Card className="p-4 mb-3">
          <Row label="最大集中ブロック" value={`${session.bestFocusMinutes ?? 0}m`} />
          <Row label="深作業ブロック"   value={`${session.deepWorkBlocks ?? 0}回`} />
          <Row label="スマホ離脱"       value={`${session.phoneDistractionCount ?? 0}回`}
               highlight={session.phoneDistractionCount > 0 ? 'text-orange-400' : undefined} />
          <Row label="スマホ時間"       value={fmtMin(session.totalPhoneDistractionMinutes)} />
        </Card>

        {/* Breakdown chart */}
        {hasBreakdown && (
          <Card className="p-4 mb-3">
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-4">Focus Breakdown</div>
            <div className="space-y-2.5">
              {breakdown.map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 dark:text-zinc-500 w-20 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs font-bold w-7 text-right tabular-nums">{Math.round(value)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Reasons */}
        {session.positiveReasons?.length > 0 && (
          <Card className="p-4 mb-3">
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">良かった点</div>
            <div className="space-y-2">
              {session.positiveReasons.map((r, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-lime-500 font-black">+</span>
                  <span className="text-stone-700 dark:text-zinc-300 leading-snug">{r}</span>
                </div>
              ))}
            </div>
            {session.negativeReasons?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100 dark:border-zinc-800 space-y-2">
                {session.negativeReasons.map((r, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-stone-400 dark:text-zinc-600">→</span>
                    <span className="text-stone-400 dark:text-zinc-500 leading-snug">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
