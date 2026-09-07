import * as admin from "firebase-admin";

const ESPN_API_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export interface ScheduleSelection {
  year: number;
  week: number;
  seasonType: 2 | 3;
  espnWeek: number;
}

export function getScheduleRequest(year: number, week: number): ScheduleSelection {
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

export function buildScoreboardUrl(selection: ScheduleSelection): string {
  // ESPN treats `dates` as the NFL season identifier here, including postseason
  // games played in the following calendar year. Omitting it reintroduces rollover ambiguity.
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
      if (now < new Date(entry.startDate) || now > new Date(entry.endDate)) continue;
      const espnWeek = Number(entry.value);
      if (seasonType === 2) return {year, week: espnWeek, seasonType, espnWeek};
      if (espnWeek === 4) return {year, week: 22, seasonType: 3, espnWeek: 5};
      const week = espnWeek === 5 ? 22 : espnWeek + 18;
      return {year, week, seasonType: 3, espnWeek};
    }
  }
  return {year, week: 1, seasonType: 2, espnWeek: 1};
}

export async function setScheduleSync(
  db: admin.firestore.Firestore,
  selection: ScheduleSelection,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;
  const now = admin.firestore.Timestamp.now();
  await db.collection("cache").doc(
    `schedule-sync-${selection.year}-${selection.week}`
  ).set({
    timestamp: now,
    expiresAt: admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 7 * 24 * 60 * 60 * 1000
    ),
    eventIds: [...eventIds].sort(),
    seasonType: selection.seasonType,
    espnWeek: selection.espnWeek,
    week: selection.week,
    year: selection.year,
  });
}

export function assertMatchingSchedule(
  data: ScoreboardIdentity,
  selection: ScheduleSelection
): void {
  const events = data.events || [];
  const metadataMatches =
    data.season?.year === selection.year &&
    data.season?.type === selection.seasonType &&
    data.week?.number === selection.espnWeek;
  if (!metadataMatches) throw new Error("ESPN returned the wrong season or week");
  if (events.length === 0) throw new Error("ESPN schedule is not available yet");
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
