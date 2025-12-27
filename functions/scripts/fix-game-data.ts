import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase Admin with service account
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

/**
 * Fix game data to match NormalizedGame interface
 */
async function fixGameData() {
  const db = admin.firestore();
  
  console.log("=== Fixing Game Data Structure ===\n");
  
  const gamesSnapshot = await db.collection("games").get();
  
  console.log(`Found ${gamesSnapshot.size} games to check\n`);
  
  let fixedCount = 0;
  let skippedCount = 0;
  let refetchCount = 0;
  
  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const gameId = gameDoc.id;
    
    // Check if game needs fixing
    const needsFix = 
      !gameData.eventId ||
      typeof gameData.status === 'string' ||
      !gameData.away?.logo ||
      !gameData.home?.logo ||
      !gameData.status?.state;
    
    if (!needsFix) {
      skippedCount++;
      continue;
    }
    
    console.log(`Fixing game ${gameId}...`);
    
    try {
      // First try to get data from the scoreboard API which has logos for all games
      const week = gameData.week;
      const year = gameData.year;
      const scoreboardResponse = await fetch(
        `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=2&week=${week}`
      );
      
      let eventData = null;
      if (scoreboardResponse.ok) {
        const scoreboardData = await scoreboardResponse.json();
        const event = scoreboardData.events?.find((e: any) => e.id === gameId);
        if (event) {
          eventData = event;
        }
      }
      
      // Fallback to summary API if not found in scoreboard
      if (!eventData) {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`
        );
        
        if (!response.ok) {
          console.log(`  ⚠️  Failed to fetch (HTTP ${response.status}), using existing data`);
          
          // Fix with existing data
          const updates: any = {};
          
          if (!gameData.eventId) {
            updates.eventId = gameId;
          }
          
          if (typeof gameData.status === 'string') {
            const statusState = gameData.status === 'post' ? 'post' : 
                              gameData.status === 'in' ? 'in' : 'pre';
            updates.status = {
              state: statusState,
              displayText: gameData.status,
              detail: `${gameData.away?.score || 0}–${gameData.home?.score || 0}`
            };
          }
          
          if (Object.keys(updates).length > 0) {
            await gameDoc.ref.update(updates);
            fixedCount++;
            console.log(`  ✓ Fixed with existing data`);
          }
          
          continue;
        }
        
        const data = await response.json();
        eventData = data.header?.competitions?.[0] ? { competitions: [data.header.competitions[0]] } : null;
      }
      
      if (!eventData || !eventData.competitions || eventData.competitions.length === 0) {
        console.log(`  ⚠️  No event data found`);
        continue;
      }
      
      const competition = eventData.competitions[0];
      const competitors = competition.competitors || [];
      const homeTeam = competitors.find((c: any) => c.homeAway === "home");
      const awayTeam = competitors.find((c: any) => c.homeAway === "away");
      
      if (!homeTeam || !awayTeam) {
        console.log(`  ⚠️  Missing team data`);
        continue;
      }
      
      // Determine status
      const statusType = competition.status?.type;
      let state: "pre" | "in" | "post";
      if (statusType?.completed) {
        state = "post";
      } else if (statusType?.state === "pre") {
        state = "pre";
      } else {
        state = "in";
      }
      
      // Build display text
      let displayText: string;
      let detail: string | undefined;
      
      if (state === "post") {
        displayText = "Final";
        detail = `${awayTeam.score ?? 0}–${homeTeam.score ?? 0}`;
      } else if (state === "in") {
        displayText = `${awayTeam.score ?? 0}–${homeTeam.score ?? 0}`;
        if (competition.status?.displayClock) {
          detail = competition.status.displayClock;
        }
      } else {
        const gameDate = new Date(competition.date || gameData.date);
        displayText = gameDate.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      }
      
      // Update game with complete data
      const updatedGame: any = {
        eventId: gameId,
        week: gameData.week,
        year: gameData.year,
        date: competition.date || gameData.date,
        status: {
          state,
          displayText,
          detail: detail || null,
        },
        home: {
          id: homeTeam.team.id,
          name: homeTeam.team.displayName || homeTeam.team.name,
          abbreviation: homeTeam.team.abbreviation,
          score: parseInt(homeTeam.score) || 0,
        },
        away: {
          id: awayTeam.team.id,
          name: awayTeam.team.displayName || awayTeam.team.name,
          abbreviation: awayTeam.team.abbreviation,
          score: parseInt(awayTeam.score) || 0,
        },
      };
      
      // Add logos if available
      if (homeTeam.team.logo) {
        updatedGame.home.logo = homeTeam.team.logo;
      }
      if (awayTeam.team.logo) {
        updatedGame.away.logo = awayTeam.team.logo;
      }
      
      // Add records if available
      if (homeTeam.records?.[0]?.summary) {
        updatedGame.home.record = homeTeam.records[0].summary;
      }
      if (awayTeam.records?.[0]?.summary) {
        updatedGame.away.record = awayTeam.records[0].summary;
      }
      
      await gameDoc.ref.set(updatedGame, { merge: true });
      
      refetchCount++;
      console.log(`  ✓ Refetched and updated`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }
  
  console.log("\n=== Fix Complete ===");
  console.log(`Games refetched: ${refetchCount}`);
  console.log(`Games fixed with existing data: ${fixedCount}`);
  console.log(`Games skipped (already correct): ${skippedCount}`);
}

// Run fix
fixGameData()
  .then(() => {
    console.log("\n✅ Fix complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fix failed:", error);
    process.exit(1);
  });
