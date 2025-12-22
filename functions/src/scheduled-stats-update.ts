import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import type { NormalizedGame } from "../../src/lib/espn-data";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Scheduled function that runs every hour to update user stats
 * Triggered by Cloud Scheduler
 */
export const scheduledStatsUpdate = functions.pubsub
  .schedule("0 * * * *") // Run every hour at minute 0
  .timeZone("America/New_York")
  .onRun(async (context) => {
    const db = admin.firestore();
    const currentYear = new Date().getFullYear();

    console.log(`Starting scheduled stats update for ${currentYear}`);

    try {
      // Fetch all completed games from ESPN API
      const allCompletedGames: NormalizedGame[] = [];
      
      for (let week = 1; week <= 18; week++) {
        try {
          const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${currentYear}&seasontype=2&week=${week}`;
          const response = await fetch(espnUrl);
          const data = await response.json();

          if (data.events) {
            const { normalizeESPNGame } = await import("../../src/lib/espn-data");
            
            for (const event of data.events) {
              try {
                const game = normalizeESPNGame(event);
                if (game.status.state === "post") {
                  allCompletedGames.push(game);
                }
              } catch (err) {
                console.error(`Error normalizing event ${event.id}:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`Error fetching week ${week}:`, err);
        }
      }

      console.log(`Found ${allCompletedGames.length} completed games`);

      // Get all users
      const usersSnapshot = await db.collection("users").get();
      const batch = db.batch();
      let updatedCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Get user's picks
        const picksSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("picks")
          .get();

        let seasonWins = 0;
        let seasonLosses = 0;

        // Calculate wins/losses
        for (const pickDoc of picksSnapshot.docs) {
          const pick = pickDoc.data();
          const game = allCompletedGames.find((g) => g.eventId === pick.gameId);

          if (game) {
            // Convert scores to numbers for proper comparison
            const homeScore = Number(game.home.score ?? 0);
            const awayScore = Number(game.away.score ?? 0);

            // Determine winning team ID
            let winningTeamId: string | null = null;
            if (homeScore > awayScore) {
              winningTeamId = game.home.id;
            } else if (awayScore > homeScore) {
              winningTeamId = game.away.id;
            }

            if (winningTeamId) {
              // Normalize pick to team ID
              let userPickedTeamId = pick.selectedTeam;
              if (pick.selectedTeam === "home") {
                userPickedTeamId = game.home.id;
              } else if (pick.selectedTeam === "away") {
                userPickedTeamId = game.away.id;
              }

              // Compare team IDs
              if (userPickedTeamId === winningTeamId) {
                seasonWins++;
              } else {
                seasonLosses++;
              }
            }
          }
        }

        // Update user stats using batch
        const userRef = db.collection("users").doc(userId);
        batch.set(
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
        updatedCount++;
      }

      // Commit all updates
      await batch.commit();

      console.log(`Successfully updated stats for ${updatedCount} users`);
      return null;
    } catch (error) {
      console.error("Error in scheduled stats update:", error);
      throw error;
    }
  });
