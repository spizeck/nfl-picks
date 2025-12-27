import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { migratePicks } from "./migrate-picks";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const runMigration = onCall(async (request) => {
  // Only allow admin to run migration
  if (request.auth?.token.admin !== true) {
    throw new Error("Only admins can run the migration");
  }

  try {
    const result = await migratePicks();
    return { success: true, result };
  } catch (error) {
    console.error("Migration failed:", error);
    throw new Error("Migration failed: " + (error as Error).message);
  }
});
