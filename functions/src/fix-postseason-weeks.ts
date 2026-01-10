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
      // First, let's check what games exist in January/February 2025
      const allGamesSnapshot = await db
        .collection("games")
        .get();
      
      console.log(`Total games in database: ${allGamesSnapshot.size}`);
      
      const januaryGames = allGamesSnapshot.docs.filter(doc => {
        const game = doc.data();
        const gameDate = new Date(game.date);
        const gameMonth = gameDate.getMonth();
        const gameYear = gameDate.getFullYear();
        return (gameMonth === 0 || gameMonth === 1) && gameYear === 2025;
      });
      
      console.log(`Games in Jan/Feb 2025: ${januaryGames.length}`);
      
      // Log details about these games
      januaryGames.forEach(doc => {
        const game = doc.data();
        console.log(`Game ${doc.id}: week=${game.week}, year=${game.year}, date=${game.date}`);
      });
      
      const batch = db.batch();
      let updatedCount = 0;
      
      // Fix games that have wrong week numbers
      for (const doc of januaryGames) {
        const game = doc.data();
        const gameDate = new Date(game.date);
        const gameDay = gameDate.getDate();
        const gameMonth = gameDate.getMonth();
        
        let correctWeek = game.week;
        
        // Determine correct week based on date
        if (gameMonth === 0) { // January
          if (gameDay <= 17) correctWeek = 19; // Wild Card
          else if (gameDay <= 24) correctWeek = 20; // Divisional
          else correctWeek = 21; // Conference
        } else if (gameMonth === 1) { // February
          correctWeek = 22; // Super Bowl
        }
        
        // Only update if week is wrong
        if (game.week !== correctWeek) {
          console.log(`Updating game ${doc.id}: week ${game.week} -> ${correctWeek}, date: ${game.date}`);
          
          batch.update(doc.ref, {
            week: correctWeek,
            year: 2024, // Ensure it's stored as 2024 season
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
        totalGames: allGamesSnapshot.size,
        januaryGames: januaryGames.length,
        gamesChecked: januaryGames.map(doc => {
          const game = doc.data();
          return {
            id: doc.id,
            week: game.week,
            year: game.year,
            date: game.date,
          };
        }),
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
