import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Migration script to move picks from old structure to new hierarchical structure
 * 
 * Old structure: users/{userId}/picks/{gameId}
 * New structure: users/{userId}/seasons/{year}/weeks/{week}/picks/{gameId}
 * 
 * Run this script once to migrate existing data
 */
export async function migratePicks() {
  const db = admin.firestore();
  
  console.log("Starting picks migration...");
  
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
        console.log(`  No picks found for user ${userId}`);
        continue;
      }
      
      const batch = db.batch();
      let userMigrated = 0;
      
      for (const pickDoc of oldPicksSnapshot.docs) {
        const pickData = pickDoc.data();
        const gameId = pickDoc.id;
        
        // Get game data to determine week and year
        const gameDoc = await db.collection("games").doc(gameId).get();
        
        if (!gameDoc.exists) {
          console.log(`  Game ${gameId} not found, skipping pick`);
          totalSkipped++;
          continue;
        }
        
        const gameData = gameDoc.data();
        const week = gameData!.week;
        const year = gameData!.year;
        
        if (!week || !year) {
          console.log(`  Game ${gameId} missing week/year data, skipping`);
          totalSkipped++;
          continue;
        }
        
        // Create new pick in hierarchical structure
        const newPickRef = db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(year.toString())
          .collection("weeks")
          .doc(week.toString())
          .collection("picks")
          .doc(gameId);
        
        const gameStartTime = admin.firestore.Timestamp.fromDate(
          new Date(gameData!.date)
        );
        const now = admin.firestore.Timestamp.now();
        const isLocked = gameStartTime.toMillis() <= now.toMillis();
        
        batch.set(newPickRef, {
          gameId,
          selectedTeam: pickData.selectedTeam,
          timestamp: pickData.timestamp || now,
          result: pickData.result || "pending",
          locked: isLocked,
          gameStartTime,
        });
        
        userMigrated++;
      }
      
      await batch.commit();
      totalMigrated += userMigrated;
      console.log(`  Migrated ${userMigrated} picks for user ${userId}`);
      
      // Recalculate stats for all weeks
      const seasonsMap = new Map<number, Set<number>>();
      
      for (const pickDoc of oldPicksSnapshot.docs) {
        const gameId = pickDoc.id;
        const gameDoc = await db.collection("games").doc(gameId).get();
        
        if (gameDoc.exists) {
          const gameData = gameDoc.data();
          const year = gameData!.year;
          const week = gameData!.week;
          
          if (!seasonsMap.has(year)) {
            seasonsMap.set(year, new Set());
          }
          seasonsMap.get(year)!.add(week);
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
    
    console.log(`\n✅ Migration complete!`);
    console.log(`   Total picks migrated: ${totalMigrated}`);
    console.log(`   Total picks skipped: ${totalSkipped}`);
    
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
