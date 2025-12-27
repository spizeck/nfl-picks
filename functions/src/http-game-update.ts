import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { normalizeESPNGame } from "./lib/espn-data";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * HTTP endpoint to manually update game scores for a specific week
 * Usage: /updateGames?week=17
 */
export const updateGamesByWeek = onRequest(
  {
    memory: "256MiB",
  },
  async (request, response) => {
    console.log("HTTP game score update triggered");
    
    const db = admin.firestore();
    const currentYear = 2024; // Hardcode to 2024 for current NFL season
    
    // Get week from query parameter
    const week = request.query.week ? parseInt(request.query.week as string) : null;
    
    if (!week || week < 1 || week > 18) {
      response.status(400).json({ error: "Valid week parameter (1-18) is required" });
      return;
    }
    
    console.log(`Updating week ${week} for year ${currentYear}`);
    
    try {
      // Fetch data from ESPN API
      const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&year=${currentYear}`;
      console.log(`Fetching data from ESPN API: ${espnUrl}`);
      
      const fetchResponse = await fetch(espnUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch data from ESPN API: ${fetchResponse.statusText}`);
      }
      
      const data = await fetchResponse.json();
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
              week: week,
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
      
      console.log(`Successfully processed ${events.length} games (${updatedCount} with status changes, ${skippedCount} skipped)`);
      
      response.json({
        success: true,
        message: `Processed week ${week} - ${events.length} games (${updatedCount} with status changes, ${skippedCount} skipped)`,
        week: week,
        year: currentYear,
        gamesUpdated: events.length,
        statusChanges: updatedCount,
        gamesSkipped: skippedCount,
      });
    } catch (error) {
      console.error("Error in HTTP game score update:", error);
      response.status(500).json({ error: `Failed to update games: ${(error as Error).message}` });
    }
  }
);
