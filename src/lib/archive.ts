import { kv } from "@vercel/kv";

/**
 * 公式サイトのページは、シーズンが終わると予告なく非公開になることがある。
 * 取得に成功したデータを Vercel KV にスナップショットとして残し、
 * 取得元が消えた（404）ときはスナップショットで補完する。
 *
 * KV が未設定・不通でも通常の取得は動き続ける（すべて握りつぶして no-op）。
 */

export interface ArchiveEntry<T> {
  savedAt: string;
  count: number;
  items: T[];
}

function entryKey(group: string, label: string): string {
  return `archive:${group}:${label}`;
}

function indexKey(group: string): string {
  return `archive:index:${group}`;
}

/** 保存済みラベルの一覧。KVのSCANを避けるためインデックスを別に持つ */
export async function listArchived(group: string): Promise<Set<string>> {
  try {
    const labels = await kv.smembers<string[]>(indexKey(group));
    return new Set(labels ?? []);
  } catch {
    return new Set();
  }
}

export async function saveArchive<T>(group: string, label: string, items: T[]): Promise<boolean> {
  if (items.length === 0) return false; // 空で上書きしない
  try {
    const entry: ArchiveEntry<T> = {
      savedAt: new Date().toISOString(),
      count: items.length,
      items,
    };
    await Promise.all([
      kv.set(entryKey(group, label), entry),
      kv.sadd(indexKey(group), label),
    ]);
    return true;
  } catch (e) {
    console.error(`archive save failed (${group}/${label}):`, e);
    return false;
  }
}

export async function loadArchive<T>(group: string, label: string): Promise<ArchiveEntry<T> | null> {
  try {
    return (await kv.get<ArchiveEntry<T>>(entryKey(group, label))) ?? null;
  } catch (e) {
    console.error(`archive load failed (${group}/${label}):`, e);
    return null;
  }
}

export interface ArchivedEntry<T> {
  label: string;
  savedAt: string;
  items: T[];
}

/**
 * 指定した接頭辞を持つ保存済みデータをまとめて読み出す。
 * 終わったシーズン（取得候補から外れたページ）を表示し続けるために使う。
 * 公式サイトへは一切アクセスしない。
 */
export async function loadArchivedByPrefix<T>(
  group: string,
  prefix: string
): Promise<ArchivedEntry<T>[]> {
  const labels = [...(await listArchived(group))].filter((l) => l.startsWith(prefix));
  const entries = await Promise.all(
    labels.map(async (label) => {
      const snapshot = await loadArchive<T>(group, label);
      return snapshot?.items?.length
        ? { label, savedAt: snapshot.savedAt, items: snapshot.items }
        : null;
    })
  );
  return entries.filter((e): e is ArchivedEntry<T> => e !== null);
}

/**
 * 取得結果をアーカイブと突き合わせる共通処理。
 * - 取得できたものは保存（アーカイブを更新）
 * - 取得できなかった（404/エラー）ものは、保存済みがあればそれで補完
 *
 * 補完結果は戻り値で返す（呼び出し側の配列は書き換えない）。
 * `source` は補完時に count / fromArchive を更新する。
 *
 * @param restore 補完時にアイテムを現在の文脈へ整え直す変換（月ラベルの付け直しなど）
 * @param save    保存も行うか。公開APIの描画ごとに書き込むのは無駄なので、
 *                cron（キャッシュを介さない取得）のときだけ true にする
 */
export async function reconcileWithArchive<
  T,
  S extends { label: string; count: number; fromArchive?: string }
>(
  group: string,
  results: { items: T[]; source: S }[],
  restore: (items: T[]) => T[] = (items) => items,
  save = false
): Promise<T[][]> {
  const archived = await listArchived(group);

  return Promise.all(
    results.map(async (r) => {
      if (r.items.length > 0) {
        if (save) await saveArchive(group, r.source.label, r.items);
        return r.items;
      }
      // 保存した実績がないものは単に未公開なので触らない
      if (!archived.has(r.source.label)) return r.items;

      const snapshot = await loadArchive<T>(group, r.source.label);
      if (!snapshot?.items?.length) return r.items;

      const restored = restore(snapshot.items);
      r.source.count = restored.length;
      r.source.fromArchive = snapshot.savedAt;
      return restored;
    })
  );
}
