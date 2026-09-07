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

export function assertMatchingSchedule(
  data: ScoreboardIdentity,
  selection: ScheduleSelection
): void {
  const matches =
    data.season?.year === selection.year &&
    data.season?.type === selection.seasonType &&
    data.week?.number === selection.espnWeek &&
    (data.events || []).every(
      (event) =>
        event.season?.year === selection.year &&
        event.season?.type === selection.seasonType &&
        event.week?.number === selection.espnWeek
    );
  if (!matches) throw new Error("ESPN returned the wrong season or week");
}
