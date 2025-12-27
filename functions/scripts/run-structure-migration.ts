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
 * Migration script to move picks from old structure to new hierarchical structure
 * 
 * Old structure: users/{userId}/picks/{gameId}
 * New structure: users/{userId}/seasons/{year}/weeks/{week}/picks/{gameId}
 */
async function migratePicks() {
  const db = admin.firestore();
  
  console.log("Starting picks structure migration...");
  console.log("Old: users/{userId}/picks/{gameId}");
  console.log("New: users/{userId}/seasons/{year}/weeks/{week}/picks/{gameId}\n");
  
  try {
    const usersSnapshot = await db.collection("users").get();
    let totalMigrated = 0;
    let totalSkipped = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`\nMigrating picks for user: ${userId}`);
      
      const oldPicksSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("picks")
        .get();
      
      if (oldPicksSnapshot.empty) {
        console.log(`  No picks found in old structure for user ${userId}`);
        continue;
      }
      
      const batch = db.batch();
      let userMigrated = 0;
      let batchCount = 0;
      
      for (const pickDoc of oldPicksSnapshot.docs) {
        const pickData = pickDoc.data();
        const gameId = pickDoc.id;
        
        // Get game data to determine week and year
        const gameDoc = await db.collection("games").doc(gameId).get();
        
        if (!gameDoc.exists) {
          console.log(`  ⚠️  Game ${gameId} not found, skipping pick`);
          totalSkipped++;
          continue;
        }
        
        const gameData = gameDoc.data();
        const week = gameData!.week;
        const year = gameData!.year;
        
        if (!week || !year) {
          console.log(`  ⚠️  Game ${gameId} missing week/year data, skipping`);
          totalSkipped++;
          continue;
        }
        
        // Check if pick already exists in new structure
        const newPickRef = db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(year.toString())
          .collection("weeks")
          .doc(week.toString())
          .collection("picks")
          .doc(gameId);
        
        const existingPick = await newPickRef.get();
        if (existingPick.exists) {
          console.log(`  → Pick ${gameId} already exists in new structure, skipping`);
          totalSkipped++;
          continue;
        }
        
        const gameStartTime = admin.firestore.Timestamp.fromDate(
          new Date(gameData!.date)
        );
        const now = admin.firestore.Timestamp.now();
        const isLocked = gameStartTime.toMillis() <= now.toMillis();
        
        // Preserve all existing data from old pick
        const newPickData: any = {
          gameId,
          selectedTeam: pickData.selectedTeam,
          timestamp: pickData.timestamp || now,
          result: pickData.result || "pending",
          locked: pickData.locked !== undefined ? pickData.locked : isLocked,
          gameStartTime,
        };
        
        // Preserve migration metadata if it exists
        if (pickData.migratedAt) {
          newPickData.migratedAt = pickData.migratedAt;
        }
        if (pickData.processedAt) {
          newPickData.processedAt = pickData.processedAt;
        }
        
        batch.set(newPickRef, newPickData);
        userMigrated++;
        batchCount++;
        
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
      
      totalMigrated += userMigrated;
      console.log(`  ✓ Migrated ${userMigrated} picks for user ${userId}`);
      
      // Recalculate stats for all weeks
      const seasonsMap = new Map<number, Set<number>>();
      
      for (const pickDoc of oldPicksSnapshot.docs) {
        const gameId = pickDoc.id;
        const gameDoc = await db.collection("games").doc(gameId).get();
        
        if (gameDoc.exists) {
          const gameData = gameDoc.data();
          const year = gameData!.year;
          const week = gameData!.week;
          
          if (year && week) {
            if (!seasonsMap.has(year)) {
              seasonsMap.set(year, new Set());
            }
            seasonsMap.get(year)!.add(week);
          }
        }
      }
      
      // Update stats for each week and season
      for (const [year, weeks] of seasonsMap.entries()) {
        for (const week of weeks) {
          await updateWeekStats(db, userId, year, week);
        }
        await updateSeasonStats(db, userId, year);
      }
    }
    
    console.log(`\n=== Migration Complete ===`);
    console.log(`Total picks migrated: ${totalMigrated}`);
    console.log(`Total picks skipped: ${totalSkipped}`);
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

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
}

// Run the migration
migratePicks()
  .then(() => {
    console.log("\n✅ Migration successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
