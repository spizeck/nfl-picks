import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase Admin with service account
// Look for any firebase-adminsdk JSON file in the functions directory
const functionsDir = path.join(__dirname, "..");
const files = fs.readdirSync(functionsDir);
const serviceAccountFile = files.find(
  (f) => f.includes("firebase-adminsdk") && f.endsWith(".json")
);

if (!serviceAccountFile) {
  console.error(
    "Could not find firebase-adminsdk service account key in functions directory"
  );
  console.error(`Looked in: ${functionsDir}`);
  console.error(
    "Files found:",
    files.filter((f) => f.endsWith(".json"))
  );
  process.exit(1);
}

const serviceAccountPath = path.join(functionsDir, serviceAccountFile);
console.log(`Found service account at: ${serviceAccountPath}`);

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * One-time migration script to backfill pick results for completed games
 * Run this before deploying the new onGameComplete trigger
 */
async function migrateExistingPicks() {
  const db = admin.firestore();
  const currentYear = 2025;

  console.log("Starting migration of existing picks...");

  // Step 1: Get all weeks with cached games
  const cacheSnapshot = await db
    .collection("cache")
    .where(
      admin.firestore.FieldPath.documentId(),
      ">=",
      `nfl-games-${currentYear}-`
    )
    .where(
      admin.firestore.FieldPath.documentId(),
      "<",
      `nfl-games-${currentYear + 1}-`
    )
    .get();

  console.log(`Found ${cacheSnapshot.size} cached weeks`);

  const completedGames = new Map<
    string,
    { winningTeamId: string; homeId: string; awayId: string }
  >();

  // Step 2: Extract all completed games from cache
  for (const cacheDoc of cacheSnapshot.docs) {
    const data = cacheDoc.data();
    const events = data.events || [];

    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      // Check if game is completed
      if (!competition.status?.type?.completed) continue;

      const competitors = competition.competitors || [];
      const homeTeam = competitors.find((c: any) => c.homeAway === "home");
      const awayTeam = competitors.find((c: any) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) continue;

      const homeScore = Number(homeTeam.score ?? 0);
      const awayScore = Number(awayTeam.score ?? 0);

      let winningTeamId: string | null = null;
      if (homeScore > awayScore) {
        winningTeamId = homeTeam.team.id;
      } else if (awayScore > homeScore) {
        winningTeamId = awayTeam.team.id;
      }

      if (winningTeamId) {
        completedGames.set(event.id, {
          winningTeamId,
          homeId: homeTeam.team.id,
          awayId: awayTeam.team.id,
        });
      }
    }
  }

  console.log(`Found ${completedGames.size} completed games`);

  // Step 3: Process all picks across all users
  const usersSnapshot = await db.collection("users").get();
  let totalPicksProcessed = 0;
  let totalUsersUpdated = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const picksSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("picks")
      .get();

    if (picksSnapshot.empty) continue;

    const batch = db.batch();
    let userPicksProcessed = 0;
    let seasonWins = 0;
    let seasonLosses = 0;

    for (const pickDoc of picksSnapshot.docs) {
      const pick = pickDoc.data();
      const gameData = completedGames.get(pick.gameId);

      if (!gameData) {
        // Game not completed yet, skip
        continue;
      }

      // Normalize pick to team ID
      let userPickedTeamId = pick.selectedTeam;
      if (pick.selectedTeam === "home") {
        userPickedTeamId = gameData.homeId;
      } else if (pick.selectedTeam === "away") {
        userPickedTeamId = gameData.awayId;
      }

      // Determine result
      const didWin = userPickedTeamId === gameData.winningTeamId;
      const result = didWin ? "win" : "loss";

      // Update pick with result
      batch.update(pickDoc.ref, {
        result,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (didWin) {
        seasonWins++;
      } else {
        seasonLosses++;
      }

      userPicksProcessed++;
    }

    // Update user stats if they had any processed picks
    if (userPicksProcessed > 0) {
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

      totalPicksProcessed += userPicksProcessed;
      totalUsersUpdated++;
    }

    await batch.commit();
    console.log(`Processed ${userPicksProcessed} picks for user ${userId}`);
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Total users updated: ${totalUsersUpdated}`);
  console.log(`Total picks processed: ${totalPicksProcessed}`);
  console.log(`Completed games found: ${completedGames.size}`);
}

// Run the migration
migrateExistingPicks()
  .then(() => {
    console.log("Migration successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
