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
  process.exit(1);
}

const serviceAccountPath = path.join(functionsDir, serviceAccountFile);
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/**
 * Verification script to check migration status
 */
async function verifyMigration() {
  const db = admin.firestore();
  
  console.log("=== Migration Verification ===\n");
  
  const usersSnapshot = await db.collection("users").get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`\n📋 User: ${userData.displayName || userId}`);
    console.log(`   ID: ${userId}`);
    
    // Check old structure
    const oldPicksSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("picks")
      .get();
    
    console.log(`   Old structure picks: ${oldPicksSnapshot.size}`);
    
    if (oldPicksSnapshot.size > 0) {
      // Show sample of old picks
      const samplePick = oldPicksSnapshot.docs[0].data();
      console.log(`   Sample old pick format: selectedTeam="${samplePick.selectedTeam}"`);
    }
    
    // Check new structure
    const seasonsSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("seasons")
      .get();
    
    console.log(`   Seasons in new structure: ${seasonsSnapshot.size}`);
    
    if (seasonsSnapshot.size > 0) {
      for (const seasonDoc of seasonsSnapshot.docs) {
        const year = seasonDoc.id;
        const seasonData = seasonDoc.data();
        
        const weeksSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(year)
          .collection("weeks")
          .get();
        
        let totalPicks = 0;
        for (const weekDoc of weeksSnapshot.docs) {
          const picksSnapshot = await db
            .collection("users")
            .doc(userId)
            .collection("seasons")
            .doc(year)
            .collection("weeks")
            .doc(weekDoc.id)
            .collection("picks")
            .get();
          totalPicks += picksSnapshot.size;
        }
        
        console.log(`   └─ Season ${year}: ${weeksSnapshot.size} weeks, ${totalPicks} picks`);
        console.log(`      Stats: ${seasonData.totalWins || 0}W-${seasonData.totalLosses || 0}L`);
      }
    } else {
      console.log(`   ⚠️  NO SEASONS FOUND - Migration incomplete!`);
    }
  }
  
  console.log("\n=== Summary ===");
  console.log("Check above for users with '⚠️ NO SEASONS FOUND'");
}

// Run verification
verifyMigration()
  .then(() => {
    console.log("\n✅ Verification complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });
