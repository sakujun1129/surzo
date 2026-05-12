import { useState, useEffect } from 'react';
import { getLeaderboard, searchUsersByName, getUserId } from '../utils/storage.js';
import ProfileCard from './ProfileCard.jsx';

function fmtScore(n, metric) {
  if (metric === 'total') {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000)    return `${Math.round(n / 1000)}k`;
    if (n >= 1_000)     return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  }
  return String(n);
}
function rankColor(s) { return s >= 70 ? '#22c55e' : s >= 40 ? '#eab308' : '#ef4444'; }
function medal(r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null; }

export default function Ranking({ onBack }) {
  const [scope,  setScope]  = useState('daily'); // daily | all_time
  const [metric, setMetric] = useState('total'); // total | avg
  const [rows,   setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const [searching, setSearching] = useState(false);

  const myId = getUserId();

  useEffect(() => {
    setLoading(true);
    getLeaderboard({ scope, metric, limit: 50 })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [scope, metric]);

  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchUsersByName(searchQ, 20)
        .then(setSearchRes)
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  const renderRow = (item, idx, isSearch) => {
    const rank = idx + 1;
    const m = !isSearch ? medal(rank) : null;
    const score = scope === 'daily'
      ? (metric === 'total' ? (item.daily_pts || 0) : (item.daily_avg || 0))
      : (metric === 'total' ? (item.total_pts || 0) : (item.avg_score || 0));
    const color = rankColor(scope === 'daily' ? (item.daily_avg || 0) : (item.avg_score || 0));
    const isMe = item.id === myId;
    const name = item.display_name || item.email_handle || '?';
    return (
      <button key={item.id} onClick={() => setSelected(item)}
        className={`flex items-center bg-stone-100 dark:bg-zinc-900 rounded-2xl px-4 py-3 text-left active:scale-[.99] transition-all
          ${isMe ? 'ring-1 ring-lime-400/30 bg-lime-50 dark:bg-lime-950/20' : ''}`}>
        {!isSearch && (
          <div className="w-8 flex items-center justify-center">
            {m
              ? <span className="text-xl">{m}</span>
              : <span className={`text-sm font-black ${rank <= 10 ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-300 dark:text-zinc-600'}`}>{rank}</span>}
          </div>
        )}
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black overflow-hidden ml-2"
          style={{ background: '#d4f57a', color: '#000', fontSize: 13 }}>
          {item.avatar_url ? <img src={item.avatar_url} alt="" className="w-full h-full object-cover" /> : name.slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 ml-3">
          <div className={`font-bold text-sm truncate ${isMe ? 'text-lime-600 dark:text-lime-400' : 'text-stone-900 dark:text-white'}`}>
            {name}{isMe && ' (you)'}
          </div>
          <div className="text-xs text-stone-400 dark:text-zinc-600 mt-0.5">
            {scope === 'daily' ? `今日 ${item.daily_sessions || 0} sessions` : `${item.sessions_count || 0} sessions`}
          </div>
        </div>
        <span className="text-2xl font-black tracking-tight tabular-nums" style={{ color }}>
          {fmtScore(score, metric)}
        </span>
      </button>
    );
  };

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8 fadein">
        <div className="pt-2 mb-5">
          <button onClick={onBack}
            className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>

        <h2 className="text-2xl font-black mb-5 tracking-tight">Ranking</h2>

        {/* Search bar */}
        <div className="relative mb-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-600">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="ユーザーを検索…"
            className="w-full bg-stone-100 dark:bg-zinc-900 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none border border-transparent focus:border-lime-300/40 transition-colors" />
        </div>

        {searchQ.trim() ? (
          searching ? (
            <div className="text-center py-6 text-stone-400 dark:text-zinc-600 text-sm">検索中…</div>
          ) : searchRes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-stone-400 dark:text-zinc-500">該当ユーザーなし</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {searchRes.map((item, i) => renderRow(item, i, true))}
            </div>
          )
        ) : (
          <>
            <div className="flex bg-stone-100 dark:bg-zinc-800 rounded-xl p-1 mb-3">
              {[
                { id: 'daily', label: '今日' },
                { id: 'all_time', label: '通算' },
              ].map(s => (
                <button key={s.id} onClick={() => setScope(s.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors
                    ${scope === s.id
                      ? 'bg-white dark:bg-zinc-700 text-stone-900 dark:text-white shadow-sm'
                      : 'text-stone-400 dark:text-zinc-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-5">
              {[
                { id: 'total', label: '合計 pts' },
                { id: 'avg',   label: '平均 score' },
              ].map(m => (
                <button key={m.id} onClick={() => setMetric(m.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors
                    ${metric === m.id
                      ? 'bg-stone-200 dark:bg-zinc-700 text-stone-900 dark:text-white'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500'}`}>
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex px-1 mb-2 text-xs font-semibold text-stone-300 dark:text-zinc-700 tracking-wider uppercase">
              <span>Rank</span>
              <span className="flex-1" />
              <span>{metric === 'total' ? 'Total' : 'Avg'}</span>
            </div>

            {loading ? (
              <div className="text-center py-10 text-zinc-600 text-sm">読み込み中…</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-stone-500 dark:text-zinc-500">
                  {scope === 'daily' ? '今日のランキングはまだ空です' : 'まだランキングデータがありません'}
                </p>
                <p className="text-xs text-stone-400 dark:text-zinc-700 mt-1">セッションを完了すると登録されます</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((item, idx) => renderRow(item, idx, false))}
              </div>
            )}
          </>
        )}
      </div>

      {selected && <ProfileCard userId={selected.id} onClose={() => setSelected(null)} />}
    </div>
  );
}
