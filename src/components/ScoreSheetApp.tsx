"use client";

import { useEffect, useRef, useState } from "react";
import ScoreSheetEditor from "@/components/ScoreSheetEditor";
import { GameDetail, LeagueAnalysis } from "@/components/ScoreSheetAnalysis";
import { checkSheet, emptySheet, type ScoreSheet } from "@/lib/scoreSheet";

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

export default function ScoreSheetApp() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [sheets, setSheets] = useState<ScoreSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState<ScoreSheet | null>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScoreSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const fileObj = useRef<File | null>(null);

  async function loadSheets() {
    const d = await fetch("/api/scoresheets")
      .then((r) => r.json())
      .catch(() => ({ sheets: [] }));
    setSheets(d.sheets ?? []);
    setLoading(false);
  }
  useEffect(() => {
    loadSheets();
  }, []);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo)), [photo]);

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    fileObj.current = file;
    setPhoto(URL.createObjectURL(file));
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
        setMessage("読み取りました。写真と見比べて、違うところを直してから登録してください。");
      } else {
        setDraft((cur) => cur ?? emptySheet());
        setMessage(d.message ?? "読み取れませんでした。手入力で登録できます。");
      }
    } catch {
      setDraft((cur) => cur ?? emptySheet());
      setMessage("読み取れませんでした。手入力で登録できます。");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scoresheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        await loadSheets();
        setOpened({ ...draft, id: d.id });
        setDraft(null);
        setPhoto(null);
        fileObj.current = null;
        setTab("analysis");
      } else {
        setMessage(d.message ?? (d.errors ? d.errors.join(" / ") : "登録できませんでした。"));
      }
    } finally {
      setSaving(false);
    }
  }

  const canSave = draft !== null && checkSheet(draft).errors.length === 0;

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-white">スコア表分析</h1>
          <p className="text-xs text-gray-500 mt-1">
            試合のスコア表を登録すると、セーブ率・決定率・パワープレー得点など、公式サイトに無い数字を分析できます。
          </p>
        </div>

        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          {(
            [
              ["analysis", "分析を見る"],
              ["add", "スコア表を登録"],
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

        {tab === "analysis" && (
          <>
            {opened && (
              <div className="space-y-2">
                <GameDetail sheet={opened} />
                <button onClick={() => setOpened(null)} className="text-xs text-gray-400 underline">閉じる</button>
              </div>
            )}
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : (
              <LeagueAnalysis
                sheets={sheets}
                onOpen={(s) => {
                  setOpened(s);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          </>
        )}

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
                  disabled={!photo || reading}
                  data-track="スコア表 読み取り"
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40"
                >
                  {reading ? "読み取り中…（30秒ほど）" : "写真から読み取る"}
                </button>
              </div>
              {!draft && (
                <button onClick={() => setDraft(emptySheet())} className="text-xs text-blue-400 underline">
                  写真なしで手入力する
                </button>
              )}
              {photo && (
                // 入力中に見比べられるよう、写真は拡大できる大きさで表示する
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="スコア表の写真" className="w-full rounded-lg border border-gray-800" />
              )}
            </section>

            {message && <p className="text-xs text-gray-300 bg-gray-800 rounded px-3 py-2">{message}</p>}

            {draft && (
              <>
                <ScoreSheetEditor sheet={draft} onChange={setDraft} />
                <button
                  onClick={save}
                  disabled={!canSave || saving}
                  data-track="スコア表 登録"
                  className="w-full py-3 rounded-lg bg-green-600 text-white font-medium disabled:opacity-40"
                >
                  {saving ? "登録中…" : canSave ? "この内容で登録する" : "赤い項目を直すと登録できます"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
