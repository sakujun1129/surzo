import { useState } from 'react';

const SLIDES = [
  {
    icon: '🎯',
    title: 'Surzoとは',
    body: 'MacとiPhoneを連携させて、作業セッションの集中度を記録するアプリです。PCの使用状況とスマホのチェック回数をもとにWork Scoreを算出します。',
  },
  {
    icon: '📊',
    title: 'Work Score',
    body: 'Macで使用中のアプリをもとに、集中度を0〜100のスコアで表示します。スコアは5段階のゾーン（DEEP FOCUS / ON TRACK / FOCUSED / DRIFTING / OFF TASK）に分類されます。',
  },
  {
    icon: '📱',
    title: 'スマホチェックの記録',
    body: 'セッション中にスマホを確認するときは「Check Phone」をタップします。タップした時間帯のみスマホ使用として記録され、それ以外の時間はカウントされません。',
  },
  {
    icon: '📸',
    title: 'セッションの記録',
    body: 'セッション終了後、Work Score・作業時間・カテゴリが自動で保存されます。写真を1〜3枚追加することができます。過去の記録はいつでも確認できます。',
  },
  {
    icon: '⚙️',
    title: 'はじめ方',
    body: '同じアカウントでMacとiPhoneにログインすると、自動的に連携されます。連携後はスマホからセッションの開始・終了を操作できます。',
  },
];

export default function Onboarding({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-8">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-zinc-600 hover:text-zinc-300 text-sm font-semibold transition-colors">
        閉じる
      </button>

      {/* Slide content */}
      <div className="w-full max-w-sm flex flex-col items-center text-center fadein" key={idx}>
        <div className="text-6xl mb-8">{slide.icon}</div>
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">{slide.title}</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">{slide.body}</p>
      </div>

      {/* Dots */}
      <div className="flex gap-2 mt-12 mb-8">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`rounded-full transition-all ${
              i === idx ? 'w-6 h-2 bg-lime-400' : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-500'
            }`}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 w-full max-w-sm">
        {idx > 0 && (
          <button
            onClick={() => setIdx(i => i - 1)}
            className="flex-1 py-3 rounded-2xl bg-zinc-800 text-zinc-300 font-bold text-sm hover:bg-zinc-700 transition-colors">
            戻る
          </button>
        )}
        <button
          onClick={isLast ? onClose : () => setIdx(i => i + 1)}
          className="flex-1 py-3 rounded-2xl bg-lime-400 text-black font-bold text-sm hover:bg-lime-300 transition-colors">
          {isLast ? '始める' : '次へ'}
        </button>
      </div>
    </div>
  );
}
