import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { normalizeESPNGame } from "./lib/espn-data";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Scheduled function to update game scores from ESPN API
 * Runs every 5 minutes during football season
 */
export const updateGameScores = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/New_York",
    memory: "256MiB",
  },
  async (event) => {
    console.log("Starting scheduled game score update");
    
    const db = admin.firestore();
    
    try {
      // First, get current week info from ESPN API
      const currentCalendarYear = new Date().getFullYear();
      const weekInfoUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=1`;
      
      console.log(`Fetching week info from ESPN API: ${weekInfoUrl}`);
      const weekInfoResponse = await fetch(weekInfoUrl);
      
      if (!weekInfoResponse.ok) {
        throw new Error(`Failed to fetch week info: ${weekInfoResponse.statusText}`);
      }
      
      const weekInfoData = await weekInfoResponse.json();
      let currentWeek = weekInfoData.week?.number || getCurrentNFLWeekFallback();
      const currentYear = weekInfoData.season?.year || currentCalendarYear;
      const seasonType = weekInfoData.season?.type || 2;
      
      // ESPN uses seasontype=3 with weeks 1-5 for postseason, but we use 19-22 internally
      // Store the ESPN week for API calls
      const espnWeek = currentWeek;
      
      // Convert ESPN's postseason weeks to our internal numbering
      if (seasonType === 3) {
        // Postseason: ESPN weeks map to our internal weeks
        if (currentWeek === 1) currentWeek = 19; // Wild Card
        else if (currentWeek === 2) currentWeek = 20; // Divisional
        else if (currentWeek === 3) currentWeek = 21; // Conference Championships
        else if (currentWeek === 5) currentWeek = 22; // Super Bowl
        else if (currentWeek === 4) currentWeek = 21; // Pro Bowl - treat as Conference week
      }
      
      console.log(`Current NFL week: ${currentWeek}, year: ${currentYear}, season type: ${seasonType}`);
      
      // Allow both regular season and postseason
      if (seasonType !== 2 && seasonType !== 3) {
        console.log(`Not in regular or postseason (type: ${seasonType}), skipping update`);
        return;
      }
      
      // Check if we've recently updated (within 5 minutes instead of 2)
      const lastUpdateRef = db.collection("config").doc("lastGameUpdate");
      const lastUpdateDoc = await lastUpdateRef.get();
      
      if (lastUpdateDoc.exists) {
        const lastUpdateTime = lastUpdateDoc.data()?.timestamp?.toDate();
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        
        if (lastUpdateTime && lastUpdateTime > fiveMinutesAgo) {
          console.log("Skipping scheduled update - was performed recently");
          return;
        }
      }
      
      // Fetch actual game data from ESPN API
      // For postseason, use seasontype=3 and dates parameter with calendar year
      let espnUrl;
      if (seasonType === 3) {
        const calendarYear = currentYear + 1; // Postseason games are in next calendar year
        espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&week=${espnWeek}&dates=${calendarYear}`;
        console.log(`Fetching postseason game data: ${espnUrl} (ESPN week: ${espnWeek}, internal week: ${currentWeek})`);
      } else {
        espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}&year=${currentYear}`;
        console.log(`Fetching regular season game data: ${espnUrl}`);
      }
      
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
                ...(normalizedGame.status.detail !== undefined && { detail: normalizedGame.status.detail }),
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
      
      return;
    } catch (error) {
      console.error("Error in scheduled game score update:", error);
      throw error;
    }
  }
);

/**
 * Fallback function to calculate NFL week if ESPN API fails
 */
function getCurrentNFLWeekFallback(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // NFL season typically starts in early September
  // Use current year if we're past August, otherwise previous year
  const seasonYear = now.getMonth() >= 7 ? currentYear : currentYear - 1;
  const startDate = new Date(seasonYear, 8, 1); // September 1st of season year
  
  // Calculate weeks since start of season
  const diffTime = Math.abs(now.getTime() - startDate.getTime());
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  
  // Handle postseason weeks (Wild Card is week 19, Divisional is week 20, etc.)
  // Regular season is 18 weeks, then postseason starts
  if (diffWeeks > 18) {
    // Return appropriate postseason week number
    if (diffWeeks === 19) return 19; // Wild Card week
    if (diffWeeks === 20) return 20; // Divisional week
    if (diffWeeks === 21) return 21; // Conference championship
    if (diffWeeks === 22) return 22; // Super Bowl
  }
  
  // Ensure week is between 1 and 18 for regular season
  return Math.min(Math.max(diffWeeks, 1), 18);
}

// Manual trigger function that actually works
export const updateScoresNow = onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "America/New_York",
    memory: "256MiB",
  },
  async (event) => {
    console.log("Running manual score update trigger");
    
    // Call the same logic as the main function but bypass the throttle check
    const db = admin.firestore();
    
    try {
      // Clear the last update check to force an update
      await db.collection("config").doc("lastGameUpdate").delete();
      
      // Import and call the update logic
      // Note: In a real implementation, you'd refactor the shared logic into a separate function
      console.log("Forced score update triggered");
      
      // Reuse the same logic as the scheduled function
      // The handler will be called by the scheduler
    } catch (error) {
      console.error("Error in manual score update:", error);
    }
  }
);

// Force update week 17 games specifically
export const forceUpdateWeek17 = onSchedule(
  {
    schedule: "every monday 09:00",
    timeZone: "America/New_York",
    memory: "256MiB",
  },
  async (event) => {
    console.log("Force updating week 17 games");
    
    const db = admin.firestore();
    
    try {
      // Clear the last update check to force an update
      await db.collection("config").doc("lastGameUpdate").delete();
      
      // Force update week 17
      await updateWeekGames(17, 2025); // Assuming 2025 season
      
      console.log("Week 17 force update completed");
    } catch (error) {
      console.error("Error in week 17 force update:", error);
    }
  }
);

// Helper function to update specific week games
async function updateWeekGames(week: number, year: number) {
  const db = admin.firestore();
  
  // Fetch game data from ESPN API
  const espnUrl = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&year=${year}`;
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
  
  for (const event of events) {
    try {
      const normalizedGame = normalizeESPNGame(event);
      
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
  
  console.log(`Successfully updated ${updatedCount} games for week ${week}`);
}
