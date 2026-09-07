import type { ESPNEvent } from "./espn-data";

export const ESPN_API_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export type NFLSeasonType = 1 | 2 | 3;

export interface ESPNScoreboard {
  season?: { year?: number; type?: number };
  week?: { number?: number };
  events?: ESPNEvent[];
  leagues?: Array<{
    season?: { year?: number };
    calendar?: Array<{
      value?: string;
      entries?: Array<{ value?: string; startDate?: string; endDate?: string }>;
    }>;
  }>;
}

export interface NFLWeekSelection {
  year: number;
  week: number;
  seasonType: NFLSeasonType;
  espnWeek: number;
}

export function getNFLSeasonYear(now = new Date()): number {
  return now.getUTCMonth() <= 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

export function toInternalWeek(seasonType: number, espnWeek: number): number | null {
  if (seasonType !== 3) return espnWeek;
  if (espnWeek >= 1 && espnWeek <= 3) return espnWeek + 18;
  if (espnWeek === 5) return 22;
  return null;
}

export function getScheduleRequest(year: number, internalWeek: number): NFLWeekSelection {
  if (internalWeek >= 19 && internalWeek <= 22) {
    const espnWeek = internalWeek === 22 ? 5 : internalWeek - 18;
    return { year, week: internalWeek, seasonType: 3, espnWeek };
  }
  if (internalWeek < 1 || internalWeek > 18) {
    throw new Error(`Invalid NFL week: ${internalWeek}`);
  }
  return { year, week: internalWeek, seasonType: 2, espnWeek: internalWeek };
}

export function buildESPNScoreboardUrl(selection: Pick<NFLWeekSelection, "year" | "seasonType" | "espnWeek">): string {
  const params = new URLSearchParams({
    dates: selection.year.toString(),
    seasontype: selection.seasonType.toString(),
    week: selection.espnWeek.toString(),
    limit: "100",
  });
  return `${ESPN_API_URL}?${params}`;
}

export function isMatchingSchedule(
  data: ESPNScoreboard,
  selection: Pick<NFLWeekSelection, "year" | "seasonType" | "espnWeek">
): boolean {
  if (
    data.season?.year !== selection.year ||
    data.season?.type !== selection.seasonType ||
    data.week?.number !== selection.espnWeek
  ) {
    return false;
  }
  return (data.events || []).every(
    (event) =>
      event.season?.year === selection.year &&
      event.season?.type === selection.seasonType &&
      event.week?.number === selection.espnWeek
  );
}

export function isGameDateInSeason(date: string, year: number, internalWeek: number): boolean {
  const gameDate = new Date(date);
  if (Number.isNaN(gameDate.getTime())) return false;
  const expectedYear = internalWeek >= 19 ? year + 1 : year;
  return gameDate.getUTCFullYear() === expectedYear;
}

export function resolveNFLWeekFromCalendar(
  data: ESPNScoreboard,
  now = new Date()
): NFLWeekSelection {
  const league = data.leagues?.[0];
  const year = league?.season?.year;
  if (!year) throw new Error("ESPN response is missing its season calendar");

  for (const season of league.calendar || []) {
    const seasonType = Number(season.value);
    if (seasonType !== 2 && seasonType !== 3) continue;
    for (const entry of season.entries || []) {
      if (!entry.startDate || !entry.endDate || !entry.value) continue;
      if (now < new Date(entry.startDate) || now > new Date(entry.endDate)) continue;
      const espnWeek = Number(entry.value);
      const week = toInternalWeek(seasonType, espnWeek);
      if (week !== null) return { year, week, seasonType, espnWeek };
      return { year, week: 22, seasonType: 3, espnWeek: 5 };
    }
  }

  return { year, week: 1, seasonType: 2, espnWeek: 1 };
}

export function resolveCurrentNFLWeek(
  regular: ESPNScoreboard,
  postseason: ESPNScoreboard | null,
  now = new Date()
): NFLWeekSelection {
  const year = regular.season?.year;
  if (!year || regular.season?.type !== 2) throw new Error("Invalid regular-season response");

  const postseasonWeek = postseason?.week?.number;
  if (postseason?.season?.year === year && postseason.season.type === 3 && postseasonWeek) {
    const internalWeek = toInternalWeek(3, postseasonWeek);
    if (internalWeek !== null) {
      const firstPostseasonGame = postseason.events?.map((event) => event.date).filter(Boolean).sort()[0];
      if (!firstPostseasonGame || now >= new Date(firstPostseasonGame)) {
        return { year, week: internalWeek, seasonType: 3, espnWeek: postseasonWeek };
      }
    } else if (postseasonWeek === 4) {
      return { year, week: 22, seasonType: 3, espnWeek: 5 };
    }
  }

  const week = regular.week?.number;
  if (!week || week < 1 || week > 18) throw new Error("Invalid regular-season week");
  return { year, week, seasonType: 2, espnWeek: week };
}
