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
    
    // Cache the data in Firestore if available
    if (adminDb) {
      const cacheKey = `nfl-games-${year}-${week || "current"}`;
      await adminDb.collection("cache").doc(cacheKey).set({
        events,
        timestamp: Timestamp.now(),
      });
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
