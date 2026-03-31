import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { Attendance } from "@/lib/voteConstants";

const kv = Redis.fromEnv();

interface VoterRecord {
  attendance: Attendance;
  menu: string[];
}

interface VoteResult {
  attend: { yes: number; maybe: number; no: number };
  menu: Record<string, number>;
  myVote: VoterRecord | null;
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

  const [raw, myVoteRaw] = await Promise.all([
    kv.get<{ attend: { yes: number; maybe: number; no: number }; menu: Record<string, number> }>(dateKey(date)),
    voterId ? kv.get<VoterRecord>(voterKey(date, voterId)) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    attend: raw?.attend ?? { yes: 0, maybe: 0, no: 0 },
    menu: raw?.menu ?? {},
    myVote: myVoteRaw ?? null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<VoteResult>> {
  const { date, voterId, attendance, menu } = await req.json() as {
    date: string;
    voterId: string;
    attendance: Attendance;
    menu: string[];
  };

  if (!date || !voterId || !attendance) {
    return NextResponse.json({ attend: { yes: 0, maybe: 0, no: 0 }, menu: {}, myVote: null }, { status: 400 });
  }

  const key = dateKey(date);
  const vKey = voterKey(date, voterId);

  // 以前の投票を取得（変更の場合は差し引く）
  const [existing, prev] = await Promise.all([
    kv.get<{ attend: { yes: number; maybe: number; no: number }; menu: Record<string, number> }>(key),
    kv.get<VoterRecord>(vKey),
  ]);

  const attend = existing?.attend ?? { yes: 0, maybe: 0, no: 0 };
  const menuCounts: Record<string, number> = existing?.menu ?? {};

  // 以前の投票を削除
  if (prev) {
    attend[prev.attendance] = Math.max(0, (attend[prev.attendance] ?? 0) - 1);
    for (const item of prev.menu) {
      menuCounts[item] = Math.max(0, (menuCounts[item] ?? 0) - 1);
    }
  }

  // 新しい投票を加算
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
}
