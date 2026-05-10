import { useState, useEffect, useRef } from 'react';
import { fmtTimer, scoreTextColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { saveSession, setLiveSession, clearLiveSession, subscribePhoneEvents, updateLiveScore, sendMobileAlert, subscribeSessionPhoto, getSessionPhoto, getSessionPhotos, addSessionPhoto } from '../utils/storage.js';

function getZone(score) {
  if (score >= 85) return { label: 'DEEP FOCUS',  emoji: '🔥', color: 'text-lime-400',   bg: 'bg-lime-400/8'  };
  if (score >= 70) return { label: 'ON TRACK',    emoji: '⚡', color: 'text-emerald-400', bg: 'bg-emerald-400/8' };
  if (score >= 55) return { label: 'FOCUSED',     emoji: '✓',  color: 'text-sky-400',     bg: 'bg-sky-400/8'   };
  if (score >= 38) return { label: 'DRIFTING',    emoji: '→',  color: 'text-yellow-400',  bg: 'bg-yellow-400/8' };
  if (score >= 20) return { label: 'OFF TASK',    emoji: '⚠',  color: 'text-orange-400',  bg: 'bg-orange-400/8' };
  return               { label: 'DISTRACTED',  emoji: '✕',  color: 'text-red-400',     bg: 'bg-red-400/8'   };
}

function getNudge(score, prev) {
  const rising = prev !== null && score > prev + 3;
  const falling = prev !== null && score < prev - 3;
  if (score >= 85) return rising ? 'You\'re in the zone — keep going.' : 'Deep focus. Don\'t break the streak.';
  if (score >= 70) return rising ? 'Good momentum, push further.' : 'Solid work. Lock in.';
  if (score >= 55) return 'Stay with it — you\'re close to the zone.';
  if (score >= 38) return falling ? 'You\'re drifting. Come back.' : 'Refocus. What\'s your next action?';
  if (score >= 20) return 'Off track. Close the tab and get back.';
  return 'Stop. Get back to work now.';
}

export default function ActiveSession({ sessionData, onEnd }) {
  const [update, setUpdate]       = useState({ elapsed: 0, liveScore: 50, currentApp: '', phoneCount: 0, idleSecs: 0 });
  const [prevScore, setPrevScore] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [phoneActive, setPhoneActive] = useState(false);
  const [sessionPhoto, setSessionPhoto] = useState(null);
  const scoreHistory   = useRef([]);
  const lastScoreWrite = useRef(0);

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
      if (now - lastScoreWrite.current > 5000) {
        updateLiveScore(data.liveScore, data.elapsed, data.currentApp, data.phoneCount);
        lastScoreWrite.current = now;
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

  // Mini sparkline from history
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
      // Use already-received photo from Realtime, fall back to DB fetch
      const photoUrl = sessionPhoto || await getSessionPhoto(result.id);
      if (photoUrl?.startsWith('https://')) result.photoUri = photoUrl;
      await saveSession(result);
      // Ensure session_photo_gallery has the cover entry so mobile records pick it up
      if (photoUrl?.startsWith('https://')) {
        addSessionPhoto(result.id, photoUrl).catch(() => {});
      }
    }
    onEnd(result);
  };

  return (
    <div className={`h-screen text-stone-900 dark:text-white overflow-y-auto transition-colors duration-700 ${zone.bg} bg-stone-50 dark:bg-zinc-950`}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-8 fadein">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-2 window-drag">
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
            <span className="w-2 h-2 rounded-full bg-lime-400 anim-blink" />
            <span className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest">Live</span>
          </div>
          <div className="text-stone-400 dark:text-zinc-500 text-xs" style={{ WebkitAppRegion: 'no-drag' }}>
            {CAT_ICON[sessionData.category]} {sessionData.category}
          </div>
        </div>

        {/* Zone + Score — hero block */}
        <div className="mb-5 text-center">
          <div className={`text-xs font-black uppercase tracking-[0.2em] mb-2 ${zone.color}`}>
            {zone.emoji} {zone.label}
          </div>

          <div className="relative inline-block">
            <div className={`text-[7rem] font-black tabular-nums leading-none ${scoreTextColor(score)}`}>
              {score}
            </div>
            {trend !== 0 && (
              <span className={`absolute top-4 -right-7 text-xl font-black ${trend > 0 ? 'text-lime-400' : 'text-orange-400'}`}>
                {trend > 0 ? '↑' : '↓'}
              </span>
            )}
          </div>

          {/* Sparkline */}
          {hist.length > 2 && (
            <div className="mt-1 mx-auto w-32 h-8">
              <svg viewBox="0 100 100 100" className="w-full h-full" preserveAspectRatio="none">
                <path d={sparkPath} fill="none" stroke="currentColor"
                  className={zone.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}

          {/* Nudge message */}
          <p className="text-stone-500 dark:text-zinc-400 text-sm mt-2 font-medium">{nudge}</p>
        </div>

        {/* Score bar (100-level visual) */}
        <div className="mb-5">
          <div className="h-2 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                score >= 70 ? 'bg-lime-400' : score >= 45 ? 'bg-yellow-400' : 'bg-orange-400'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-stone-300 dark:text-zinc-700 mt-1 px-0.5">
            <span>Distracted</span>
            <span>Deep Focus</span>
          </div>
        </div>

        {/* Timer + progress */}
        <div className="flex items-center gap-4 mb-5 bg-white/60 dark:bg-zinc-900/60 rounded-3xl px-5 py-4">
          <div className="text-4xl font-black tabular-nums tracking-tight flex-1">
            {fmtTimer(update.elapsed)}
          </div>
          <div className="text-right">
            <div className="text-stone-400 dark:text-zinc-500 text-xs mb-1">{Math.round(progress)}%</div>
            <div className="w-20 h-1.5 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-lime-300/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-stone-300 dark:text-zinc-700 text-xs mt-1">{sessionData.plannedMinutes}m planned</div>
          </div>
        </div>

        {/* Current context */}
        {(update.currentApp || isIdle || aiAnalysis) && (
          <div className="flex items-center gap-2 mb-4 text-xs text-stone-400 dark:text-zinc-600">
            {isIdle
              ? <span className="text-yellow-400">⏸ Idle {update.idleSecs}s</span>
              : update.currentApp && <span>▶ {aiAnalysis?.topApp || update.currentApp}</span>
            }
            {aiAnalysis && (
              <span className={`ml-auto font-semibold ${
                aiAnalysis.isOnTask ? 'text-lime-500' : 'text-orange-400'
              }`}>
                {aiAnalysis.isOnTask ? 'on task' : 'off task'}
              </span>
            )}
          </div>
        )}

        {/* Phone */}
        {sessionData.trackPhone && (
          <div className="flex items-center gap-3 mb-5 bg-white/60 dark:bg-zinc-900/60 rounded-3xl px-5 py-4">
            <div className="flex-1">
              <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-1">Phone</div>
              <div className={`text-2xl font-black ${update.phoneCount > 0 ? 'text-orange-400' : 'text-stone-300 dark:text-zinc-700'}`}>
                {update.phoneCount}× {update.phoneCount === 0 ? '🎯' : '📱'}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={checkPhone} disabled={phoneActive}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-colors ${
                  phoneActive ? 'bg-stone-100 dark:bg-zinc-800 text-stone-300 dark:text-zinc-700 cursor-not-allowed'
                              : 'bg-stone-100 dark:bg-zinc-800 hover:bg-orange-50 dark:hover:bg-orange-500/15 text-stone-500 dark:text-zinc-400'
                }`}>
                Checked phone
              </button>
              {phoneActive && (
                <button onClick={endPhone}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300">
                  Back to work
                </button>
              )}
            </div>
          </div>
        )}

        {sessionPhoto && (
          <div className="mb-4 rounded-2xl overflow-hidden" style={{ aspectRatio: '3/4', maxHeight: 200 }}>
            <img src={sessionPhoto} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <button onClick={handleEnd}
          className="w-full bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-white font-bold text-base py-4 rounded-3xl transition-colors">
          End Session
        </button>
      </div>
    </div>
  );
}
