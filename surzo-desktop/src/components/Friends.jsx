import { useState, useEffect } from 'react';
import { fmtMin, scoreTextColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card } from './ui.jsx';

function loadFriends() {
  try { return JSON.parse(localStorage.getItem('surzo-friends') || '[]'); } catch { return []; }
}
function saveFriends(list) {
  localStorage.setItem('surzo-friends', JSON.stringify(list));
}

export default function Friends({ onBack }) {
  const [friends, setFriends] = useState(loadFriends);
  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [added,   setAdded]   = useState(false);

  const handleAdd = () => {
    setError('');
    try {
      const parsed = JSON.parse(atob(code.trim()));
      if (!parsed.name || !parsed.session) throw new Error('Invalid code');
      const updated = [...friends, { ...parsed, addedAt: Date.now() }];
      setFriends(updated);
      saveFriends(updated);
      setCode('');
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch {
      setError('Invalid code. Ask your friend to copy their Friend Code from session results.');
    }
  };

  const handleRemove = (i) => {
    const updated = friends.filter((_, idx) => idx !== i);
    setFriends(updated);
    saveFriends(updated);
  };

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8 fadein">
        <div className="pt-2 mb-6">
          <button onClick={onBack} className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>
        <h2 className="text-2xl font-black mb-1">Friends</h2>
        <p className="text-stone-400 dark:text-zinc-600 text-sm mb-6">Add friends with their session code.</p>

        {/* Add friend */}
        <Card className="p-4 mb-5">
          <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Add Friend</div>
          <textarea
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            placeholder="Paste friend code here…"
            rows={2}
            className="w-full bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-white text-xs px-3 py-2.5 rounded-2xl placeholder-stone-400 dark:placeholder-zinc-600 outline-none resize-none mb-2 font-mono"
          />
          {error && <p className="text-orange-500 text-xs mb-2">{error}</p>}
          <button
            onClick={handleAdd}
            disabled={!code.trim()}
            className={`w-full py-3 rounded-2xl text-sm font-black transition-colors ${
              code.trim()
                ? 'bg-lime-300 hover:bg-lime-200 text-zinc-950'
                : 'bg-stone-100 dark:bg-zinc-800 text-stone-300 dark:text-zinc-600 cursor-not-allowed'
            }`}
          >
            {added ? '✓ Friend added!' : 'Add Friend'}
          </button>
        </Card>

        {/* Friend list */}
        {friends.length > 0 ? (
          <>
            <div className="text-stone-400 dark:text-zinc-700 text-xs uppercase tracking-widest mb-3">
              {friends.length} friend{friends.length !== 1 ? 's' : ''}
            </div>
            <div className="space-y-2">
              {friends.map((f, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-sm">{f.name}</div>
                      <div className="text-stone-400 dark:text-zinc-600 text-xs mt-0.5">
                        Added {new Date(f.addedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(i)}
                      className="text-stone-300 dark:text-zinc-700 hover:text-stone-500 dark:hover:text-zinc-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  {f.session && (
                    <div className="bg-stone-50 dark:bg-zinc-800/60 rounded-2xl px-3 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{CAT_ICON[f.session.category] || '⚡'}</span>
                        <div>
                          <div className="text-sm font-semibold leading-tight">{f.session.title}</div>
                          <div className="text-stone-400 dark:text-zinc-600 text-xs mt-0.5">
                            {fmtMin(f.session.durationMinutes)} · {new Date(f.session.startedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div className={`text-2xl font-black tabular-nums ${scoreTextColor(f.session.averageWorkScore)}`}>
                        {f.session.averageWorkScore}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-4xl mb-3 opacity-20">👥</div>
            <p className="text-stone-400 dark:text-zinc-600 text-sm">No friends yet.</p>
            <p className="text-stone-300 dark:text-zinc-700 text-xs mt-1">Ask them to copy their Friend Code from their session result.</p>
          </div>
        )}
      </div>
    </div>
  );
}
