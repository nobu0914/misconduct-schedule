"use client";

import { useEffect, useRef, useState } from "react";
import ScoreSheetEditor from "@/components/ScoreSheetEditor";
import { GameDetail, SheetList } from "@/components/ScoreSheetAnalysis";
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
export default function ScoreSheetApp({ embedded = false }: { embedded?: boolean }) {
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

  useEffect(() => {
    setSheets(loadLocal());
    setLoading(false);
  }, []);

  function remember(sheet: ScoreSheet) {
    setSheets((cur) => {
      const next = upsert(cur, sheet);
      saveLocal(next);
      return next;
    });
  }

  /** データを削除（サーバーからも消すので、コンテニューコードでも呼び出せなくなる） */
  async function deleteSheet(sheet: ScoreSheet) {
    const code = sheet.continueCode;
    const label = `${sheet.date || "日付なし"} ${sheet.visitor.name || "?"} ${sheet.visitor.total}−${sheet.home.total} ${sheet.home.name || "?"}`;
    if (!confirm(`この試合のデータを削除します。\n${label}\n\nコンテニューコード ${code ?? ""} でも呼び出せなくなります。よろしいですか？`)) return;
    if (code) {
      try {
        const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(code)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 400 && res.status !== 404) {
          alert("いまは削除できませんでした。時間をおいてもう一度お試しください。");
          return;
        }
      } catch {
        alert("いまは削除できませんでした。通信状況を確かめてもう一度お試しください。");
        return;
      }
      forgetCode(code);
    }
    forget(code);
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
        setDraft(d.sheet);
        setPhotoOpen(false);
        setMessage("読み取りました。写真と見比べて（上の「写真を表示」で開けます）、違うところを直してから保存してください。");
        setTimeout(() => document.getElementById("sheet-message")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else {
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, continueCode: code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
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

  useEffect(() => {
    if (draft && !newCode) setNewCode(suggestContinueCode(browserRandom));
  }, [draft, newCode]);

  const issues = draft ? checkSheet(draft).errors.length : 0;
  const blank = draft ? isBlankSheet(draft) : true;

  return (
    <div className={embedded ? "" : "min-h-screen bg-gray-950"}>
      <div className={embedded ? "space-y-4" : "max-w-2xl mx-auto px-4 py-6 space-y-4"}>
        <div>
          <h1 className="text-xl font-bold text-white">スコア表分析</h1>
          <p className="text-xs text-gray-500 mt-1">
            スコア表の写真から、セーブ率・決定率・パワープレー得点などを分析します。会員登録は不要です。保存するとコンテニューコードが出るので、メモしておけばいつでも呼び出せます。
          </p>
        </div>

        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          {(
            [
              ["analysis", "分析を見る"],
              ["add", "アップロード"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-md text-sm font-medium ${tab === k ? "bg-blue-600 text-white" : "text-gray-400"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {issued && <ContinueCodeModal code={issued} onClose={() => setIssued(null)} />}

        {tab === "analysis" && (
          <>
            <ContinueCodeInput
              onLoaded={(s) => {
                // 呼び出したデータは一覧に入れる（分析は一覧からタップ）
                remember(s);
                setJustLoaded(s.continueCode ?? null);
                setOpened(null);
              }}
            />
            {!loading && (
              <SheetList
                sheets={sheets}
                highlight={justLoaded}
                onDelete={deleteSheet}
                onOpen={(s) => {
                  setOpened(s);
                  setJustLoaded(null);
                  setTimeout(() => document.getElementById("sheet-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
              />
            )}
            {opened && (
              <div id="sheet-detail" className="space-y-2 scroll-mt-4">
                <GameDetail sheet={opened} />
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <button onClick={() => setOpened(null)} className="text-xs text-gray-400 underline">閉じる</button>
                  <button onClick={() => deleteSheet(opened)} className="text-xs text-red-400 underline">
                    このデータを削除
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("この端末の一覧から外します（コンテニューコードでまた呼び出せます）。")) forget(opened.continueCode);
                    }}
                    className="text-xs text-gray-500 underline"
                  >
                    この端末から外す
                  </button>
                </div>
              </div>
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
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
              <p className="text-xs text-gray-400">
                スコア表の写真を選ぶと、自動で読み取って下の欄に入れます（写真は保存しません）。手書きなので読み違いがあります。必ず写真と見比べてから登録してください。
              </p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="flex-1 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200">
                  {photo ? "写真を選び直す" : "写真を選ぶ"}
                </button>
                <button
                  onClick={readPhoto}
                  disabled={!photo || reading || quota?.remaining === 0}
                  data-track="スコア表 読み取り"
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40"
                >
                  {reading ? "読み取り中…" : quota?.remaining === 0 ? "今日の上限に達しました" : "写真から読み取る"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 flex flex-wrap gap-x-3">
                <span>画像のみ・10MBまで</span>
                {quota && quota.remaining !== null && (
                  <span className={quota.remaining === 0 ? "text-amber-300" : quota.remaining <= 5 ? "text-amber-200" : ""}>
                    今日のアップロード 残り <b className="text-gray-200">{quota.remaining}</b> / {quota.limit} 件（全員で共通・0時に戻ります）
                  </span>
                )}
              </p>
              {!draft && (
                <button onClick={() => setDraft(emptySheet())} className="text-xs text-blue-400 underline">
                  写真なしで手入力する
                </button>
              )}
              {photo && (
                <div className="space-y-2">
                  {draft && (
                    <button onClick={() => setPhotoOpen((v) => !v)} className="text-xs text-blue-400 underline">
                      {photoOpen ? "写真を折りたたむ" : "写真を表示"}
                    </button>
                  )}
                  {photoOpen && (
                    // 入力中に見比べられるよう、写真は拡大できる大きさで表示する
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="スコア表の写真" className="w-full rounded-lg border border-gray-800" />
                  )}
                </div>
              )}
            </section>

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
                      className="px-3 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300"
                    >
                      おまかせ
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">短いコードや分かりやすい言葉は、ほかの人に当てられて見られることがあります。</p>
                  {codeError && <p className="text-xs text-red-300">{codeError}</p>}
                </section>
                <button
                  onClick={save}
                  disabled={saving || reading || blank}
                  data-track="スコア表 登録"
                  className={`w-full py-3 rounded-lg text-white font-medium disabled:opacity-40 ${issues ? "bg-amber-600" : "bg-green-600"}`}
                >
                  {saving ? "保存中…" : blank ? "チーム名や得点を入れると保存できます" : "コンテニューコードを設定して保存"}
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
        <p className="text-[11px] text-gray-500">このままお待ちください。読み取りが終わると下の欄に入ります。</p>
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
  async function load(input = code) {
    const c = normalizeContinueCode(input);
    if (!c) return setError("コンテニューコードは半角の大文字と数字の4〜8文字です（例 K7QM3XRA）。");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scoresheets?code=${encodeURIComponent(c)}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sheet) {
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
                load(c);
              }}
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
          このコードを入れると、別の端末からでもこの試合のデータを呼び出せます。この端末ではクッキーに覚えておくので次回は入力不要ですが、会員登録が無いので、別の端末で使うときやクッキーを消したときのためにメモかスクリーンショットで残してください。
        </p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                window.prompt("コンテニューコード", code);
              }
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${copied ? "bg-green-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-200"}`}
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white">
            分析を見る
          </button>
        </div>
      </div>
    </div>
  );
}
