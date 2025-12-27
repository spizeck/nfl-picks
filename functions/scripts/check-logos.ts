import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

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

async function checkLogos() {
  const db = admin.firestore();
  
  const gamesSnapshot = await db
    .collection("games")
    .where("week", "==", 17)
    .where("year", "==", 2025)
    .get();
  
  console.log(`\nChecking ${gamesSnapshot.size} games for Week 17:\n`);
  
  gamesSnapshot.docs.forEach((doc) => {
    const game = doc.data();
    console.log(`${game.away?.name} @ ${game.home?.name}`);
    console.log(`  Away logo: ${game.away?.logo ? '✓ Present' : '✗ Missing'}`);
    console.log(`  Home logo: ${game.home?.logo ? '✓ Present' : '✗ Missing'}`);
    console.log(`  Status: ${game.status?.state || game.status}`);
    console.log();
  });
}

checkLogos()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
