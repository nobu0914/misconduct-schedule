import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  applyVote,
  EMPTY_RESULT,
  isValidVoteDate,
  readAggregate,
  readMyVote,
  validateVoteInput,
  type VoteResult,
  type VoteStore,
} from "@/lib/votes";

// 投票ロジックは src/lib/votes.ts（テスト可能なようにKV操作を差し替えられる形）
const store = kv as unknown as VoteStore;

export async function GET(req: NextRequest): Promise<NextResponse<VoteResult>> {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const voterId = req.nextUrl.searchParams.get("voterId") ?? "";
  if (!isValidVoteDate(date)) return NextResponse.json(EMPTY_RESULT, { status: 400 });

  try {
    const [aggregate, myVote] = await Promise.all([
      readAggregate(store, date),
      voterId ? readMyVote(store, date, voterId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ...aggregate, myVote });
  } catch (e) {
    console.error("votes GET error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(EMPTY_RESULT, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<VoteResult>> {
  const input = validateVoteInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json(EMPTY_RESULT, { status: 400 });

  try {
    return NextResponse.json(await applyVote(store, input));
  } catch (e) {
    // 例外の中身はログにだけ出す（利用者に内部情報を返さない）
    console.error("votes POST error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(EMPTY_RESULT, { status: 500 });
  }
}
