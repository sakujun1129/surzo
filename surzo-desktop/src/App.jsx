import { useState, useEffect, useRef } from 'react';
import { getSessions, getSupabase, getUserId, saveSession, ensureMyProfile, refreshMyProfileStats } from './utils/storage.js';
import { genId } from './utils/format.js';
import Dashboard    from './components/Dashboard.jsx';
import StartSession from './components/StartSession.jsx';
import ActiveSession from './components/ActiveSession.jsx';
import SessionResult from './components/SessionResult.jsx';
import Settings      from './components/Settings.jsx';
import Friends       from './components/Friends.jsx';
import AuthScreen    from './components/AuthScreen.jsx';
import SessionDetail from './components/SessionDetail.jsx';
import Ranking       from './components/Ranking.jsx';
import Onboarding    from './components/Onboarding.jsx';
import MobilePrompt  from './components/MobilePrompt.jsx';

function UpdateBanner({ info, progress, ready, onClose }) {
  if (!info) return null;
  const auto = info.autoApply;

  let label;
  if (!auto)                  label = `v${info.version} が利用可能です`;
  else if (ready)             label = `v${info.version} の準備ができました`;
  else if (progress != null)  label = `v${info.version} をダウンロード中… ${progress}%`;
  else                        label = `v${info.version} を取得中…`;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'var(--accent)', color: '#06060a',
      padding: '9px 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', fontSize: 13, fontWeight: 700,
      boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
    }}>
      <span>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {auto && ready && (
          <button
            onClick={() => window.electronAPI?.applyUpdate?.()}
            style={{ background: '#06060a', color: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            再起動して更新
          </button>
        )}
        {!auto && (
          <button
            onClick={() => window.electronAPI?.openExternal(info.url)}
            style={{ background: '#06060a', color: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            更新する
          </button>
        )}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#06060a', opacity: 0.65, padding: '0 4px', lineHeight: 1 }}>✕</button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen,        setScreen]       = useState('dashboard');
  const [sessions,      setSessions]     = useState([]);
  const [sessionData,   setSessionData]  = useState(null);
  const [doneSession,   setDoneSession]  = useState(null);
  const [hasPermission, setPermission]   = useState(true);
  const [theme,         setTheme]        = useState(() => localStorage.getItem('surzo-theme') || 'dark');
  const [updateInfo,     setUpdateInfo]     = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [updateReady,    setUpdateReady]    = useState(false);
  const [authed,        setAuthed]       = useState(false);
  const [authLoading,   setAuthLoading]  = useState(true);
  const [detailSession, setDetailSession] = useState(null);
  const [showOnboarding,   setShowOnboarding]   = useState(false);
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const [targetScore,   setTargetScore]   = useState(() => {
    const v = localStorage.getItem('surzo-target-score');
    return v ? Number(v) : null;
  });

  const handleSetTarget = (v) => {
    setTargetScore(v);
    if (v == null) localStorage.removeItem('surzo-target-score');
    else localStorage.setItem('surzo-target-score', String(v));
  };

  const handleStart = async ({ title, category, plannedMinutes, trackPhone, targetScore: payloadTarget }) => {
    // Use the per-session target if provided, otherwise fall back to the global default
    const effectiveTarget = payloadTarget !== undefined ? payloadTarget : targetScore;
    // Persist the chosen target as the new default
    if (payloadTarget !== undefined && payloadTarget !== targetScore) handleSetTarget(payloadTarget);
    // Pass Supabase creds so main process can write live_sessions at 1Hz
    // (works even when the main window is closed mid-session).
    const uid = getUserId();
    const liveAuth = (uid && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) ? {
      url:     import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      userId:  uid,
    } : null;
    const data = { id: genId(), title, category, plannedMinutes, trackPhone, targetScore: effectiveTarget, liveAuth };
    await window.electronAPI?.startSession(data);
    setSessionData(data);
    setScreen('active');
  };

  const handleEnd = (result) => {
    if (!result) { setScreen('dashboard'); return; }
    getSessions().then(list => setSessions(list || []));
    setDoneSession(result);
    setScreen('result');
  };

  // Keep html.dark class in sync with theme state
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // Listen for update notifications from main process
  useEffect(() => {
    const u1 = window.electronAPI?.onUpdateAvailable?.((info) => {
      setUpdateInfo(info); setUpdateProgress(null); setUpdateReady(false);
    });
    const u2 = window.electronAPI?.onUpdateProgress?.(({ percent }) => setUpdateProgress(percent));
    const u3 = window.electronAPI?.onUpdateDownloaded?.(() => setUpdateReady(true));
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setAuthLoading(false); setAuthed(true); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authed) return;
    getSessions().then(list => setSessions(list || []));
    window.electronAPI?.checkAccessibility().then(({ ok }) => setPermission(ok));
    if (!localStorage.getItem('surzo-onboarding-v4')) setShowOnboarding(true);
    if (!localStorage.getItem('surzo-mobile-prompt-v1')) setShowMobilePrompt(true);
    // Register/refresh own user_profile for leaderboard
    ensureMyProfile().then(() => refreshMyProfileStats()).catch(() => {});
  }, [authed]);

  const phoneChannelRef = useRef(null);

  // iPhone AppState → phone_events テーブル → PC スコアへブリッジ
  // Realtime + 2秒ポーリングの二重で取りこぼし防止
  useEffect(() => {
    if (!sessionData?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const sid = sessionData.id;

    if (phoneChannelRef.current) {
      supabase.removeChannel(phoneChannelRef.current);
      phoneChannelRef.current = null;
    }

    const processedKeys = new Set();
    const processEvent = (row) => {
      if (!row) return;
      const key = `${row.ts || ''}-${row.type || ''}`;
      if (processedKeys.has(key)) return;
      processedKeys.add(key);
      if (row.type === 'start') window.electronAPI?.phoneCheckStart();
      if (row.type === 'end')   window.electronAPI?.phoneCheckEnd();
    };

    // 1) Realtime subscription
    const channel = supabase.channel(`phone-${sid}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'phone_events',
        filter: `session_id=eq.${sid}`,
      }, (payload) => processEvent(payload.new))
      .subscribe();
    phoneChannelRef.current = channel;

    // 2) Polling fallback every 2s — catches events Realtime misses
    let lastSeenTs = new Date().toISOString();
    const poll = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('phone_events')
          .select('type, ts')
          .eq('session_id', sid)
          .gte('ts', lastSeenTs)
          .order('ts', { ascending: true });
        for (const row of (data ?? [])) {
          processEvent(row);
          if (row.ts && row.ts > lastSeenTs) lastSeenTs = row.ts;
        }
      } catch (_e) {}
    }, 2000);

    return () => { supabase.removeChannel(channel); clearInterval(poll); phoneChannelRef.current = null; };
  }, [sessionData?.id]);

  // ─── Heartbeat from mobile (presence detection) ───────────────────────────
  // Mobile broadcasts a heartbeat every 2s while Surzo is visible. If the PC
  // hasn't received a beat for >6s, treat the user as "looking at phone".
  // This catches distractions that visibilitychange + phone_events miss.
  useEffect(() => {
    if (!sessionData?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const sid = sessionData.id;

    let lastHb = 0;
    let wasAway = false;
    let seenOnce = false;

    const goAway = () => {
      if (wasAway) return;
      wasAway = true;
      window.electronAPI?.phoneCheckStart();
    };
    const comeBack = () => {
      if (!wasAway) return;
      wasAway = false;
      window.electronAPI?.phoneCheckEnd();
    };

    const ch = supabase.channel(`hb-${sid}`)
      .on('broadcast', { event: 'hb' }, () => {
        lastHb = Date.now();
        seenOnce = true;
        comeBack();
      })
      .on('broadcast', { event: 'leave' }, () => {
        // Immediate distraction — no 6s wait
        seenOnce = true;
        goAway();
      })
      .on('broadcast', { event: 'back' }, () => {
        lastHb = Date.now();
        seenOnce = true;
        comeBack();
      })
      .subscribe();

    // Safety net: if no heartbeat in 6s (and we've seen the mobile before), assume away
    const interval = setInterval(() => {
      if (!seenOnce) return;
      const gap = Date.now() - lastHb;
      if (gap > 6000) goAway();
    }, 1000);

    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [sessionData?.id]);

  // スマホからのセッション開始コマンドを受信
  useEffect(() => {
    if (!authed) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const uid = getUserId();
    if (!uid) return;

    const processCommand = async (row) => {
      const { id, command, data } = row;
      try {
        if (command === 'start') handleStart({ trackPhone: true, ...data });
        if (command === 'stop') {
          const result = await window.electronAPI?.endSession();
          if (result) await saveSession(result);
          handleEnd(result ?? null);
        }
      } finally {
        // Always delete after processing so it doesn't replay
        try { await supabase.from('session_commands').delete().eq('id', id); } catch (_e) {}
      }
    };

    // 1) Catch up: pull any commands inserted in last 2 minutes (in case app was offline / just launched)
    (async () => {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: pending } = await supabase
        .from('session_commands')
        .select('*')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: true });
      for (const row of (pending ?? [])) {
        await processCommand(row);
      }
    })().catch(() => {});

    // 2) Subscribe to future commands
    const channel = supabase.channel(`session-commands-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'session_commands',
        filter: `user_id=eq.${uid}`,
      }, (payload) => { processCommand(payload.new); })
      .subscribe();

    // 3) Polling fallback every 4s in case Realtime is flaky
    const poll = setInterval(async () => {
      const since = new Date(Date.now() - 15 * 1000).toISOString();
      const { data: pending } = await supabase
        .from('session_commands')
        .select('*')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: true });
      for (const row of (pending ?? [])) {
        await processCommand(row);
      }
    }, 4000);

    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [authed]);

  if (authLoading) return null;
  if (!authed) return <AuthScreen />;

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('surzo-theme', next);
    window.electronAPI?.setTheme?.(next);
  };

  const handleCheckPermission = () => {
    window.electronAPI?.checkAccessibility().then(({ ok }) => setPermission(ok));
  };

  const handleQuickStart = async () => {
    const ctx = await window.electronAPI?.detectContext().catch(() => null);
    handleStart({
      title:          ctx?.title    || 'Quick Session',
      category:       ctx?.category || 'General Work',
      plannedMinutes: 25,
      trackPhone:     true,
    });
  };

  const handleDone = () => {
    getSessions().then(list => setSessions(list || []));
    setDoneSession(null);
    setSessionData(null);
    setScreen('dashboard');
  };

  // Thin fixed strip that lets the user drag the window from any screen.
  // z-index:-1 sits behind all content, so it only catches events in empty areas.
  const drag = <div style={{ position:'fixed', top:0, left:76, right:0, height:28, WebkitAppRegion:'drag', zIndex:9999 }} />;

  const handleCloseOnboarding = () => {
    localStorage.setItem('surzo-onboarding-v4', '1');
    setShowOnboarding(false);
  };

  const handleCloseMobilePrompt = () => {
    localStorage.setItem('surzo-mobile-prompt-v1', '1');
    setShowMobilePrompt(false);
  };

  const banner = <UpdateBanner info={updateInfo} progress={updateProgress} ready={updateReady} onClose={() => setUpdateInfo(null)} />;

  if (screen === 'settings')
    return <>{banner}{drag}<Settings onBack={() => setScreen('dashboard')} theme={theme} onToggleTheme={toggleTheme} onShowOnboarding={() => { localStorage.removeItem('surzo-onboarding-v4'); setShowOnboarding(true); setScreen('dashboard'); }} /></>;

  if (screen === 'friends')
    return <>{banner}{drag}<Friends onBack={() => setScreen('dashboard')} /></>;

  if (screen === 'ranking')
    return <>{banner}{drag}<Ranking onBack={() => setScreen('dashboard')} /></>;

  if (screen === 'start')
    return <>{banner}{drag}<StartSession onStart={handleStart} onBack={() => setScreen('dashboard')} targetScore={targetScore} /></>;

  if (screen === 'active' && sessionData)
    return <>{banner}{drag}<ActiveSession sessionData={sessionData} onEnd={handleEnd} /></>;

  if (screen === 'result' && doneSession)
    return <>{banner}{drag}<SessionResult session={doneSession} onDone={handleDone} /></>;

  if (screen === 'session-detail' && detailSession)
    return <>{banner}{drag}<SessionDetail session={detailSession} onBack={() => { setDetailSession(null); setScreen('dashboard'); }} /></>;

  return (
    <>{banner}{drag}
    {showMobilePrompt && <MobilePrompt onDone={handleCloseMobilePrompt} />}
    {showOnboarding && !showMobilePrompt && <Onboarding onClose={handleCloseOnboarding} />}
    <Dashboard
      sessions={sessions}
      onQuickStart={handleQuickStart}
      onCustomStart={() => setScreen('start')}
      hasPermission={hasPermission}
      onCheckPermission={handleCheckPermission}
      onSettings={() => setScreen('settings')}
      onFriends={() => setScreen('friends')}
      onRanking={() => setScreen('ranking')}
      onSessionDetail={s => { setDetailSession(s); setScreen('session-detail'); }}
      theme={theme}
      onToggleTheme={toggleTheme}
      targetScore={targetScore}
      onSetTarget={handleSetTarget}
    /></>
  );
}
