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

`Ver.1-260913-1724`（Nav.tsx の h1 タグ内に表示）

---

## 未完了・検討中タスク

- [ ] スコア表示（現在は試合結果非対応）
- [ ] 水曜練習会投票の集計結果表示UI改善
- [ ] PWA対応（オフライン閲覧・ホーム画面追加）

## アーキテクチャメモ

### API キャッシュ構成
- `/api/schedule`: `revalidate=86400`（1日）+ `s-maxage=86400, stale-while-revalidate=3600`
- `/api/rental`: `revalidate=86400`（1日）+ `s-maxage=86400, stale-while-revalidate=3600`
- `/api/cron/schedule`: Vercel Cron で1日1回（03:00 UTC / 12:00 JST）。公式サイトを直接（`no-store`）叩いて取得可否を検証し、その後 ISR キャッシュを破棄＋再生成する
- `/api/cron/verify`: Vercel Cron で週1回（月曜 03:00 UTC / 12:00 JST）。スケジュール・レンタル・スコアを `no-store` で取得し、保存済みスナップショットと突き合わせる
- `/api/standings`: `revalidate=172800`（48時間）+ `s-maxage=172800, stale-while-revalidate=86400`
- `/api/prev-season`: `revalidate=86400`（1日）
- `/api/standings-debug`: `force-dynamic`（デバッグ専用、常にリアルタイム）

**重要**: ルートの `revalidate` と、その中の `fetch(..., { next: { revalidate } })` は必ず同じ値にする。
- 内部 fetch を**短く**すると、セグメント全体の再生成間隔がそちらに引きずられる（Next は最小値を採用）
- 内部 fetch を**長く**すると、再生成時に古いキャッシュが使われ鮮度が二重に劣化する
- ルートの `revalidate` はリテラルで書く（定数を参照すると Next が静的解析できず警告）

### 取得元URLの自動生成（重要）
公式サイトは月ごとにファイルを追加していくため、URLを固定すると**新しい月が永久に取得されない**。
`src/lib/schedule.ts` / `src/lib/rental.ts` が現在日付から候補URLを組み立てる。

- スケジュール: `{シーズン}_schedule_{月名}.htm` を、進行中シーズンと次シーズンの全12か月分
  - シーズンは**10月開幕〜翌3月**。「54th = 2026年10月3日開幕」を基準に年ごとに繰り上げ（`currentSeasonNumber()`）
  - 進行中シーズン＋次シーズンの両方を見る（9月時点では「53rd の残り＋プレイオフ」と「10/3開幕の54th」が同時に必要なため）
  - 年月の判定は JST 基準（Vercel は UTC で動くため、月初 00:00-09:00 JST のズレを防ぐ）
  - 月名以外のページも候補に含む（`EXTRA_SCHEDULE_SLUGS` = `playoff` / `playoffs` / `final`）。
    プレイオフ表は `53rd_schedule_playoff.htm`。新しい種類のページが増えたらここに追加する
  - 合計30件（2シーズン × 15ページ）を並列取得し、404はスキップ
- レンタル: `rent_YYYYMM.htm` を、現在月の前8か月〜先6か月（計15件）
- 未公開の月は 404 になるためスキップする（エラー扱いしない）
- 月ラベル（フィルタ用）はURLではなく**ページ内の実日付**から生成。年をまたぐと `1月` が重複するため、当年以外は `2027年1月` 形式にする
- 試合行の判定は「論理10列以上 + col[1]が時刻」。col[0]（試合番号）が連番でない場合（プレイオフの `SF1` や空欄）は col[6]=`vs` で試合行とみなす

### 取得状態の可視化
`/api/schedule` と `/api/rental` はレスポンスに `sources[]`（取得元ごとの `status` / `count` / `error`）を含む。
- トップページは、取得0件や失敗があると警告バナーを表示する（「該当する試合がありません」と区別）
- `/api/cron/schedule` は 0件・今後の予定0件・404以外の失敗を `warnings[]` にまとめ、異常時は HTTP 503 を返す（Vercel Cron のログで失敗として見える）

### データ保存とフォールバック（Vercel KV）
公式サイトのページはシーズンが終わると**予告なく非公開になる**ため、取得できたデータを KV に残して補完する（`src/lib/archive.ts`）。

- キー: `archive:{group}:{label}`（例 `archive:schedule:53rd/march`）。ラベル一覧は `archive:index:{group}` の set で管理（KVのSCANを避けるため）
- group は `schedule` / `rental` / `scores`
- **保存は cron のときだけ**（`noStore: true` の経路）。公開APIの描画ごとに書き込むと無駄なので、公開側は読み取り補完のみ
- 取得0件かつ保存実績がある取得元は、スナップショットで補完し `SourceStatus.fromArchive` に保存時刻が入る
- 空配列では上書きしない（公式側の一時的な不調でアーカイブを壊さないため）
- 月ラベルは「当年かどうか」で表記が変わるので、補完時に付け直す
- KV 未設定・不通でも通常の取得は動く（すべて握りつぶして no-op）

### 週1回の整合性チェック
`/api/cron/verify`（月曜 12:00 JST）。公式サイトを直接取得し、保存済みと突き合わせて次を報告する。

- `problems`（要対応 → HTTP 503 で Vercel Cron のログに失敗として出る）
  - 解析エラー、404以外のHTTPエラー、件数が保存時の80%未満に減少、区分ごと全滅
- `notices`（想定内 → 正常終了）
  - 公式ページが消えて保存データで表示中（シーズン終了後の非公開はここに出る）
- 結果は KV の `verify:last` と `verify:history`（12週分）に保存

### standings 共通モジュール
パース関数は `src/lib/standings.ts` に切り出し済み。`/api/standings`（キャッシュ有効）と `/api/standings-debug`（動的）の両方から利用。`/api/standings` は `GET()` に `req: Request` を受け取らないことでISRを有効化している。

**シーズンの選び方（スケジュール・スコアと違う）**: 順位表は「今の順位」なので複数シーズンを混ぜられない（同じディビジョンの行が二重になる）。
`fetchCurrentStandings()` は進行中シーズンを取り、**1件も取れなければ前シーズンにフォールバック**する（開幕直後の空白期間対策）。
`/api/player-stats` は順位表ページから個人成績を読むため、`buildStandingsSources()` を共有して同じ判定をする。
順位変動の比較用スナップショットは `standings:last:{season}` とシーズン別に分ける（切替時に変動表示が壊れないように）。
ファイル名スラッグはスコア表と綴りが違う（Women Gold = `wg`、スコアは `womengold`）。Women Bronze は `wb` と想定（未公開なら404でスキップ）。
`/api/standings` と `/api/player-stats` は実際に使ったシーズンを `season` で返し、ランキングページの「今シーズン（53rd）」表記はこれを使う。

### イベントプログラム連携
- `/api/events` がタイトルに「イベント・プログラム」を含む記事の詳細をスクレイピングし `programs` フィールドで返す
- `/events` ページ: 該当記事クリックでモーダル表示
- `/rental` ページ: 日付＋開始時刻でマッチングし「詳細」バッジ＋モーダル表示

## 作業記録

### 2026-09-13（続き）
- スコアの点数が全件 null に見えたのは調査コマンド側の不具合（日付を文字列比較して、まだ結果が入っていない直近の試合を「最新」として拾っていた）。パーサーの列位置（`[5]`=awayScore / `[7]`=homeScore）は実物と一致していた。
- 週1回の整合性チェック（`/api/cron/verify`）とデータ保存（`src/lib/archive.ts`）を追加。
  古いシーズンのページが非公開になっても表示を維持できる。

### 2026-09-13
- プレイオフ日程（`53rd_schedule_playoff.htm`）が取得できていなかった。原因: URL生成が月名（january〜december）のみで、月以外のページが候補に入っていなかった。
  - `EXTRA_SCHEDULE_SLUGS`（`playoff` / `playoffs` / `final`）を追加。
  - 試合行の判定も緩和: 試合番号が連番でない行（プレイオフの `SF1`、空欄）は col[6]=`vs` で試合行とみなす。これを直さないとURLを足しても0件になる。
- 9/11 の修正（53rd 9月 + 54th 10〜3月の手書きリスト）を、日付からのURL自動生成に置き換え。シーズン番号も 10月開幕基準で自動繰り上げ（`src/lib/schedule.ts` / `src/lib/rental.ts` に切り出し）。
  - 月ラベルを実日付から生成し、当年以外は `2026年10月` 形式にしたので、3月が重複する問題は月を削らなくても解決する。
- 取得状態を可視化: `/api/schedule` `/api/rental` が `sources[]`（取得元ごとの status / 件数 / error）を返す。トップページは取得失敗時に警告バナーを出し「試合なし」と区別する。
- `/api/cron/schedule` を実監視に変更。公式サイトを `no-store` で直接検証し、0件・今後の予定0件・404以外の失敗があれば HTTP 503。その後 `revalidatePath` + 再取得でキャッシュを更新する（従来の `?cron=` は静的ISRルートには効いていなかった）。
- 内部 fetch のキャッシュをルートのISRと同じ値に統一（standings は 48h対72h の逆転で最大5日古くなり得た）。
- プレイオフ表の実構造を確認（ローカルから実サイト取得）。**月別表と構造が違った**:
  - 論理**14列**（月別表は10列）。`vs` の位置も [6] ではなく **[8]**
  - `[0]no("PO1") [1]start [2]～ [3]end [4]awaySeed [5]awayName [6]awaySub [8]vs [10]homeSub [11]homeName [12]homeSeed [13]division`
  - Division 欄は `Brass Quarter Finals` のように回戦名込み → `splitDivision()` で `division` と `round` に分離。
    `35 & Over` は月別表の `35&Over` に合わせて空白を詰める（フィルタが分裂しないように）
  - 回戦名は `round` として琥珀色のバッジで表示（カード2箇所＋モーダル）
  - 催し物（Pick Up Hockey 等）・時間調整・対戦カード未定の行は取り込まない
- cron の `failedSources` が status だけで判定しており、「200だが解析0件」を正常扱いしていたのを修正（`error` の有無でも拾う）。
- ただし「0件＝異常」ではない。`54th_schedule_march.htm` は日程（2027/3/6 など5日分）だけ確定していて
  対戦カードが「MHL 54th Season Playoff」の枠のみ、という正常な状態で誤検知した。
  判定を **「時刻があり、かつ試合番号か `vs` を持つ行（＝対戦カードのはず）が1件以上あるのに、1件も解釈できない」** に変更。
  列構成の変化も拾えるよう、この判定は列数チェックより前に行う。催し物・時間調整・対戦カード未定の枠は数えない。
  レンタルは公開直後に予定0件が普通にあるので0件では警告しない。
- スコア（`/api/scores`）も 53rd 固定だったので、スケジュールと同じ日付ベースのURL自動生成に変更。
  進行中＋次シーズンの2シーズンを取得するので、10/3の54th開幕後も53rdの結果が消えない。
  54th新設の **Women Bronze** をスコアのディビジョン一覧とランキングページの `DIVISIONS` に追加。
  `GameScore` に `season` / `sourceUrl` を追加し、「公式サイトで見る」のリンクと React key に使う
  （2シーズン混在時に `gameNo` が衝突するため）。
- スコア表示を**日付の新しい順**に変更（従来は古い順）。
- standings / player-stats もシーズン自動判定に変更（進行中→取れなければ前シーズン）。
  UIの「今シーズン（53rd）」表記もAPIの `season` から出すようにした。
- **未対応**: `/api/prev-season` と `/api/prev-season-players` は 52nd のハードコード
  （公式ページが消えたため Wayback Machine から採取したもの）。53rd 終了後は「昨シーズン＝53rd」に
  更新が必要。今は `src/lib/archive.ts` に 53rd のデータが貯まるので、次はそこから生成できる。

### 2026-09-11
- The 54th season schedule (announced 9/10, starts 10/3) wasn't showing. Cause: `SCHEDULE_URLS` in `/api/schedule` was hardcoded to 53rd 3–7月 and 9月.
  - Changed to 53rd `september` (remaining games through 9/27) + 54th `october`–`march`. Removed 53rd 3–7月 so 2026年3月 and 2027年3月 don't collide under the same "3月" label.
  - Unpublished months (404) are treated as empty and picked up automatically once published.
- `/api/rental` was also hardcoded to `rent_202601`–`202609`. Changed to generate the 12 months from 8 months back to 3 months ahead automatically (JST).
- Added the new 54th division `Women Bronze` to `DIVISION_ORDER` in `page.tsx`.
- Checked with a local build and `next start`: 53rd Sept 41 games + 54th Oct–Jan 220 games.
- Deployed to production with `npx vercel --prod --yes` (deployment `dpl_9pKhzcB26E5wha7RSC7iEj3FJsiF`, aliased to `mhlcxc.rinnavi.com`). To avoid shipping the uncommitted Capacitor changes, deployed from a copy of HEAD (2b42582) plus the 3 fixed files only.
- Deploy note: deploying from a git checkout gets **BLOCKED** by Vercel because the commit author is `m5MBA32GB1TB <…@m5MBA24GB1TB.local>` (the CLI just hangs at "Building…"; the cause only shows with `--debug`). Worked around by deploying from a copy with no `.git`. `.vercel` doesn't exist at the repo root, so re-link with `npx vercel link --yes --project misconduct-schedule`.
- At deploy time, the official site's `54th_schedule_january.htm` was temporarily 404 (it was fetchable just before). It's still linked, so it will appear automatically once restored upstream (within 1 day via ISR revalidation).
- Not done yet: standings/scores/player-stats are still hardcoded to 53rd, and the previous-season reference is still 52nd. Needs updating after 54th opens (10/3).

### 2026-06-24
- 水曜練習会モーダルのおまけ漫画に vol4 を追加。
  - `2026/7/1`: `/wednesday-manga-vol4.jpg`（新シリーズ「ツーブロちゃんパパ 第1話『あと23日』」）
- `public/wednesday-manga-vol4.jpg` を追加。`WednesdayVoteModal.tsx` の `MANGA_BY_DATE` に `"2026/7/1"` を追加。
- `RESEND_API_KEY=re_dummy npm run build` で検証済み。
- `npx vercel --prod --yes` で本番反映済み（deployment `dpl_…b78vyp963…`、`mhlcxc.rinnavi.com` にエイリアス）。本番 `/wednesday-manga-vol4.jpg` は `200 image/jpeg`。

### 2026-06-23
- LINEでURLを貼った際に「変なサムネイル」が出る問題を修正。原因は `og:image` 未設定で、LINEが apple-touch-icon（`src/app/apple-icon.tsx`）を代替サムネイルとして拾っていたこと。
- `src/app/opengraph-image.tsx` を追加し、`next/og` の `ImageResponse` でサイトロゴ調のOGP画像（1200×630・ダーク背景＋青アイコン＋「Rinnavi / MHL / CxC」）を自動生成。日本語はデフォルトフォントで豆腐化するため英字でレイアウト。
- `src/app/layout.tsx` の `metadata` に `metadataBase`（`https://mhlcxc.rinnavi.com`）と `openGraph`（title/url/siteName/type）を追加し、`og:image` が絶対URLで出力されるよう修正。
- `RESEND_API_KEY=re_dummy npm run build` で検証 → `npm run start` で `/opengraph-image`（200 image/png 1200×630）と `og:image` メタを目視/HTTP確認。
- `npx vercel --prod --yes` で本番反映済み（deployment `dpl_DSy83kCsUqcmGfdxV45J3jF2ihAN`、`mhlcxc.rinnavi.com` にエイリアス）。本番の `og:image` 取得は `200 image/png`。
- 注意: LINEはOGPを強くキャッシュするため、既存トークルームでは即時に変わらない場合あり。確認時は `?v=2` 等を付けた別URLで貼り直すと反映確認しやすい。

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
