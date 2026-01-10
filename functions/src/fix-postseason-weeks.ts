import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * One-time migration function to fix postseason games that were stored with wrong week numbers
 * This fixes games that were stored as week 1-4 when they should be week 19-22
 */
export const fixPostseasonWeeks = onRequest(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req, res) => {
    console.log("Starting postseason week number fix");
    
    const db = admin.firestore();
    
    try {
      // Find all games from 2024 season with week 1-4 that are actually postseason games
      // Postseason games happen in January 2025, so we can identify them by date
      const gamesSnapshot = await db
        .collection("games")
        .where("year", "==", 2024)
        .where("week", "in", [1, 2, 3, 4])
        .get();
      
      console.log(`Found ${gamesSnapshot.size} games to check`);
      
      const batch = db.batch();
      let updatedCount = 0;
      
      for (const doc of gamesSnapshot.docs) {
        const game = doc.data();
        const gameDate = new Date(game.date);
        const gameMonth = gameDate.getMonth(); // 0 = January
        const gameYear = gameDate.getFullYear();
        
        // If the game is in January or February 2025, it's a postseason game
        if ((gameMonth === 0 || gameMonth === 1) && gameYear === 2025) {
          let correctWeek = game.week;
          
          // Map old week numbers to correct postseason week numbers
          if (game.week === 1) correctWeek = 19; // Wild Card
          else if (game.week === 2) correctWeek = 20; // Divisional
          else if (game.week === 3) correctWeek = 21; // Conference
          else if (game.week === 4) correctWeek = 22; // Super Bowl
          
          console.log(`Updating game ${doc.id}: week ${game.week} -> ${correctWeek}, date: ${game.date}`);
          
          batch.update(doc.ref, {
            week: correctWeek,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          updatedCount++;
        }
      }
      
      if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully updated ${updatedCount} games`);
      } else {
        console.log("No games needed updating");
      }
      
      res.status(200).json({
        success: true,
        message: `Updated ${updatedCount} games`,
        checked: gamesSnapshot.size,
      });
    } catch (error) {
      console.error("Error fixing postseason weeks:", error);
      res.status(500).json({
        success: false,
        error: String(error),
      });
    }
  }
);
