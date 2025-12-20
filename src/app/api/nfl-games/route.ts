import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

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
      
      // If cache exists and is less than 1 hour old, return it
      if (cacheDoc.exists) {
        const cachedData = cacheDoc.data();
        if (cachedData && cachedData.timestamp) {
          const cacheTime = cachedData.timestamp.toDate();
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          
          if (cacheTime > oneHourAgo) {
            return NextResponse.json(cachedData.games);
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
    
    // Transform the data to make it easier to work with
    const games = data.events?.map((event: {
      id: string;
      date: string;
      name: string;
      shortName: string;
      competitions: Array<{
        competitors: Array<{
          team: {
            id: string;
            displayName: string;
            logo: string;
          };
          score?: number;
          homeAway: string;
        }>;
      }>;
      status: {
        type: {
          state: string;
        };
      };
    }) => ({
      id: event.id,
      date: event.date,
      name: event.name,
      shortName: event.shortName,
      teams: {
        home: {
          id: event.competitions[0].competitors[0].team.id,
          name: event.competitions[0].competitors[0].team.displayName,
          logo: event.competitions[0].competitors[0].team.logo,
          score: event.competitions[0].competitors[0].score,
        },
        away: {
          id: event.competitions[0].competitors[1].team.id,
          name: event.competitions[0].competitors[1].team.displayName,
          logo: event.competitions[0].competitors[1].team.logo,
          score: event.competitions[0].competitors[1].score,
        },
      },
      status: event.status.type.state,
      completed: event.status.type.state === "post",
    })) || [];
    
    // Cache the data in Firestore if available
    if (adminDb) {
      const cacheKey = `nfl-games-${year}-${week || "current"}`;
      await adminDb.collection("cache").doc(cacheKey).set({
        games,
        timestamp: Timestamp.now(),
      });
    }
    
    return NextResponse.json(games);
  } catch (error) {
    console.error("Error fetching NFL games:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFL games" },
      { status: 500 }
    );
  }
}
