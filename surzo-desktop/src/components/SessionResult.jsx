import { useState, useEffect, useRef } from 'react';
import { fmtMin, fmtScore, scoreTextColor, scoreColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card, StatTile, ScoreBar } from './ui.jsx';
import { saveSession, getSessionPhotos, setCoverPhoto, addSessionPhoto, uploadPhotoFromFile, subscribeSessionPhoto } from '../utils/storage.js';
import ShareCardModal from './ShareCardModal.jsx';

function ScoreRing({ score, total, title, category, duration, onAddPhoto, uploading }) {
  const r     = 96;
  const sw    = 15;
  const circ  = 2 * Math.PI * r;
  const filled = Math.min(score / 100, 1) * circ;
  const color = scoreColor(score);
  const trackColor = `${color.replace('rgb(', 'rgba(').replace(')', ',0.07)')}`;

  return (
    <div className="rounded-3xl mb-3 py-7 flex flex-col items-center relative overflow-hidden"
      style={{ background: trackColor, border: '1px solid rgba(255,255,255,0.04)' }}>

      {/* ring */}
      <svg width="230" height="230" viewBox="0 0 230 230" style={{ overflow: 'visible' }}>
        <circle cx="115" cy="115" r={r} fill="none"
          stroke="currentColor" strokeWidth={sw} strokeOpacity="0.08" className="text-stone-900 dark:text-white" />
        <circle cx="115" cy="115" r={r} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 115 115)"
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* pts — hero */}
        <text x="115" y="107" textAnchor="middle" dominantBaseline="middle"
          fontSize="52" fontWeight="900" fill={color} fontFamily="inherit" letterSpacing="-2">{total}</text>
        <text x="115" y="132" textAnchor="middle" fontSize="11" fontWeight="700"
          fill={color} fillOpacity="0.4" fontFamily="inherit" letterSpacing="2.5">PTS</text>
        {/* avg — sub */}
        <text x="115" y="150" textAnchor="middle" fontSize="12" fontWeight="600"
          fill="currentColor" fillOpacity="0.22" fontFamily="inherit"
          className="text-stone-900 dark:text-white">avg {score}</text>
      </svg>

      {/* session meta */}
      <div className="text-center mt-1 px-6">
        <div className="font-black text-base leading-tight" style={{ color: 'var(--fg-base)' }}>{title}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>{category} · {duration}</div>
      </div>

      {/* add photo */}
      <button onClick={onAddPhoto} disabled={uploading}
        className="mt-5 flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold hover:opacity-70 transition-opacity"
        style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-sub)' }}>
        {uploading
          ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
        }
        写真を追加
      </button>
    </div>
  );
}

const FOCUS_LABELS    = { 'very-focused': 'Very focused', focused: 'Focused', mixed: 'Mixed', 'not-focused': 'Not focused' };
const PROGRESS_LABELS = { completed: 'Completed', 'good-progress': 'Good progress', 'some-progress': 'Some progress', 'little-progress': 'Little progress' };

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  return Math.round(avg * mins);
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

  const heroColor = scoreColor(session.averageWorkScore);
  return (
    <div className="h-screen overflow-y-auto pb-8" style={{ background: 'var(--bg-base)', color: 'var(--fg-base)' }}>
      <div className="max-w-lg mx-auto px-5 pt-10 pb-2 fadein">
        <div className="pt-2 mb-5 window-drag">
          <h2 className="text-2xl font-black tracking-tight" style={{ WebkitAppRegion: 'no-drag' }}>セッション完了</h2>
        </div>

        {/* Hero card — matches Dashboard style: huge total pts + sub stats */}
        <div className="sz-card mb-3 fadein relative overflow-hidden" style={{ padding: '26px 26px 22px' }}>
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: heroColor }} />
          <div className="sz-lbl mb-3">RESULT</div>
          <div className="flex items-baseline gap-2 mb-5">
            <span className="font-black tabular-nums" style={{
              fontSize: 96, lineHeight: 0.85, letterSpacing: '-0.05em', color: 'var(--accent)',
            }}>
              {fmtScore(calcTotal(session))}
            </span>
            <span className="font-bold tracking-widest" style={{ fontSize: 13, color: 'var(--text-muted)' }}>PTS</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex-1">
              <div className="font-black tabular-nums leading-none" style={{ fontSize: 24, color: heroColor }}>
                {session.averageWorkScore}
              </div>
              <div className="sz-lbl mt-1.5">平均</div>
            </div>
            <div style={{ width: 1, height: 36, background: 'var(--card-border)' }} />
            <div className="flex-1">
              <div className="font-black tabular-nums leading-none" style={{ fontSize: 24 }}>
                {fmtMin(session.durationMinutes)}
              </div>
              <div className="sz-lbl mt-1.5">時間</div>
            </div>
            {session.trackPhone && (
              <>
                <div style={{ width: 1, height: 36, background: 'var(--card-border)' }} />
                <div className="flex-1">
                  <div className="font-black tabular-nums leading-none"
                    style={{ fontSize: 24, color: session.phoneDistractionCount > 0 ? '#fb923c' : 'var(--text-sub)' }}>
                    {session.phoneDistractionCount}
                    <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2, color: 'var(--text-sub)' }}>回</span>
                  </div>
                  <div className="sz-lbl mt-1.5">スマホ</div>
                </div>
              </>
            )}
          </div>
          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
            <div className="font-bold text-sm leading-snug" style={{ color: 'var(--text)' }}>{session.title}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>{session.category}</div>
          </div>
        </div>

        {/* Photo / gallery */}
        <div className="mb-3">
          {coverUrl ? (
            <div className="rounded-2xl overflow-hidden mb-2" style={{ aspectRatio: '3/4', maxHeight: 320 }}>
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="w-full rounded-2xl py-4 font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{ background: 'rgba(212,245,122,0.10)', border: '1px solid rgba(212,245,122,0.25)', color: 'var(--accent)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1.5-2h5L16 5"/>
              </svg>
              {uploading ? 'アップロード中…' : '写真を追加'}
            </button>
          )}

          {photos.length > 0 && (
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
                  </button>
                ))}
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="relative flex-shrink-0 rounded-xl flex items-center justify-center transition-colors"
                  style={{ width: 72, height: 96, background: 'rgba(255,255,255,0.04)', border: '1px dashed var(--card-border)' }}>
                  {uploading
                    ? <div className="w-4 h-4 border-2 border-stone-300 border-t-lime-400 rounded-full animate-spin" />
                    : <span style={{ fontSize: 22, color: 'var(--text-muted)' }}>+</span>}
                </button>
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>★ でカバー写真を選択</p>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} />
        </div>

        {/* Secondary stats — 2-col compact */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatTile label="Best Focus"  value={`${session.bestFocusMinutes}m`}   sub="streak" />
          <StatTile label="Deep Work"   value={String(session.deepWorkBlocks)}   sub="blocks ≥10 min" />
          {session.trackPhone && session.phoneDistractionCount > 0 && (
            <StatTile label="Phone Time"
              value={session.totalPhoneDistractionMinutes > 0 ? fmtMin(session.totalPhoneDistractionMinutes) : '—'}
              color={session.totalPhoneDistractionMinutes > 0 ? 'text-orange-400' : undefined} />
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
          <button onClick={() => setShowShare(true)}
            className="bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 font-bold px-5 rounded-3xl transition-colors flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            共有
          </button>
        </div>
      </div>

      {showShare && (
        <ShareCardModal session={session} photoUrl={coverUrl} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
