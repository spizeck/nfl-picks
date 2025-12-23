import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get("week");
    const year = searchParams.get("year") || new Date().getFullYear().toString();
    
    const adminDb = getAdminDb();
    if (!adminDb) {
      // If Firebase Admin is not configured, fall back to ESPN API
      console.warn("Firebase Admin not configured, falling back to ESPN API");
      const espnUrl = week 
        ? `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&year=${year}`
        : `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`;
      
      const response = await fetch(espnUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch data from ESPN API");
      }
      
      const data = await response.json();
      // Normalize ESPN events before returning
      const normalized = (data.events || []).map((event: unknown) => {
        try {
          return normalizeESPNGame(event as never);
        } catch (error) {
          console.error(`Error normalizing event ${(event as { id?: string }).id || 'unknown'}:`, error);
          return null;
        }
      }).filter((game: NormalizedGame | null): game is NormalizedGame => game !== null);
      return NextResponse.json(normalized);
    }

    // Query games from Firestore
    const weekNumber = week ? parseInt(week, 10) : null;
    const yearNumber = parseInt(year, 10);
    
    let query = adminDb
      .collection("games")
      .where("year", "==", yearNumber);
    
    if (weekNumber) {
      query = query.where("week", "==", weekNumber);
    }
    
    // Order by date to ensure consistent ordering
    query = query.orderBy("date", "asc");
    
    const snapshot = await query.get();
    const games = snapshot.docs.map(doc => {
      const data = doc.data();
      // Convert Firestore Timestamps to ISO strings for JSON serialization
      if (data.lastUpdated && data.lastUpdated.toDate) {
        data.lastUpdated = data.lastUpdated.toDate().toISOString();
      }
      return data;
    });

    // If no games found in Firestore, fall back to ESPN API
    if (games.length === 0) {
      console.log(`No games found in Firestore for week ${week}, year ${year}, falling back to ESPN API`);
      
      const espnUrl = week 
        ? `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&year=${year}`
        : `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`;
      
      const response = await fetch(espnUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch data from ESPN API");
      }
      
      const data = await response.json();
      // Normalize ESPN events before returning
      const normalized = (data.events || []).map((event: unknown) => {
        try {
          return normalizeESPNGame(event as never);
        } catch (error) {
          console.error(`Error normalizing event ${(event as { id?: string }).id || 'unknown'}:`, error);
          return null;
        }
      }).filter((game: NormalizedGame | null): game is NormalizedGame => game !== null);
      return NextResponse.json(normalized);
    }

    return NextResponse.json(games);
  } catch (error) {
    console.error("Error fetching games:", error);
    return NextResponse.json(
      { error: "Failed to fetch games" },
      { status: 500 }
    );
  }
}
