import { useState } from 'react';
import { CATEGORIES, CAT_ICON } from '../utils/categories.js';
import { Card } from './ui.jsx';

export default function StartSession({ onStart, onBack }) {
  const [title,          setTitle]    = useState('');
  const [category,       setCategory] = useState('Programming');
  const [plannedMinutes, setPlanned]  = useState(25);
  const [trackPhone,     setPhone]    = useState(true);

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 fadein">
        <div className="pt-2 mb-6">
          <button onClick={onBack} className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>
        <h2 className="text-2xl font-black mb-5">New Session</h2>

        <div className="space-y-3">
          <Card className="px-4 py-3">
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-1.5">
              Title <span className="normal-case text-stone-300 dark:text-zinc-700">(optional)</span>
            </div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. "${category} deep work"`}
              className="w-full bg-transparent text-stone-900 dark:text-white text-base placeholder-stone-300 dark:placeholder-zinc-700 outline-none"
            />
          </Card>

          <Card className="p-4">
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">Category</div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-colors text-left ${
                    category === cat
                      ? 'bg-lime-300 text-zinc-950'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  <span className="text-base">{CAT_ICON[cat]}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-baseline mb-3">
              <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest">Planned Duration</div>
              <div className="font-bold tabular-nums text-sm">{plannedMinutes} min</div>
            </div>
            <input
              type="range" min={5} max={120} step={5}
              value={plannedMinutes}
              onChange={e => setPlanned(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-stone-300 dark:text-zinc-700 text-xs mt-2">
              <span>5m</span><span>30m</span><span>1h</span><span>1.5h</span><span>2h</span>
            </div>
          </Card>

          <button
            onClick={() => setPhone(t => !t)}
            className="w-full bg-white dark:bg-zinc-900/80 border border-stone-200 dark:border-white/[0.06] hover:bg-stone-50 dark:hover:bg-zinc-800/80 rounded-3xl px-4 py-3.5 flex items-center justify-between transition-colors"
          >
            <div className="text-left">
              <div className="font-semibold text-sm">Track Phone Distractions</div>
              <div className="text-stone-400 dark:text-zinc-500 text-xs mt-0.5">Log each time you check your phone</div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${trackPhone ? 'bg-lime-300' : 'bg-stone-200 dark:bg-zinc-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${trackPhone ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>

        <button
          onClick={() => onStart({ title: title.trim() || category, category, plannedMinutes, trackPhone })}
          className="w-full bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950 font-black text-lg py-4 rounded-3xl transition-all mt-4"
        >
          Start
        </button>
      </div>
    </div>
  );
}
