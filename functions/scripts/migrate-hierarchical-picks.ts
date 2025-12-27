import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase Admin with service account
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
  process.exit(1);
}

const serviceAccountPath = path.join(functionsDir, serviceAccountFile);
console.log(`Found service account at: ${serviceAccountPath}`);

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * Migration script to convert "away"/"home" picks to team IDs
 * in the new hierarchical structure: users/{userId}/seasons/{year}/weeks/{week}/picks/{gameId}
 */
async function migrateHierarchicalPicks() {
  const db = admin.firestore();

  console.log("Starting migration of hierarchical picks...");
  console.log("Converting 'away'/'home' to team IDs\n");

  let totalPicksProcessed = 0;
  let totalPicksConverted = 0;
  let totalPicksSkipped = 0;

  // Get all users
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    console.log(`Processing user: ${userId}`);

    // Get all seasons for this user
    const seasonsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("seasons")
      .get();

    for (const seasonDoc of seasonsSnapshot.docs) {
      const year = seasonDoc.id;

      // Get all weeks for this season
      const weeksSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("seasons")
        .doc(year)
        .collection("weeks")
        .get();

      for (const weekDoc of weeksSnapshot.docs) {
        const week = weekDoc.id;

        // Get all picks for this week
        const picksSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(year)
          .collection("weeks")
          .doc(week)
          .collection("picks")
          .get();

        const batch = db.batch();
        let batchCount = 0;

        for (const pickDoc of picksSnapshot.docs) {
          const pick = pickDoc.data();
          const gameId = pick.gameId;

          totalPicksProcessed++;

          // Check if pick needs conversion
          if (pick.selectedTeam !== "away" && pick.selectedTeam !== "home") {
            // Already a team ID, skip
            totalPicksSkipped++;
            continue;
          }

          // Get game data to find team IDs
          const gameDoc = await db.collection("games").doc(gameId).get();

          if (!gameDoc.exists) {
            console.log(`  ⚠️  Game ${gameId} not found, skipping pick`);
            totalPicksSkipped++;
            continue;
          }

          const gameData = gameDoc.data();
          const homeTeamId = gameData!.home?.id;
          const awayTeamId = gameData!.away?.id;

          if (!homeTeamId || !awayTeamId) {
            console.log(`  ⚠️  Game ${gameId} missing team IDs, skipping`);
            totalPicksSkipped++;
            continue;
          }

          // Convert "away"/"home" to team ID
          const teamId = pick.selectedTeam === "home" ? homeTeamId : awayTeamId;

          // Prepare update data
          const updateData: any = {
            selectedTeam: teamId,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          // Add missing fields if they don't exist
          if (!pick.gameStartTime && gameData!.date) {
            updateData.gameStartTime = admin.firestore.Timestamp.fromDate(
              new Date(gameData!.date)
            );
          }

          if (!pick.locked) {
            const gameStartTime = updateData.gameStartTime || pick.gameStartTime;
            const now = admin.firestore.Timestamp.now();
            updateData.locked = gameStartTime
              ? gameStartTime.toMillis() <= now.toMillis()
              : false;
          }

          if (!pick.result) {
            // Check if game is completed
            if (gameData!.status === "post") {
              const homeScore = gameData!.home?.score || 0;
              const awayScore = gameData!.away?.score || 0;

              let winningTeamId: string | null = null;
              if (homeScore > awayScore) {
                winningTeamId = homeTeamId;
              } else if (awayScore > homeScore) {
                winningTeamId = awayTeamId;
              }

              if (winningTeamId) {
                updateData.result = teamId === winningTeamId ? "win" : "loss";
                updateData.processedAt =
                  admin.firestore.FieldValue.serverTimestamp();
              } else {
                updateData.result = "pending";
              }
            } else {
              updateData.result = "pending";
            }
          }

          batch.update(pickDoc.ref, updateData);
          batchCount++;
          totalPicksConverted++;

          // Commit batch every 500 operations (Firestore limit)
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }

        // Commit remaining operations
        if (batchCount > 0) {
          await batch.commit();
        }
      }
    }

    console.log(`  ✓ Completed user ${userId}`);
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Total picks processed: ${totalPicksProcessed}`);
  console.log(`Total picks converted: ${totalPicksConverted}`);
  console.log(`Total picks skipped: ${totalPicksSkipped}`);
}

// Run the migration
migrateHierarchicalPicks()
  .then(() => {
    console.log("\n✅ Migration successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
