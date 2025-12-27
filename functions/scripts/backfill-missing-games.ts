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
 * Backfill missing games from ESPN API
 */
async function backfillMissingGames() {
  const db = admin.firestore();
  
  console.log("=== Backfilling Missing Games ===\n");
  
  // Collect all unique game IDs from picks
  const missingGameIds = new Set<string>();
  
  const usersSnapshot = await db.collection("users").get();
  
  for (const userDoc of usersSnapshot.docs) {
    const picksSnapshot = await db
      .collection("users")
      .doc(userDoc.id)
      .collection("picks")
      .get();
    
    for (const pickDoc of picksSnapshot.docs) {
      const gameId = pickDoc.id;
      
      // Check if game exists
      const gameDoc = await db.collection("games").doc(gameId).get();
      if (!gameDoc.exists) {
        missingGameIds.add(gameId);
      }
    }
  }
  
  console.log(`Found ${missingGameIds.size} missing games\n`);
  
  if (missingGameIds.size === 0) {
    console.log("No missing games to backfill!");
    return;
  }
  
  // Fetch games from ESPN API
  let fetchedCount = 0;
  let failedCount = 0;
  
  for (const gameId of missingGameIds) {
    try {
      console.log(`Fetching game ${gameId}...`);
      
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`
      );
      
      if (!response.ok) {
        console.log(`  ❌ Failed to fetch (HTTP ${response.status})`);
        failedCount++;
        continue;
      }
      
      const data = await response.json();
      const event = data.header?.competitions?.[0];
      
      if (!event) {
        console.log(`  ❌ No event data found`);
        failedCount++;
        continue;
      }
      
      // Extract game data
      const competition = event;
      const competitors = competition.competitors || [];
      const homeTeam = competitors.find((c: any) => c.homeAway === "home");
      const awayTeam = competitors.find((c: any) => c.homeAway === "away");
      
      if (!homeTeam || !awayTeam) {
        console.log(`  ❌ Missing team data`);
        failedCount++;
        continue;
      }
      
      const gameData: any = {
        eventId: gameId,
        week: data.header?.week || 0,
        year: data.header?.season?.year || 2025,
        date: competition.date || new Date().toISOString(),
        status: competition.status?.type?.name || "unknown",
        home: {
          id: homeTeam.team.id,
          name: homeTeam.team.displayName || "Unknown",
          abbreviation: homeTeam.team.abbreviation || "UNK",
          score: parseInt(homeTeam.score) || 0,
        },
        away: {
          id: awayTeam.team.id,
          name: awayTeam.team.displayName || "Unknown",
          abbreviation: awayTeam.team.abbreviation || "UNK",
          score: parseInt(awayTeam.score) || 0,
        },
      };
      
      // Only add logo if it exists
      if (homeTeam.team.logo) {
        gameData.home.logo = homeTeam.team.logo;
      }
      if (awayTeam.team.logo) {
        gameData.away.logo = awayTeam.team.logo;
      }
      
      // Save to Firestore
      await db.collection("games").doc(gameId).set(gameData);
      
      console.log(`  ✓ Saved: Week ${gameData.week}, ${gameData.away.abbreviation} @ ${gameData.home.abbreviation}`);
      fetchedCount++;
      
      // Rate limiting - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      failedCount++;
    }
  }
  
  console.log("\n=== Backfill Complete ===");
  console.log(`Games fetched: ${fetchedCount}`);
  console.log(`Games failed: ${failedCount}`);
  console.log("\nNow run the structure migration again:");
  console.log("npx ts-node scripts/run-structure-migration.ts");
}

// Run backfill
backfillMissingGames()
  .then(() => {
    console.log("\n✅ Backfill complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Backfill failed:", error);
    process.exit(1);
  });
