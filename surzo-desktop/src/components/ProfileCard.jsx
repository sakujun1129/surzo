import { useState, useEffect } from 'react';
import { getUserProfile, getUserTopSessions, getFriendStatusWith, sendFriendRequest, acceptFriendRequest, removeFriendship, getFriendships, getUserId } from '../utils/storage.js';
import { scoreColor, fmtMin, fmtScore } from '../utils/format.js';

function calcTotal(s) {
  const avg = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  return Math.round(avg * mins);
}

export default function ProfileCard({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [topSessions, setTopSessions] = useState([]);
  const [status, setStatus]   = useState('none'); // none, sent, received, accepted, self
  const [busy, setBusy]       = useState(false);
  const [loading, setLoading] = useState(true);
  const myId = getUserId();

  useEffect(() => {
    setLoading(true);
    const isSelf = userId === myId;
    Promise.all([
      getUserProfile(userId),
      isSelf ? Promise.resolve([]) : getFriendStatusWith(userId),
      getUserTopSessions(userId, 3),
    ]).then(([p, s, tops]) => {
      setProfile(p);
      setStatus(isSelf ? 'self' : s);
      setTopSessions(tops);
    }).finally(() => setLoading(false));
  }, [userId]);

  const handleAdd = async () => {
    setBusy(true);
    await sendFriendRequest(userId);
    setStatus('sent');
    setBusy(false);
  };

  const handleAccept = async () => {
    setBusy(true);
    const ships = await getFriendships();
    const ship = ships.find(s => (s.requester_id === userId && s.addressee_id === myId));
    if (ship) {
      await acceptFriendRequest(ship.id);
      setStatus('accepted');
    }
    setBusy(false);
  };

  const handleRemove = async () => {
    setBusy(true);
    const ships = await getFriendships();
    const ship = ships.find(s =>
      (s.requester_id === userId && s.addressee_id === myId) ||
      (s.requester_id === myId && s.addressee_id === userId));
    if (ship) {
      await removeFriendship(ship.id);
      setStatus('none');
    }
    setBusy(false);
  };

  const name = profile?.display_name || profile?.email_handle || '?';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-950 rounded-t-3xl p-6 pb-8 fadein max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 24px)' }}>
        <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-800 rounded-full mx-auto mb-5" />

        {loading ? (
          <div className="text-center py-10 text-zinc-500 text-sm">読み込み中…</div>
        ) : !profile ? (
          <div className="text-center py-10 text-zinc-500 text-sm">プロフィールが見つかりません</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-black"
                style={{ background: '#d4f57a', color: '#000' }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-black tracking-tight truncate">{name}</div>
                <div className="text-zinc-500 dark:text-zinc-600 text-xs mt-0.5">
                  {profile.flag_emoji} {profile.country || '—'}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="text-center py-3 rounded-2xl bg-stone-100 dark:bg-zinc-900">
                <div className="text-stone-400 dark:text-zinc-600 text-[10px] font-bold tracking-widest mb-1">SESSIONS</div>
                <div className="font-black tabular-nums" style={{ fontSize: 22 }}>{profile.sessions_count || 0}</div>
              </div>
              <div className="text-center py-3 rounded-2xl bg-stone-100 dark:bg-zinc-900">
                <div className="text-stone-400 dark:text-zinc-600 text-[10px] font-bold tracking-widest mb-1">AVG</div>
                <div className="font-black tabular-nums" style={{ fontSize: 22, color: scoreColor(profile.avg_score) }}>{profile.avg_score || '—'}</div>
              </div>
              <div className="text-center py-3 rounded-2xl bg-stone-100 dark:bg-zinc-900">
                <div className="text-stone-400 dark:text-zinc-600 text-[10px] font-bold tracking-widest mb-1">TOTAL</div>
                <div className="font-black tabular-nums" style={{ fontSize: 22, color: '#8ecf5a' }}>{fmtScore(profile.total_pts || 0)}</div>
              </div>
            </div>

            {/* Top 3 sessions (visible only to self or friends due to RLS) */}
            {topSessions.length > 0 && (
              <>
                <div className="text-stone-400 dark:text-zinc-600 text-[10px] font-bold tracking-widest mb-2.5">TOP SESSIONS</div>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {topSessions.map(s => {
                    const c = scoreColor(s.averageWorkScore);
                    return (
                      <div key={s.id} className="rounded-2xl overflow-hidden relative aspect-[3/4]" style={{ background: '#18181b' }}>
                        {s.photoUri?.startsWith('https://') ? (
                          <>
                            <img src={s.photoUri} className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />
                            <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
                              <div className="font-black tabular-nums text-base leading-none" style={{ color: c }}>{s.averageWorkScore}</div>
                              <div className="text-[9px] font-semibold mt-1 truncate text-white/70">{s.title}</div>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full p-2">
                            <div className="font-black tabular-nums" style={{ fontSize: 28, color: c }}>{s.averageWorkScore}</div>
                            <div className="text-[9px] mt-1 truncate w-full text-center text-zinc-400">{s.title}</div>
                            <div className="text-[9px] text-zinc-600 mt-0.5">{fmtMin(s.durationMinutes)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {status === 'accepted' && topSessions.length === 0 && (
              <p className="text-center text-zinc-500 text-xs py-6">セッションがまだありません</p>
            )}

            {/* Action button */}
            {status === 'self' ? (
              <button onClick={onClose}
                className="w-full bg-stone-100 dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 font-bold py-3.5 rounded-2xl">
                閉じる
              </button>
            ) : status === 'none' ? (
              <button onClick={handleAdd} disabled={busy}
                className="w-full bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950 font-black py-3.5 rounded-2xl transition-all disabled:opacity-60">
                + フレンド追加
              </button>
            ) : status === 'sent' ? (
              <button disabled
                className="w-full bg-stone-200 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 font-bold py-3.5 rounded-2xl">
                リクエスト送信済み
              </button>
            ) : status === 'received' ? (
              <button onClick={handleAccept} disabled={busy}
                className="w-full bg-lime-300 active:scale-[.98] text-zinc-950 font-black py-3.5 rounded-2xl">
                ✓ リクエストを承認
              </button>
            ) : (
              <button onClick={handleRemove} disabled={busy}
                className="w-full bg-stone-100 dark:bg-zinc-900 text-red-500 font-bold py-3.5 rounded-2xl">
                フレンドから削除
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
