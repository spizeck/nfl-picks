import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSeasonStats,
  deriveStats,
  isExpectedSeattleWin,
} from "./2026-week-1-missed-picks";

const completedGame = {
  year: 2026,
  week: 1,
  date: "2026-09-10T00:20Z",
  away: { id: "17", name: "New England Patriots", score: "10" },
  home: { id: "26", name: "Seattle Seahawks", score: "13" },
  status: { state: "post" },
};

test("equivalent kickoff ISO timestamps are accepted", () => {
  assert.equal(
    isExpectedSeattleWin({ ...completedGame, date: "2026-09-10T00:20:00Z" }),
    true
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      date: "2026-09-09T20:20:00-04:00",
    }),
    true
  );
});

test("missing and non-numeric final scores are rejected", () => {
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      home: { id: "26", name: "Seattle Seahawks" },
    }),
    false
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      away: { id: "17", name: "New England Patriots" },
    }),
    false
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      home: { id: "26", name: "Seattle Seahawks", score: "final" },
    }),
    false
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      away: { id: "17", name: "New England Patriots", score: "unknown" },
    }),
    false
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      away: { id: "17", name: "New England Patriots", score: null },
    }),
    false
  );
  assert.equal(
    isExpectedSeattleWin({
      ...completedGame,
      away: { id: "17", name: "New England Patriots", score: "" },
    }),
    false
  );
});

test("corrected win is included in weekly derived stats", () => {
  const stats = deriveStats([
    { result: "win" },
    { result: "loss" },
    { result: "pending" },
    { selectedTeam: "26", result: "win" },
  ]);

  assert.deepEqual(stats, { wins: 2, losses: 1, pending: 1, total: 4 });
});

test("corrected week flows into season and all-time source stats", () => {
  const season = deriveSeasonStats(
    [
      { id: "1", wins: 0, losses: 0 },
      { id: "2", wins: 3, losses: 2 },
    ],
    { wins: 1, losses: 0, pending: 15, total: 16 }
  );

  assert.deepEqual(season, {
    totalWins: 4,
    totalLosses: 2,
    totalGames: 6,
    weeklyRecords: { 1: "1-0", 2: "3-2" },
  });
});
