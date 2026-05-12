import { useState, useEffect, useRef } from 'react';
import { fmtTimer, scoreColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { saveSession, setLiveSession, clearLiveSession, subscribePhoneEvents, updateLiveScore, sendMobileAlert, subscribeSessionPhoto, getSessionPhoto, getSessionPhotos, addSessionPhoto } from '../utils/storage.js';

function getZone(score) {
  const color = scoreColor(score);
  if (score >= 85) return { label: 'DEEP FOCUS', color, bg: 'rgba(96,165,250,0.05)'  };
  if (score >= 70) return { label: 'ON TRACK',   color, bg: 'rgba(34,211,238,0.05)'  };
  if (score >= 55) return { label: 'FOCUSED',    color, bg: 'rgba(52,211,153,0.05)'  };
  if (score >= 38) return { label: 'DRIFTING',   color, bg: 'rgba(251,191,36,0.05)'  };
  if (score >= 20) return { label: 'OFF TASK',   color, bg: 'rgba(251,146,60,0.05)'  };
  return               { label: 'DISTRACTED', color, bg: 'rgba(244,63,94,0.05)'   };
}

function getNudge(score, prev) {
  const rising  = prev !== null && score > prev + 3;
  const falling = prev !== null && score < prev - 3;
  if (score >= 85) return rising ? 'You\'re in the zone — keep going.' : 'Deep focus. Don\'t break the streak.';
  if (score >= 70) return rising ? 'Good momentum, push further.' : 'Solid work. Lock in.';
  if (score >= 55) return 'Stay with it — you\'re close to the zone.';
  if (score >= 38) return falling ? 'You\'re drifting. Come back.' : 'Refocus. What\'s your next action?';
  if (score >= 20) return 'Off track. Close the tab and get back.';
  return 'Stop. Get back to work now.';
}

export default function ActiveSession({ sessionData, onEnd }) {
  const [update,       setUpdate]      = useState({ elapsed: 0, liveScore: 50, currentApp: '', phoneCount: 0, idleSecs: 0 });
  const [prevScore,    setPrevScore]   = useState(null);
  const [aiAnalysis,   setAiAnalysis]  = useState(null);
  const [phoneActive,  setPhoneActive] = useState(false);
  const [sessionPhoto, setSessionPhoto] = useState(null);
  const scoreHistory   = useRef([]);
  const lastScoreWrite = useRef(0);
  const lastPhoneCount = useRef(0);
  const prevZoneRef    = useRef('');
  const [zonePop, setZonePop] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onSessionUpdate(data => {
      setUpdate(prev => {
        setPrevScore(prev.liveScore);
        return data;
      });
      scoreHistory.current.push(data.liveScore);
      if (scoreHistory.current.length > 30) scoreHistory.current.shift();

      const now = Date.now();
      const phoneChanged = data.phoneCount !== lastPhoneCount.current;
      // Write immediately on phone_count change so mobile sees the new count fast
      if (phoneChanged || now - lastScoreWrite.current > 5000) {
        updateLiveScore(data.liveScore, data.elapsed, data.currentApp, data.phoneCount);
        lastScoreWrite.current = now;
        lastPhoneCount.current = data.phoneCount;
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubA = window.electronAPI.onAiAnalysis?.(data => setAiAnalysis(data));
    return () => unsubA?.();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onAlertMobile?.(({ score }) => {
      sendMobileAlert(score);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!sessionData?.id) return;
    getSessionPhoto(sessionData.id).then(url => { if (url?.startsWith('https://')) setSessionPhoto(url); });
    return subscribeSessionPhoto(sessionData.id, url => { if (url?.startsWith('https://')) setSessionPhoto(url); });
  }, [sessionData?.id]);

  useEffect(() => {
    const label = getZone(update.liveScore).label;
    if (prevZoneRef.current && label !== prevZoneRef.current) {
      setZonePop(true);
      const t = setTimeout(() => setZonePop(false), 500);
      return () => clearTimeout(t);
    }
    prevZoneRef.current = label;
  }, [update.liveScore]);

  useEffect(() => {
    if (!sessionData?.id) return;
    setLiveSession(sessionData.id, sessionData);
    const unsub = subscribePhoneEvents(sessionData.id, async (event) => {
      if (event.type === 'start') {
        await window.electronAPI?.phoneCheckStart();
        setPhoneActive(true);
      } else if (event.type === 'end') {
        await window.electronAPI?.phoneCheckEnd();
        setPhoneActive(false);
      }
    });
    return () => { clearLiveSession(); unsub(); };
  }, [sessionData?.id]);

  const score    = update.liveScore;
  const zone     = getZone(score);
  const nudge    = getNudge(score, prevScore);
  const progress = Math.min(100, (update.elapsed / 60 / sessionData.plannedMinutes) * 100);
  const trend    = prevScore !== null ? score - prevScore : 0;
  const isIdle   = update.idleSecs >= 30;

  const hist = scoreHistory.current;
  const sparkPath = hist.length > 1 ? hist.map((v, i) => {
    const x = (i / (hist.length - 1)) * 100;
    const y = 100 - v;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ') : '';

  const checkPhone = async () => {
    if (phoneActive) return;
    await window.electronAPI?.phoneCheckStart();
    setPhoneActive(true);
  };
  const endPhone = async () => {
    if (!phoneActive) return;
    await window.electronAPI?.phoneCheckEnd();
    setPhoneActive(false);
  };
  const handleEnd = async () => {
    if (phoneActive) await endPhone();
    const result = await window.electronAPI?.endSession();
    if (result) {
      try {
        const photoUrl = sessionPhoto || await Promise.race([
          getSessionPhoto(result.id),
          new Promise(r => setTimeout(() => r(null), 4000)),
        ]);
        if (photoUrl?.startsWith('https://')) result.photoUri = photoUrl;
        if (photoUrl?.startsWith('https://')) addSessionPhoto(result.id, photoUrl).catch(() => {});
      } catch {}
      saveSession(result).catch(() => {});
    }
    onEnd(result);
  };

  return (
    <div className="h-screen overflow-y-auto fadein" style={{ background: 'var(--bg-base)', color: 'var(--fg-base)' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: zone.bg, transition: 'background 1s ease' }} />

      <div className="max-w-lg mx-auto px-4 pt-8 pb-8" style={{ position: 'relative' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-7 pt-2 window-drag">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
            <span className="w-1.5 h-1.5 rounded-full anim-blink" style={{ background: '#8ecf5a' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Live</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-sub)', WebkitAppRegion: 'no-drag' }}>
            {sessionData.category}
          </div>
        </div>

        {/* Zone + Score hero */}
        <div className="mb-6 text-center">
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: zone.color, marginBottom: 8, transition: 'color 0.6s ease' }}>
            {zone.label}
          </div>

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div className={zonePop ? 'score-pop' : ''} style={{ fontSize: 108, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-4px', color: zone.color, transition: 'color 0.6s ease' }}>
              {score}
            </div>
            {trend !== 0 && (
              <span style={{ position: 'absolute', top: 16, right: -24, fontSize: 18, fontWeight: 900, color: trend > 0 ? '#8ecf5a' : '#c45050' }}>
                {trend > 0 ? '↑' : '↓'}
              </span>
            )}
          </div>

          {hist.length > 2 && (
            <div style={{ marginTop: 8, marginLeft: 'auto', marginRight: 'auto', width: 128, height: 32 }}>
              <svg viewBox="0 100 100 100" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
                <path d={sparkPath} fill="none" stroke={zone.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
              </svg>
            </div>
          )}

          <p key={nudge} className="text-sm font-medium mt-2 fadein" style={{ color: 'var(--text-sub)' }}>{nudge}</p>
        </div>

        {/* Score bar */}
        <div className="mb-5">
          <div style={{ height: 3, borderRadius: 999, background: 'var(--track-bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, width: `${score}%`, background: zone.color, opacity: 0.65, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1), background 0.7s ease' }} />
          </div>
          <div className="flex justify-between mt-1 px-0.5" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <span>Distracted</span>
            <span>Deep Focus</span>
          </div>
        </div>

        {/* Timer + progress */}
        <div className="sz-card flex items-center gap-4 mb-4" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px', lineHeight: 1, flex: 1 }}>
            {fmtTimer(update.elapsed)}
          </div>
          <div className="text-right">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
              {Math.round(progress)}%
            </div>
            <div style={{ width: 72, height: 3, borderRadius: 999, background: 'var(--track-bg)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${progress}%`, background: '#8ecf5a', opacity: 0.55, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{sessionData.plannedMinutes}m planned</div>
          </div>
        </div>

        {/* Current context */}
        {(update.currentApp || isIdle || aiAnalysis) && (
          <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: 'var(--text-sub)' }}>
            {isIdle
              ? <span style={{ color: '#c9a030' }}>Idle {update.idleSecs}s</span>
              : update.currentApp && <span>▶ {aiAnalysis?.topApp || update.currentApp}</span>
            }
            {aiAnalysis && (
              <span className="ml-auto font-semibold" style={{ color: aiAnalysis.isOnTask ? '#3fb87a' : '#c97040' }}>
                {aiAnalysis.isOnTask ? 'on task' : 'off task'}
              </span>
            )}
          </div>
        )}

        {/* Phone tracker */}
        {sessionData.trackPhone && (
          <div className="sz-card flex items-center gap-4 mb-5" style={{ padding: '16px 20px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Phone</div>
              <div style={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: update.phoneCount > 0 ? '#c97040' : 'var(--text-muted)' }}>
                {update.phoneCount}×
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={checkPhone}
                disabled={phoneActive}
                style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                  background: 'var(--card-bg)',
                  color: phoneActive ? 'var(--text-muted)' : 'var(--text-sub)',
                  border: '1px solid var(--card-border)',
                  cursor: phoneActive ? 'not-allowed' : 'pointer',
                  opacity: phoneActive ? 0.5 : 1,
                }}>
                Checked phone
              </button>
              {phoneActive && (
                <button
                  onClick={endPhone}
                  style={{
                    padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                    background: 'rgba(201,112,64,0.15)', color: '#c97040',
                    border: '1px solid rgba(201,112,64,0.2)', cursor: 'pointer',
                  }}>
                  Back to work
                </button>
              )}
            </div>
          </div>
        )}

        {sessionPhoto && (
          <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', aspectRatio: '3/4', maxHeight: 200 }}>
            <img src={sessionPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <button
          onClick={handleEnd}
          style={{
            width: '100%', fontWeight: 700, fontSize: 15, padding: '15px 0',
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderTop: '1px solid var(--card-top)',
            borderRadius: 10, color: 'var(--text)', cursor: 'pointer',
            transition: 'background 0.15s',
          }}>
          End Session
        </button>
      </div>
    </div>
  );
}
