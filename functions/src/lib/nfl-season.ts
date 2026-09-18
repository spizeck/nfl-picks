import {Firestore, Timestamp} from "firebase-admin/firestore";

const ESPN_API_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export interface ScheduleSelection {
  year: number;
  week: number;
  seasonType: 2 | 3;
  espnWeek: number;
}

/**
 * Map an app week number to ESPN scoreboard request parameters.
 * @param {number} year Season year.
 * @param {number} week App week (19-22 are postseason weeks).
 * @return {ScheduleSelection} Parameters for the ESPN scoreboard API.
 */
export function getScheduleRequest(
  year: number,
  week: number
): ScheduleSelection {
  if (week >= 19 && week <= 22) {
    return {
      year,
      week,
      seasonType: 3,
      espnWeek: week === 22 ? 5 : week - 18,
    };
  }
  if (week < 1 || week > 18) throw new Error(`Invalid NFL week: ${week}`);
  return {year, week, seasonType: 2, espnWeek: week};
}

/**
 * Build the ESPN scoreboard URL for a schedule selection.
 * @param {ScheduleSelection} selection Season/week selection.
 * @return {string} Fully qualified scoreboard URL.
 */
export function buildScoreboardUrl(selection: ScheduleSelection): string {
  // ESPN treats `dates` as the NFL season identifier here, including
  // postseason games played in the following calendar year. Omitting it
  // reintroduces rollover ambiguity.
  const params = new URLSearchParams({
    dates: selection.year.toString(),
    seasontype: selection.seasonType.toString(),
    week: selection.espnWeek.toString(),
    limit: "100",
  });
  return `${ESPN_API_URL}?${params}`;
}

interface ScoreboardIdentity {
  season?: {year?: number; type?: number};
  week?: {number?: number};
  events?: Array<{
    season?: {year?: number; type?: number};
    week?: {number?: number};
  }>;
}

/**
 * Resolve the current NFL week from an ESPN scoreboard response.
 * @param {object} data Scoreboard payload containing the season calendar.
 * @param {Date} now Reference time, defaults to the current time.
 * @return {ScheduleSelection} The current season/week selection.
 */
export function resolveCurrentWeek(data: {
  leagues?: Array<{
    season?: {year?: number};
    calendar?: Array<{
      value?: string;
      entries?: Array<{value?: string; startDate?: string; endDate?: string}>;
    }>;
  }>;
}, now = new Date()): ScheduleSelection {
  const league = data.leagues?.[0];
  const year = league?.season?.year;
  if (!year) throw new Error("ESPN response is missing its season calendar");
  for (const season of league.calendar || []) {
    const seasonType = Number(season.value);
    if (seasonType !== 2 && seasonType !== 3) continue;
    for (const entry of season.entries || []) {
      if (!entry.startDate || !entry.endDate || !entry.value) continue;
      const start = new Date(entry.startDate);
      const end = new Date(entry.endDate);
      if (now < start || now > end) continue;
      const espnWeek = Number(entry.value);
      if (seasonType === 2) return {year, week: espnWeek, seasonType, espnWeek};
      if (espnWeek === 4) return {year, week: 22, seasonType: 3, espnWeek: 5};
      const week = espnWeek === 5 ? 22 : espnWeek + 18;
      return {year, week, seasonType: 3, espnWeek};
    }
  }
  return {year, week: 1, seasonType: 2, espnWeek: 1};
}

/**
 * Record which events a schedule sync wrote, for change detection.
 * @param {Firestore} db Firestore instance.
 * @param {ScheduleSelection} selection Season/week selection.
 * @param {string[]} eventIds Event IDs written for the week.
 */
export async function setScheduleSync(
  db: Firestore,
  selection: ScheduleSelection,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;
  const now = Timestamp.now();
  await db.collection("cache").doc(
    `schedule-sync-${selection.year}-${selection.week}`
  ).set({
    timestamp: now,
    expiresAt: Timestamp.fromMillis(
      now.toMillis() + 7 * 24 * 60 * 60 * 1000
    ),
    eventIds: [...eventIds].sort(),
    seasonType: selection.seasonType,
    espnWeek: selection.espnWeek,
    week: selection.week,
    year: selection.year,
  });
}

/**
 * Verify an ESPN response actually describes the requested schedule.
 * @param {ScoreboardIdentity} data Scoreboard payload.
 * @param {ScheduleSelection} selection Expected season/week selection.
 */
export function assertMatchingSchedule(
  data: ScoreboardIdentity,
  selection: ScheduleSelection
): void {
  const events = data.events || [];
  const metadataMatches =
    data.season?.year === selection.year &&
    data.season?.type === selection.seasonType &&
    data.week?.number === selection.espnWeek;
  if (!metadataMatches) {
    throw new Error("ESPN returned the wrong season or week");
  }
  if (events.length === 0) {
    throw new Error("ESPN schedule is not available yet");
  }
  if (
    !events.every(
      (event) =>
        event.season?.year === selection.year &&
        event.season?.type === selection.seasonType &&
        event.week?.number === selection.espnWeek
    )
  ) {
    throw new Error("ESPN returned the wrong season or week");
  }
}
