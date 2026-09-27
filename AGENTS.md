# misconduct-schedule — プロジェクト概要

## サイト概要

**Rinnavi - MHL / CxC**（`mhlcxc.rinnavi.com`）
MHL（Metro Hockey League）および CxC のスケジュール・レンタル情報などを公式サイトからスクレイピングして自動表示する非公式ツール。

- フレームワーク: Next.js 15 (App Router)
- スタイリング: Tailwind CSS
- デプロイ: Vercel（`npx vercel --prod` でデプロイ）
- ストレージ: Vercel KV（`@vercel/kv`、投票データ保存に使用）

---

## 実装済み機能

| ページ | 内容 |
|---|---|
| `/` | ゲームスケジュール（ディビジョン・月・チーム名フィルター、今後のみ表示、URL共有） |
| `/rental` | レンタルアイス情報（日付ソート、フィルター、URL共有） |
| `/events` | イベント情報（NEW バッジ付き） |
| `/contact` | お問い合わせフォーム（Resend でメール送信） |
| `/disclaimer` | 免責事項ページ |

### 主な機能
- Pull-to-Refresh（スケジュール・レンタルページ）
- スワイプジェスチャーでのページ遷移
- ハンバーガーメニュー（MHL/CXC リンク・お問い合わせ・免責事項）
- 水曜練習会 出欠・投票モーダル（Vercel KV で集計）
- ディビジョン別カラーバッジ
- URL パラメータによるフィルター共有
- イベント・プログラム紹介記事の詳細モーダル表示（`/events`）
- レンタル予定とイベントプログラムの自動マッチング＋詳細モーダル（`/rental`）
- APIレスポンスキャッシュ（ISR + Cache-Control）
- ページ読み込み中のスケルトンUI（`loading.tsx`）

---

## 現在のバージョン表記

`Ver.1-260405-1726`（Nav.tsx の h1 タグ内に表示）

---

## 未完了・検討中タスク

- [ ] スコア表示（現在は試合結果非対応）
- [ ] 水曜練習会投票の集計結果表示UI改善
- [ ] PWA対応（オフライン閲覧・ホーム画面追加）

## アーキテクチャメモ

### API キャッシュ構成
- `/api/schedule`: `revalidate=86400`（1日）+ `s-maxage=86400, stale-while-revalidate=3600`
- `/api/cron/schedule`: Vercel Cron で1日1回（03:00 UTC / 12:00 JST）巡回し、取得状態と試合数を確認
- `/api/standings`: `revalidate=172800`（48時間）+ `s-maxage=172800, stale-while-revalidate=86400`
- `/api/prev-season`: `revalidate=86400`（1日）
- `/api/standings-debug`: `force-dynamic`（デバッグ専用、常にリアルタイム）

### standings 共通モジュール
パース関数は `src/lib/standings.ts` に切り出し済み。`/api/standings`（キャッシュ有効）と `/api/standings-debug`（動的）の両方から利用。`/api/standings` は `GET()` に `req: Request` を受け取らないことでISRを有効化している。

### イベントプログラム連携
- `/api/events` がタイトルに「イベント・プログラム」を含む記事の詳細をスクレイピングし `programs` フィールドで返す
- `/events` ページ: 該当記事クリックでモーダル表示
- `/rental` ページ: 日付＋開始時刻でマッチングし「詳細」バッジ＋モーダル表示

## 作業記録

### 2026-06-14
- アクセス解析が更新されない問題を修正。`PageTracker` が未接続だったため、`src/app/layout.tsx` に追加して `/admin` 以外のページPVを `/api/track` に送るよう復元。
- `npx vercel --prod --yes` で本番反映済み（deployment `dpl_AbwUpFRWCNFY97RmzsmnV4o9KySc`、`mhlcxc.rinnavi.com` にエイリアス）。本番 `/api/track` への確認POSTは `{"ok":true}`。
- 右上ハンバーガーメニューに `/admin` への「管理者画面」導線を復元。
- 水曜練習会モーダルのおまけ漫画を `2026/6/17` に追加。
  - `2026/6/17`: `/wednesday-manga-vol3.jpg`
- `public/wednesday-manga-vol3.jpg` を追加（「水曜日のツーブロちゃん vol.3」）。
- `RESEND_API_KEY=re_dummy npm run build` で検証済み。
- `npx vercel --prod --yes` で本番反映済み（deployment `dpl_EyyNpqEB4HTQvqXPyt5593wmRhn5`、`mhlcxc.rinnavi.com` にエイリアス）。
- 管理者画面導線復元後、`npx vercel --prod --yes` で本番反映済み（deployment `dpl_CUR5r8uPzPPJssGr4sk8xkekGsjs`、`mhlcxc.rinnavi.com` にエイリアス）。

### 2026-05-31
- 水曜練習会モーダルのおまけ漫画を日付別に表示するよう更新。
  - `2026/5/27`: `/wednesday-manga-vol1.jpg`
  - `2026/6/3`: `/wednesday-manga-vol2.jpg`
- `public/wednesday-manga-vol2.jpg` を追加（「水曜日のツーブロちゃん vol.2」）。
- `WednesdayVoteModal` の `localStorage` 参照をマウント後に実行するよう修正し、`/rental?practice=2026%2F6%2F3` のサーバー描画時エラーを回避。
- 水曜練習会の参加費表示を `大人 3,000円` に変更。
  - `/rental` ページ内の説明
  - 投票モーダル内の説明
- `RESEND_API_KEY=re_dummy npm run build` で検証済み。
- `npx vercel --prod` で本番反映済み（`mhlcxc.rinnavi.com` にエイリアス）。

---

## デプロイ手順

```bash
npx vercel --prod
```

デプロイ後、`mhlcxc.rinnavi.com` に自動でエイリアスされる。

---

## 注意事項

- スクレイピング対象は MHL / CxC 公式サイト。サイト構造変更時はパーサーの修正が必要。
- 投票データは Vercel KV に保存。環境変数 `KV_REST_API_URL` / `KV_REST_API_TOKEN` が必要。
- お問い合わせメール送信は Resend を使用。環境変数 `RESEND_API_KEY` が必要。
