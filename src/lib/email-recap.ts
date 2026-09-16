/**
 * Weekly recap data model. Everything here is derived deterministically from
 * stored games, picks, and leaderboard math — no invented commentary.
 */

import type { NormalizedGame } from "./espn-data";
import type { StoredGame } from "./email-reminder";
import {
  rankLeaderboard,
  type LeaderboardEntry,
  type RankedLeaderboardEntry,
} from "./leaderboard-ranking";

export interface RecapPickResult {
  eventId: string;
  matchup: string;
  pickedTeamName: string;
  result: "win" | "loss" | "pending";
  scoreText?: string;
}

export interface BestPick {
  matchup: string;
  pickedTeamName: string;
  pickersForTeam: number;
  totalPickers: number;
}

export interface RecapLeaderboardRow {
  rank: number;
  displayName: string;
  wins: number;
  losses: number;
  isUser: boolean;
}

export interface WeeklyRecapModel {
  displayName: string;
  year: number;
  week: number;
  weekLabel: string;
  headline: string;
  weeklyWins: number;
  weeklyLosses: number;
  weeklyPending: number;
  weeklyRank: number;
  seasonWins: number;
  seasonLosses: number;
  overallRank: number;
  totalPlayers: number;
  /** Positive = climbed. Null when there is no meaningful prior rank. */
  rankDelta: number | null;
  previousRank: number | null;
  topThree: RecapLeaderboardRow[];
  bestPick: BestPick | null;
  results: RecapPickResult[];
  appUrl: string;
}

export function weekLabel(week: number): string {
  switch (week) {
    case 19:
      return "Wild Card";
    case 20:
      return "Divisional Round";
    case 21:
      return "Conference Championships";
    case 22:
      return "Super Bowl";
    default:
      return `Week ${week}`;
  }
}

/**
 * A week is recap-ready when it has synced games and every one is final.
 */
export function isWeekComplete(games: StoredGame[]): boolean {
  return (
    games.length > 0 &&
    games.every((game) => game.status?.state === "post")
  );
}

/**
 * Deterministic, data-driven headline. Playful but never insulting.
 */
export function buildRecapHeadline(input: {
  wins: number;
  losses: number;
  pending: number;
  overallRank: number;
  rankDelta: number | null;
}): string {
  const { wins, losses, pending, overallRank, rankDelta } = input;
  const played = wins + losses;
  if (played === 0) return "The Tape Is In 📼";
  if (losses === 0 && pending === 0) return "Clean Sweep! 🧹";
  if (overallRank === 1) return "Top of the Leaderboard 👑";
  const pct = wins / played;
  if (pct >= 0.75) return "Dominant Week 💪";
  if (pct >= 0.5) return "Winning Week 📈";
  if (rankDelta !== null && rankDelta > 0) return "Climbing Anyway 🧗";
  return "Tough Week — Reset Button Hit 🔁";
}

export interface RecapUserPick {
  gameId: string;
  selectedTeam: string;
  result?: "win" | "loss" | "pending";
}

export interface BuildRecapInput {
  userId: string;
  displayName: string;
  year: number;
  week: number;
  appUrl: string;
  games: StoredGame[];
  picks: RecapUserPick[];
  /** All users' picks for the week: gameId -> teamId -> picker count. */
  pickCounts: Map<string, Map<string, number>>;
  /** Ranked season leaderboard including this week's results. */
  seasonLeaderboard: RankedLeaderboardEntry[];
  /** Ranked season leaderboard with this week's results removed. */
  previousSeasonLeaderboard: RankedLeaderboardEntry[];
  /** Ranked weekly leaderboard (by wins). */
  weeklyLeaderboard: RankedLeaderboardEntry[];
}

function teamName(game: StoredGame, teamId: string): string {
  if (game.away.id === teamId) return game.away.name;
  if (game.home.id === teamId) return game.home.name;
  return teamId;
}

function matchup(game: NormalizedGame): string {
  return `${game.away.name} at ${game.home.name}`;
}

function findRank(
  leaderboard: RankedLeaderboardEntry[],
  userId: string
): number | null {
  return leaderboard.find((entry) => entry.uid === userId)?.rank ?? null;
}

/**
 * The user's "boldest" correct pick: a win on the team that the smallest
 * share of pickers chose. Returns null when nothing qualifies.
 */
export function findBestPick(
  picks: RecapUserPick[],
  games: StoredGame[],
  pickCounts: Map<string, Map<string, number>>
): BestPick | null {
  let best: { pick: RecapUserPick; share: number; total: number; forTeam: number } | null =
    null;
  for (const pick of picks) {
    if (pick.result !== "win") continue;
    const counts = pickCounts.get(pick.gameId);
    if (!counts) continue;
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total < 2) continue;
    const forTeam = counts.get(pick.selectedTeam) ?? 0;
    if (forTeam === 0) continue;
    const share = forTeam / total;
    if (!best || share < best.share) {
      best = { pick, share, total, forTeam };
    }
  }
  if (!best) return null;
  const game = games.find((g) => g.eventId === best!.pick.gameId);
  if (!game) return null;
  return {
    matchup: matchup(game),
    pickedTeamName: teamName(game, best.pick.selectedTeam),
    pickersForTeam: best.forTeam,
    totalPickers: best.total,
  };
}

export function buildWeeklyRecapModel(input: BuildRecapInput): WeeklyRecapModel {
  const wins = input.picks.filter((p) => p.result === "win").length;
  const losses = input.picks.filter((p) => p.result === "loss").length;
  const pending = input.picks.filter(
    (p) => !p.result || p.result === "pending"
  ).length;

  const overallRank = findRank(input.seasonLeaderboard, input.userId) ?? 0;
  const previousRank = findRank(input.previousSeasonLeaderboard, input.userId);
  const weeklyRank = findRank(input.weeklyLeaderboard, input.userId) ?? 0;

  const userSeason = input.seasonLeaderboard.find(
    (entry) => entry.uid === input.userId
  );
  const userPrevious = input.previousSeasonLeaderboard.find(
    (entry) => entry.uid === input.userId
  );
  const hadPriorGames =
    (userPrevious?.wins ?? 0) + (userPrevious?.losses ?? 0) > 0;
  const rankDelta =
    previousRank !== null && hadPriorGames ? previousRank - overallRank : null;

  const headline = buildRecapHeadline({
    wins,
    losses,
    pending,
    overallRank,
    rankDelta,
  });

  const results: RecapPickResult[] = input.games
    .filter((game) => input.picks.some((p) => p.gameId === game.eventId))
    .map((game) => {
      const pick = input.picks.find((p) => p.gameId === game.eventId)!;
      const scoreText =
        game.status.state === "post" &&
        game.away.score !== undefined &&
        game.home.score !== undefined
          ? `${game.away.score}–${game.home.score}`
          : undefined;
      return {
        eventId: game.eventId,
        matchup: matchup(game),
        pickedTeamName: teamName(game, pick.selectedTeam),
        result: pick.result ?? "pending",
        scoreText,
      };
    });

  return {
    displayName: input.displayName,
    year: input.year,
    week: input.week,
    weekLabel: weekLabel(input.week),
    headline,
    weeklyWins: wins,
    weeklyLosses: losses,
    weeklyPending: pending,
    weeklyRank,
    seasonWins: userSeason?.wins ?? 0,
    seasonLosses: userSeason?.losses ?? 0,
    overallRank,
    totalPlayers: input.seasonLeaderboard.length,
    rankDelta,
    previousRank: hadPriorGames ? previousRank : null,
    topThree: input.seasonLeaderboard.slice(0, 3).map((entry) => ({
      rank: entry.rank,
      displayName: entry.displayName,
      wins: entry.wins,
      losses: entry.losses,
      isUser: entry.uid === input.userId,
    })),
    bestPick: findBestPick(input.picks, input.games, input.pickCounts),
    results,
    appUrl: input.appUrl,
  };
}

/**
 * Build the leaderboard inputs shared by every recipient's recap so the
 * expensive work happens once per batch.
 */
export function buildLeaderboardContext(
  users: Array<{
    uid: string;
    displayName: string;
    seasonWins: number;
    seasonLosses: number;
    weekWins: number;
    weekLosses: number;
  }>
): {
  season: RankedLeaderboardEntry[];
  previous: RankedLeaderboardEntry[];
  weekly: RankedLeaderboardEntry[];
} {
  const toEntry = (
    u: (typeof users)[number],
    wins: number,
    losses: number
  ): LeaderboardEntry => ({
    uid: u.uid,
    displayName: u.displayName,
    wins,
    losses,
    winPercentage: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
  });

  return {
    // Matches the leaderboard card's default sort (win percentage).
    season: rankLeaderboard(
      users.map((u) => toEntry(u, u.seasonWins, u.seasonLosses)),
      "percentage"
    ),
    previous: rankLeaderboard(
      users.map((u) =>
        toEntry(u, u.seasonWins - u.weekWins, u.seasonLosses - u.weekLosses)
      ),
      "percentage"
    ),
    weekly: rankLeaderboard(
      users.map((u) => toEntry(u, u.weekWins, u.weekLosses)),
      "wins"
    ),
  };
}
