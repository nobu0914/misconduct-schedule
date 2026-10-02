// シーズンの最終結果（プレイオフの優勝・準優勝と個人賞）。クライアントからも使う。
//
// 順位表（レギュラーシーズン）の1位・2位を優勝・準優勝として扱ってはいけない。優勝はプレイオフで決まる
// （53rd: Brass はレギュラー2位のサイコが優勝、Platinum はレギュラー2位の TEAM I が優勝）。
// データは公式の最終結果ページから scripts/fetch-season-results.mts で書き出したもの。
// 52nd・51st は公式から消えていたので Wayback Machine に残っていたページから書き出した。

import awards51st from "../data/awards-51st.json";
import awards52nd from "../data/awards-52nd.json";
import awards53rd from "../data/awards-53rd.json";
import { teamKey } from "./teamName";

export interface AwardPerson {
  name: string;
  team?: string;
}

export interface DivisionAwards {
  division: string;
  champion?: string;
  runnerUp?: string;
  topGun?: AwardPerson;
  wall?: AwardPerson;
}

const SEASON_AWARDS: Record<number, DivisionAwards[]> = {
  51: awards51st as DivisionAwards[],
  52: awards52nd as DivisionAwards[],
  53: awards53rd as DivisionAwards[],
};

export function divisionAwards(season: number | undefined, division: string | undefined): DivisionAwards | undefined {
  if (season === undefined || !division) return undefined;
  return SEASON_AWARDS[season]?.find((a) => a.division === division);
}

/** プレイオフの結果（公式の結果がないシーズンは undefined） */
export function playoffResult(
  season: number | undefined,
  division: string | undefined,
  team: string
): "champion" | "runnerUp" | undefined {
  const a = divisionAwards(season, division);
  if (!a) return undefined;
  const key = teamKey(team);
  if (a.champion && teamKey(a.champion) === key) return "champion";
  if (a.runnerUp && teamKey(a.runnerUp) === key) return "runnerUp";
  return undefined;
}
