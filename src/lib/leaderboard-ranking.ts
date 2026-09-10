export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  wins: number;
  losses: number;
  winPercentage: number;
}

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  rank: number;
  separated: boolean;
}

export type LeaderboardSort = "wins" | "percentage";

export function rankLeaderboard(
  leaderboard: LeaderboardEntry[],
  sortBy: LeaderboardSort
): RankedLeaderboardEntry[] {
  return [...leaderboard]
    .sort((a, b) =>
      sortBy === "wins"
        ? b.wins - a.wins
        : b.winPercentage - a.winPercentage
    )
    .map((entry, index) => ({ ...entry, rank: index + 1, separated: false }));
}

export function getDisplayedLeaderboard(
  leaderboard: RankedLeaderboardEntry[],
  currentUserId: string,
  showAll: boolean
): RankedLeaderboardEntry[] {
  if (showAll || leaderboard.length <= 3) return leaderboard;

  const topThree = leaderboard.slice(0, 3);
  const currentUser = leaderboard.find((entry) => entry.uid === currentUserId);
  if (!currentUser || currentUser.rank <= 3) return topThree;

  return [...topThree, { ...currentUser, separated: true }];
}
