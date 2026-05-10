import { useState, useEffect } from 'react';
import { getSessions, getSupabase, getUserId, saveSession } from './utils/storage.js';
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

export default function App() {
  const [screen,        setScreen]       = useState('dashboard');
  const [sessions,      setSessions]     = useState([]);
  const [sessionData,   setSessionData]  = useState(null);
  const [doneSession,   setDoneSession]  = useState(null);
  const [hasPermission, setPermission]   = useState(true);
  const [theme,         setTheme]        = useState(() => localStorage.getItem('surzo-theme') || 'dark');
  const [authed,        setAuthed]       = useState(false);
  const [authLoading,   setAuthLoading]  = useState(true);
  const [detailSession, setDetailSession] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleStart = async ({ title, category, plannedMinutes, trackPhone }) => {
    const data = { id: genId(), title, category, plannedMinutes, trackPhone };
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
  }, [authed]);

  // スマホからのセッション開始コマンドを受信
  useEffect(() => {
    if (!authed) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const uid = getUserId();
    if (!uid) return;

    const channel = supabase.channel('session-commands')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'session_commands',
        filter: `user_id=eq.${uid}`,
      }, (payload) => {
        const { command, data } = payload.new;
        if (command === 'start') handleStart({ trackPhone: true, ...data });
        if (command === 'stop') {
          Promise.resolve(window.electronAPI?.endSession()).then(async result => {
            if (result) await saveSession(result);
            handleEnd(result ?? null);
          }).catch(() => handleEnd(null));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [authed]);

  if (authLoading) return null;
  if (!authed) return <AuthScreen />;

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('surzo-theme', next);
    if (next === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  const handleCheckPermission = () => {
    window.electronAPI?.checkAccessibility().then(({ ok }) => setPermission(ok));
  };

  const handleQuickStart = () => {
    handleStart({ title: 'Quick Session', category: 'General Work', plannedMinutes: 25, trackPhone: true });
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

  if (screen === 'settings')
    return <>{drag}<Settings onBack={() => setScreen('dashboard')} theme={theme} onToggleTheme={toggleTheme} /></>;

  if (screen === 'friends')
    return <>{drag}<Friends onBack={() => setScreen('dashboard')} /></>;

  if (screen === 'ranking')
    return <>{drag}<Ranking onBack={() => setScreen('dashboard')} /></>;

  if (screen === 'start')
    return <>{drag}<StartSession onStart={handleStart} onBack={() => setScreen('dashboard')} /></>;

  if (screen === 'active' && sessionData)
    return <>{drag}<ActiveSession sessionData={sessionData} onEnd={handleEnd} /></>;

  if (screen === 'result' && doneSession)
    return <>{drag}<SessionResult session={doneSession} onDone={handleDone} /></>;

  if (screen === 'session-detail' && detailSession)
    return <>{drag}<SessionDetail session={detailSession} onBack={() => { setDetailSession(null); setScreen('dashboard'); }} /></>;

  return (
    <>{drag}
    {showOnboarding && <Onboarding onClose={handleCloseOnboarding} />}
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
    /></>
  );
}
