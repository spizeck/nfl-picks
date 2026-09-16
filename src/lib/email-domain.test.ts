import assert from "node:assert/strict";
import test from "node:test";
import {
  getMissingPickGames,
  getPickableGames,
  type StoredGame,
} from "./email-reminder";
import {
  isUsableEmail,
  resolveEmailPreferences,
} from "./email-preferences";
import {
  buildLeaderboardContext,
  buildRecapHeadline,
  buildWeeklyRecapModel,
  findBestPick,
  isWeekComplete,
  weekLabel,
} from "./email-recap";

function game(
  eventId: string,
  date: string,
  state: "pre" | "in" | "post" = "pre",
  scores?: { away: number; home: number }
): StoredGame {
  return {
    eventId,
    date,
    week: 3,
    year: 2026,
    away: {
      id: `away-${eventId}`,
      name: `Away ${eventId}`,
      logo: "",
      ...(scores ? { score: scores.away } : {}),
    },
    home: {
      id: `home-${eventId}`,
      name: `Home ${eventId}`,
      logo: "",
      ...(scores ? { score: scores.home } : {}),
    },
    status: { state, displayText: state },
  };
}

const NOW = new Date("2026-09-16T20:00:00Z");

test("pickable games exclude games that already kicked off", () => {
  const games = [
    game("g-past", "2026-09-16T18:00:00Z", "in"),
    game("g-now", "2026-09-16T20:00:00Z", "in"),
    game("g-future", "2026-09-18T00:20:00Z"),
  ];
  const pickable = getPickableGames(games, NOW);
  assert.deepEqual(
    pickable.map((g) => g.eventId),
    ["g-future"]
  );
});

test("missing picks only count unpicked games that are still eligible", () => {
  const games = [
    game("g1", "2026-09-16T18:00:00Z", "post"),
    game("g2", "2026-09-18T00:20:00Z"),
    game("g3", "2026-09-19T17:00:00Z"),
  ];
  const missing = getMissingPickGames(games, new Set(["g2"]), NOW);
  assert.deepEqual(
    missing.map((g) => g.eventId),
    ["g3"]
  );
  // Fully picked eligible schedule -> nothing missing.
  assert.equal(
    getMissingPickGames(games, new Set(["g2", "g3"]), NOW).length,
    0
  );
});

test("email preferences default to enabled and honor explicit opt-outs", () => {
  assert.deepEqual(resolveEmailPreferences(undefined), {
    weeklyRecap: true,
    pickReminders: true,
  });
  assert.deepEqual(resolveEmailPreferences({ emailPreferences: {} }), {
    weeklyRecap: true,
    pickReminders: true,
  });
  assert.equal(
    resolveEmailPreferences({
      emailPreferences: { pickReminders: false },
    }).pickReminders,
    false
  );
  assert.equal(
    resolveEmailPreferences({
      emailPreferences: { pickReminders: false },
    }).weeklyRecap,
    true
  );
  assert.equal(
    resolveEmailPreferences({
      emailPreferences: { weeklyRecap: false },
    }).weeklyRecap,
    false
  );
});

test("usable email check rejects missing and malformed addresses", () => {
  assert.equal(isUsableEmail("player@example.com"), true);
  assert.equal(isUsableEmail(""), false);
  assert.equal(isUsableEmail(null), false);
  assert.equal(isUsableEmail(undefined), false);
  assert.equal(isUsableEmail("not-an-email"), false);
  assert.equal(isUsableEmail("missing@domain"), false);
});

test("week completion requires at least one game and all games final", () => {
  assert.equal(isWeekComplete([]), false);
  assert.equal(
    isWeekComplete([
      game("g1", "2026-09-10T00:20:00Z", "post"),
      game("g2", "2026-09-14T00:15:00Z", "in"),
    ]),
    false
  );
  assert.equal(
    isWeekComplete([
      game("g1", "2026-09-10T00:20:00Z", "post"),
      game("g2", "2026-09-14T00:15:00Z", "post"),
    ]),
    true
  );
});

test("week labels match the app's week selector naming", () => {
  assert.equal(weekLabel(7), "Week 7");
  assert.equal(weekLabel(19), "Wild Card");
  assert.equal(weekLabel(22), "Super Bowl");
});

test("recap headlines are deterministic and performance-based", () => {
  const base = { pending: 0, overallRank: 2, rankDelta: null };
  assert.equal(
    buildRecapHeadline({ ...base, wins: 2, losses: 0 }),
    "Clean Sweep! 🧹"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 1, losses: 1, overallRank: 1 }),
    "Top of the Leaderboard 👑"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 3, losses: 1 }),
    "Dominant Week 💪"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 2, losses: 2 }),
    "Winning Week 📈"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 1, losses: 3, rankDelta: 1 }),
    "Climbing Anyway 🧗"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 0, losses: 4, rankDelta: -2 }),
    "Tough Week — Reset Button Hit 🔁"
  );
  assert.equal(
    buildRecapHeadline({ ...base, wins: 0, losses: 0 }),
    "The Tape Is In 📼"
  );
});

test("best pick is the winning pick with the lowest pick share", () => {
  const games = [game("g1", "2026-09-10T00:20:00Z", "post")];
  const picks = [
    { gameId: "g1", selectedTeam: "home-g1", result: "win" as const },
  ];
  const pickCounts = new Map([
    ["g1", new Map([["home-g1", 1], ["away-g1", 4]])],
  ]);
  const best = findBestPick(picks, games, pickCounts);
  assert.equal(best?.pickedTeamName, "Home g1");
  assert.equal(best?.pickersForTeam, 1);
  assert.equal(best?.totalPickers, 5);
});

test("best pick ignores losses and single-picker games", () => {
  const games = [game("g1", "2026-09-10T00:20:00Z", "post")];
  assert.equal(
    findBestPick(
      [{ gameId: "g1", selectedTeam: "home-g1", result: "loss" }],
      games,
      new Map([["g1", new Map([["home-g1", 1], ["away-g1", 4]])]])
    ),
    null
  );
  assert.equal(
    findBestPick(
      [{ gameId: "g1", selectedTeam: "home-g1", result: "win" }],
      games,
      new Map([["g1", new Map([["home-g1", 1]])]])
    ),
    null
  );
});

test("weekly recap model derives records, ranks, and movement", () => {
  const users = [
    { uid: "alice", displayName: "Alice", seasonWins: 9, seasonLosses: 4, weekWins: 2, weekLosses: 0 },
    { uid: "bob", displayName: "Bob", seasonWins: 11, seasonLosses: 3, weekWins: 1, weekLosses: 1 },
    { uid: "carol", displayName: "Carol", seasonWins: 8, seasonLosses: 6, weekWins: 0, weekLosses: 2 },
    { uid: "dave", displayName: "Dave", seasonWins: 6, seasonLosses: 8, weekWins: 0, weekLosses: 2 },
  ];
  const leaderboard = buildLeaderboardContext(users);

  const games = [
    game("g1", "2026-09-10T00:20:00Z", "post", { away: 10, home: 24 }),
    game("g2", "2026-09-14T00:15:00Z", "post", { away: 20, home: 17 }),
  ];
  const picks = [
    { gameId: "g1", selectedTeam: "home-g1", result: "win" as const },
    { gameId: "g2", selectedTeam: "away-g2", result: "win" as const },
  ];
  const pickCounts = new Map([
    ["g1", new Map([["home-g1", 1], ["away-g1", 3]])],
    ["g2", new Map([["away-g2", 3], ["home-g2", 1]])],
  ]);

  const model = buildWeeklyRecapModel({
    userId: "alice",
    displayName: "Alice",
    year: 2026,
    week: 3,
    appUrl: "https://picks.example.com",
    games,
    picks,
    pickCounts,
    seasonLeaderboard: leaderboard.season,
    previousSeasonLeaderboard: leaderboard.previous,
    weeklyLeaderboard: leaderboard.weekly,
  });

  assert.equal(model.weeklyWins, 2);
  assert.equal(model.weeklyLosses, 0);
  assert.equal(model.weeklyRank, 1);
  // Season: bob 11-3 (.786) #1, alice 9-4 (.692) #2.
  assert.equal(model.overallRank, 2);
  assert.equal(model.seasonWins, 9);
  assert.equal(model.totalPlayers, 4);
  // Previous: bob 10-2 (.833) #1, carol 8-4 (.667) #2, alice 7-4 (.636) #3.
  assert.equal(model.previousRank, 3);
  assert.equal(model.rankDelta, 1);
  assert.equal(model.headline, "Clean Sweep! 🧹");
  assert.deepEqual(
    model.topThree.map((r) => r.displayName),
    ["Bob", "Alice", "Carol"]
  );
  assert.equal(model.topThree[1].isUser, true);
  // Boldest call: g1 where only 1 of 4 pickers chose the home team.
  assert.equal(model.bestPick?.pickedTeamName, "Home g1");
  assert.equal(model.bestPick?.totalPickers, 4);
  assert.equal(model.results.length, 2);
  assert.equal(model.results[0].result, "win");
  assert.equal(model.results[0].scoreText, "10–24");
});
