import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { normalizeESPNGame } from "./lib/espn-data";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Callable function to force update games for a specific week
 * Call this function directly to trigger an immediate update
 */
export const forceUpdateWeek = onCall(async (request) => {
  const { week, year } = request.data;
  
  // Validate input
  if (!week || !year) {
    throw new Error("Both week and year must be provided");
  }
  
  console.log(`Force updating week ${week} games for year ${year}`);
  
  const db = admin.firestore();
  
  try {
    // Convert internal week numbers (19-22) to ESPN postseason weeks
    let espnWeek = week;
    let isPostseason = false;
    
    if (week >= 19 && week <= 22) {
      isPostseason = true;
      // Map internal weeks to ESPN postseason weeks
      if (week === 19) espnWeek = 1; // Wild Card
      else if (week === 20) espnWeek = 2; // Divisional
      else if (week === 21) espnWeek = 3; // Conference Championships
      else if (week === 22) espnWeek = 5; // Super Bowl
      
      console.log(`Postseason: converting internal week ${week} to ESPN week ${espnWeek}`);
    }
    
    const espnUrl = isPostseason
      ? `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&week=${espnWeek}`
      : `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${espnWeek}&year=${year}`;
    
    console.log(`Fetching week ${week} game data from ESPN API: ${espnUrl}`);
    
    const response = await fetch(espnUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch data from ESPN API: ${response.statusText}`);
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    console.log(`Found ${events.length} games for week ${week}`);
    
    // Process each game
    const batch = db.batch();
    let updatedCount = 0;
    let finalGames = [];
    
    for (const event of events) {
      try {
        const normalizedGame = normalizeESPNGame(event);
        
        // Check if this is one of the final games (Monday/Tuesday)
        const gameDate = new Date(normalizedGame.date);
        const dayOfWeek = gameDate.getDay();
        const isFinalGame = dayOfWeek === 1 || dayOfWeek === 2; // Sunday=0, Monday=1, Tuesday=2
        
        if (week === 17 && isFinalGame) {
          finalGames.push(`${normalizedGame.away.name} vs ${normalizedGame.home.name}`);
        }
        
        // Reference to the game document
        const gameRef = db.collection("games").doc(normalizedGame.eventId);
        
        // Always update for force refresh
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
            ...(normalizedGame.status.detail !== undefined && { detail: normalizedGame.status.detail }),
          },
          week: week,
          year: year,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        
        updatedCount++;
      } catch (error) {
        console.error(`Error processing game ${(event as any).id}:`, error);
      }
    }
    
    // Commit all updates
    await batch.commit();
    
    // Update the last update timestamp
    await db.collection("config").doc("lastGameUpdate").set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      week: week,
      year: year,
    });
    
    const result = {
      success: true,
      message: `Successfully updated ${updatedCount} games for week ${week}`,
      finalGames: week === 17 ? finalGames : undefined,
    };
    
    console.log(result.message);
    if (finalGames.length > 0) {
      console.log("Final week 17 games updated:", finalGames);
    }
    
    return result;
  } catch (error) {
    console.error(`Error force updating week ${week}:`, error);
    throw error;
  }
});
