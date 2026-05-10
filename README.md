# Surzo

MacとiPhoneを連携させた作業集中度トラッキングアプリ。

## 構成

| | 技術スタック |
|---|---|
| **surzo-desktop** | Electron + React + Vite + Tailwind CSS + Supabase |
| **surzo-mobile** | Expo (React Native) + Supabase |

## 機能

- **Work Score**: 使用アプリをもとに集中度を0〜100でリアルタイム計測
- **スマホ連携**: iPhoneからセッション開始・終了・スマホチェック記録
- **セッション記録**: スコア・時間・カテゴリ・写真をクラウド保存
- **ランキング**: 合計／平均スコアでグローバルランキング

## セットアップ

```bash
# Desktop
cd surzo-desktop
cp .env.example .env  # Supabase credentials を記入
npm install
npm run dev

# Mobile
cd surzo-mobile
cp .env.example .env
npm install
npx expo start
```
