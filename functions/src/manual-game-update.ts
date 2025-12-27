import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { normalizeESPNGame } from "./lib/espn-data";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Callable function to manually update game scores
 * Can be triggered from your app or the Firebase console
 */
export const updateScoresNow = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    console.log("Manual game score update triggered");
    
    const db = admin.firestore();
    const currentYear = 2024; // Hardcode to 2024 for current NFL season
    
    // Allow passing a specific week, otherwise use calculated week
    const requestedWeek = request.data?.week;
    const currentWeek = requestedWeek || getCurrentNFLWeek();
    
    console.log(`Updating week ${currentWeek} for year ${currentYear}`);
    
    try {
      
      // Check if we've recently updated (within last 2 minutes)
      const lastUpdateRef = db.collection("config").doc("lastGameUpdate");
      const lastUpdateDoc = await lastUpdateRef.get();
      
      if (lastUpdateDoc.exists) {
        const lastUpdateTime = lastUpdateDoc.data()?.timestamp?.toDate();
        const now = new Date();
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        
        if (lastUpdateTime && lastUpdateTime > twoMinutesAgo) {
          console.log("Skipping update - was performed recently");
          return {
            success: true,
            message: "Skipped - updated recently",
            gamesUpdated: 0,
            statusChanges: 0,
          };
        }
      }
      
      // Fetch data from ESPN API
      const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&year=${currentYear}`;
      console.log(`Fetching data from ESPN API: ${espnUrl}`);
      
      const response = await fetch(espnUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch data from ESPN API: ${response.statusText}`);
      }
      
      const data = await response.json();
      const events = data.events || [];
      
      console.log(`Found ${events.length} games from ESPN API`);
      
      // Process each game
      const batch = db.batch();
      let updatedCount = 0;
      let skippedCount = 0;
      
      for (const event of events) {
        try {
          const normalizedGame = normalizeESPNGame(event);
          
          // Reference to the game document
          const gameRef = db.collection("games").doc(normalizedGame.eventId);
          
          // Get current game data from Firestore
          const gameDoc = await gameRef.get();
          const currentData = gameDoc.exists ? gameDoc.data() : null;
          
          // Check if we need to update this game
          let needsUpdate = false;
          
          if (!currentData) {
            // New game - always update
            needsUpdate = true;
          } else {
            // Check if scores or status changed
            const awayScoreChanged = currentData.away?.score !== normalizedGame.away.score;
            const homeScoreChanged = currentData.home?.score !== normalizedGame.home.score;
            const statusChanged = currentData.status?.state !== normalizedGame.status.state;
            
            needsUpdate = awayScoreChanged || homeScoreChanged || statusChanged;
          }
          
          if (needsUpdate) {
            // Update the game with latest data
            batch.set(gameRef, {
              eventId: normalizedGame.eventId,
              date: normalizedGame.date,
              away: {
                id: normalizedGame.away.id,
                name: normalizedGame.away.name,
                logo: normalizedGame.away.logo,
                score: normalizedGame.away.score,
              },
              home: {
                id: normalizedGame.home.id,
                name: normalizedGame.home.name,
                logo: normalizedGame.home.logo,
                score: normalizedGame.home.score,
              },
              status: {
                state: normalizedGame.status.state,
                displayText: normalizedGame.status.displayText,
                detail: normalizedGame.status.detail,
              },
              week: currentWeek,
              year: currentYear,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            
            if (currentData && currentData.status?.state !== normalizedGame.status.state) {
              console.log(`Game ${normalizedGame.eventId} status changed from ${currentData.status?.state} to ${normalizedGame.status.state}`);
              updatedCount++;
            }
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`Error processing game ${(event as any).id}:`, error);
        }
      }
      
      // Commit all updates
      await batch.commit();
      
      // Update the last update timestamp
      await lastUpdateRef.set({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        week: currentWeek,
        year: currentYear,
      });
      
      console.log(`Successfully processed ${events.length} games (${updatedCount} with status changes, ${skippedCount} skipped)`);
      
      return {
        success: true,
        message: `Processed ${events.length} games (${updatedCount} with status changes, ${skippedCount} skipped)`,
        gamesUpdated: events.length,
        statusChanges: updatedCount,
        gamesSkipped: skippedCount,
      };
    } catch (error) {
      console.error("Error in manual game score update:", error);
      throw new Error(`Failed to update games: ${(error as Error).message}`);
    }
  }
);

/**
 * Helper function to get current NFL week number
 */
function getCurrentNFLWeek(): number {
  const now = new Date();
  const startDate = new Date(2024, 8, 1); // September 1st, 2024
  
  // Calculate weeks since start of season
  const diffTime = Math.abs(now.getTime() - startDate.getTime());
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  // Ensure week is between 1 and 18
  return Math.min(Math.max(diffWeeks, 1), 18);
}
