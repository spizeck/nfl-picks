export interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp: FirebaseFirestore.Timestamp;
  result?: "win" | "loss" | "pending";
  locked: boolean;
  gameStartTime: FirebaseFirestore.Timestamp;
}

export interface WeekStats {
  wins: number;
  losses: number;
  pending: number;
  total: number;
}

export interface SeasonStats {
  totalWins: number;
  totalLosses: number;
  totalGames: number;
  weeklyRecords: Record<number, string>;
}

export interface UserProfile {
  displayName: string;
  photoURL: string;
  email: string;
}

export interface PickWithUserInfo {
  userId: string;
  displayName: string;
  photoURL: string;
  selectedTeam: string;
  result?: "win" | "loss" | "pending";
}
