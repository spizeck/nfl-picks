import {
  buildESPNScoreboardUrl,
  getNFLSeasonYear,
  getScheduleRequest,
  isMatchingSchedule,
  resolveNFLWeekFromCalendar,
  type ESPNScoreboard,
  type NFLWeekSelection,
} from "./nfl-season";

const REVALIDATE_SECONDS = 300;

export async function fetchSeasonCalendar(
  year: number,
  fetchImpl: typeof fetch = fetch
): Promise<ESPNScoreboard> {
  const selection = getScheduleRequest(year, 1);
  const response = await fetchImpl(buildESPNScoreboardUrl(selection), {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
  const data = (await response.json()) as ESPNScoreboard;
  if (!isMatchingSchedule(data, selection)) {
    throw new Error("ESPN did not return the authoritative Week 1 schedule");
  }
  return data;
}

/**
 * Resolve the current NFL week using the same ESPN season-calendar logic the
 * `/api/current-week` route uses.
 */
export async function resolveCurrentWeekSelection(
  now = new Date(),
  fetchImpl: typeof fetch = fetch
): Promise<NFLWeekSelection> {
  const seasonYear = getNFLSeasonYear(now);
  const calendar = await fetchSeasonCalendar(seasonYear, fetchImpl);
  return resolveNFLWeekFromCalendar(calendar, now);
}
