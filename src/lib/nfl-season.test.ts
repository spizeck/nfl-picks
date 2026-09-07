import assert from "node:assert/strict";
import test from "node:test";
import {
  buildESPNScoreboardUrl,
  getNFLSeasonYear,
  getScheduleRequest,
  getScheduleResponseStatus,
  hasCompleteStoredSchedule,
  isGameDateInSeason,
  isMatchingSchedule,
  isValidScheduleSync,
  resolveCurrentNFLWeek,
  resolveNFLWeekFromCalendar,
  toInternalWeek,
  type ESPNScoreboard,
} from "./nfl-season";

function scoreboard(year: number, type: number, week: number, date: string): ESPNScoreboard {
  return {
    season: { year, type },
    week: { number: week },
    events: [{ season: { year, type }, week: { number: week }, date } as never],
  };
}

test("January and February belong to the previous NFL season", () => {
  assert.equal(getNFLSeasonYear(new Date("2027-01-15T12:00:00Z")), 2026);
  assert.equal(getNFLSeasonYear(new Date("2027-02-15T12:00:00Z")), 2026);
  assert.equal(getNFLSeasonYear(new Date("2027-03-01T00:00:00Z")), 2027);
});

test("offseason and preseason select the upcoming regular-season week", () => {
  const regular = scoreboard(2026, 2, 1, "2026-09-10T00:20:00Z");
  const postseason = scoreboard(2026, 3, 1, "2027-01-16T05:00:00Z");
  assert.deepEqual(resolveCurrentNFLWeek(regular, postseason, new Date("2026-06-01T00:00:00Z")), {
    year: 2026,
    week: 1,
    seasonType: 2,
    espnWeek: 1,
  });
  assert.equal(resolveCurrentNFLWeek(regular, postseason, new Date("2026-09-07T00:00:00Z")).week, 1);
});

test("calendar resolves regular season, postseason, and Pro Bowl rollover", () => {
  const calendar: ESPNScoreboard = {
    leagues: [{
      season: { year: 2026 },
      calendar: [
        { value: "2", entries: [{ value: "1", startDate: "2026-09-06T07:00Z", endDate: "2026-09-16T06:59Z" }] },
        { value: "3", entries: [
          { value: "1", startDate: "2027-01-13T08:00Z", endDate: "2027-01-20T07:59Z" },
          { value: "4", startDate: "2027-02-03T08:00Z", endDate: "2027-02-10T07:59Z" },
        ] },
      ],
    }],
  };
  assert.equal(resolveNFLWeekFromCalendar(calendar, new Date("2026-09-07T00:00Z")).week, 1);
  assert.equal(resolveNFLWeekFromCalendar(calendar, new Date("2027-01-15T00:00Z")).week, 19);
  assert.equal(resolveNFLWeekFromCalendar(calendar, new Date("2027-02-05T00:00Z")).week, 22);
});

test("postseason maps to internal weeks and skips the Pro Bowl", () => {
  assert.equal(toInternalWeek(3, 1), 19);
  assert.equal(toInternalWeek(3, 3), 21);
  assert.equal(toInternalWeek(3, 4), null);
  assert.equal(toInternalWeek(3, 5), 22);
  assert.deepEqual(getScheduleRequest(2026, 22), {
    year: 2026,
    week: 22,
    seasonType: 3,
    espnWeek: 5,
  });
});

test("schedule URLs explicitly identify the NFL season and type", () => {
  const regularUrl = new URL(buildESPNScoreboardUrl(getScheduleRequest(2026, 1)));
  assert.equal(regularUrl.searchParams.get("dates"), "2026");
  assert.equal(regularUrl.searchParams.get("seasontype"), "2");
  assert.equal(regularUrl.searchParams.get("week"), "1");

  const postseasonUrl = new URL(buildESPNScoreboardUrl(getScheduleRequest(2026, 19)));
  assert.equal(postseasonUrl.searchParams.get("dates"), "2026");
  assert.equal(postseasonUrl.searchParams.get("seasontype"), "3");
  assert.equal(postseasonUrl.searchParams.get("week"), "1");
  assert.equal(isGameDateInSeason("2027-01-16T05:00:00Z", 2026, 19), true);
});

test("empty, contaminated, and valid-but-partial stored schedules require a refresh", () => {
  const completeIds = ["game-1", "game-2", "game-3"];
  assert.equal(hasCompleteStoredSchedule(0, [], null), false);
  assert.equal(hasCompleteStoredSchedule(3, [], completeIds), false);
  assert.equal(hasCompleteStoredSchedule(4, completeIds, completeIds), false);
  assert.equal(hasCompleteStoredSchedule(2, ["game-1", "game-2"], completeIds), false);
  assert.equal(hasCompleteStoredSchedule(3, completeIds, completeIds), true);

  const selection = getScheduleRequest(2026, 1);
  const marker = {
    year: 2026,
    week: 1,
    seasonType: 2,
    espnWeek: 1,
    eventIds: completeIds,
    expiresAtMillis: 2_000,
  };
  assert.equal(isValidScheduleSync(marker, selection, 1_000), true);
  assert.equal(isValidScheduleSync(marker, selection, 2_000), false);
  assert.equal(isValidScheduleSync({ ...marker, espnWeek: 2 }, selection, 1_000), false);

  const empty = scoreboard(2026, 2, 1, "2026-09-10T00:20:00Z");
  empty.events = [];
  assert.equal(getScheduleResponseStatus(empty, selection), "unavailable");
  assert.equal(isMatchingSchedule(empty, selection), false);
  assert.equal(
    getScheduleResponseStatus(scoreboard(2025, 2, 1, "2025-09-05T00:20:00Z"), selection),
    "invalid"
  );
});

test("mismatched top-level and event metadata are rejected", () => {
  const selection = getScheduleRequest(2026, 19);
  assert.equal(isMatchingSchedule(scoreboard(2025, 3, 1, "2026-01-16T05:00:00Z"), selection), false);
  assert.equal(isMatchingSchedule(scoreboard(2026, 2, 1, "2026-09-10T00:20:00Z"), selection), false);
  assert.equal(isMatchingSchedule(scoreboard(2026, 3, 2, "2027-01-23T05:00:00Z"), selection), false);

  const mixed = scoreboard(2026, 3, 1, "2027-01-16T05:00:00Z");
  mixed.events!.push({ season: { year: 2025, type: 3 }, week: { number: 1 } } as never);
  assert.equal(isMatchingSchedule(mixed, selection), false);
});

test("January and February games are accepted only for the preceding NFL season", () => {
  const wildCard = scoreboard(2026, 3, 1, "2027-01-16T05:00:00Z");
  assert.equal(isMatchingSchedule(wildCard, getScheduleRequest(2026, 19)), true);
  assert.equal(isGameDateInSeason("2027-01-16T05:00:00Z", 2026, 19), true);
  assert.equal(isGameDateInSeason("2027-02-14T23:30:00Z", 2026, 22), true);
  assert.equal(isGameDateInSeason("2027-01-16T05:00:00Z", 2027, 19), false);
  assert.equal(isGameDateInSeason("2025-09-05T00:20:00Z", 2026, 1), false);
});
