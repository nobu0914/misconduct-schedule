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

`Ver.1-261002-2325`（Nav.tsx の h1 タグ内に表示）

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
- `/api/standings` / `/api/scores` / `/api/player-stats`: `revalidate=86400`（1日）+ `s-maxage=86400, stale-while-revalidate=3600`
- `/api/prev-season`: `revalidate=86400`（1日）。進行中・前・前々シーズンの保存済み最終順位を `seasons` で返す
- `/api/prev-season-players`: 動的（`?season=N`）+ `s-maxage=3600`。指定シーズンの保存済み個人成績と、
  データがある過去シーズンの一覧 `available`（個人ランクの「過去シーズン」選択肢）
- `/api/past-standings`: 動的（`?season=N`）+ `s-maxage=3600`。過去シーズンの保存済み最終順位と `available`
- `/api/past-scores`: 動的（`?season=N`）+ `s-maxage=3600`。過去シーズンのスコア（KVの `archive:scores:{シーズン}/*`、
  無ければ `src/data/scores-{シーズン}.json`）と `available`
- `/api/events`: `revalidate=86400`（1日）

**cron で毎日再生成する対象**（`/api/cron/schedule` の `WARM_PATHS`）:
`/api/schedule` `/api/rental` `/api/standings` `/api/scores` `/api/player-stats`

これが無いと「誰かがアクセスして、かつキャッシュ期限が切れていたら更新」頼みになる。
さらに `stale-while-revalidate` のため**期限切れ後の最初のアクセスには古い値が返る**（再生成は裏で走る）ので、
アクセスが多くないサイトでは公式の更新が何日も反映されない。新しい取得系APIを足したら必ずここにも追加すること。
再生成後の件数は cron のレスポンスの `warmedCounts` に出る（0件なら `warnings` に載る）。
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

**終わったシーズンの表示継続（重要）**: シーズンが切り替わると `buildScheduleSources()` /
`buildScoreSources()` の対象は「進行中＋次」になり、前シーズンが候補から外れる。
これだけだと過去の試合・スコアがサイトから消えるため、`loadArchivedByPrefix()` で
前シーズン（`{前シーズン}/` 接頭辞）の保存済みデータを読み、取得結果に足している
（`withArchivedSeasons()` / `withArchivedScoreSeasons()`）。**公式サイトへの追加アクセスは無し**。
取得候補にも同じラベルがある場合は取得できた方を優先する。
アーカイブ由来の取得元は `status: 0` + `fromArchive` が付くので、cron の異常判定からは除外している。

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
`fetchCurrentStandings()` は進行中シーズンだけを取り、**前シーズンにはフォールバックしない**
（チームランキング・個人ランクとも「今シーズン」と「過去シーズン（保存済み）」を分けて持つ）。
`/api/player-stats` も順位表ページから個人成績を読むので `buildStandingsSources()` を共有し、同じ扱い。
開幕直後で今シーズンが空の間は `/api/standings` / `/api/player-stats` とも空配列と `pending: true` を返し、
cron の0件チェックは `pending` を想定内として扱う。その間も前シーズンの公式ページが残っていれば取り直して
`season:{N-1}:data` / `season:{N-1}:players` を更新する（最終更新を取り逃さないため。表示には使わない）。
順位変動の比較用スナップショットは `standings:last:{season}` とシーズン別に分ける（切替時に変動表示が壊れないように）。
ファイル名スラッグはスコア表と綴りが違う（Women Gold = `wg`、スコアは `womengold`）。Women Bronze は `wb` と想定（未公開なら404でスキップ）。
`/api/standings` と `/api/player-stats` は今シーズンを `season` で返し、ランキングページの「今シーズン（54th）」表記はこれを使う。
過去シーズンの最終順位は `/api/past-standings?season=N`、個人成績は `/api/prev-season-players?season=N`（どちらも保存済みデータ、`available` に選べるシーズン一覧）。
52nd の固定データと保存データの読み出しは `src/lib/pastStandings.ts`（TOP用の `/api/prev-season` と共有）。

### シーズンを混ぜない（重要）
9月は「前シーズンの残り＋プレイオフ」と「次シーズンの日程」が並び、開幕後は保存済みの前シーズン分も一覧に出る。
**成績・順位は必ず同じシーズン同士で突き合わせる**。

- 試合（`Match.season`）は取得元ラベル（`53rd/march`）から付ける。スコアは `GameScore.season`
- TOP の順位・勝敗は `Match.season` と順位表の `season` が一致するときだけ出す（`findStanding()`）
- 「前シーズン」は**表示しているシーズン − 1** を選ぶ。決め打ち（旧: 52nd固定）にすると2シーズン前のデータを
  前シーズン・前年比として出してしまう。TOP は試合のシーズン − 1、ランキングは個人成績の `season` − 1
- スコアタブも「今シーズン」と「過去シーズン」に分ける。今シーズンは `/api/scores`（前・今・次シーズンが混在して返る）
  のうち今シーズンの試合だけ。過去シーズンは `/api/past-scores`（`src/lib/pastScores.ts`）から選んだシーズンを読む。
  次シーズンの日程はそのシーズンが始まってから今シーズンとして出る
- **52nd のスコア**は保存の仕組みを入れる前に公式ページが消えていたため、`scripts/fetch-wayback-scores.mts` で
  Wayback Machine から取り直して `src/data/scores-52nd.json` に置く（この環境からは web.archive.org に出られないので
  手元のPCで実行する: `npx tsx scripts/fetch-wayback-scores.mts 52`）。パーサーはサイトと同じ `parseScoresHtml()`
- シーズン表記の変換は `src/lib/season.ts`（依存なし。ページ側から `schedule.ts` を import しない）

**チーム名・選手名の照合**（`src/lib/teamName.ts`）: 同じチームでも日程表・順位表・シーズンで表記が微妙に違う。
`normalizeName()`（NFKC・括弧書き除去・大文字小文字・空白/記号の無視）で揃えてから完全一致で比べる。
呼び方そのものが違うもの（`NANASHI Boyz` = `名無しBoyz`）だけ `TEAM_ALIASES` に書く。
**部分一致・あいまい一致はしない**（`日体大DREAMS WB` と `WG` のような別チームを取り違えるため）。
ディビジョンも必ず一致させる（同名チームが別ディビジョンにいる）。

**シーズン別の最終順位・個人成績の保存**（`src/lib/seasonSnapshot.ts`）: 順位表ページもシーズン後に消えるため、
`/api/standings` / `/api/player-stats` が取得のたびに `season:{N}:data` / `season:{N}:players` へ保存する。
ディビジョン単位で差し替えるので、一部のページが先に消えても残りは失わない。空では上書きしない。
52nd は公式ページが既に無いため固定データ。**固定データはKVより優先**する（以前は初回アクセス時にKVへ写していたため、
KVを先に見ると取り直したデータが反映されない）。52nd は `scripts/fetch-wayback-standings.mts` で取り直した
`src/data/standings-52nd.json` / `src/data/players-52nd.json` を使い、空なら手で復元した旧データ（Women Bronze 欠け）を使う。

### 入力検証とレート制限（重要）
公開APIが受け取った値は**そのままKVのキーや集計キーになる**ため、検証しないと任意のキーを作られて
集計データを際限なく膨らませられる。以下は必ず検証してから使う。

- `/api/track`: `path` は `src/lib/analyticsConstants.ts` の `normalizeTrackedPath()` を通す
  （既知ページはそのまま、未知は形式検証＋長さ制限）。`event` は `EVENT_TYPES` のみ受け付ける
- `/api/votes`: `date`（`YYYY/M/D`）・`voterId`（英数64文字以内）・`attendance`（yes/maybe/no）・
  `menu`（`MENU_ITEMS` に含まれるものだけ）を検証。例外の詳細は利用者に返さずログにだけ出す
  （検証ロジックは `src/lib/votes.ts` の `validateVoteInput()`）
- `/api/contact`: 名前100・メール200・本文5000文字で切り詰め、同一IPから1時間5通まで。
  Resend のエラー詳細は返さない。`Resend` はモジュール読み込み時ではなくハンドラ内で生成する
  （`RESEND_API_KEY` なしでも `npm run build` が通る）
- `/api/admin/*`: パスコードは `src/lib/adminAuth.ts` の `verifyAdminPasscode()` で照合。
  ハッシュ同士の定数時間比較 + IPごとの失敗回数制限（15分で20回）
- `/api/cron/*`: `CRON_SECRET` **未設定なら誰でも叩ける**。1回で公式サイトへ数十件アクセスするため、
  認証が無い場合だけ最短実行間隔を設けている（schedule 5分 / verify 10分、`src/lib/cronGuard.ts`）。
  **本番では `CRON_SECRET` を設定するのが本筋**（設定すれば認証必須になり、Vercel Cron は自動でヘッダーを付ける）

### 投票の集計方式（`src/lib/votes.ts`）
旧実装は `vote:{date}` に集計オブジェクトをまるごと保存し、読み込み→加算→書き戻ししていたため、
**2人が同時に投票すると片方の票が失われた**。現在は次の形。

- `vote:{date}:attend` / `vote:{date}:menu` のハッシュに対し `hincrby` で**原子的に**増減する
- 投票のやり直しは `getset` で直前の記録を原子的に取り出して置き換え、その差分だけを反映する
  （同じ人が二重送信しても二重計上しない）
- 旧形式のデータは初回アクセス時にハッシュへ移行する。同時アクセスで二重計上しないよう
  `vote:{date}:migrating` を `nx` で取れた1リクエストだけが書き込む
- KV操作は `VoteStore` インターフェース越しに呼ぶ（テストでメモリ実装に差し替えるため）

### テスト
テストランナーは導入していない。`tests/*.mts` を tsx で直接実行する。

```bash
npx tsx tests/votes.mts         # 投票の検証・同時実行・旧データ移行（20項目）
npx tsx tests/data-sources.mts  # URL自動生成・パーサー・シーズン判定・名前照合・Wayback復元（Shift-JISのダミーページ使用、84項目）
```

どちらも外部ネットワークに接続しない（`fetch` とKVをメモリ実装に差し替える）ので、
オフラインでもそのまま動く。パーサーやシーズン判定を変えたら必ず両方を通すこと。

### イベントプログラム連携
- `/api/events` がタイトルに「イベント・プログラム」を含む記事の詳細をスクレイピングし `programs` フィールドで返す
- `/events` ページ: 該当記事クリックでモーダル表示
- `/rental` ページ: 日付＋開始時刻でマッチングし「詳細」バッジ＋モーダル表示

## 作業記録

### 2026-10-02
- **本番が 9/29 から古いコードに巻き戻っていた**。9/28 のデプロイ（`past-standings` / `past-scores` あり）の後、
  9/29 の2回のデプロイはどちらも `past-standings` が404で、9/13〜9/28 の18コミット
  （入力検証・認証強化、過去シーズン分離、52nd 復元など）を含まない古いコードだった（どこから出たかは未確認）。
  10/2 の作業も最初は 9/13 時点の手元ブランチ（`feat/capacitor-app`）を土台にデプロイしてしまい、
  `git fetch` で気づいて `origin/main` を土台に必要な修正だけ載せ直した。
  **CLI でデプロイする前に必ず `git fetch` して `origin/main` との差を確認する**こと。
- 公式サイトの取得が Vercel から全滅（`fetch failed`）。ローカルからは 200 で取れるのに Vercel からだけ
  `UND_ERR_CONNECT_TIMEOUT`。同じ日に「本家がPCだと遅い・スマホだと速い・その後回復」とのことで、
  意図的な遮断より公式サーバーの一時的な不調の可能性が高い（断続的に成功・失敗した）。
  - 失敗時のエラーに `cause.code` を残すようにした（`src/lib/schedule.ts`）。`fetch failed` だけでは区別できない。
  - Vercel のリージョンを東京（`hnd1`）に変更（`vercel.json`）。効果は断定できないが国内向けなので害はない。
- **リンク予定の保存データ補完が一度も効いていなかった**。Upstash は値をJSONとして解釈するため、数字だけのラベル
  （レンタルの `202610`）が `smembers` から**数値**で返り、`Set.has("202610")` が一致しなかった。
  `listArchived()` で文字列に揃えた（`src/lib/archive.ts`）。公式に届かない日はリンク予定が0件になっていた。
- トップの警告が、終わったシーズンの保存データ（status 0・エラーなし）まで「取得できなかった日程」と数えていた
  （最初に見た「37件」は失敗30件＋53rd の保存分7件）。エラーがあったものだけを失敗に数え、取れなかった分を
  保存データで補えているときは「保存データ（M/D HH:MM時点）で表示しています」と出すようにした（`src/app/page.tsx`）。
- 公式に届く環境から KV の保存データを更新する `scripts/refresh-kv.mts` を追加し、GitHub Actions
  （`.github/workflows/refresh-kv.yml`、毎日 05:30 / 17:30 JST）で実行する。KV の認証情報は GitHub の
  Secrets（`KV_REST_API_URL` / `KV_REST_API_TOKEN`）。手元では `npx tsx scripts/refresh-kv.mts --env <.env>`、
  書き込まずに確認するなら `--dry-run`。

### 2026-09-28
- 本番が `main` ではなく `claude/latest-data-fetch-check-ie1hqs` からデプロイされていたため、`main` に取り込んで揃えた
  （`main` を push すると本番に自動デプロイされる。**本番より古い `main` を push すると巻き戻る**ので注意）。
- 「前シーズン」が 52nd 固定だった問題を解消。54th 開幕後に 52nd を前シーズン・前年比として出すところだった。
  - 順位表・個人成績をシーズン番号付きで KV に保存（53rd の最終順位を公式ページが消える前に確保するため）
  - 前シーズンは「表示中のシーズン − 1」から選ぶ
  - 試合にシーズンを持たせ、順位・勝敗は同じシーズンの試合にだけ付ける
  - ランキング・スコアにシーズン表記、スコアはシーズン切替
- チーム名・選手名の表記ゆれ（全角/半角・空白・記号）で順位や前シーズンが出ないことがあるため、
  照合を `src/lib/teamName.ts` に集約して正規化してから比べるようにした。
  旧実装はチーム名だけをキーにした map で、同名チームが別ディビジョンにいると上書きされて見つからなかった。
- 個人ランクを「今シーズン」と「過去シーズン」に分けた。今シーズンは前シーズンで代用しない（未掲載なら空欄）。
  過去シーズンは保存済みのシーズン（`available`）から選ぶ。URLは `?season=53`（旧 `?season=prev` は前シーズン扱い）。
- チームランキングも同様に分けた。`/api/standings` の前シーズンへのフォールバックを廃止し、過去シーズンは
  `/api/past-standings`。シーズンの選択は個人ランクとチームランキングで共通（URLの `season`）。
  あわせて、ランキング・スコアの初回取得が「件数0」で取得済み判定していたため、空だと取り直し続ける不具合を修正。

### 2026-09-29
- スコアタブも「今シーズン」と「過去シーズン」に分けた（個人ランク・チームランキングと共通のシーズン選択、URLの `season`）。
  旧実装は取得できた全シーズンをチップで並べ、結果が出ている最新シーズンを既定にしていた。
- スコアの過去シーズンを `/api/past-scores` から読むようにし、2シーズン以上前（KVに保存済みのもの）も選べるようにした。
  52nd は `scripts/fetch-wayback-scores.mts` で Wayback Machine から復元する（`src/data/scores-52nd.json`、未取得の間は空）。
  スコア表の解析を `parseScoresHtml()` / `decodePage()` に切り出し、スクリプトと共有。
- 52nd のスコア 282 試合を復元（手元のPCでスクリプトを実行）。Gold・Bronze・35&Over は最新の保存が 2/15 時点で、
  2/15・2/22 の10試合は結果が空欄のまま。過去シーズンでは「未消化」ではなく「記録なし」と表示する。
  52nd には Women Bronze もあった（11試合）が、52nd の順位表データ（`src/lib/pastStandings.ts`）には入っていない。
- 52nd の順位表・個人成績も Wayback Machine から取り直せるようにした（`scripts/fetch-wayback-standings.mts`、
  CDX 検索は `scripts/wayback.mts` に共通化）。順位表・個人成績の解析を `parseStandingsHtml()` /
  `parsePlayersHtml()`（`src/lib/playerStats.ts`）に切り出してスクリプトと共有。
- 52nd の順位表（66チーム）・個人成績（584人）を復元（手元のPCでスクリプトを実行）。旧データは 62チーム / 431人で
  Women Bronze が欠け、Bronze・Brass などは試合数も少なかった（シーズン途中の保存）。
- **Wayback の保存時期はページごとにばらばら**。52nd の順位表は Copper（42/54試合）・Iron（18/45試合）・Platinum（5/6試合）が
  シーズン途中の保存だったため、`scripts/fill-standings-from-scores.mts` でスコアから集計し直した
  （勝ち2・引き分け1、同点は得失点差→総得点。Iron の 3〜5位と 7〜8位は勝点が並んでおり、公式の決め方は不明）。
  スコアより保存ページの方が新しいディビジョン（Gold・Bronze）は保存ページのまま。
- `normalizeName()` でアクセント記号も無視するようにした（スコア表 `EUROSPORT MĀVIN` / 順位表 `EUROSPORT MAVIN`）。

### 2026-09-26
- **プレイオフの決勝・準決勝が一覧に出ない**問題を修正。原因は表示期間ではなくパーサー側だった。
  勝ち上がり待ちの回戦は前の回戦が終わるまで**チーム名欄が空**で、順位表記（`Brass 1st` 等）だけが入る。
  「両チーム空欄なら取り込まない」判定で行ごと落ちていた。
  → チーム名が無い側は**順位表記を代わりに使って取り込む**（`src/lib/schedule.ts` のプレイオフ分岐）。
  名前も順位表記も無い行（枠だけ）は従来どおり除外。ベンチ表記はチーム名が確定している側にだけ付ける。
- 初期表示は**当日か今後のみ**。9/24 に入れた「過去7日/プレイオフ30日は残す」は取り消し
  （`RECENT_DAYS` / `RECENT_PLAYOFF_DAYS` を削除、ラベルも「今後のみ」に戻した）。

### 2026-09-24
- 本番が 9/13 のデプロイのままで、`72ec513`（入力検証・認証強化）と `2522288`（順位表の毎日更新）が
  未反映だったことを確認。コードは push 済み、デプロイは未実施。
- 10/3 の 54th 開幕で取得対象が「54th + 55th」に切り替わり、**53rd の試合・スコアがサイトから消える**
  問題を先回りで修正。アーカイブから前シーズン分を読んで足すようにした（追加のHTTP取得なし）。
  プレイオフ（9/19-20）の結果も残る。
- この環境からは公式サイトにも本番にも到達できないまま（Vercel コネクタはプロジェクト未認可で
  `web_fetch_vercel_url` が拒否される。`list_deployments` は可）。

### 2026-09-13（キャッシュ）
- チームランキングが更新されないという指摘。原因は2つ重なっていた:
  1. `/api/standings` が48時間キャッシュ（スコア・個人成績は72時間）
  2. cron が再生成していたのは `/api/schedule` と `/api/rental` だけで、順位表は対象外だった
  → 順位表・スコア・個人成績を1日キャッシュに統一し、cron の `WARM_PATHS` に追加。
  これで公式の更新は毎日12:00 JSTに必ず反映される。

### 2026-09-13（全体レビュー）
- 公開APIの入力検証が抜けており、`/api/track` の `path` と `/api/votes` の `date`/`voterId`/`attendance`/`menu` が
  未検証のままKVのキーになっていた（任意のキーを作れる状態）。いずれも検証を追加。
- `/api/contact`: 文字数上限なし・回数制限なし・Resendのエラー本文をそのまま返却していたのを修正。
  `Resend` の生成をハンドラ内に移し、`RESEND_API_KEY` なしでもビルドが通るようになった。
- `/api/admin/*`: パスコード比較を定数時間に変更し、IPごとの失敗回数制限を追加。
- `/api/cron/*`: `CRON_SECRET` 未設定時のみ最短実行間隔を設け、公式サイトへの連打を防止。
- `/api/events` に `revalidate` が無く毎リクエスト動的実行だったのでISR化（1日）。
- `next.config.js` に `X-Content-Type-Options` と `Referrer-Policy` を追加。
- `/api/votes` の集計を `hincrby` による原子的な増減に変更し、同時投票で票が落ちる問題を解消。
  投票ロジックを `src/lib/votes.ts` に切り出し、KV操作を差し替え可能にしてテストを追加（`tests/votes.mts`、20項目）。
  旧形式のデータは初回アクセス時に自動移行する（移行時の二重計上も排他制御で防止）。
- 投票者IDの生成が `crypto.randomUUID()` 直呼びで、使えない環境（古いブラウザ・https以外）では
  投票できなくなるため、フォールバックを追加。
- `tests/` を追加し、テストの実行方法を CLAUDE.md に記載。

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
- ~~**未対応**: `/api/prev-season` と `/api/prev-season-players` は 52nd のハードコード~~ → 2026-09-28 に対応
  （シーズン別に保存し、表示中のシーズン − 1 を選ぶ）。

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

**デプロイ前に必ず `git fetch` して、手元が `origin/main` より古くないか確認する**（`git log HEAD..origin/main` が空であること）。
古い手元のコードから CLI でデプロイすると、本番が巻き戻る（2026-10-02 に実際に起きた）。`main` を push した場合も同様。

---

## 注意事項

- スクレイピング対象は MHL / CxC 公式サイト。サイト構造変更時はパーサーの修正が必要。
- 投票データは Vercel KV に保存。環境変数 `KV_REST_API_URL` / `KV_REST_API_TOKEN` が必要。
- お問い合わせメール送信は Resend を使用。環境変数 `RESEND_API_KEY` が必要。
