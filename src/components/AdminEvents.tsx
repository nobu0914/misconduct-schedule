"use client";

// 管理画面: events.rinnavi.com（MHL 以外の練習会・イベントの告知）の登録・修正・削除。書くのは管理者だけ
import { useState } from "react";
import { KINDS, SPORT_LABEL, dateLabel, timeLabel, todayJst, type SiteEvent } from "@/lib/siteEvents";

const EVENTS_ORIGIN = "https://events.rinnavi.com";

type Draft = Partial<SiteEvent>;

const empty = (): Draft => ({ sport: "inline", kind: "練習会", published: false, formLabel: "" });

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gray-400">
        {label}
        {note && <span className="ml-1 text-[10px] text-gray-500">{note}</span>}
      </span>
      {children}
    </label>
  );
}

const input = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500";

export default function AdminEvents({ passcode }: { passcode: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<SiteEvent[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/admin/site-events", { headers: { "x-admin-passcode": passcode } })
      .then((r) => r.json())
      .catch(() => null);
    setEvents(d?.events ?? []);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/site-events", {
      method: "POST",
      headers: { "x-admin-passcode": passcode, "content-type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (res?.ok && d?.event) {
      setMsg(d.event.published ? "保存しました（公開中）。" : "下書きとして保存しました（サイトには出ていません）。");
      setDraft(null);
      void load();
    } else setMsg(d?.message ?? `保存できませんでした（${res?.status ?? "通信エラー"}）`);
  }

  async function remove(e: SiteEvent) {
    if (!confirm(`「${e.title}」を削除します。元に戻せません。よろしいですか？`)) return;
    const res = await fetch(`/api/admin/site-events?id=${encodeURIComponent(e.id)}`, {
      method: "DELETE",
      headers: { "x-admin-passcode": passcode },
    }).catch(() => null);
    setMsg(res?.ok ? "削除しました。" : "削除できませんでした。");
    void load();
  }

  const set = (k: keyof SiteEvent) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: ev.target.value }));
  const today = todayJst();

  return (
    <section className="space-y-2">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (events === null) void load();
        }}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-semibold text-gray-300">イベント告知（events.rinnavi.com）</h2>
        <span className="text-xs text-blue-400">{open ? "閉じる ▲" : "開く ▼"}</span>
      </button>
      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
          <div className="flex items-center gap-2">
            <a href={EVENTS_ORIGIN} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 underline underline-offset-2">
              サイトを開く ↗
            </a>
            {!draft && (
              <button onClick={() => setDraft(empty())} className="ml-auto px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-medium">
                ＋ 新しいイベント
              </button>
            )}
          </div>
          {msg && <p className="text-xs text-gray-300">{msg}</p>}

          {draft && (
            <div className="space-y-3 border border-emerald-900/60 rounded-xl p-3 bg-gray-950/40">
              <p className="text-sm font-semibold text-white">{draft.id ? "イベントを修正" : "新しいイベント"}</p>
              <Field label="タイトル">
                <input value={draft.title ?? ""} onChange={set("title")} maxLength={80} className={input} placeholder="例 平日夜のインライン練習会" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="競技">
                  <select value={draft.sport ?? "inline"} onChange={set("sport")} className={input}>
                    {(Object.keys(SPORT_LABEL) as (keyof typeof SPORT_LABEL)[]).map((k) => (
                      <option key={k} value={k}>
                        {SPORT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="種類" note="自由に書いても可">
                  <input value={draft.kind ?? ""} onChange={set("kind")} list="site-event-kinds" maxLength={20} className={input} />
                  <datalist id="site-event-kinds">
                    {KINDS.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <Field label="日付">
                <input type="date" value={draft.date ?? ""} onChange={set("date")} className={input} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="開始">
                  <input type="time" value={draft.start ?? ""} onChange={set("start")} className={input} />
                </Field>
                <Field label="終了">
                  <input type="time" value={draft.end ?? ""} onChange={set("end")} className={input} />
                </Field>
              </div>
              <Field label="会場">
                <input value={draft.place ?? ""} onChange={set("place")} maxLength={80} className={input} placeholder="例 ○○スポーツセンター" />
              </Field>
              <Field label="住所" note="地図のリンクに使う（任意）">
                <input value={draft.address ?? ""} onChange={set("address")} maxLength={120} className={input} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="参加費" note="任意">
                  <input value={draft.fee ?? ""} onChange={set("fee")} maxLength={80} className={input} placeholder="例 大人 3,000円" />
                </Field>
                <Field label="定員" note="任意">
                  <input value={draft.capacity ?? ""} onChange={set("capacity")} maxLength={40} className={input} placeholder="例 20名" />
                </Field>
              </div>
              <Field label="対象" note="任意">
                <input value={draft.target ?? ""} onChange={set("target")} maxLength={80} className={input} placeholder="例 初心者歓迎・小学生以上" />
              </Field>
              <Field label="持ち物" note="任意">
                <input value={draft.bring ?? ""} onChange={set("bring")} maxLength={120} className={input} />
              </Field>
              <Field label="主催" note="任意">
                <input value={draft.organizer ?? ""} onChange={set("organizer")} maxLength={60} className={input} />
              </Field>
              <Field label="説明" note="URL はリンクになります（任意）">
                <textarea value={draft.body ?? ""} onChange={set("body")} maxLength={3000} rows={6} className={input} />
              </Field>
              <Field label="申込フォームの URL" note="https:// から（任意）">
                <input value={draft.formUrl ?? ""} onChange={set("formUrl")} inputMode="url" className={input} placeholder="https://forms.gle/..." />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ボタンの文言" note="空なら「申し込む」">
                  <input value={draft.formLabel ?? ""} onChange={set("formLabel")} maxLength={20} className={input} />
                </Field>
                <Field label="申込締切" note="任意">
                  <input type="date" value={draft.deadline ?? ""} onChange={set("deadline")} className={input} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={!!draft.published}
                  onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                公開する（オフなら下書き。サイトには出ません）
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDraft(null)} className="py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200">
                  やめる
                </button>
                <button onClick={() => void save()} disabled={busy} className="py-2 rounded-lg bg-emerald-600 text-sm font-medium text-white disabled:opacity-40">
                  {busy ? "保存中…" : "保存する"}
                </button>
              </div>
            </div>
          )}

          {events === null && <p className="text-xs text-gray-500">読み込み中…</p>}
          {events?.length === 0 && !draft && <p className="text-xs text-gray-500">まだ登録はありません。</p>}
          <div className="divide-y divide-gray-800">
            {events?.map((e) => (
              <div key={e.id} className={`py-2 flex items-start gap-2 ${e.date < today ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">
                    {e.date.slice(0, 4)}/{dateLabel(e.date)} {timeLabel(e)} ／ {e.kind}・{SPORT_LABEL[e.sport]}
                  </p>
                  <p className="text-sm text-white truncate">{e.title}</p>
                  <p className="text-[11px]">
                    {e.published ? <span className="text-emerald-300">公開中</span> : <span className="text-amber-300">下書き</span>}
                    {e.published && (
                      <a href={`${EVENTS_ORIGIN}/e/${e.id}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-gray-400 underline underline-offset-2">
                        ページ ↗
                      </a>
                    )}
                  </p>
                </div>
                <button onClick={() => setDraft({ ...e })} className="text-xs text-blue-400 flex-shrink-0">
                  修正
                </button>
                <button onClick={() => void remove(e)} className="text-xs text-gray-500 flex-shrink-0">
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
