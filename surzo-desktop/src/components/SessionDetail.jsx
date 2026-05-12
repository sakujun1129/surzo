import { useState, useEffect, useRef } from 'react';
import { fmtMin, fmtScore, scoreColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card } from './ui.jsx';
import { getSessionPhoto, subscribeSessionPhoto, getSessionPhotos, setCoverPhoto, uploadPhotoFromFile } from '../utils/storage.js';
import ShareCardModal from './ShareCardModal.jsx';

function buildShareText(session) {
  const icon = session.averageWorkScore >= 90 ? '🔥' : session.averageWorkScore >= 75 ? '⚡' : session.averageWorkScore >= 60 ? '💪' : '📊';
  return `${icon} Work Session — surzo\n\n"${session.title}"\n${fmtMin(session.durationMinutes)} · Score: ${session.averageWorkScore}\nDeep work: ${session.deepWorkBlocks ?? 0} blocks · Phone: ${session.phoneDistractionCount ?? 0}x\n\n#surzo #focusmode`;
}

function getZoneLabel(s) {
  if (s >= 85) return 'DEEP FOCUS';
  if (s >= 70) return 'ON TRACK';
  if (s >= 55) return 'FOCUSED';
  if (s >= 38) return 'DRIFTING';
  if (s >= 20) return 'OFF TASK';
  return 'DISTRACTED';
}

function rgbaFromRgb(rgb, a) {
  return rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  return Math.round(avg * mins);
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
          <button onClick={() => setShowShare(true)} style={{ WebkitAppRegion: 'no-drag' }}
            className="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 font-bold text-sm px-4 py-2 rounded-2xl transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            共有
          </button>
        </div>

        {/* Hero — photo-or-glow background with HUGE score */}
        {(() => {
          const c = scoreColor(score);
          const zone = getZoneLabel(score);
          const pts = calcTotal(session);
          return (
            <div className="relative rounded-3xl overflow-hidden mb-3 shadow-2xl"
              style={{
                aspectRatio: photoUrl ? '4/5' : '5/4',
                background: '#08080b',
              }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <>
                  <div className="absolute inset-0" style={{
                    background: `radial-gradient(circle at 28% 30%, ${rgbaFromRgb(c, 0.38)} 0%, transparent 55%)`,
                  }} />
                  <div className="absolute inset-0" style={{
                    background: `radial-gradient(circle at 85% 85%, ${rgbaFromRgb(c, 0.18)} 0%, transparent 50%)`,
                  }} />
                </>
              )}

              {/* Dark gradient overlay */}
              <div className="absolute inset-0" style={{
                background: photoUrl
                  ? 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 28%, rgba(0,0,0,0.30) 58%, rgba(0,0,0,0.92) 100%)'
                  : 'linear-gradient(180deg, transparent 0%, transparent 45%, rgba(0,0,0,0.45) 100%)',
              }} />

              {/* Top meta: category · date */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-5">
                <span className="text-white/85 text-xs font-bold flex items-center gap-1.5">
                  <span>{CAT_ICON[session.category]}</span>
                  <span>{session.category}</span>
                </span>
                <span className="text-white/55 text-[11px] font-semibold tabular-nums">{date}</span>
              </div>

              {/* Bottom block: title + HUGE score + zone */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
                <div className="text-white text-lg font-black leading-tight mb-0.5 line-clamp-2"
                  style={{ letterSpacing: '-0.01em' }}>
                  {session.title}
                </div>
                <div className="text-white/55 text-[11px] font-semibold mb-2 tabular-nums">
                  {fmtMin(session.durationMinutes)} · {fmtScore(pts)} pts
                </div>
                <div className="flex items-end gap-3">
                  <div className="font-black tabular-nums leading-[0.82]"
                    style={{
                      fontSize: 'clamp(96px, 30vw, 148px)',
                      color: c,
                      letterSpacing: '-0.06em',
                      textShadow: photoUrl ? '0 4px 32px rgba(0,0,0,0.55)' : 'none',
                    }}>
                    {Math.round(score)}
                  </div>
                  <div className="pb-2 min-w-0">
                    <div className="font-extrabold tracking-[2.5px] text-[10px]" style={{ color: c }}>
                      {zone}
                    </div>
                    <div className="text-white/45 text-[9px] font-bold tracking-widest mt-0.5">
                      WORK SCORE
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Thumbnail strip + add photo */}
        <div className="mb-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map(p => (
              <button key={p.photo_url} onClick={() => handleSetCover(p.photo_url)}
                className="relative flex-shrink-0 rounded-xl overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ width: 60, height: 80 }}>
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
              style={{ width: 60, height: 80 }}>
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

        {/* Good points */}
        {session.positiveReasons?.length > 0 && (
          <Card className="p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(212,245,122,0.15)', color: '#86b03d' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div className="text-xs uppercase tracking-widest font-bold" style={{ color: '#86b03d' }}>良かった点</div>
            </div>
            <div className="space-y-3">
              {session.positiveReasons.map((r, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className="font-black mt-px flex-shrink-0" style={{ color: '#86b03d' }}>+</span>
                  <span className="leading-relaxed" style={{ color: 'var(--text)' }}>{r}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Improvement points */}
        {session.negativeReasons?.length > 0 && (
          <Card className="p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md flex items-center justify-center"
                style={{ background: 'rgba(251,146,60,0.18)', color: '#fb923c' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </div>
              <div className="text-xs uppercase tracking-widest font-bold" style={{ color: '#fb923c' }}>改善点</div>
            </div>
            <div className="space-y-3">
              {session.negativeReasons.map((r, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className="font-black mt-px flex-shrink-0" style={{ color: '#fb923c' }}>→</span>
                  <span className="leading-relaxed" style={{ color: 'var(--text-sub)' }}>{r}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {showShare && (
        <ShareCardModal session={session} photoUrl={photoUrl} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
