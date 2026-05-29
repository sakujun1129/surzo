import { useState, useEffect, useRef } from 'react';
import { fmtTimer } from './utils/format.js';
import './widget.css';

const PHRASES = [
  'Return.', 'Refocus.', 'Back to it.', 'Resume.', 'Recenter.',
  'Stay in.', 'Still in.', 'Keep going.', 'Come back.', 'Build on.',
  'Finish it.', 'One more.', 'Not yet.', 'Again.', 'Continue.',
];

function getZone(score) {
  if (score >= 85) return { color: '#8ecf5a' };
  if (score >= 70) return { color: '#3fb87a' };
  if (score >= 55) return { color: '#4a9fd4' };
  if (score >= 38) return { color: '#c9a030' };
  if (score >= 20) return { color: '#c97040' };
  return               { color: '#c45050' };
}

/* Tiny arc that fills clockwise based on score 0–100 */
function ZoneArc({ score, color }) {
  const r = 5.2, cx = 7, cy = 7, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg className="wz" width="14" height="14" viewBox="0 0 14 14">
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="rgba(255,255,255,0.07)" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth="1.6"
        strokeDasharray={`${dash.toFixed(2)} ${circ}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '7px 7px', transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.5s ease' }} />
    </svg>
  );
}

/* Minimal phone icon (shown when phone is in use) */
function PhoneIcon() {
  return (
    <svg className="wz" width="9" height="13" viewBox="0 0 9 13" fill="none">
      <rect x="0.6" y="0.6" width="7.8" height="11.8" rx="1.8"
        stroke="rgba(255,255,255,0.36)" strokeWidth="1.1" />
      <line x1="3" y1="2.4" x2="6" y2="2.4"
        stroke="rgba(255,255,255,0.22)" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="4.5" cy="10.2" r="0.75" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

const HOLD_MS        = 200;  // press duration to enter drag mode (shorter = a deliberate "grab" won't count as a tap)
const MOVE_THRESHOLD = 6;    // px movement during press → drag immediately

export default function Widget() {
  const [update, setUpdate]     = useState({ elapsed: 0, liveScore: 50, targetScore: null });
  const [prevScore, setPrev]    = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [hovering,   setHovering]   = useState(false);
  const histRef          = useRef([]);
  const timerRef         = useRef(null);
  const pressStartRef    = useRef(0);
  const pressStartPosRef = useRef(null);
  const holdTimerRef     = useRef(null);
  const draggingRef      = useRef(false);
  const longPressedRef   = useRef(false); // once true, suppress tap on this release

  // Sync theme with main window
  useEffect(() => {
    const saved = localStorage.getItem('surzo-theme') || 'dark';
    if (saved === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    const unsub = window.electronAPI?.onThemeChange?.((t) => {
      if (t === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const u1 = window.electronAPI.onSessionUpdate(data => {
      setUpdate(prev => { setPrev(prev.liveScore); return data; });
      histRef.current.push(data.liveScore);
      if (histRef.current.length > 24) histRef.current.shift();
    });
    const u2 = window.electronAPI.onAlertData(() => {
      setAlertMsg(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAlertMsg(null), 5000);
    });
    const u3 = window.electronAPI.onAlertClear?.(() => {
      setAlertMsg(null);
      clearTimeout(timerRef.current);
    });
    const u4 = window.electronAPI.onNowPlaying?.((np) => setNowPlaying(np));
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  }, []);

  const dismiss = () => { clearTimeout(timerRef.current); setAlertMsg(null); };

  // ─── Press handling: short-tap → open main, long-press → drag ────────────
  const enterDragMode = () => {
    if (draggingRef.current) return;
    longPressedRef.current = true;
    draggingRef.current    = true;
    setDragging(true);
    window.electronAPI?.widgetDragStart?.();
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    pressStartRef.current    = Date.now();
    pressStartPosRef.current = { x: e.screenX, y: e.screenY };
    longPressedRef.current   = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(enterDragMode, HOLD_MS);
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!pressStartRef.current || draggingRef.current) return;
      const p0 = pressStartPosRef.current;
      if (!p0) return;
      if (Math.abs(e.screenX - p0.x) + Math.abs(e.screenY - p0.y) > MOVE_THRESHOLD) {
        if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
        enterDragMode();
      }
    };

    const onUp = (e) => {
      if (e.button !== 0) return;
      if (!pressStartRef.current) return;
      const heldMs = Date.now() - pressStartRef.current;
      pressStartRef.current = 0;
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }

      // Long-press / drag path — never fire tap, regardless of timing
      if (longPressedRef.current || draggingRef.current) {
        if (draggingRef.current) {
          window.electronAPI?.widgetDragEnd?.();
          draggingRef.current = false;
          setDragging(false);
        }
        longPressedRef.current = false;
        return;
      }

      // Short tap only — strict threshold
      if (heldMs < HOLD_MS) {
        window.electronAPI?.widgetTap?.();
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const score       = update.liveScore ?? 50;
  const target      = update.targetScore ?? null;
  const phoneActive = update.phoneActive ?? false;
  const zone        = getZone(score);
  const trend       = prevScore !== null ? score - prevScore : 0;
  const hist        = histRef.current;
  const belowTarget = target != null && score < target;
  const scoreColor  = belowTarget ? '#c45050' : zone.color;

  const sparkPath = hist.length > 1 ? hist.map((v, i) => {
    const x = (i / (hist.length - 1)) * 36;
    const y = 10 - (v / 100) * 8;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') : '';

  const [musicHover, setMusicHover] = useState(false);
  const musicHoverRef      = useRef(false);
  const pillHoverRef       = useRef(false);
  const musicHoverTimerRef = useRef(null);

  // Drive setIgnoreMouseEvents from the union of hover states. Refs so we
  // always read the latest value (state updates are async).
  const syncMouseIgnore = () => {
    const anyHover = pillHoverRef.current || musicHoverRef.current;
    window.electronAPI?.setWidgetMouse?.(!anyHover);
  };

  const enterMusicArea = () => {
    if (musicHoverTimerRef.current) { clearTimeout(musicHoverTimerRef.current); musicHoverTimerRef.current = null; }
    musicHoverRef.current = true;
    setMusicHover(true);
    syncMouseIgnore();
  };
  const leaveMusicArea = () => {
    if (musicHoverTimerRef.current) clearTimeout(musicHoverTimerRef.current);
    musicHoverTimerRef.current = setTimeout(() => {
      musicHoverRef.current = false;
      setMusicHover(false);
      syncMouseIgnore();
    }, 140);
  };

  const handlePillEnter = () => {
    pillHoverRef.current = true;
    syncMouseIgnore();
  };
  const handlePillLeave = () => {
    // Cursor left the pill while still pressed → the user is dragging it away.
    // Treat as a drag (never a tap) so moving the widget can't open the main window.
    if (!draggingRef.current && !longPressedRef.current && pressStartRef.current) {
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
      enterDragMode();
    }
    pillHoverRef.current = false;
    syncMouseIgnore();
  };

  const musicVisible = musicHover && nowPlaying;

  return (
    <div className="wr">
      {musicVisible && (
        <div className="wnp" onMouseEnter={enterMusicArea} onMouseLeave={leaveMusicArea}>
          <div className="wnp-info" onClick={() => window.electronAPI?.openMediaApp?.(nowPlaying.app)}>
            <div className="wnp-title" title={nowPlaying.title}>{nowPlaying.title || '—'}</div>
            <div className="wnp-artist" title={`${nowPlaying.artist} · ${nowPlaying.app}`}>
              {nowPlaying.artist || nowPlaying.album} <span className="wnp-src">· {nowPlaying.app}</span>
            </div>
          </div>
          <div className="wnp-controls">
            <button className="wnp-btn" onClick={() => window.electronAPI?.mediaCommand?.(nowPlaying.app, 'previous')} aria-label="previous">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9.5 12L20 6v12z"/></svg>
            </button>
            <button className="wnp-btn wnp-btn-play" onClick={() => window.electronAPI?.mediaCommand?.(nowPlaying.app, 'playpause')} aria-label="play/pause">
              {nowPlaying.state === 'playing' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button className="wnp-btn" onClick={() => window.electronAPI?.mediaCommand?.(nowPlaying.app, 'next')} aria-label="next">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l10.5 6L4 18z"/></svg>
            </button>
          </div>
        </div>
      )}
      <div
        className={`wp${alertMsg ? ' wp-open' : ''}${dragging ? ' wp-dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseEnter={handlePillEnter}
        onMouseLeave={handlePillLeave}
      >
        <div className="wrow">
          {phoneActive
            ? <PhoneIcon />
            : <ZoneArc score={score} color={zone.color} />
          }

          <span className="ws" style={{ color: scoreColor }}>{score}</span>

          {target != null && (
            <span className="wtgt" style={{ color: belowTarget ? '#c45050' : undefined }}>
              /{target}
            </span>
          )}

          {trend !== 0 && (
            <span className="wt" style={{ color: trend > 0 ? '#8ecf5a' : '#c45050' }}>
              {trend > 0 ? '↑' : '↓'}
            </span>
          )}

          {sparkPath && (
            <svg className="wg" viewBox="0 0 36 10" preserveAspectRatio="none">
              <path d={sparkPath} fill="none" stroke={zone.color}
                strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </svg>
          )}

          <span className="wdiv" />
          <span className="wm">{fmtTimer(update.elapsed)}</span>

          {nowPlaying && (
            <span
              className={`wnp-trigger${musicHover ? ' wnp-trigger-on' : ''}${nowPlaying.state === 'playing' ? ' wnp-trigger-playing' : ''}`}
              onMouseEnter={(e) => { e.stopPropagation(); enterMusicArea(); }}
              onMouseLeave={(e) => { e.stopPropagation(); leaveMusicArea(); }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="now playing"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 17V5l11-2v12.5a3.5 3.5 0 1 1-2-3.15V5.5L11 7v9.5a3.5 3.5 0 1 1-2-3.15z"/>
              </svg>
            </span>
          )}
        </div>

        <div className={`wa${alertMsg ? ' wa-show' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={dismiss}>
          {alertMsg && <span className="wat">{alertMsg}</span>}
        </div>
      </div>
    </div>
  );
}
