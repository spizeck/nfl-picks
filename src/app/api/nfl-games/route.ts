import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";

// ESPN API endpoint for NFL scores and schedule
const ESPN_API_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get("week");
    const year = searchParams.get("year") || new Date().getFullYear().toString();
    
    // Check if we have cached data in Firestore
    const adminDb = getAdminDb();
    if (!adminDb) {
      // If Firebase Admin is not configured, fetch directly from ESPN
      console.warn("Firebase Admin not configured, fetching directly from ESPN");
    } else {
      const cacheKey = `nfl-games-${year}-${week || "current"}`;
      const cacheDoc = await adminDb.collection("cache").doc(cacheKey).get();
      
      // If cache exists and is less than 15 minutes old, return it
      if (cacheDoc.exists) {
        const cachedData = cacheDoc.data();
        if (cachedData && cachedData.timestamp) {
          const cacheTime = cachedData.timestamp.toDate();
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          
          if (cacheTime > fifteenMinutesAgo) {
            return NextResponse.json(cachedData.events || cachedData.games || []);
          }
        }
      }
    }
    
    // Fetch fresh data from ESPN API
    const espnUrl = week ? `${ESPN_API_URL}?week=${week}&year=${year}` : ESPN_API_URL;
    const response = await fetch(espnUrl);
    
    if (!response.ok) {
      throw new Error("Failed to fetch data from ESPN API");
    }
    
    const data = await response.json();
    
    // Return raw ESPN events data
    const events = data.events || [];
    
    // Normalize the events for individual game documents
    const normalizedGames: (NormalizedGame & { week: number; year: number })[] = [];
    const weekNumber = week ? parseInt(week, 10) : 0;
    const yearNumber = parseInt(year, 10);
    
    for (const event of events) {
      try {
        const normalized = normalizeESPNGame(event);
        normalizedGames.push({
          ...normalized,
          week: weekNumber,
          year: yearNumber,
        });
      } catch (error) {
        console.error(`Error normalizing event ${event.id}:`, error);
        // Continue processing other events even if one fails
      }
    }
    
    // Cache the data in Firestore if available
    if (adminDb) {
      const cacheKey = `nfl-games-${year}-${week || "current"}`;
      
      // Use batch write for atomic updates
      const batch = adminDb.batch();
      
      // Update cache document (for backward compatibility)
      const cacheRef = adminDb.collection("cache").doc(cacheKey);
      batch.set(cacheRef, {
        events,
        timestamp: Timestamp.now(),
      });
      
      // Write each game to individual documents
      for (const game of normalizedGames) {
        const gameRef = adminDb.collection("games").doc(game.eventId);
        batch.set(gameRef, {
          ...game,
          lastUpdated: Timestamp.now(),
        }, { merge: true });
      }
      
      // Commit all writes atomically
      await batch.commit();
      
      console.log(`Cached ${events.length} events and ${normalizedGames.length} individual games for week ${week}, year ${year}`);
    }
    
    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching NFL games:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFL games" },
      { status: 500 }
    );
  }
}
