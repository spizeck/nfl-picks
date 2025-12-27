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
  console.error("Could not find firebase-adminsdk service account key");
  process.exit(1);
}

const serviceAccountPath = path.join(functionsDir, serviceAccountFile);
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * Backfill wins/losses for all completed games
 */
async function backfillStats() {
  const db = admin.firestore();
  
  console.log("=== Backfilling Stats for Completed Games ===\n");
  
  // Get all completed games
  const completedGamesSnapshot = await db
    .collection("games")
    .where("status.state", "==", "post")
    .get();
  
  console.log(`Found ${completedGamesSnapshot.size} completed games\n`);
  
  let gamesProcessed = 0;
  let picksUpdated = 0;
  const usersAffected = new Set<string>();
  const weeksAffected = new Map<string, Set<number>>();
  
  for (const gameDoc of completedGamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const gameId = gameDoc.id;
    const gameWeek = gameData.week;
    const gameYear = gameData.year;
    
    console.log(`Processing game ${gameId} (Week ${gameWeek}, ${gameYear})...`);
    
    // Determine winner
    const homeScore = Number(gameData.home?.score ?? 0);
    const awayScore = Number(gameData.away?.score ?? 0);
    
    let winningTeamId: string | null = null;
    if (homeScore > awayScore) {
      winningTeamId = gameData.home.id;
    } else if (awayScore > homeScore) {
      winningTeamId = gameData.away.id;
    }
    
    if (!winningTeamId) {
      console.log(`  ⚠️  Game ended in tie, skipping`);
      continue;
    }
    
    // Find all picks for this game
    const usersSnapshot = await db.collection("users").get();
    const batch = db.batch();
    let gamePicks = 0;
    
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
      
      // Skip if already processed
      if (pick!.result && pick!.result !== "pending") {
        continue;
      }
      
      let userPickedTeamId = pick!.selectedTeam;
      
      // Convert "home"/"away" to team IDs if needed
      if (pick!.selectedTeam === "home") {
        userPickedTeamId = gameData.home.id;
      } else if (pick!.selectedTeam === "away") {
        userPickedTeamId = gameData.away.id;
      }
      
      const didWin = userPickedTeamId === winningTeamId;
      
      batch.update(pickRef, {
        result: didWin ? "win" : "loss",
        locked: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      usersAffected.add(userId);
      gamePicks++;
      
      // Track weeks that need stats recalculation
      const userKey = `${userId}-${gameYear}`;
      if (!weeksAffected.has(userKey)) {
        weeksAffected.set(userKey, new Set());
      }
      weeksAffected.get(userKey)!.add(gameWeek);
    }
    
    if (gamePicks > 0) {
      await batch.commit();
      picksUpdated += gamePicks;
      gamesProcessed++;
      console.log(`  ✓ Updated ${gamePicks} picks`);
    } else {
      console.log(`  → No picks to update`);
    }
  }
  
  console.log("\n=== Recalculating Stats ===\n");
  
  // Recalculate stats for all affected users/weeks
  for (const [userKey, weeks] of weeksAffected.entries()) {
    const [userId, yearStr] = userKey.split("-");
    const year = parseInt(yearStr);
    
    console.log(`Updating stats for user ${userId}, year ${year}...`);
    
    for (const week of weeks) {
      await updateWeekStats(db, userId, year, week);
    }
    
    await updateSeasonStats(db, userId, year);
    console.log(`  ✓ Completed`);
  }
  
  console.log("\n=== Backfill Complete ===");
  console.log(`Games processed: ${gamesProcessed}`);
  console.log(`Picks updated: ${picksUpdated}`);
  console.log(`Users affected: ${usersAffected.size}`);
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

// Run backfill
backfillStats()
  .then(() => {
    console.log("\n✅ Backfill complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Backfill failed:", error);
    process.exit(1);
  });
