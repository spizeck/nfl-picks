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
  const rankValue = (entry: LeaderboardEntry) =>
    sortBy === "wins" ? entry.wins : entry.winPercentage;

  // Display order for tied entries: more wins, then name, then uid. This
  // orders rows deterministically but never separates tied ranks.
  const sorted = [...leaderboard].sort(
    (a, b) =>
      rankValue(b) - rankValue(a) ||
      b.wins - a.wins ||
      a.displayName.localeCompare(b.displayName) ||
      a.uid.localeCompare(b.uid)
  );

  // Standard competition ranking: equal values share a rank and the next
  // distinct value takes the rank of its position (1, 2, 2, 4).
  let rank = 0;
  return sorted.map((entry, index) => {
    if (index === 0 || rankValue(entry) !== rankValue(sorted[index - 1])) {
      rank = index + 1;
    }
    return { ...entry, rank, separated: false };
  });
}

export function hasExpandableLeaderboard(totalEntries: number): boolean {
  return totalEntries > 3;
}

export function getDisplayedLeaderboard(
  leaderboard: RankedLeaderboardEntry[],
  currentUserId: string,
  showAll: boolean
): RankedLeaderboardEntry[] {
  if (showAll || leaderboard.length <= 3) return leaderboard;

  // "Top three" means every entry holding a podium rank (1-3), so a tie
  // that crosses the boundary shows everyone who genuinely placed there.
  const topThree = leaderboard.filter((entry) => entry.rank <= 3);
  const currentUser = leaderboard.find((entry) => entry.uid === currentUserId);
  if (!currentUser || currentUser.rank <= 3) return topThree;

  return [...topThree, { ...currentUser, separated: true }];
}
