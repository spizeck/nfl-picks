import assert from "node:assert/strict";
import test from "node:test";
import {
  getDisplayedLeaderboard,
  hasExpandableLeaderboard,
  rankLeaderboard,
  type LeaderboardEntry,
  type RankedLeaderboardEntry,
} from "./leaderboard-ranking";

function entries(percentages: number[]): LeaderboardEntry[] {
  return percentages.map((winPercentage, index) => ({
    uid: `user-${index + 1}`,
    displayName: `User ${index + 1}`,
    wins: percentages.length - index,
    losses: index,
    winPercentage,
  }));
}

const ranked = rankLeaderboard(entries([90, 80, 70, 60, 50, 40, 30]), "percentage");

test("current user ranked first appears once in the top three", () => {
  const displayed = getDisplayedLeaderboard(ranked, "user-1", false);
  assert.deepEqual(displayed.map((entry) => entry.rank), [1, 2, 3]);
  assert.equal(displayed.filter((entry) => entry.uid === "user-1").length, 1);
});

test("current user ranked third appears once in the top three", () => {
  const displayed = getDisplayedLeaderboard(ranked, "user-3", false);
  assert.deepEqual(displayed.map((entry) => entry.rank), [1, 2, 3]);
  assert.equal(displayed.filter((entry) => entry.uid === "user-3").length, 1);
});

test("current user ranked fourth keeps actual rank and is separated", () => {
  const displayed = getDisplayedLeaderboard(ranked, "user-4", false);
  assert.deepEqual(displayed.map((entry) => entry.rank), [1, 2, 3, 4]);
  assert.equal(displayed[3].separated, true);
});

test("current user far down keeps actual rank after omitted entries", () => {
  const displayed = getDisplayedLeaderboard(ranked, "user-7", false);
  assert.deepEqual(displayed.map((entry) => entry.rank), [1, 2, 3, 7]);
  assert.equal(displayed[3].separated, true);
});

test("fewer than three users displays everyone without separation", () => {
  const short = rankLeaderboard(entries([90, 80]), "percentage");
  assert.deepEqual(getDisplayedLeaderboard(short, "user-2", false), short);
});

test("show all and show less toggle between full and compact rows", () => {
  assert.equal(hasExpandableLeaderboard(ranked.length), true);
  assert.equal(getDisplayedLeaderboard(ranked, "user-7", true).length, 7);
  assert.deepEqual(
    getDisplayedLeaderboard(ranked, "user-7", false).map((entry) => entry.rank),
    [1, 2, 3, 7]
  );
});

test("expanded state does not show a redundant toggle for three or fewer users", () => {
  assert.equal(hasExpandableLeaderboard(3), false);
  assert.equal(hasExpandableLeaderboard(2), false);
});

test("week, season, and all-time datasets each recalculate compact ranking", () => {
  const periods = [
    entries([90, 80, 70, 60]),
    entries([60, 90, 80, 70]),
    entries([70, 60, 90, 80]),
  ];
  const currentRanks = periods.map((period) =>
    getDisplayedLeaderboard(rankLeaderboard(period, "percentage"), "user-4", false)
      .find((entry) => entry.uid === "user-4")?.rank
  );
  assert.deepEqual(currentRanks, [4, 3, 2]);
});

function tiedEntries(wins: number[]): LeaderboardEntry[] {
  return wins.map((w, index) => ({
    uid: `user-${index + 1}`,
    displayName: `User ${index + 1}`,
    wins: w,
    losses: 20 - w,
    winPercentage: (w / 20) * 100,
  }));
}

const ranks = (list: RankedLeaderboardEntry[]) => list.map((e) => e.rank);

test("competition ranking with no ties is 1, 2, 3, 4", () => {
  assert.deepEqual(ranks(rankLeaderboard(tiedEntries([10, 9, 8, 7]), "wins")), [1, 2, 3, 4]);
});

test("two-way tie shares a rank and skips the next one", () => {
  assert.deepEqual(ranks(rankLeaderboard(tiedEntries([10, 9, 9, 7]), "wins")), [1, 2, 2, 4]);
});

test("tie for first shares rank 1 and resumes at 3", () => {
  assert.deepEqual(ranks(rankLeaderboard(tiedEntries([10, 10, 8, 7]), "wins")), [1, 1, 3, 4]);
});

test("three-way tie shares a rank and skips the next two", () => {
  assert.deepEqual(ranks(rankLeaderboard(tiedEntries([10, 9, 9, 9, 7]), "wins")), [1, 2, 2, 2, 5]);
});

test("percentage mode ties on equal win percentage regardless of wins", () => {
  const board: LeaderboardEntry[] = [
    { uid: "a", displayName: "A", wins: 8, losses: 2, winPercentage: 80 },
    { uid: "b", displayName: "B", wins: 4, losses: 1, winPercentage: 80 },
    { uid: "c", displayName: "C", wins: 7, losses: 3, winPercentage: 70 },
    { uid: "d", displayName: "D", wins: 6, losses: 4, winPercentage: 60 },
  ];
  const rankedPct = rankLeaderboard(board, "percentage");
  assert.deepEqual(ranks(rankedPct), [1, 1, 3, 4]);
  // Equal percentages order by wins for display but share the rank.
  assert.deepEqual(rankedPct.map((e) => e.uid), ["a", "b", "c", "d"]);
});

test("tied players get a deterministic display order independent of input order", () => {
  const forward = tiedEntries([10, 9, 9, 9, 7]);
  const reversed = [...forward].reverse();
  const orderA = rankLeaderboard(forward, "wins").map((e) => e.uid);
  const orderB = rankLeaderboard(reversed, "wins").map((e) => e.uid);
  assert.deepEqual(orderA, orderB);
  assert.deepEqual(ranks(rankLeaderboard(reversed, "wins")), [1, 2, 2, 2, 5]);
});

test("compact leaderboard includes everyone tied at rank 3", () => {
  const board = rankLeaderboard(tiedEntries([10, 9, 8, 8, 7]), "wins");
  assert.deepEqual(ranks(board), [1, 2, 3, 3, 5]);
  // Current user is the second player tied at #3: still fully in view.
  const displayed = getDisplayedLeaderboard(board, "user-4", false);
  assert.deepEqual(ranks(displayed), [1, 2, 3, 3]);
  assert.equal(displayed.some((e) => e.separated), false);
});

test("compact leaderboard appends current user below a tied podium", () => {
  const board = rankLeaderboard(tiedEntries([10, 9, 8, 8, 7]), "wins");
  const displayed = getDisplayedLeaderboard(board, "user-5", false);
  assert.deepEqual(ranks(displayed), [1, 2, 3, 3, 5]);
  assert.equal(displayed[4].separated, true);
  assert.equal(displayed[4].uid, "user-5");
});

test("Win percentage and Total Wins preserve their existing sort behavior", () => {
  const leaderboard = [
    { uid: "a", displayName: "A", wins: 5, losses: 0, winPercentage: 100 },
    { uid: "b", displayName: "B", wins: 8, losses: 4, winPercentage: 66.7 },
    { uid: "c", displayName: "C", wins: 6, losses: 2, winPercentage: 75 },
    { uid: "d", displayName: "D", wins: 4, losses: 1, winPercentage: 80 },
  ];
  assert.deepEqual(rankLeaderboard(leaderboard, "percentage").map((entry) => entry.uid), ["a", "d", "c", "b"]);
  assert.deepEqual(rankLeaderboard(leaderboard, "wins").map((entry) => entry.uid), ["b", "c", "a", "d"]);
});
