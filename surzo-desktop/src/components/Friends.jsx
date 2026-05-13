import { useState, useEffect } from 'react';
import { fmtMin, fmtScore, isToday, scoreColor } from '../utils/format.js';
import {
  getFriendsList, getPendingRequests, getFriendsFeed,
  acceptFriendRequest, removeFriendship, searchUsersByName,
} from '../utils/storage.js';
import { useReveal, useCountUp } from '../utils/hooks.js';
import { Card } from './ui.jsx';
import ProfileCard from './ProfileCard.jsx';

function calcTotal(s) {
  const avg = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  return Math.round(avg * mins);
}

function timeAgo(iso) {
  const d = new Date(iso);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'たった今';
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}日前`;
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function FriendsSheet({ friends, requests, reload, onClose, onSelectUser }) {
  const [innerTab, setInnerTab] = useState(requests.length > 0 ? 'requests' : 'friends');
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchUsersByName(searchQ, 20).then(setSearchRes).finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md mx-4 bg-white dark:bg-zinc-950 rounded-3xl p-5 fadein max-h-[88vh] overflow-y-auto">
        {/* Search */}
        <div className="relative mb-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-600">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="名前で検索してフレンド追加…"
            className="w-full bg-stone-100 dark:bg-zinc-900 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none border border-transparent focus:border-lime-300/40 transition-colors" />
        </div>

        {searchQ.trim() ? (
          searching ? (
            <div className="text-center py-6 text-stone-400 dark:text-zinc-600 text-sm">検索中…</div>
          ) : searchRes.length === 0 ? (
            <div className="text-center py-8"><p className="text-sm text-stone-400 dark:text-zinc-500">該当ユーザーなし</p></div>
          ) : (
            <div className="space-y-2 mb-4">
              {searchRes.map(u => {
                const name = u.display_name || u.email_handle || '?';
                return (
                  <button key={u.id} onClick={() => { onClose(); onSelectUser(u.id); }}
                    className="w-full text-left active:scale-[.99] transition-all">
                    <Card className="p-3.5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black overflow-hidden"
                        style={{ background: '#d4f57a', color: '#000', fontSize: 13 }}>
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{name}</div>
                        <div className="text-xs text-stone-400 dark:text-zinc-600 mt-0.5">{u.sessions_count || 0} sessions · avg {u.avg_score || 0}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-stone-300 dark:text-zinc-600">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </Card>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              {[
                { id: 'friends', label: `フレンド${friends.length ? ` ${friends.length}` : ''}` },
                { id: 'requests', label: `リクエスト${requests.length ? ` ${requests.length}` : ''}` },
              ].map(t => (
                <button key={t.id} onClick={() => setInnerTab(t.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
                  style={{
                    background: innerTab === t.id ? 'var(--accent)' : 'transparent',
                    color: innerTab === t.id ? '#06060a' : 'var(--text-sub)',
                    border: innerTab === t.id ? 'none' : '1px solid var(--card-border)',
                  }}>{t.label}</button>
              ))}
            </div>

            {innerTab === 'friends' ? (
              friends.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>フレンドがまだいません</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>ランキング・検索から追加できます</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map(f => {
                    const name = f.display_name || f.email_handle || '?';
                    return (
                      <button key={f.id} onClick={() => { onClose(); onSelectUser(f.id); }}
                        className="w-full text-left active:scale-[.99] transition-all">
                        <Card className="p-3.5 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black overflow-hidden"
                            style={{ background: '#d4f57a', color: '#000', fontSize: 13 }}>
                            {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" /> : name.slice(0,2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">{name}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.sessions_count || 0} sessions · avg {f.avg_score || 0}</div>
                          </div>
                          <div className="font-black tabular-nums" style={{ fontSize: 18, color: 'var(--accent)' }}>{fmtScore(f.total_pts || 0)}</div>
                        </Card>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              requests.length === 0 ? (
                <div className="text-center py-10"><p className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>受信中のリクエストなし</p></div>
              ) : (
                <div className="space-y-2">
                  {requests.map(p => {
                    const name = p.display_name || p.email_handle || '?';
                    return (
                      <Card key={p.id} className="p-3.5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black overflow-hidden"
                          style={{ background: '#d4f57a', color: '#000', fontSize: 13 }}>
                          {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : name.slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{name}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>フレンド申請</div>
                        </div>
                        <button onClick={async () => { await acceptFriendRequest(p.friendship_id); reload(); }}
                          className="rounded-lg font-bold text-xs px-3 py-2"
                          style={{ background: 'var(--accent)', color: '#06060a' }}>承認</button>
                        <button onClick={async () => { await removeFriendship(p.friendship_id); reload(); }}
                          className="rounded-lg font-semibold text-xs px-2.5 py-2"
                          style={{ color: 'var(--text-muted)' }}>×</button>
                      </Card>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        <button onClick={onClose}
          className="w-full mt-4 py-3 text-sm font-semibold"
          style={{ color: 'var(--text-muted)' }}>閉じる</button>
      </div>
    </div>
  );
}

function getZone(s) {
  if (s >= 85) return 'DEEP FOCUS';
  if (s >= 70) return 'ON TRACK';
  if (s >= 55) return 'FOCUSED';
  if (s >= 38) return 'DRIFTING';
  if (s >= 20) return 'OFF TASK';
  return 'DISTRACTED';
}

// Share-card style feed card — photos only (BeReal feel)
function FeedItem({ user, session, created_at, onTapUser }) {
  const c    = scoreColor(session.averageWorkScore);
  const pts  = calcTotal(session);
  const zone = getZone(session.averageWorkScore);
  const name = user.display_name || user.email_handle || '?';
  const rgba = (rgb, a) => rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const dateStr = new Date(session.endedAt || session.startedAt || created_at)
                    .toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  const [revealRef, revealed] = useReveal();
  const animatedScore = useCountUp(session.averageWorkScore, 800, revealed);

  return (
    <div ref={revealRef} className={`relative rounded-3xl overflow-hidden shadow-2xl mb-4 reveal ${revealed ? 'in' : ''}`}
         style={{ aspectRatio: '4/5', background: '#08080b' }}>
      <img src={session.photoUri} className="absolute inset-0 w-full h-full object-cover" alt="" />
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 28%, rgba(0,0,0,0.30) 58%, rgba(0,0,0,0.92) 100%)',
      }} />

      {/* Top: avatar (tap → profile) + name + date */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-5 pt-5">
        <button onClick={() => onTapUser(user.id)}
                className="flex items-center gap-2.5 min-w-0 max-w-[68%] active:scale-95 transition-transform">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black overflow-hidden"
               style={{ background: '#d4f57a', color: '#000', fontSize: 13 }}>
            {user.avatar_url
              ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              : name.slice(0,2).toUpperCase()}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-white font-bold text-sm truncate">{name}</div>
            <div className="text-white/55 text-[10px] mt-0.5 truncate">
              {user.flag_emoji || '🌐'} · {timeAgo(created_at)}
            </div>
          </div>
        </button>
        <span className="text-white/55 text-[10px] font-semibold mt-1 tabular-nums truncate ml-2">{dateStr}</span>
      </div>

      {/* Bottom: title + huge score + zone/pts */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
        <div className="text-white font-black text-base leading-tight mb-0.5 truncate" style={{ letterSpacing: '-0.01em' }}>
          {session.title}
        </div>
        <div className="text-white/55 text-[11px] tabular-nums mb-2">
          {session.category} · {fmtMin(session.durationMinutes)}
          {session.phoneDistractionCount > 0 && <span className="text-orange-400 ml-1.5">· 📱×{session.phoneDistractionCount}</span>}
        </div>
        <div className="flex items-end gap-3">
          <div className="font-black tabular-nums leading-[0.82]"
               style={{ fontSize: 'clamp(72px, 18vw, 110px)', color: c, letterSpacing: '-0.06em',
                        textShadow: '0 4px 24px rgba(0,0,0,0.55)' }}>
            {animatedScore}
          </div>
          <div className="pb-1.5 min-w-0">
            <div className="font-extrabold tracking-[2px] text-[9px] mb-1" style={{ color: c }}>{zone}</div>
            <div className="text-white/45 text-[8px] font-bold tracking-widest">WORK SCORE</div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-black text-white tabular-nums text-base">{fmtScore(pts)}</span>
              <span className="text-white/45 text-[8px] font-bold tracking-widest">PTS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Friends({ onBack }) {
  const [feed, setFeed] = useState([]);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([getFriendsFeed(30), getFriendsList(), getPendingRequests()])
      .then(([f, fr, r]) => {
        // Photos-only feed (BeReal feel)
        const photoFeed = f.filter(x => x.session?.photoUri?.startsWith('https://'));
        setFeed(photoFeed); setFriends(fr); setRequests(r);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8 fadein">
        <div className="pt-2 mb-5">
          <button onClick={onBack}
            className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-black tracking-tight">Friends</h2>
          <button onClick={() => setSheetOpen(true)}
            className="relative w-10 h-10 rounded-full flex items-center justify-center active:scale-[.96] transition-all"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            {requests.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-black px-1"
                style={{ background: '#fb923c', color: '#000' }}>
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>読み込み中…</div>
        ) : feed.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>フィードはまだ空です</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>写真付きのセッションだけがここに流れます</p>
          </div>
        ) : (
          <div>
            {feed.map((item, i) => (
              <FeedItem key={`${item.user.id}-${item.created_at}-${i}`}
                user={item.user} session={item.session} created_at={item.created_at}
                onTapUser={(uid) => setSelected(uid)} />
            ))}
          </div>
        )}
      </div>

      {sheetOpen && (
        <FriendsSheet friends={friends} requests={requests} reload={reload}
          onClose={() => setSheetOpen(false)} onSelectUser={setSelected} />
      )}
      {selected && <ProfileCard userId={selected} onClose={() => { setSelected(null); reload(); }} />}
    </div>
  );
}
