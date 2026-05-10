import { useState, useEffect, useRef } from 'react';
import { fmtMin, fmtScore, scoreTextColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card, StatTile, ScoreBar } from './ui.jsx';
import { saveSession, getSessionPhotos, setCoverPhoto, addSessionPhoto, uploadPhotoFromFile, subscribeSessionPhoto } from '../utils/storage.js';

const FOCUS_LABELS    = { 'very-focused': 'Very focused', focused: 'Focused', mixed: 'Mixed', 'not-focused': 'Not focused' };
const PROGRESS_LABELS = { completed: 'Completed', 'good-progress': 'Good progress', 'some-progress': 'Some progress', 'little-progress': 'Little progress' };

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  const raw  = s.totalWorkScore;
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}

function buildShareText(session) {
  const icon = session.averageWorkScore >= 90 ? '🔥' : session.averageWorkScore >= 75 ? '⚡' : session.averageWorkScore >= 60 ? '💪' : '📊';
  return `${icon} Work Session — surzo\n\n"${session.title}"\n${fmtMin(session.durationMinutes)} · Score: ${session.averageWorkScore}\nDeep work: ${session.deepWorkBlocks} blocks · Phone: ${session.phoneDistractionCount}x\n\n#surzo #focusmode`;
}

function buildExportCode(session) {
  return btoa(JSON.stringify({
    name: 'Surzo Friend',
    session: {
      title: session.title,
      category: session.category,
      durationMinutes: session.durationMinutes,
      averageWorkScore: session.averageWorkScore,
      deepWorkBlocks: session.deepWorkBlocks,
      phoneDistractionCount: session.phoneDistractionCount,
      startedAt: session.startedAt,
    },
  }));
}

export default function SessionResult({ session, onDone }) {
  const [selfFocus,     setSelfFocus]     = useState(session.selfFocus || null);
  const [progressCheck, setProgressCheck] = useState(session.progressCheck || null);
  const [saved,         setSaved]         = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [codeCopied,    setCodeCopied]    = useState(false);
  const [showSelfCheck, setShowSelfCheck] = useState(false);
  const [showShare,     setShowShare]     = useState(false);
  const [photos,        setPhotos]        = useState([]);
  const [coverUrl,      setCoverUrl]      = useState(session.photoUri?.startsWith('https://') ? session.photoUri : null);
  const [uploading,     setUploading]     = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getSessionPhotos(session.id).then(list => {
        if (!alive) return;
        setPhotos(list);
        const cover = list.find(p => p.is_cover);
        if (cover) setCoverUrl(prev => prev || cover.photo_url);
      });
    refresh();
    // Subscribe: re-fetch gallery whenever a new cover photo arrives via Realtime
    const unsub = subscribeSessionPhoto(session.id, () => refresh());
    // Fallback polls for uploads that finish after session end
    const t1 = setTimeout(refresh, 3000);
    const t2 = setTimeout(refresh, 8000);
    return () => { alive = false; unsub(); clearTimeout(t1); clearTimeout(t2); };
  }, [session.id]);

  const handleSetCover = async (url) => {
    setCoverUrl(url);
    await setCoverPhoto(session.id, url);
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
      if (!coverUrl) setCoverUrl(url);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    await saveSession({ ...session, selfFocus, progressCheck });
    setSaved(true);
  };

  const handleShareCopy = async () => {
    const text = buildShareText(session);
    await window.electronAPI?.writeToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(buildShareText(session));
    window.electronAPI?.openExternal(`https://twitter.com/intent/tweet?text=${text}`);
  };

  const handleCopyCode = async () => {
    const code = buildExportCode(session);
    await window.electronAPI?.writeToClipboard(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const sb = session.scoreBreakdown;
  const breakdown = [
    { label: 'Focus Consistency',   value: sb.focusConsistency,      weight: '×0.28', negative: false, max: 100 },
    { label: 'Task Alignment',      value: sb.taskAlignment,          weight: '×0.22', negative: false, max: 100 },
    { label: 'Deep Work Ratio',     value: sb.deepWorkRatio,          weight: '×0.18', negative: false, max: 100 },
    { label: 'Recovery & Return',   value: sb.recoveryReturn,         weight: '×0.12', negative: false, max: 100 },
    { label: 'Activity Signal',     value: sb.activitySignal ?? 50,   weight: '×0.10', negative: false, max: 100 },
    { label: 'Distraction Penalty', value: sb.distractionPenalty,     weight: '×0.10', negative: true,  max: 30  },
    ...(session.trackPhone
      ? [{ label: 'Phone Penalty',  value: sb.phoneDistractionPenalty, weight: 'max 15', negative: true, max: 15 }]
      : []),
  ];

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto pb-8">
      <div className="max-w-lg mx-auto px-4 pt-10 pb-2 fadein">
        <div className="pt-2 mb-5 window-drag">
          <h2 className="text-2xl font-black" style={{ WebkitAppRegion: 'no-drag' }}>Session Complete</h2>
        </div>

        {/* Photo section */}
        <div className="mb-4">
          {coverUrl && (
            <div className="rounded-2xl overflow-hidden mb-2" style={{ aspectRatio: '3/4', maxHeight: 280 }}>
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {photos.length > 0 ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map(p => (
                  <button key={p.photo_url} onClick={() => handleSetCover(p.photo_url)}
                    className="relative flex-shrink-0 rounded-xl overflow-hidden transition-transform hover:scale-[1.02]"
                    style={{ width: 72, height: 96 }}>
                    <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                    {p.photo_url === coverUrl && (
                      <div className="absolute inset-0 ring-2 ring-lime-400 rounded-xl" />
                    )}
                    <div className="absolute top-1 right-1 text-[9px]">
                      {p.photo_url === coverUrl ? '★' : '☆'}
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
              <p className="text-[10px] text-stone-400 dark:text-zinc-600 mt-1">★ でトップ画面の写真を選択</p>
            </>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-stone-200 dark:border-zinc-700 text-stone-400 dark:text-zinc-500 text-sm font-semibold hover:border-stone-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-center gap-2 mb-1">
              {uploading
                ? <div className="w-4 h-4 border-2 border-stone-300 border-t-lime-400 rounded-full animate-spin" />
                : '+ 写真を追加'}
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
        </div>

        <Card className="p-6 text-center mb-3 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: scoreTextColor(session.averageWorkScore) === 'text-lime-400' ? '#d4f57a' : scoreTextColor(session.averageWorkScore) === 'text-yellow-400' ? '#ffd60a' : '#ff453a' }} />
          <div className="text-stone-400 dark:text-zinc-600 text-[10px] uppercase tracking-widest mb-1">Work Score</div>
          <div className={`text-[80px] font-black tabular-nums leading-none ${scoreTextColor(session.averageWorkScore)}`}>
            {fmtScore(calcTotal(session))}
          </div>
          <div className="text-stone-400 dark:text-zinc-500 text-sm font-semibold mt-1">avg {session.averageWorkScore}</div>
          <div className="text-stone-700 dark:text-zinc-200 text-sm mt-3 font-bold leading-snug">{session.title}</div>
          <div className="text-stone-400 dark:text-zinc-600 text-xs mt-0.5">{session.category} · {fmtMin(session.durationMinutes)}</div>
        </Card>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatTile label="Total Work"  value={fmtScore(calcTotal(session))} sub="pts" />
          <StatTile label="Work Time"   value={fmtMin(session.durationMinutes)} />
          <StatTile label="Best Focus"  value={`${session.bestFocusMinutes}m`}   sub="streak" />
          <StatTile label="Deep Work"   value={String(session.deepWorkBlocks)}   sub="blocks ≥10 min" />
          {session.trackPhone && (
            <>
              <StatTile label="Phone Checks" value={String(session.phoneDistractionCount)}
                color={session.phoneDistractionCount > 0 ? 'text-orange-400' : 'text-lime-500'}
                sub={session.phoneDistractionCount === 0 ? 'phone-free 🎯' : null} />
              <StatTile label="Phone Time"
                value={session.totalPhoneDistractionMinutes > 0 ? fmtMin(session.totalPhoneDistractionMinutes) : '—'}
                color={session.totalPhoneDistractionMinutes > 0 ? 'text-orange-400' : undefined} />
            </>
          )}
        </div>

        {(() => {
          const series = session.scoreSeries;
          if (!series || series.length < 2) return null;
          const W = 300, H = 72, PAD = 6;
          const maxT = series[series.length - 1].t || 1;
          const pts = series.map(({ t, s }) => ({
            x: PAD + (t / maxT) * (W - PAD * 2),
            y: PAD + (1 - s / 100) * (H - PAD * 2),
          }));
          const smooth = (ps) => {
            if (ps.length < 2) return '';
            const seg = [`M${ps[0].x.toFixed(1)},${ps[0].y.toFixed(1)}`];
            for (let i = 0; i < ps.length - 1; i++) {
              const p0=ps[Math.max(0,i-1)],p1=ps[i],p2=ps[i+1],p3=ps[Math.min(ps.length-1,i+2)];
              seg.push(`C${(p1.x+(p2.x-p0.x)/6).toFixed(1)},${(p1.y+(p2.y-p0.y)/6).toFixed(1)} ${(p2.x-(p3.x-p1.x)/6).toFixed(1)},${(p2.y-(p3.y-p1.y)/6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
            }
            return seg.join(' ');
          };
          const d    = smooth(pts);
          const area = `${d} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
          const last  = series[series.length - 1].s;
          const color = last >= 70 ? '#d4f57a' : last >= 40 ? '#ffd60a' : '#ff453a';
          const y40   = (PAD + (1 - 0.4) * (H - PAD * 2)).toFixed(1);
          const y70   = (PAD + (1 - 0.7) * (H - PAD * 2)).toFixed(1);
          return (
            <Card className="p-4 mb-3">
              <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Focus Timeline</div>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 72 }} preserveAspectRatio="none">
                <line x1={PAD} y1={y70} x2={W-PAD} y2={y70} stroke="#d4f57a" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3,3" />
                <line x1={PAD} y1={y40} x2={W-PAD} y2={y40} stroke="#ffd60a" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3,3" />
                <path d={area} fill={color} fillOpacity="0.08" />
                <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex justify-between text-xs text-zinc-700 mt-1 px-0.5">
                <span>0m</span><span>{maxT}m</span>
              </div>
            </Card>
          );
        })()}

        <Card className="p-4 mb-3">
          <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-4">Score Breakdown</div>
          <div className="space-y-3.5">
            {breakdown.map(({ label, value, weight, negative, max }) => (
              <div key={label}>
                <div className="flex justify-between items-baseline text-sm mb-1.5">
                  <span className={negative ? 'text-stone-400 dark:text-zinc-500' : 'text-stone-700 dark:text-zinc-300'}>{label}</span>
                  <span className={`font-bold tabular-nums ${negative ? 'text-orange-500' : 'text-stone-900 dark:text-white'}`}>
                    {negative ? `−${value}` : value}
                    <span className="text-stone-300 dark:text-zinc-700 text-xs font-normal ml-1.5">{weight}</span>
                  </span>
                </div>
                <ScoreBar value={value} max={max} negative={negative} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 mb-3">
          <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Session Notes</div>
          <div className="space-y-2.5">
            {session.positiveReasons.map((r, i) => (
              <div key={i} className="flex gap-2.5 text-sm">
                <span className="text-lime-500 font-black mt-px flex-shrink-0">+</span>
                <span className="text-stone-700 dark:text-zinc-300 leading-snug">{r}</span>
              </div>
            ))}
          </div>
          {session.negativeReasons.length > 0 && (
            <div className="space-y-2.5 mt-3 pt-3 border-t border-stone-100 dark:border-zinc-800">
              {session.negativeReasons.map((r, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <span className="text-stone-300 dark:text-zinc-600 mt-px flex-shrink-0">→</span>
                  <span className="text-stone-400 dark:text-zinc-500 leading-snug">{r}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 mb-3">
          <button onClick={() => setShowSelfCheck(v => !v)}
            className="flex items-center justify-between w-full text-left">
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest">Self Check</div>
            <span className="text-stone-400 dark:text-zinc-600 text-xs">{showSelfCheck ? '▲' : '▼'}</span>
          </button>
          {showSelfCheck && (
            <div className="mt-4">
              <div className="mb-4">
                <p className="text-sm text-stone-600 dark:text-zinc-300 mb-2.5">How focused did this session feel?</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(FOCUS_LABELS).map(opt => (
                    <button key={opt} onClick={() => setSelfFocus(opt)}
                      className={`py-2.5 px-3 rounded-2xl text-sm font-semibold transition-colors ${
                        selfFocus === opt
                          ? 'bg-lime-300 text-zinc-950'
                          : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                      }`}>
                      {FOCUS_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <p className="text-sm text-stone-600 dark:text-zinc-300 mb-2.5">How much progress did you make?</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(PROGRESS_LABELS).map(opt => (
                    <button key={opt} onClick={() => setProgressCheck(opt)}
                      className={`py-2.5 px-3 rounded-2xl text-sm font-semibold transition-colors ${
                        progressCheck === opt
                          ? 'bg-lime-300 text-zinc-950'
                          : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                      }`}>
                      {PROGRESS_LABELS[opt]}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSave} disabled={saved}
                className={`w-full py-3 rounded-2xl text-sm font-black transition-colors ${
                  saved ? 'bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 cursor-default' : 'bg-lime-300 hover:bg-lime-200 text-zinc-950'
                }`}>
                {saved ? '✓ Saved' : 'Save Check-in'}
              </button>
            </div>
          )}
        </Card>

        <Card className="p-4 mb-3">
          <button onClick={handleCopyCode}
            className="w-full py-2.5 rounded-2xl text-xs font-semibold transition-colors bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-500 dark:text-zinc-500 flex items-center justify-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            {codeCopied ? '✓ コピー完了 — フレンドに送ろう' : 'フレンドコードをコピー'}
          </button>
        </Card>

        <div className="flex gap-2">
          <button onClick={onDone}
            className="flex-1 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-white font-bold text-base py-4 rounded-3xl transition-colors">
            Back to Dashboard
          </button>
          <div className="relative">
            <button onClick={() => setShowShare(v => !v)}
              className="h-full bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 font-bold px-5 rounded-3xl transition-colors flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              共有
            </button>
            {showShare && (
              <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-3xl p-2 shadow-2xl w-52 z-50">
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
      </div>
    </div>
  );
}
