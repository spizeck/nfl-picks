import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

interface GameData {
  eventId: string;
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

/**
 * Triggered whenever a game document is updated
 * Only processes stats when a game changes from non-final to final
 */
export const onGameComplete = onDocumentUpdated(
  "games/{gameId}",
  async (event) => {
    const gameId = event.params.gameId;
    const beforeData = event.data?.before.data() as GameData;
    const afterData = event.data?.after.data() as GameData;

    // Only process if game just became final
    if (
      beforeData.status.state === "post" ||
      afterData.status.state !== "post"
    ) {
      console.log(`Game ${gameId} status unchanged or not final, skipping`);
      return;
    }

    console.log(`Game ${gameId} just completed, updating affected users`);

    const db = admin.firestore();
    const currentYear = new Date().getFullYear();

    try {
      // Determine the winner
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

      // Find all users who picked this game using collectionGroup query
      const picksSnapshot = await db
        .collectionGroup("picks")
        .where("gameId", "==", gameId)
        .get();

      console.log(`Found ${picksSnapshot.size} picks for game ${gameId}`);

      // Process each user's pick
      const batch = db.batch();
      const usersToUpdate = new Set<string>();

      for (const pickDoc of picksSnapshot.docs) {
        const pick = pickDoc.data();

        // Extract userId from the document path
        // Path format: users/{userId}/picks/{pickId}
        const userId = pickDoc.ref.parent.parent?.id;
        if (!userId) {
          console.error(
            `Could not extract userId from pick path: ${pickDoc.ref.path}`
          );
          continue;
        }

        // Normalize pick to team ID
        let userPickedTeamId = pick.selectedTeam;
        if (pick.selectedTeam === "home") {
          userPickedTeamId = afterData.home.id;
        } else if (pick.selectedTeam === "away") {
          userPickedTeamId = afterData.away.id;
        }

        // Determine if user won this pick
        const didWin = userPickedTeamId === winningTeamId;

        // Update the pick document with result
        batch.update(pickDoc.ref, {
          result: didWin ? "win" : "loss",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        usersToUpdate.add(userId);
      }

      // Commit pick updates
      await batch.commit();

      // Recalculate stats for affected users
      const statsBatch = db.batch();

      for (const userId of usersToUpdate) {
        // Get all processed picks for this user
        const userPicksSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("picks")
          .where("result", "in", ["win", "loss"])
          .get();

        let seasonWins = 0;
        let seasonLosses = 0;

        for (const pickDoc of userPicksSnapshot.docs) {
          const pick = pickDoc.data();
          if (pick.result === "win") {
            seasonWins++;
          } else if (pick.result === "loss") {
            seasonLosses++;
          }
        }

        // Update user stats
        const userRef = db.collection("users").doc(userId);
        statsBatch.set(
          userRef,
          {
            stats: {
              [`season${currentYear}`]: {
                wins: seasonWins,
                losses: seasonLosses,
                winPercentage:
                  seasonWins + seasonLosses > 0
                    ? (seasonWins / (seasonWins + seasonLosses)) * 100
                    : 0,
              },
              allTime: {
                wins: seasonWins,
                losses: seasonLosses,
                winPercentage:
                  seasonWins + seasonLosses > 0
                    ? (seasonWins / (seasonWins + seasonLosses)) * 100
                    : 0,
              },
            },
            lastStatsUpdate: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      await statsBatch.commit();

      console.log(
        `Successfully updated ${usersToUpdate.size} users for completed game ${gameId}`
      );
    } catch (error) {
      console.error(`Error processing game completion for ${gameId}:`, error);
      throw error;
    }
  }
);
