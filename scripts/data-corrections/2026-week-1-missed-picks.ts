import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

const PROJECT_ID = "cj-nfl-picks";
const YEAR = 2026;
const WEEK = 1;
const GAME_ID = "401872656";
const SELECTED_TEAM = "26";
const REASON = "Manual correction: user missed pick deadline";
const USERS = [
  { uid: "n7r9TVWDV2VfjmazoRUu5zMeb9t1", displayName: "David Nuttall" },
  { uid: "fxn1UIh2TZP6JlpHhgp64owWbt43", displayName: "Robin McKinnon" },
] as const;

type PickResult = "win" | "loss" | "pending";

interface PickData {
  selectedTeam?: string;
  result?: PickResult;
}

interface Stats {
  wins: number;
  losses: number;
  pending: number;
  total: number;
}

interface GameData {
  year?: unknown;
  week?: unknown;
  date?: unknown;
  away?: { id?: unknown; name?: unknown; score?: unknown };
  home?: { id?: unknown; name?: unknown; score?: unknown };
  status?: { state?: unknown };
}

function parseScore(score: unknown): number {
  if (
    (typeof score !== "string" && typeof score !== "number") ||
    (typeof score === "string" && score.trim() === "")
  ) {
    return Number.NaN;
  }
  return Number(score);
}

export function isExpectedSeattleWin(gameData: GameData): boolean {
  const expectedKickoff = Date.parse("2026-09-10T00:20Z");
  const storedKickoff =
    typeof gameData.date === "string" ? Date.parse(gameData.date) : Number.NaN;
  const homeScore = parseScore(gameData.home?.score);
  const awayScore = parseScore(gameData.away?.score);

  return (
    gameData.year === YEAR &&
    gameData.week === WEEK &&
    Number.isFinite(storedKickoff) &&
    storedKickoff === expectedKickoff &&
    gameData.away?.id === "17" &&
    gameData.away?.name === "New England Patriots" &&
    gameData.home?.id === SELECTED_TEAM &&
    gameData.home?.name === "Seattle Seahawks" &&
    gameData.status?.state === "post" &&
    Number.isFinite(homeScore) &&
    Number.isFinite(awayScore) &&
    homeScore > awayScore
  );
}

export function deriveStats(picks: PickData[]): Stats {
  const stats = { wins: 0, losses: 0, pending: 0, total: picks.length };
  for (const pick of picks) {
    if (pick.result === "win") stats.wins++;
    else if (pick.result === "loss") stats.losses++;
    else stats.pending++;
  }
  return stats;
}

export function deriveSeasonStats(
  weeks: Array<{ id: string; wins?: number; losses?: number }>,
  correctedWeek: Stats
) {
  let totalWins = 0;
  let totalLosses = 0;
  const weeklyRecords: Record<number, string> = {};

  for (const week of weeks) {
    const weekNumber = Number(week.id);
    const wins = weekNumber === WEEK ? correctedWeek.wins : week.wins ?? 0;
    const losses = weekNumber === WEEK ? correctedWeek.losses : week.losses ?? 0;
    totalWins += wins;
    totalLosses += losses;
    weeklyRecords[weekNumber] = `${wins}-${losses}`;
  }

  if (!weeks.some((week) => Number(week.id) === WEEK)) {
    totalWins += correctedWeek.wins;
    totalLosses += correctedWeek.losses;
    weeklyRecords[WEEK] = `${correctedWeek.wins}-${correctedWeek.losses}`;
  }

  return {
    totalWins,
    totalLosses,
    totalGames: totalWins + totalLosses,
    weeklyRecords,
  };
}

function correctedPicks(
  docs: QueryDocumentSnapshot[],
  correction: PickData
): PickData[] {
  const picks = docs.map((doc) => doc.data() as PickData);
  const index = docs.findIndex((doc) => doc.id === GAME_ID);
  if (index === -1) picks.push(correction);
  else picks[index] = { ...picks[index], ...correction };
  return picks;
}

function pickRefForUser(
  db: FirebaseFirestore.Firestore,
  uid: string
): DocumentReference {
  return db.doc(
    `users/${uid}/seasons/${YEAR}/weeks/${WEEK}/picks/${GAME_ID}`
  );
}

async function run(apply: boolean) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? PROJECT_ID;
  if (projectId !== PROJECT_ID) {
    throw new Error(`Refusing to run against Firebase project ${projectId}`);
  }
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const credential = clientEmail && privateKey
    ? cert({ projectId, clientEmail, privateKey })
    : applicationDefault();
  const app = initializeApp({ credential, projectId });
  const db = getFirestore(app);
  const gameRef = db.doc(`games/${GAME_ID}`);
  const game = await gameRef.get();
  if (!game.exists) throw new Error(`Expected game ${GAME_ID} does not exist`);

  const gameData = game.data()!;
  if (!isExpectedSeattleWin(gameData)) {
    throw new Error(`Game ${GAME_ID} does not match the expected completed Seattle win`);
  }

  const profiles = await Promise.all(USERS.map((user) => db.doc(`users/${user.uid}`).get()));
  profiles.forEach((profile, index) => {
    if (!profile.exists || profile.data()?.displayName !== USERS[index].displayName) {
      throw new Error(`User identity mismatch for ${USERS[index].displayName}`);
    }
  });

  const existingPicks = await Promise.all(
    USERS.map((user) => pickRefForUser(db, user.uid).get())
  );
  existingPicks.forEach((pick, index) => {
    const selection = pick.data()?.selectedTeam;
    if (selection && selection !== SELECTED_TEAM) {
      throw new Error(
        `Conflicting pick for ${USERS[index].displayName}: ${selection}; no changes made`
      );
    }
  });

  console.log(`${apply ? "Applying" : "Dry run for"} ${GAME_ID}: New England @ Seattle`);
  USERS.forEach((user, index) => {
    const selection = existingPicks[index].data()?.selectedTeam;
    console.log(`${user.displayName}: ${selection === SELECTED_TEAM ? "SEA already selected; repair result/stats" : "add SEA pick"}`);
  });
  if (!apply) {
    console.log("No writes performed. Re-run with --apply after review.");
    return;
  }

  await db.runTransaction(async (transaction) => {
    const pickRefs = USERS.map((user) => pickRefForUser(db, user.uid));
    const weekRefs = USERS.map((user) =>
      db.doc(`users/${user.uid}/seasons/${YEAR}/weeks/${WEEK}`)
    );
    const seasonRefs = USERS.map((user) =>
      db.doc(`users/${user.uid}/seasons/${YEAR}`)
    );
    const pickDocs = await Promise.all(pickRefs.map((ref) => transaction.get(ref)));
    const pickQueries = USERS.map((user) =>
      db.collection(`users/${user.uid}/seasons/${YEAR}/weeks/${WEEK}/picks`)
    );
    const seasonQueries = USERS.map((user) =>
      db.collection(`users/${user.uid}/seasons/${YEAR}/weeks`)
    );
    const weeklyPickDocs = await Promise.all(pickQueries.map((query) => transaction.get(query)));
    const weekDocs = await Promise.all(seasonQueries.map((query) => transaction.get(query)));

    pickDocs.forEach((pick, index) => {
      const selection = pick.data()?.selectedTeam;
      if (selection && selection !== SELECTED_TEAM) {
        throw new Error(
          `Conflicting pick for ${USERS[index].displayName}: ${selection}; no changes made`
        );
      }
    });

    USERS.forEach((user, index) => {
      const correctedPick = { selectedTeam: SELECTED_TEAM, result: "win" as const };
      const weekStats = deriveStats(correctedPicks(weeklyPickDocs[index].docs, correctedPick));
      const seasonStats = deriveSeasonStats(
        weekDocs[index].docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        weekStats
      );
      const existing = pickDocs[index].data();

      transaction.set(
        pickRefs[index],
        {
          gameId: GAME_ID,
          selectedTeam: SELECTED_TEAM,
          timestamp: existing?.timestamp ?? FieldValue.serverTimestamp(),
          result: "win",
          locked: true,
          gameStartTime: Timestamp.fromDate(new Date(gameData.date)),
          processedAt: FieldValue.serverTimestamp(),
          adminCorrection: {
            reason: REASON,
            correctedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
      transaction.set(
        weekRefs[index],
        { ...weekStats, lastUpdated: FieldValue.serverTimestamp() },
        { merge: true }
      );
      transaction.set(
        seasonRefs[index],
        { ...seasonStats, lastUpdated: FieldValue.serverTimestamp() },
        { merge: true }
      );
      console.log(`${user.displayName}: corrected to SEA win (${weekStats.wins}-${weekStats.losses})`);
    });
  });
}

if (process.argv[1]?.endsWith("2026-week-1-missed-picks.ts")) {
  run(process.argv.includes("--apply")).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
