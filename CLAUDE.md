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
- `/api/schedule`: `revalidate=3600`（1時間）+ `s-maxage=3600, stale-while-revalidate=1800`
- `/api/standings`: `revalidate=172800`（48時間）+ `s-maxage=172800, stale-while-revalidate=86400`
- `/api/prev-season`: `revalidate=86400`（1日）
- `/api/standings-debug`: `force-dynamic`（デバッグ専用、常にリアルタイム）

### standings 共通モジュール
パース関数は `src/lib/standings.ts` に切り出し済み。`/api/standings`（キャッシュ有効）と `/api/standings-debug`（動的）の両方から利用。`/api/standings` は `GET()` に `req: Request` を受け取らないことでISRを有効化している。

### イベントプログラム連携
- `/api/events` がタイトルに「イベント・プログラム」を含む記事の詳細をスクレイピングし `programs` フィールドで返す
- `/events` ページ: 該当記事クリックでモーダル表示
- `/rental` ページ: 日付＋開始時刻でマッチングし「詳細」バッジ＋モーダル表示

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
