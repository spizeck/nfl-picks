import assert from "node:assert/strict";
import test from "node:test";
import { deriveSeasonStats, deriveStats } from "./2026-week-1-missed-picks";

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
