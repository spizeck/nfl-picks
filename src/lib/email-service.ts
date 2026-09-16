/**
 * Batch orchestration for the two scheduled email jobs. Transport details
 * live in `email-transport.ts`; this module owns eligibility, idempotency
 * claims, rendering, and per-recipient failure isolation.
 */

import type { NFLWeekSelection } from "./nfl-season";
import {
  getMissingPickGames,
  getPickableGames,
  type StoredGame,
} from "./email-reminder";
import {
  buildLeaderboardContext,
  buildWeeklyRecapModel,
  isWeekComplete,
  weekLabel,
  type RecapUserPick,
} from "./email-recap";
import { renderRecapEmail, renderReminderEmail } from "./email-templates";
import {
  isUsableEmail,
  resolveEmailPreferences,
} from "./email-preferences";
import {
  claimEmailSend,
  emailSendDocId,
  markEmailFailed,
  markEmailSent,
} from "./email-send-log";
import type { EmailTransport } from "./email-transport";

export interface EmailBatchSummary {
  kind: "weekly-recap" | "incomplete-picks-reminder";
  sent: number;
  skipped: number;
  failed: number;
  /** Diagnostic context only — user IDs, never addresses or secrets. */
  failures: string[];
  week?: number;
  year?: number;
}

interface RunContext {
  db: FirebaseFirestore.Firestore;
  transport: EmailTransport;
  selection: NFLWeekSelection;
  now?: Date;
  appUrl: string;
}

async function getWeekGames(
  db: FirebaseFirestore.Firestore,
  year: number,
  week: number
): Promise<StoredGame[]> {
  const snapshot = await db
    .collection("games")
    .where("year", "==", year)
    .where("week", "==", week)
    .get();
  return snapshot.docs.map((doc) => doc.data() as StoredGame);
}

function picksCollection(
  db: FirebaseFirestore.Firestore,
  userId: string,
  year: number,
  week: number
) {
  return db
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .doc(week.toString())
    .collection("picks");
}

async function getUserPicks(
  db: FirebaseFirestore.Firestore,
  userId: string,
  year: number,
  week: number
): Promise<RecapUserPick[]> {
  const snapshot = await picksCollection(db, userId, year, week).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      gameId: doc.id,
      selectedTeam: data.selectedTeam as string,
      result: data.result as RecapUserPick["result"],
    };
  });
}

async function sendClaimedEmail(opts: {
  db: FirebaseFirestore.Firestore;
  transport: EmailTransport;
  key: string;
  claim: Parameters<typeof claimEmailSend>[1];
  render: () => { to: string; subject: string; html: string; text: string };
  summary: EmailBatchSummary;
}): Promise<void> {
  const claim = await claimEmailSend(opts.db, opts.claim);
  if (claim !== "claimed") {
    opts.summary.skipped++;
    return;
  }
  try {
    const email = opts.render();
    const result = await opts.transport.send(email);
    await markEmailSent(opts.db, opts.key, result.id);
    opts.summary.sent++;
  } catch (error) {
    await markEmailFailed(opts.db, opts.key, error);
    throw error;
  }
}

export async function runPickReminders(
  ctx: RunContext
): Promise<EmailBatchSummary> {
  const now = ctx.now ?? new Date();
  const { year, week } = ctx.selection;
  const summary: EmailBatchSummary = {
    kind: "incomplete-picks-reminder",
    sent: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    week,
    year,
  };

  const games = await getWeekGames(ctx.db, year, week);
  const pickable = getPickableGames(games, now);
  if (pickable.length === 0) {
    return summary;
  }

  const usersSnapshot = await ctx.db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    try {
      const userData = userDoc.data();
      const email = userData.email;
      if (
        !resolveEmailPreferences(userData).pickReminders ||
        !isUsableEmail(email)
      ) {
        summary.skipped++;
        continue;
      }

      const picks = await getUserPicks(ctx.db, userId, year, week);
      const pickedIds = new Set(picks.map((p) => p.gameId));
      const missing = getMissingPickGames(games, pickedIds, now);
      if (missing.length === 0) {
        summary.skipped++;
        continue;
      }

      const key = emailSendDocId(
        "incomplete-picks-reminder",
        year,
        week,
        userId
      );
      await sendClaimedEmail({
        db: ctx.db,
        transport: ctx.transport,
        key,
        claim: {
          key,
          kind: "incomplete-picks-reminder",
          year,
          week,
          userId,
          createdAtMillis: now.getTime(),
        },
        render: () => {
          const rendered = renderReminderEmail({
            displayName: userData.displayName || "Player",
            weekLabel: weekLabel(week),
            missingGames: missing,
            appUrl: ctx.appUrl,
          });
          return { to: email, ...rendered };
        },
        summary,
      });
    } catch (error) {
      summary.failed++;
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push(`${userId}: ${message}`);
      console.error(`Pick reminder failed for user ${userId}: ${message}`);
    }
  }

  return summary;
}

/**
 * Find the most recent week at or before `selection.week` whose games are
 * all final. Bounded lookback keeps postseason gaps cheap.
 */
export async function findLatestCompletedWeek(
  db: FirebaseFirestore.Firestore,
  selection: NFLWeekSelection
): Promise<{ year: number; week: number } | null> {
  const earliest = Math.max(1, selection.week - 3);
  for (let week = selection.week; week >= earliest; week--) {
    const games = await getWeekGames(db, selection.year, week);
    if (isWeekComplete(games)) {
      return { year: selection.year, week };
    }
  }
  return null;
}

export async function runWeeklyRecaps(
  ctx: RunContext
): Promise<EmailBatchSummary> {
  const now = ctx.now ?? new Date();
  const summary: EmailBatchSummary = {
    kind: "weekly-recap",
    sent: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  const completed = await findLatestCompletedWeek(ctx.db, ctx.selection);
  if (!completed) {
    return summary;
  }
  const { year, week } = completed;
  summary.week = week;
  summary.year = year;

  const [games, usersSnapshot] = await Promise.all([
    getWeekGames(ctx.db, year, week),
    ctx.db.collection("users").get(),
  ]);

  // Load every user's picks + stats for the completed week once, then reuse
  // the shared leaderboard context for every recipient's model.
  const perUser = new Map<
    string,
    {
      picks: RecapUserPick[];
      weekWins: number;
      weekLosses: number;
      seasonWins: number;
      seasonLosses: number;
    }
  >();
  const pickCounts = new Map<string, Map<string, number>>();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const [picks, seasonDoc] = await Promise.all([
      getUserPicks(ctx.db, userId, year, week),
      ctx.db
        .collection("users")
        .doc(userId)
        .collection("seasons")
        .doc(year.toString())
        .get(),
    ]);
    const weekWins = picks.filter((p) => p.result === "win").length;
    const weekLosses = picks.filter((p) => p.result === "loss").length;
    const seasonData = seasonDoc.exists ? seasonDoc.data()! : {};
    perUser.set(userId, {
      picks,
      weekWins,
      weekLosses,
      seasonWins: Number(seasonData.totalWins ?? 0),
      seasonLosses: Number(seasonData.totalLosses ?? 0),
    });
    for (const pick of picks) {
      const counts = pickCounts.get(pick.gameId) ?? new Map<string, number>();
      counts.set(pick.selectedTeam, (counts.get(pick.selectedTeam) ?? 0) + 1);
      pickCounts.set(pick.gameId, counts);
    }
  }

  const leaderboard = buildLeaderboardContext(
    usersSnapshot.docs.map((userDoc) => {
      const stats = perUser.get(userDoc.id)!;
      return {
        uid: userDoc.id,
        displayName: userDoc.data().displayName || "Anonymous",
        ...stats,
      };
    })
  );

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    try {
      const userData = userDoc.data();
      const email = userData.email;
      const stats = perUser.get(userId)!;
      if (
        !resolveEmailPreferences(userData).weeklyRecap ||
        !isUsableEmail(email) ||
        stats.picks.length === 0
      ) {
        summary.skipped++;
        continue;
      }

      const key = emailSendDocId("weekly-recap", year, week, userId);
      await sendClaimedEmail({
        db: ctx.db,
        transport: ctx.transport,
        key,
        claim: {
          key,
          kind: "weekly-recap",
          year,
          week,
          userId,
          createdAtMillis: now.getTime(),
        },
        render: () => {
          const rendered = renderRecapEmail(
            buildWeeklyRecapModel({
              userId,
              displayName: userData.displayName || "Player",
              year,
              week,
              appUrl: ctx.appUrl,
              games,
              picks: stats.picks,
              pickCounts,
              seasonLeaderboard: leaderboard.season,
              previousSeasonLeaderboard: leaderboard.previous,
              weeklyLeaderboard: leaderboard.weekly,
            })
          );
          return { to: email, ...rendered };
        },
        summary,
      });
    } catch (error) {
      summary.failed++;
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push(`${userId}: ${message}`);
      console.error(`Weekly recap failed for user ${userId}: ${message}`);
    }
  }

  return summary;
}
