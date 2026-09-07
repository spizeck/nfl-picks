import { NextResponse } from "next/server";
import {
  buildESPNScoreboardUrl,
  getNFLSeasonYear,
  getScheduleRequest,
  isMatchingSchedule,
  resolveNFLWeekFromCalendar,
  type ESPNScoreboard,
} from "@/lib/nfl-season";

export const revalidate = 300;

async function fetchSeasonCalendar(year: number) {
  const selection = getScheduleRequest(year, 1);
  const response = await fetch(buildESPNScoreboardUrl(selection), {
    next: { revalidate },
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  const data = (await response.json()) as ESPNScoreboard;
  if (!isMatchingSchedule(data, selection)) {
    throw new Error("ESPN did not return the authoritative Week 1 schedule");
  }
  return data;
}

export async function GET() {
  try {
    const now = new Date();
    const seasonYear = getNFLSeasonYear(now);
    const calendar = await fetchSeasonCalendar(seasonYear);
    const selection = resolveNFLWeekFromCalendar(calendar, now);

    return NextResponse.json({
      week: selection.week,
      year: selection.year,
      seasonType: selection.seasonType,
    });
  } catch (error) {
    console.error("Error fetching current week:", error);
    return NextResponse.json(
      { error: "Current NFL week is temporarily unavailable. Please retry." },
      { status: 503 }
    );
  }
}
