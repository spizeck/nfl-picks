import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { migratePicks } from "./migrate-picks";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const runMigrationHttp = onRequest(async (request, response) => {
  // Only allow POST requests
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }

  // Check for authorization (you should add proper auth here)
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    response.status(401).send("Unauthorized");
    return;
  }

  try {
    console.log("Starting migration...");
    const result = await migratePicks();
    console.log("Migration completed successfully");
    
    response.status(200).json({
      success: true,
      message: "Migration completed successfully",
      result,
    });
  } catch (error) {
    console.error("Migration failed:", error);
    response.status(500).json({
      success: false,
      message: "Migration failed",
      error: (error as Error).message,
    });
  }
});
