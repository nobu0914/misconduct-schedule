"use client";

// 管理画面: リーグニュースの確認と「今すぐ作り直す」（毎週金曜 7:00 に自動で作る）
import { useState } from "react";
import type { NewsEdition } from "@/lib/leagueNews";
import { newsDate } from "@/components/newsStyle";

export default function AdminNews({ passcode }: { passcode: string }) {
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState<NewsEdition | null | undefined>(undefined);
  const [digest, setDigest] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/admin/news", { headers: { "x-admin-passcode": passcode } })
      .then((r) => r.json())
      .catch(() => null);
    setLatest(d?.latest ?? null);
  }

  async function regenerate() {
    if (!confirm("AI でニュースを作り直して、すぐサイトに出します。よろしいですか？")) return;
    setBusy(true);
    setMsg("作成中…（1分ほどかかります）");
    const res = await fetch("/api/admin/news", { method: "POST", headers: { "x-admin-passcode": passcode } }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && d?.edition) {
      setLatest(d.edition);
      setDigest(d.digest ?? "");
      setMsg("作り直しました（サイトの表示は最大1時間で切り替わります）。");
    } else setMsg(`作れませんでした（${d?.error ?? res?.status ?? "通信エラー"}）`);
  }

  return (
    <section className="space-y-2">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (latest === undefined) void load();
        }}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-300">リーグニュース（毎週金曜 7:00 に自動作成）</h2>
        <span className="text-xs text-blue-400">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{latest ? newsDate(latest.generatedAt) : latest === null ? "まだありません" : "読み込み中…"}</span>
            <button onClick={() => void regenerate()} disabled={busy} className="ml-auto px-3 py-1 rounded bg-blue-600 text-white text-xs disabled:opacity-50">
              今すぐ作り直す
            </button>
          </div>
          {msg && <p className="text-xs text-gray-300">{msg}</p>}
          {latest?.items.map((it, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-2 space-y-0.5">
              <p className="text-xs text-gray-500">{it.tag}{it.link && ` ／ ${it.link.label}`}</p>
              <p className="text-sm font-semibold text-white">{it.title}</p>
              <p className="text-xs text-gray-300">{it.body}</p>
            </div>
          ))}
          {digest && (
            <details className="text-[11px] text-gray-500">
              <summary>AI に渡した材料</summary>
              <pre className="whitespace-pre-wrap mt-1">{digest}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
