import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

interface GameData {
  eventId: string;
  week: number;
  year: number;
  away: {
    id: string;
    score?: number;
  };
  home: {
    id: string;
    score?: number;
  };
  status: {
    state: "pre" | "in" | "post";
  };
}

export const onGameComplete = onDocumentUpdated(
  "games/{gameId}",
  async (event) => {
    const gameId = event.params.gameId;
    const beforeData = event.data?.before.data() as GameData;
    const afterData = event.data?.after.data() as GameData;

    if (
      beforeData.status.state === "post" ||
      afterData.status.state !== "post"
    ) {
      console.log(`Game ${gameId} status unchanged or not final, skipping`);
      return;
    }

    console.log(`Game ${gameId} just completed, updating affected users`);

    const db = admin.firestore();
    const gameWeek = afterData.week;
    const gameYear = afterData.year;

    try {
      const homeScore = Number(afterData.home.score ?? 0);
      const awayScore = Number(afterData.away.score ?? 0);

      let winningTeamId: string | null = null;
      if (homeScore > awayScore) {
        winningTeamId = afterData.home.id;
      } else if (awayScore > homeScore) {
        winningTeamId = afterData.away.id;
      }

      if (!winningTeamId) {
        console.log(`Game ${gameId} ended in a tie, no winner to process`);
        return;
      }

      const usersSnapshot = await db.collection("users").get();
      const usersToUpdate = new Set<string>();
      const batch = db.batch();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const pickRef = db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(gameYear.toString())
          .collection("weeks")
          .doc(gameWeek.toString())
          .collection("picks")
          .doc(gameId);

        const pickDoc = await pickRef.get();
        if (!pickDoc.exists) {
          continue;
        }

        const pick = pickDoc.data();
        let userPickedTeamId = pick!.selectedTeam;

        if (pick!.selectedTeam === "home") {
          userPickedTeamId = afterData.home.id;
        } else if (pick!.selectedTeam === "away") {
          userPickedTeamId = afterData.away.id;
        }

        const didWin = userPickedTeamId === winningTeamId;

        batch.update(pickRef, {
          result: didWin ? "win" : "loss",
          locked: true,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        usersToUpdate.add(userId);
      }

      await batch.commit();

      console.log(`Updated ${usersToUpdate.size} picks for game ${gameId}`);

      for (const userId of usersToUpdate) {
        await updateWeekStats(db, userId, gameYear, gameWeek);
        await updateSeasonStats(db, userId, gameYear);
      }

      console.log(
        `Successfully updated stats for ${usersToUpdate.size} users`
      );
    } catch (error) {
      console.error(`Error processing game completion for ${gameId}:`, error);
      throw error;
    }
  }
);

async function updateWeekStats(
  db: admin.firestore.Firestore,
  userId: string,
  year: number,
  week: number
) {
  const picksSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .doc(week.toString())
    .collection("picks")
    .get();

  let wins = 0;
  let losses = 0;
  let pending = 0;

  picksSnapshot.docs.forEach((doc) => {
    const pick = doc.data();
    if (pick.result === "win") wins++;
    else if (pick.result === "loss") losses++;
    else pending++;
  });

  const weekStatsRef = db
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .doc(week.toString());

  await weekStatsRef.set(
    {
      wins,
      losses,
      pending,
      total: wins + losses + pending,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Updated week ${week} stats for user ${userId}: ${wins}-${losses}`);
}

async function updateSeasonStats(
  db: admin.firestore.Firestore,
  userId: string,
  year: number
) {
  const weeksSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .get();

  let totalWins = 0;
  let totalLosses = 0;
  let totalGames = 0;
  const weeklyRecords: Record<number, string> = {};

  weeksSnapshot.docs.forEach((doc) => {
    const weekData = doc.data();
    const weekNumber = parseInt(doc.id);
    const wins = weekData.wins || 0;
    const losses = weekData.losses || 0;

    totalWins += wins;
    totalLosses += losses;
    totalGames += wins + losses;
    weeklyRecords[weekNumber] = `${wins}-${losses}`;
  });

  const seasonStatsRef = db
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString());

  await seasonStatsRef.set(
    {
      totalWins,
      totalLosses,
      totalGames,
      weeklyRecords,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(
    `Updated season ${year} stats for user ${userId}: ${totalWins}-${totalLosses}`
  );
}
