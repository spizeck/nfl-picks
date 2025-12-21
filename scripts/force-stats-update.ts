import { getAdminDb } from "../src/lib/firebase-admin";

async function forceStatsUpdate() {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("Firebase Admin not configured");
    process.exit(1);
  }

  console.log("Clearing stats update metadata to force recalculation...");
  
  // Delete the metadata document to bypass rate limiting and force recalculation
  await adminDb.collection("metadata").doc("statsUpdate").delete();
  
  console.log("✓ Metadata cleared");
  console.log("\nNow call the /api/update-stats endpoint to recalculate all stats.");
  console.log("You can do this by:");
  console.log("1. Opening your browser to: http://localhost:3000");
  console.log("2. Opening the browser console");
  console.log("3. Running: fetch('/api/update-stats', { method: 'POST' }).then(r => r.json()).then(console.log)");
  
  process.exit(0);
}

forceStatsUpdate().catch(console.error);
