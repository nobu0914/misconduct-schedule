"use client";

import { useEffect, useRef, useState } from "react";
import ScoreSheetEditor from "@/components/ScoreSheetEditor";
import { GameDetail, SheetList } from "@/components/ScoreSheetAnalysis";
import { getVisitorId } from "@/lib/analyticsClient";
import { trackFeature } from "@/lib/trackEvent";
import {
  checkSheet,
  CONTINUE_MIN,
  continueCodeInput,
  emptySheet,
  isBlankSheet,
  normalizeContinueCode,
  suggestContinueCode,
  type ScoreSheet,
} from "@/lib/scoreSheet";

/** アップロードできる写真の大きさ（元のファイル。送るときは縮める） */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const browserRandom = (n: number) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};

// この端末で保存・呼び出した試合（会員登録なし。別の端末ではコンテニューコードで呼び出す）
const LOCAL_KEY = "rinnavi_scoresheets";

function loadLocal(): ScoreSheet[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 修正用の鍵（保存した端末だけが持つ）。コード → 鍵
const TOKEN_KEY = "rinnavi_edit_tokens";
function loadTokens(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveToken(code: string, token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...loadTokens(), [code]: token }));
  } catch {
    // 保存できない環境では、この端末でも修正できないだけ
  }
}

function saveLocal(sheets: ScoreSheet[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(sheets));
  } catch {
    // 保存できなくても、コンテニューコードで呼び出せる
  }
}

// 使ったコンテニューコードはクッキーに残し、次に開いたとき入力欄に入れる（再入力の手間を省く）
const CODE_COOKIE = "rinnavi_cc";
const MAX_REMEMBERED = 10;

function rememberedCodes(): string[] {
  try {
    const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CODE_COOKIE}=`))?.slice(CODE_COOKIE.length + 1) ?? "";
    return decodeURIComponent(raw)
      .split(",")
      .filter((c) => normalizeContinueCode(c));
  } catch {
    return [];
  }
}

function forgetCode(code: string) {
  try {
    const codes = rememberedCodes().filter((c) => c !== code);
    document.cookie = `${CODE_COOKIE}=${encodeURIComponent(codes.join(","))}; max-age=${2 * 365 * 86400}; path=/; samesite=lax; secure`;
  } catch {
    // 無視
  }
}

function rememberCode(code: string) {
  try {
    const codes = [code, ...rememberedCodes().filter((c) => c !== code)].slice(0, MAX_REMEMBERED);
    document.cookie = `${CODE_COOKIE}=${encodeURIComponent(codes.join(","))}; max-age=${2 * 365 * 86400}; path=/; samesite=lax; secure`;
  } catch {
    // クッキーが使えなくても、コードを入力すれば呼び出せる
  }
}

/** 同じコードは1件にまとめて、新しい順に */
function upsert(list: ScoreSheet[], sheet: ScoreSheet): ScoreSheet[] {
  return [sheet, ...list.filter((s) => s.continueCode !== sheet.continueCode)];
}

type Tab = "analysis" | "add";

/** 写真を長辺 2000px の JPEG に縮める（送信サイズを抑える。写真そのものは保存しない） */
async function shrinkImage(file: File): Promise<{ base64: string; mediaType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** embedded: データページの「分析」タブの中に出すとき（外枠・余白を付けない） */
/** 共有用のリンク（開くとこのコードの試合を呼び出して開く） */
function shareUrl(code: string): string {
  return `${window.location.origin}/player-ranking?mode=analysis&code=${encodeURIComponent(code)}`;
}

/** コンテニューコードとリンクを共有する（共有シートが無ければコピー）。成功したら "shared" / "copied" */
async function shareGame(code: string, sheet?: ScoreSheet | null): Promise<"shared" | "copied" | null> {
  const title = sheet
    ? `スコア表分析 ${sheet.date} ${sheet.visitor.name} ${sheet.visitor.total}-${sheet.home.total} ${sheet.home.name}`
    : "スコア表分析";
  const text = `${title}\nコンテニューコード: ${code}`;
  const url = shareUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch {
      return null; // 共有シートを閉じただけ
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    window.prompt("このテキストをコピーしてください", `${text}\n${url}`);
    return null;
  }
}

/** 試合のカードを画面の上（固定ヘッダーのすぐ下）に合わせる */
function scrollToGame(code: string | undefined | null) {
  if (!code) return;
  setTimeout(() => {
    const el = document.getElementById(`row-${code}`);
    if (!el) return;
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - header - 8, behavior: "smooth" });
  }, 80);
}

export default function ScoreSheetApp({
  embedded = false,
  initialCode,
  onInitialCodeUsed,
}: {
  embedded?: boolean;
  /** 共有リンク（?code=）で開いたときのコード。呼び出して開く */
  initialCode?: string | null;
  /** initialCode を呼び出したら呼ぶ（親が消して、開き直しで再取得しないように） */
  onInitialCodeUsed?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("analysis");
  const [sheets, setSheets] = useState<ScoreSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState<ScoreSheet | null>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScoreSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);
  // 読み取りが終わったら写真は折りたたむ（入力欄を見やすく。見比べたいときは開ける）
  const [photoOpen, setPhotoOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileObj = useRef<File | null>(null);

  const [issued, setIssued] = useState<string | null>(null);
  // 保存するときのコンテニューコード（自由に決められる。最初はおまかせの候補を入れておく）
  const [newCode, setNewCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [justLoaded, setJustLoaded] = useState<string | null>(null);
  // 保存した試合の修正中の内容（読み間違いを直す）
  const [fixing, setFixing] = useState<ScoreSheet | null>(null);
  // 修正用の鍵（保存した端末だけ）。鍵のある試合だけ修正ボタンを出す
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const claimed = useRef(new Set<string>());
  useEffect(() => setTokens(loadTokens()), []);
  // 鍵を入れる前に保存した試合は、保存した端末なら開いたときに鍵を受け取れる
  useEffect(() => {
    const code = opened?.continueCode;
    if (!code || tokens[code] || claimed.current.has(code) || normalizeContinueCode(code) !== code) return;
    claimed.current.add(code);
    fetch(`/api/scoresheets?code=${encodeURIComponent(code)}`, { method: "PATCH", headers: { "x-visitor-id": getVisitorId() ?? "" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.editToken) {
          saveToken(code, d.editToken);
          setTokens(loadTokens());
        }
      })
      .catch(() => {});
  }, [opened, tokens]);

  useEffect(() => {
    setSheets(loadLocal());
    setLoading(false);
  }, []);

  // 共有リンクで開いたとき: そのコードを呼び出して表示する。
  // 人から共有された試合は、この端末の一覧・前に使ったコードには自動で入れない（入れるのは「一覧に追加」を押したときだけ）。
  // 自分の一覧にすでにある試合なら、一覧の行を開く
  const [shared, setShared] = useState<ScoreSheet | null>(null);
  const [sharedError, setSharedError] = useState("");
  useEffect(() => {
    const code = initialCode ? normalizeContinueCode(initialCode) : null;
    if (!code) return;
    onInitialCodeUsed?.();
    (async () => {
      const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(code)}&via=link`, { headers: { "x-visitor-id": getVisitorId() ?? "" } }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && d.sheet) {
        trackFeature("分析 > 共有リンクから開いた");
        if (loadLocal().some((s) => s.continueCode === code)) {
          replaceLocal(d.sheet);
          setOpened(d.sheet);
          scrollToGame(code);
        } else {
          setShared(d.sheet);
          scrollToGame(`shared-${code}`);
        }
      } else {
        setSharedError(d.message ?? "共有されたコンテニューコードの試合を呼び出せませんでした。");
      }
    })();
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);
  const [shareNote, setShareNote] = useState<string | null>(null);

  function remember(sheet: ScoreSheet) {
    setSheets((cur) => {
      const next = upsert(cur, sheet);
      saveLocal(next);
      return next;
    });
  }

  /** データを削除（サーバーからも消すので、コンテニューコードでも呼び出せなくなる） */
  // 削除はコンテニューコードを入力してもらってから（DeleteDialog）
  const [deleting, setDeleting] = useState<ScoreSheet | null>(null);
  function deleteSheet(sheet: ScoreSheet) {
    setDeleting(sheet);
  }

  /** 削除を実行（サーバーではバックアップに移し、削除した人の情報を記録する） */
  async function confirmDelete(sheet: ScoreSheet): Promise<string | null> {
    const code = sheet.continueCode;
    if (code) {
      try {
        const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(code)}`, {
          method: "DELETE",
          headers: { "x-visitor-id": getVisitorId() ?? "" },
        });
        if (!res.ok && res.status !== 400 && res.status !== 404) return "いまは削除できませんでした。時間をおいてもう一度お試しください。";
      } catch {
        return "いまは削除できませんでした。通信状況を確かめてもう一度お試しください。";
      }
      forgetCode(code);
    }
    trackFeature("分析 > 削除した");
    forget(code);
    setDeleting(null);
    return null;
  }


  /** 一覧の並びは変えずに中身だけ差し替える（AI 総評が付いたときなど） */
  /**
   * AI総評ができたら、その試合の総評だけを入れる。作っている間に修正された試合（editedAt が違う）には入れない
   * （総評の応答に付いてくる試合データは作り始めた時点のものなので、丸ごと入れると修正が消える）
   */
  function applyReview(updated: ScoreSheet) {
    const same = (x: ScoreSheet) => x.continueCode === updated.continueCode && (x.editedAt ?? "") === (updated.editedAt ?? "");
    setSheets((cur) => {
      const next = cur.map((x) => (same(x) ? { ...x, review: updated.review } : x));
      saveLocal(next);
      return next;
    });
    setOpened((o) => (o && same(o) ? { ...o, review: updated.review } : o));
  }

  function replaceLocal(sheet: ScoreSheet) {
    setSheets((cur) => {
      const next = cur.map((x) => (x.continueCode === sheet.continueCode ? sheet : x));
      saveLocal(next);
      return next;
    });
  }

  function forget(code: string | undefined) {
    setSheets((cur) => {
      const next = cur.filter((s) => s.continueCode !== code);
      saveLocal(next);
      return next;
    });
    setOpened(null);
  }

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo)), [photo]);

  // 読み取り中の経過秒（だいたい30秒かかるので、止まっていないことが分かるように）
  useEffect(() => {
    if (!reading) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [reading]);

  // 今日のアップロードの残り（全体）。カウンター表示と、0件のときにボタンを止めるのに使う
  const [quota, setQuota] = useState<{ limit: number; remaining: number | null } | null>(null);
  async function loadQuota() {
    const d = await fetch("/api/scoresheets/read", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    if (d && typeof d.limit === "number") setQuota({ limit: d.limit, remaining: d.remaining });
  }
  useEffect(() => {
    if (tab === "add") loadQuota();
  }, [tab]);

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("アップロードできるのは画像（写真）だけです。");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setMessage(`写真が大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。10MBまでの画像を選んでください。`);
      return;
    }
    fileObj.current = file;
    setPhoto(URL.createObjectURL(file));
    setPhotoOpen(true);
    setMessage("");
  }

  async function readPhoto() {
    if (!fileObj.current) return;
    setReading(true);
    setMessage("");
    try {
      const { base64, mediaType } = await shrinkImage(fileObj.current);
      const res = await fetch("/api/scoresheets/read", {
        method: "POST",
        headers: { "content-type": "application/json", "x-visitor-id": getVisitorId() ?? "" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
        trackFeature("分析 > アップロード > 読み取り成功");
        setDraft(d.sheet);
        setPhotoOpen(false);
        setMessage("読み取りました。写真と見比べて（上の「開く ▼」で写真を表示）、違うところを直してから一番下で保存してください。");
        setTimeout(() => document.getElementById("sheet-message")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else {
        trackFeature(`分析 > アップロード > 読み取り失敗 > ${d.error ?? res.status}`);
        setDraft((cur) => cur ?? emptySheet());
        setMessage(d.message ?? "読み取れませんでした。手入力で登録できます。");
      }
    } catch {
      setDraft((cur) => cur ?? emptySheet());
      setMessage("読み取れませんでした。手入力で登録できます。");
    } finally {
      setReading(false);
      loadQuota();
    }
  }

  async function save() {
    if (!draft) return;
    const code = normalizeContinueCode(newCode);
    if (!code) {
      setCodeError(`コンテニューコードは半角の大文字と数字で${CONTINUE_MIN}〜8文字にしてください。`);
      return;
    }
    setCodeError("");
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scoresheets", {
        method: "POST",
        headers: { "content-type": "application/json", "x-visitor-id": getVisitorId() ?? "" },
        body: JSON.stringify({ ...draft, continueCode: code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
        trackFeature(`分析 > 保存 > ${issues ? "要確認あり" : "要確認なし"}`);
        if (d.editToken) {
          saveToken(d.continueCode, d.editToken);
          setTokens(loadTokens());
        }
        remember(d.sheet);
        rememberCode(d.continueCode);
        setOpened(d.sheet);
        setIssued(d.continueCode);
        setDraft(null);
        setNewCode("");
        setPhoto(null);
        fileObj.current = null;
        setTab("analysis");
      } else if (d.error === "taken" || d.error === "bad_code") {
        setCodeError(d.message);
      } else {
        setMessage(d.message ?? "保存できませんでした。");
      }
    } finally {
      setSaving(false);
    }
  }

  // おまかせの候補は、入力欄が出たときに1回だけ入れる（消したあとに勝手に入れ直さない）
  const suggested = useRef(false);
  useEffect(() => {
    if (!draft) {
      suggested.current = false;
      return;
    }
    if (!suggested.current) {
      suggested.current = true;
      setNewCode((cur) => cur || suggestContinueCode(browserRandom));
    }
  }, [draft]);
  const codeOk = normalizeContinueCode(newCode) !== null;

  const issues = draft ? checkSheet(draft).errors.length : 0;
  const blank = draft ? isBlankSheet(draft) : true;

  return (
    <div className={embedded ? "" : "min-h-screen bg-gray-950"}>
      <div className={embedded ? "space-y-4" : "max-w-2xl mx-auto px-4 py-6 space-y-4"}>
        <div>
          <h1 className="text-xl font-bold text-white">スコア表分析</h1>
          <p className="text-xs text-gray-500 mt-1">
            スコア表の写真から、セーブ率・決定率・得点の流れなどを分析します。会員登録は不要で、コンテニューコードでいつでも呼び出せます。
          </p>
        </div>

        {/* 上の「チーム / スコア / … / 分析」と見分けやすいよう、こちらは下線のタブにする */}
        <div className="flex border-b border-gray-800">
          {(
            [
              ["analysis", "分析を見る"],
              ["add", "アップロード"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              data-feature={`分析 > ${label}`}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                tab === k ? "border-blue-500 text-white" : "border-transparent text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {deleting && <DeleteDialog sheet={deleting} onCancel={() => setDeleting(null)} onDelete={confirmDelete} />}

        {issued && (
          <ContinueCodeModal
            code={issued}
            onClose={() => {
              scrollToGame(issued);
              setIssued(null);
            }}
          />
        )}

        {tab === "analysis" && (
          <>
            <ContinueCodeInput
              onLoaded={(s) => {
                // 呼び出したデータは一覧に入れる（分析は一覧の行をタップして開く）
                remember(s);
                setJustLoaded(s.continueCode ?? null);
                setOpened(null);
              }}
            />
            {sharedError && <p className="text-xs text-red-300 bg-red-900/30 border border-red-800/60 rounded px-3 py-2">{sharedError}</p>}
            {shared && (
              <SharedGame
                sheet={shared}
                onUpdate={(updated) =>
                  setShared((cur) => (cur && (cur.editedAt ?? "") === (updated.editedAt ?? "") ? { ...cur, review: updated.review } : cur))
                }
                onKeep={() => {
                  trackFeature("分析 > 共有された試合を一覧に追加");
                  remember(shared);
                  rememberCode(shared.continueCode ?? "");
                  setJustLoaded(shared.continueCode ?? null);
                  setShared(null);
                  scrollToGame(shared.continueCode);
                }}
                onClose={() => setShared(null)}
              />
            )}
            {!loading && (
              <SheetList
                sheets={sheets}
                highlight={justLoaded}
                onDelete={deleteSheet}
                openCode={opened?.continueCode ?? null}
                onToggle={(s) => {
                  setJustLoaded(null);
                  setFixing(null);
                  const closing = opened?.continueCode === s.continueCode;
                  setOpened(closing ? null : s);
                  if (!closing) scrollToGame(s.continueCode);
                }}
                renderDetail={(s) =>
                  fixing && fixing.continueCode === s.continueCode ? (
                    <FixSheet
                      sheet={fixing}
                      token={tokens[fixing.continueCode ?? ""] ?? ""}
                      onChange={setFixing}
                      onCancel={() => setFixing(null)}
                      onSaved={(updated) => {
                        trackFeature(`分析 > 修正を保存 > ${checkSheet(updated).errors.length ? "要確認あり" : "要確認なし"}`);
                        replaceLocal(updated);
                        setOpened(updated);
                        setFixing(null);
                        scrollToGame(updated.continueCode);
                      }}
                    />
                  ) : (
                  <div className="space-y-2 pb-2">
                    <GameDetail sheet={s} compact onUpdate={applyReview} />
                    {s.continueCode && tokens[s.continueCode] && (
                      <button
                        onClick={() => {
                          setFixing(structuredClone(s));
                          scrollToGame(s.continueCode);
                        }}
                        data-feature="分析 > 修正する"
                        className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-800 border border-gray-600 text-gray-100"
                      >
                        ✏️ 読み取り結果を修正する
                      </button>
                    )}
                    {s.continueCode && (
                      <button
                        onClick={async () => {
                          const r = await shareGame(s.continueCode!, s);
                          if (r === "copied") {
                            setShareNote(s.continueCode!);
                            setTimeout(() => setShareNote(null), 2500);
                          }
                        }}
                        data-track="スコア表 共有"
                        data-feature="分析 > 共有"
                        className={`w-full py-2.5 rounded-lg text-sm font-medium ${
                          shareNote === s.continueCode ? "bg-green-600 text-white" : "bg-blue-600 text-white"
                        }`}
                      >
                        {shareNote === s.continueCode ? "コードとリンクをコピーしました" : "🔗 コンテニューコードとリンクを共有"}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
                      <button onClick={() => setOpened(null)} className="text-xs text-gray-400 underline">
                        閉じる
                      </button>
                      <button onClick={() => deleteSheet(s)} data-feature="分析 > 削除（確認画面）" className="text-xs text-red-400 underline">
                        このデータを削除
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("この端末の一覧から外します（コンテニューコードでまた呼び出せます）。")) forget(s.continueCode);
                        }}
                        className="text-xs text-gray-500 underline"
                      >
                        この端末から外す
                      </button>
                    </div>
                  </div>
                  )
                }
              />
            )}
            {!loading && sheets.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-10">
                この端末に保存した試合はまだありません。
                <br />
                「アップロード」から始めるか、コンテニューコードで呼び出してください。
              </p>
            )}
          </>
        )}

        {reading && <ReadingOverlay elapsed={elapsed} />}

        {tab === "add" && (
          <div className="space-y-4">
            <Steps step={draft ? 3 : photo ? 2 : 1} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />

            {/* ① 写真を選ぶ */}
            {!photo && !draft && (
              <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 text-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  data-feature="分析 > アップロード > 写真を選ぶ"
                  className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-base"
                >
                  📷 スコア表の写真を選ぶ
                </button>
                <p className="text-[11px] text-gray-500">画像のみ・10MBまで（写真は保存しません）</p>
                <button onClick={() => setDraft(emptySheet())} data-feature="分析 > アップロード > 手入力" className="text-xs text-gray-400 underline">
                  写真を使わず手入力する
                </button>
              </section>
            )}

            {/* ② 読み取る */}
            {photo && !draft && (
              <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="スコア表の写真" className="w-full max-h-72 object-contain rounded-lg border border-gray-800 bg-black" />
                <button
                  onClick={readPhoto}
                  disabled={reading || quota?.remaining === 0}
                  data-track="スコア表 読み取り"
                  data-feature="分析 > アップロード > 読み取り開始"
                  className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-base disabled:opacity-40"
                >
                  {reading ? "読み取り中…" : quota?.remaining === 0 ? "今日の上限に達しました" : "この写真を読み取る（約30秒）"}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button onClick={() => fileRef.current?.click()} data-feature="分析 > アップロード > 別の写真にする" className="text-gray-400 underline">
                    別の写真にする
                  </button>
                  <button
                    onClick={() => {
                      setDraft(emptySheet());
                      setPhotoOpen(false);
                    }}
                    className="text-gray-400 underline"
                  >
                    手入力にする
                  </button>
                </div>
              </section>
            )}

            {/* ③ 確認して保存：写真は折りたたみ。読み直し（再アップロード）もここから */}
            {draft && (
              <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                <p className="text-[11px] text-gray-400">読み取りがうまくいかなかったときは、やり直せます（入力中の内容は消えます）。</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!confirm("入力中の内容を消して、別の写真を選び直しますか？")) return;
                      trackFeature("分析 > アップロード > 別の写真で読み直す");
                      setDraft(null);
                      setMessage("");
                      fileRef.current?.click();
                    }}
                    className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100"
                  >
                    📷 別の写真で読み直す
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("入力中の内容を消して、同じ写真をもう一度読み取りますか？（アップロード1件として数えます）")) return;
                      trackFeature("分析 > アップロード > 同じ写真を読み直す");
                      readPhoto();
                    }}
                    disabled={!photo || reading || quota?.remaining === 0}
                    className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100 disabled:opacity-40"
                  >
                    🔄 同じ写真を読み直す
                  </button>
                </div>
                {quota && quota.remaining !== null && (
                  <p className="text-[10px] text-gray-500 text-center">今日のアップロード 残り {quota.remaining} / {quota.limit} 件</p>
                )}
              </section>
            )}
            {draft && photo && (
              <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                <button
                  onClick={() => setPhotoOpen((v) => !v)}
                  data-feature="分析 > アップロード > 写真を見比べる"
                  className="w-full flex items-center justify-between text-sm text-gray-300"
                >
                  <span>📷 スコア表の写真（見比べ用）</span>
                  <span className="text-xs text-blue-400">{photoOpen ? "閉じる ▲" : "開く ▼"}</span>
                </button>
                {photoOpen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="スコア表の写真" className="w-full rounded-lg border border-gray-800" />
                )}
              </section>
            )}

            {quota && quota.remaining !== null && !draft && (
              <p className={`text-[11px] text-center ${quota.remaining === 0 ? "text-amber-300" : quota.remaining <= 5 ? "text-amber-200" : "text-gray-500"}`}>
                今日のアップロード 残り <b className="text-gray-200">{quota.remaining}</b> / {quota.limit} 件（全員で共通・0時に戻ります）
              </p>
            )}

            {message && (
              <p id="sheet-message" className="text-xs text-gray-300 bg-gray-800 rounded px-3 py-2 scroll-mt-4">
                {message}
              </p>
            )}

            {draft && (
              <>
                <ScoreSheetEditor sheet={draft} onChange={setDraft} />
                <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                  <label className="block text-xs text-gray-400" htmlFor="new-continue-code">
                    コンテニューコード（半角の大文字と数字・{CONTINUE_MIN}〜8文字。自由に決められます）
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="new-continue-code"
                      value={newCode}
                      onChange={(e) => {
                        setNewCode(continueCodeInput(e.target.value));
                        setCodeError("");
                      }}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
                      className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white tracking-widest focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        setNewCode(suggestContinueCode(browserRandom));
                        setCodeError("");
                      }}
                      data-feature="分析 > 保存 > おまかせコード"
                      className="px-3 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300"
                    >
                      おまかせ
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200 bg-amber-900/20 border border-amber-800/50 rounded px-2 py-1.5">
                    ⚠ コンテニューコードが分かれば、<b>誰でもこのデータを呼び出せます</b>（削除もできます）。
                    「1234」「AAAA」やチーム名のような簡単なコード、ほかの人と重なりやすいコードは使わないでください。迷ったら「おまかせ」がおすすめです。
                  </p>
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    保存した試合の結果・得点者などは、このサイトの「リーグニュース」の記事の材料に使うことがあります（コンテニューコードは載せません）。
                  </p>
                  {codeError && <p className="text-xs text-red-300">{codeError}</p>}
                </section>
                <button
                  onClick={save}
                  disabled={saving || reading || blank || !codeOk}
                  data-track="スコア表 登録"
                  className={`w-full py-3 rounded-lg text-white font-medium disabled:opacity-40 ${issues ? "bg-amber-600" : "bg-green-600"}`}
                >
                  {saving
                    ? "保存中…"
                    : blank
                      ? "チーム名や得点を入れると保存できます"
                      : !codeOk
                        ? "コンテニューコードを入れると保存できます"
                        : "コンテニューコードを設定して保存"}
                </button>
                {issues > 0 && (
                  <p className="text-[11px] text-amber-300/80 -mt-2">
                    要確認が {issues}件 あります（このまま保存できます）。
                  </p>
                )}
                {issues > 0 && (
                  <p className="text-[11px] text-gray-500 -mt-2">
                    要確認のまま保存すると、分析の試合一覧に「要確認」と表示されます。合わない項目は集計が正しく出ないことがあります。
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 読み取り中の表示（画面のどこにいても見えるように全面に出す） */
function ReadingOverlay({ elapsed }: { elapsed: number }) {
  const progress = Math.min(95, (elapsed / 35) * 100);
  const step = elapsed < 5 ? "写真を送っています" : elapsed < 25 ? "スコア表を読み取っています" : "仕上げています";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" role="status" aria-live="polite">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4 text-center">
        <div className="mx-auto animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        <div>
          <p className="text-base font-bold text-white">{step}…</p>
          <p className="text-xs text-gray-400 mt-1">
            {elapsed}秒経過（いつも30秒ほどかかります）
          </p>
        </div>
        <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[11px] text-gray-500">このままお待ちください。</p>
      </div>
    </div>
  );
}

/** コンテニューコードで呼び出す（前に使ったコードはクッキーから入れておく） */
function ContinueCodeInput({ onLoaded }: { onLoaded: (s: ScoreSheet) => void }) {
  const [code, setCode] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const codes = rememberedCodes();
    setRecent(codes);
    if (codes[0]) setCode(codes[0]);
  }, []);
  /** via: 入力して呼び出した（input）／「前に使ったコード」を押した（recent）。操作ログで見分ける */
  async function load(input = code, via: "input" | "recent" = "input") {
    const c = normalizeContinueCode(input);
    if (!c) return setError("コンテニューコードは半角の大文字と数字の4〜8文字です（例 K7QM3XRA）。");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(c)}&via=${via}`, { headers: { "x-visitor-id": getVisitorId() ?? "" } });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
        trackFeature("分析 > コードで呼び出し");
        onLoaded(d.sheet);
        rememberCode(c);
        setRecent(rememberedCodes());
      } else {
        setError(d.message ?? "呼び出せませんでした。");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
      <p className="text-xs text-gray-400">コンテニューコードで呼び出す</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(continueCodeInput(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="K7QM3XRA"
          inputMode="text"
          pattern="[A-Z0-9]{8}"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white tracking-widest placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button onClick={() => load()} disabled={busy || !code.trim()} className="px-4 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40">
          {busy ? "…" : "呼び出す"}
        </button>
      </div>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-gray-500">前に使ったコード</span>
          {recent.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCode(c);
                load(c, "recent");
              }}
              data-feature="分析 > 前に使ったコード"
              className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs text-gray-200 tracking-wider"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </section>
  );
}

/** 保存直後にコンテニューコードを見せる */
function ContinueCodeModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="コンテニューコード"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-white">保存しました</p>
        <div>
          <p className="text-xs text-gray-400">コンテニューコード</p>
          <p className="text-3xl font-bold text-white tracking-[0.2em] mt-1 select-all">{code}</p>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          このコードを入れると、別の端末からでもこの試合のデータを呼び出せます。コードが分かれば誰でも呼び出せるので、人に教えるときは気をつけてください。この端末ではクッキーに覚えておくので次回は入力不要ですが、会員登録が無いので、別の端末で使うときやクッキーを消したときのためにメモかスクリーンショットで残してください。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                window.prompt("コンテニューコード", code);
              }
            }}
            className={`py-2.5 rounded-lg text-sm font-medium ${copied ? "bg-green-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-200"}`}
          >
            {copied ? "コピーしました" : "コードをコピー"}
          </button>
          <button
            onClick={() => shareGame(code)}
            data-feature="分析 > 保存直後に共有"
            className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm font-medium text-gray-200"
          >
            🔗 共有
          </button>
          <button onClick={onClose} className="col-span-2 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white">
            分析を見る
          </button>
        </div>
      </div>
    </div>
  );
}

/** アップロードの手順（今どこか） */
function Steps({ step }: { step: 1 | 2 | 3 }) {
  const items = ["写真を選ぶ", "読み取る", "確認して保存"];
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <li key={label} className="flex-1 flex items-center gap-1 min-w-0">
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full grid place-items-center font-bold ${
                state === "now" ? "bg-blue-600 text-white" : state === "done" ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-500"
              }`}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={`truncate ${state === "now" ? "text-white font-medium" : "text-gray-500"}`}>{label}</span>
            {n < 3 && <span className="flex-1 h-px bg-gray-800 min-w-2" />}
          </li>
        );
      })}
    </ol>
  );
}

/** 保存した試合の読み取り結果を直す（コンテニューコードはそのまま。修正前の版は管理者が戻せるよう残る） */
function FixSheet({
  sheet,
  token,
  onChange,
  onCancel,
  onSaved,
}: {
  sheet: ScoreSheet;
  /** 修正用の鍵（保存した端末だけが持つ） */
  token: string;
  onChange: (s: ScoreSheet) => void;
  onCancel: () => void;
  onSaved: (s: ScoreSheet) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const issues = checkSheet(sheet).errors.length;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(sheet.continueCode ?? "")}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-visitor-id": getVisitorId() ?? "", "x-edit-token": token },
        body: JSON.stringify(sheet),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) onSaved(d.sheet);
      else setError(d.message ?? "修正を保存できませんでした。時間をおいてもう一度お試しください。");
    } catch {
      setError("修正を保存できませんでした。通信状況を確かめてもう一度お試しください。");
    }
    setBusy(false);
  }
  return (
    <div className="space-y-2 pb-2">
      <div className="rounded-lg bg-sky-950/30 border border-sky-800/60 px-3 py-2">
        <p className="text-sm font-semibold text-sky-200">読み取り結果を修正</p>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          スコア表と見比べて、違うところを直してください。コンテニューコードはそのままです。修正できるのは保存したこの端末だけです。
          保存すると AI総評は直した内容で作り直します。
        </p>
      </div>
      <ScoreSheetEditor sheet={sheet} onChange={onChange} />
      {issues > 0 && (
        <p className="text-xs text-amber-300">要確認が {issues}件 あります（このまま保存できます）。</p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={onCancel} disabled={busy} className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200">
          やめる
        </button>
        <button
          onClick={() => void save()}
          disabled={busy}
          className={`py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${issues ? "bg-amber-600" : "bg-green-600"}`}
        >
          {busy ? "保存中…" : "修正を保存"}
        </button>
      </div>
    </div>
  );
}

/** 共有リンクで開いた試合（この端末には保存しない。一覧に入れるかは開いた人が決める） */
function SharedGame({
  sheet,
  onUpdate,
  onKeep,
  onClose,
}: {
  sheet: ScoreSheet;
  onUpdate: (s: ScoreSheet) => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  return (
    <section
      id={`row-shared-${sheet.continueCode}`}
      className="scroll-mt-4 rounded-xl border border-sky-700/70 bg-sky-950/20 p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sky-200">共有された試合</p>
          <p className="text-[11px] text-gray-400">この端末には保存されていません。ページを閉じると表示は消えます。</p>
        </div>
        <button onClick={onClose} aria-label="閉じる" className="ml-auto text-gray-500 text-lg leading-none px-1">
          ×
        </button>
      </div>
      <GameDetail sheet={sheet} compact onUpdate={onUpdate} />
      <button
        onClick={onKeep}
        className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-800 border border-gray-600 text-gray-100"
      >
        ＋ この端末の一覧に追加
      </button>
    </section>
  );
}

/** 削除の確認。コンテニューコードを入力しないと削除できない。削除した人の情報が記録されることも伝える */
function DeleteDialog({
  sheet,
  onCancel,
  onDelete,
}: {
  sheet: ScoreSheet;
  onCancel: () => void;
  onDelete: (s: ScoreSheet) => Promise<string | null>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const code = sheet.continueCode ?? "";
  const plain = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matches = code !== "" && plain(typed) === plain(code);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="データの削除"
        className="w-full max-w-sm bg-gray-900 border border-red-800/60 rounded-2xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-white">この試合のデータを削除</p>
        <p className="text-xs text-gray-300">
          {sheet.date || "日付なし"} {sheet.division} ／ {sheet.visitor.name || "?"} {sheet.visitor.total} − {sheet.home.total} {sheet.home.name || "?"}
        </p>
        <div className="text-[11px] leading-relaxed text-amber-200 bg-amber-900/20 border border-amber-800/50 rounded px-2 py-1.5 space-y-1">
          <p>削除すると、このコンテニューコードでは呼び出せなくなります。</p>
          <p>
            <b>削除した人の情報（日時・IPアドレス・ブラウザ・端末ID）を記録します。</b>
            誤って削除したときやいたずらに備えて、管理者がデータを一定期間保管し、復元できるようにしています。
          </p>
        </div>
        <label className="block text-xs text-gray-400" htmlFor="delete-code">
          確認のため、コンテニューコード <b className="text-gray-200 tracking-wider">{code}</b> を入力してください
        </label>
        <input
          id="delete-code"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value.toUpperCase());
            setError("");
          }}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white tracking-widest focus:outline-none focus:border-red-500"
        />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200">
            やめる
          </button>
          <button
            disabled={!matches || busy}
            onClick={async () => {
              setBusy(true);
              const err = await onDelete(sheet);
              setBusy(false);
              if (err) setError(err);
            }}
            className="py-2.5 rounded-lg bg-red-600 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "削除中…" : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}
