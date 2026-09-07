import { NextResponse } from "next/server";
import {
  buildESPNScoreboardUrl,
  getNFLSeasonYear,
  getScheduleRequest,
  resolveNFLWeekFromCalendar,
  type ESPNScoreboard,
} from "@/lib/nfl-season";

export const revalidate = 300;

async function fetchSeasonCalendar(year: number) {
  const response = await fetch(
    buildESPNScoreboardUrl(getScheduleRequest(year, 1)),
    { next: { revalidate } }
  );
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  return (await response.json()) as ESPNScoreboard;
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
