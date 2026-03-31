import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import type { Attendance } from "@/lib/voteConstants";

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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("votes POST error:", msg);
    return NextResponse.json({ attend: { yes: 0, maybe: 0, no: 0 }, menu: {}, myVote: null, error: msg }, { status: 500 });
  }
}
