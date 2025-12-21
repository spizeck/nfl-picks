import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");
    const year = searchParams.get("year");

    if (!week || !year) {
      return NextResponse.json(
        { error: "Week and year are required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    // Fetch all games for the week to get game IDs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const gamesResponse = await fetch(`${baseUrl}/api/nfl-games?week=${week}&year=${year}`);
    const rawGames = await gamesResponse.json();
    
    const { normalizeESPNGame } = await import("@/lib/espn-data");
    const gameIds = new Set(
      rawGames.map((event: Record<string, unknown>) => {
        try {
          const game = normalizeESPNGame(event as never);
          return game.eventId;
        } catch {
          return null;
        }
      }).filter(Boolean)
    );

    // Get all users
    const usersSnapshot = await adminDb.collection("users").get();
    const allPicks: Record<string, Array<{ userId: string; displayName: string; photoURL: string; selectedTeam: string }>> = {};

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // Get user's picks for this week
      const picksSnapshot = await adminDb
        .collection("users")
        .doc(userId)
        .collection("picks")
        .get();

      picksSnapshot.docs.forEach((pickDoc) => {
        const pick = pickDoc.data();
        
        // Only include picks for games in this week
        if (gameIds.has(pick.gameId)) {
          if (!allPicks[pick.gameId]) {
            allPicks[pick.gameId] = [];
          }
          
          allPicks[pick.gameId].push({
            userId,
            displayName: userData.displayName || "Unknown",
            photoURL: userData.photoURL || "",
            selectedTeam: pick.selectedTeam,
          });
        }
      });
    }

    return NextResponse.json(allPicks);
  } catch (error) {
    console.error("Error fetching all picks:", error);
    return NextResponse.json(
      { error: "Failed to fetch picks" },
      { status: 500 }
    );
  }
}
