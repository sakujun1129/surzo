import { useState, useEffect } from 'react';
import { getSupabase } from '../utils/storage.js';
import Onboarding from './Onboarding.jsx';

export default function AuthScreen() {
  const [mode,     setMode]     = useState('login'); // 'login' | 'signup'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('surzo-onboarding-v4')) setShowOnboarding(true);
  }, []);

  const handleCloseOnboarding = () => {
    localStorage.setItem('surzo-onboarding-v4', '1');
    setShowOnboarding(false);
  };

  const supabase = getSupabase();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        // If Supabase auto-confirmed (no email verification required on their end),
        // sign out immediately so user must verify properly.
        if (data.session) await supabase.auth.signOut();
        setDone(true);
      }
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div className="h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(212,245,122,0.1)', border: '1px solid rgba(212,245,122,0.2)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4f57a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
          </div>
          <h2 className="text-xl font-black mb-2 tracking-tight">確認メールを送りました</h2>
          <p className="text-zinc-500 text-sm leading-relaxed mb-1">{email} にメールを送りました。</p>
          <p className="text-zinc-600 text-sm leading-relaxed">メール内のリンクをクリックして、アカウントを有効化してください。</p>
          <button onClick={() => { setDone(false); setMode('login'); }}
            className="mt-7 text-sm font-semibold text-lime-400 hover:text-lime-300 transition-colors">
            ログインに戻る →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      {showOnboarding && <Onboarding onClose={handleCloseOnboarding} />}
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black mb-1">Surzo</h1>
        <p className="text-zinc-500 text-sm mb-8">
          {mode === 'login' ? 'ログイン' : 'アカウント作成'}
        </p>

        <form onSubmit={handle} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm outline-none focus:border-lime-400 transition-colors"
          />
          <input
            type="password"
            placeholder="パスワード（8文字以上）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm outline-none focus:border-lime-400 transition-colors"
          />

          {error && <p className="text-red-400 text-xs px-1">{error}</p>}

          <button type="submit" disabled={loading}
            className="bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950 font-black py-3 rounded-2xl transition-all disabled:opacity-50 mt-1">
            {loading ? '...' : mode === 'login' ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>

        <button onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(null); }}
          className="w-full text-center text-zinc-500 hover:text-zinc-300 text-sm mt-5 transition-colors">
          {mode === 'login' ? 'アカウントをお持ちでない方はこちら' : 'すでにアカウントをお持ちの方'}
        </button>
      </div>
    </div>
  );
}
