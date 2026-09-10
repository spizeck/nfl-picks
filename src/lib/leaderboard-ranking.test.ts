import assert from "node:assert/strict";
import test from "node:test";
import {
  getDisplayedLeaderboard,
  hasExpandableLeaderboard,
  rankLeaderboard,
  type LeaderboardEntry,
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
