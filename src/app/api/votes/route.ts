import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { MENU_ITEMS, type Attendance } from "@/lib/voteConstants";

interface VoterRecord {
  attendance: Attendance;
  menu: string[];
}

interface VoteResult {
  attend: { yes: number; maybe: number; no: number };
  menu: Record<string, number>;
  myVote: VoterRecord | null;
}

const ATTENDANCE_VALUES: Attendance[] = ["yes", "maybe", "no"];

/**
 * 受け取った値はそのままKVのキーや集計キーになるため、既知の形・既知の値だけを通す。
 * （検証しないと任意のキーを作られ、集計データを際限なく膨らませられる）
 */
function validate(input: {
  date: unknown; voterId: unknown; attendance: unknown; menu: unknown;
}): { date: string; voterId: string; attendance: Attendance; menu: string[] } | null {
  const { date, voterId, attendance, menu } = input;
  if (typeof date !== "string" || !/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(date)) return null;
  if (typeof voterId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(voterId)) return null;
  if (!ATTENDANCE_VALUES.includes(attendance as Attendance)) return null;
  if (menu !== undefined && !Array.isArray(menu)) return null;
  const known: readonly string[] = MENU_ITEMS;
  const items = (menu ?? []) as unknown[];
  if (items.length > MENU_ITEMS.length) return null;
  if (!items.every((m) => typeof m === "string" && known.includes(m))) return null;
  return {
    date,
    voterId,
    attendance: attendance as Attendance,
    menu: Array.from(new Set(items as string[])),
  };
}

function dateKey(date: string) {
  return `vote:${date}`;
}
function voterKey(date: string, voterId: string) {
  return `vote:${date}:voter:${voterId}`;
}

export async function GET(req: NextRequest): Promise<NextResponse<VoteResult>> {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const voterId = req.nextUrl.searchParams.get("voterId") ?? "";

  try {
    const [raw, myVoteRaw] = await Promise.all([
      kv.get<{ attend: { yes: number; maybe: number; no: number }; menu: Record<string, number> }>(dateKey(date)),
      voterId ? kv.get<VoterRecord>(voterKey(date, voterId)) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      attend: raw?.attend ?? { yes: 0, maybe: 0, no: 0 },
      menu: raw?.menu ?? {},
      myVote: myVoteRaw ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("votes GET error:", msg);
    return NextResponse.json(
      { attend: { yes: 0, maybe: 0, no: 0 }, menu: {}, myVote: null, error: msg },
      { status: 500 }
    );
  }
}

const EMPTY_RESULT: VoteResult = { attend: { yes: 0, maybe: 0, no: 0 }, menu: {}, myVote: null };

export async function POST(req: NextRequest): Promise<NextResponse<VoteResult>> {
  const input = validate(await req.json());
  if (!input) {
    return NextResponse.json(EMPTY_RESULT, { status: 400 });
  }
  const { date, voterId, attendance, menu } = input;

  try {
    const key = dateKey(date);
    const vKey = voterKey(date, voterId);

    const [existing, prev] = await Promise.all([
      kv.get<{ attend: { yes: number; maybe: number; no: number }; menu: Record<string, number> }>(key),
      kv.get<VoterRecord>(vKey),
    ]);

    const attend = existing?.attend ?? { yes: 0, maybe: 0, no: 0 };
    const menuCounts: Record<string, number> = existing?.menu ?? {};

    if (prev) {
      attend[prev.attendance] = Math.max(0, (attend[prev.attendance] ?? 0) - 1);
      for (const item of prev.menu) {
        menuCounts[item] = Math.max(0, (menuCounts[item] ?? 0) - 1);
      }
    }

    attend[attendance] = (attend[attendance] ?? 0) + 1;
    for (const item of menu) {
      menuCounts[item] = (menuCounts[item] ?? 0) + 1;
    }

    const newRecord: VoterRecord = { attendance, menu };

    await Promise.all([
      kv.set(key, { attend, menu: menuCounts }),
      kv.set(vKey, newRecord),
    ]);

    return NextResponse.json({ attend, menu: menuCounts, myVote: newRecord });
  } catch (e) {
    // 例外の中身はログにだけ出す（利用者に内部情報を返さない）
    console.error("votes POST error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(EMPTY_RESULT, { status: 500 });
  }
}
