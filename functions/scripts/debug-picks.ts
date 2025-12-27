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
 * Debug picks for a specific week
 */
async function debugPicks() {
  const db = admin.firestore();
  const week = 17;
  const year = 2025;
  
  console.log(`=== Debugging Picks for Week ${week}, ${year} ===\n`);
  
  // Get all users
  const usersSnapshot = await db.collection("users").get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`\n📋 User: ${userData.displayName || userId}`);
    
    // Check picks in new structure
    const picksSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("seasons")
      .doc(year.toString())
      .collection("weeks")
      .doc(week.toString())
      .collection("picks")
      .get();
    
    console.log(`   Picks found: ${picksSnapshot.size}`);
    
    if (picksSnapshot.size > 0) {
      picksSnapshot.docs.forEach((pickDoc) => {
        const pick = pickDoc.data();
        console.log(`   - Game ${pick.gameId}: selectedTeam="${pick.selectedTeam}", result="${pick.result || 'pending'}", locked=${pick.locked}`);
      });
    }
  }
  
  console.log("\n=== Games for Week 17 ===\n");
  
  const gamesSnapshot = await db
    .collection("games")
    .where("week", "==", week)
    .where("year", "==", year)
    .get();
  
  console.log(`Found ${gamesSnapshot.size} games\n`);
  
  gamesSnapshot.docs.forEach((gameDoc) => {
    const game = gameDoc.data();
    console.log(`Game ${gameDoc.id}:`);
    console.log(`  ${game.away?.name} (${game.away?.id}) @ ${game.home?.name} (${game.home?.id})`);
    console.log(`  Status: ${game.status?.state || game.status}`);
    console.log(`  Score: ${game.away?.score}-${game.home?.score}`);
    console.log(`  Has eventId: ${!!game.eventId}`);
    console.log(`  Has logos: away=${!!game.away?.logo}, home=${!!game.home?.logo}`);
    console.log();
  });
}

// Run debug
debugPicks()
  .then(() => {
    console.log("\n✅ Debug complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Debug failed:", error);
    process.exit(1);
  });
