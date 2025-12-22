import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { NormalizedGame } from "@/lib/espn-data";

/**
 * Recalculate stats for a specific user
 * Called when a user's picks change or when needed
 */
export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const currentYear = new Date().getFullYear();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    // Fetch all completed games
    const allCompletedGames: NormalizedGame[] = [];
    const { normalizeESPNGame } = await import("@/lib/espn-data");
    
    for (let week = 1; week <= 18; week++) {
      try {
        const gamesResponse = await fetch(
          `${baseUrl}/api/nfl-games?week=${week}&year=${currentYear}`
        );
        const rawEvents = await gamesResponse.json();

        const normalizedGames = (rawEvents as Array<Record<string, unknown>>)
          .map((event) => {
            try {
              return normalizeESPNGame(event as never);
            } catch (err) {
              return null;
            }
          })
          .filter((game): game is NormalizedGame => game !== null);

        const completedGames = normalizedGames.filter(
          (game) => game.status.state === "post"
        );
        
        allCompletedGames.push(...completedGames);
      } catch (err) {
        console.error(`Error fetching week ${week}:`, err);
      }
    }

    // Get user's picks
    const picksSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .collection("picks")
      .get();

    let seasonWins = 0;
    let seasonLosses = 0;

    // Calculate wins/losses
    picksSnapshot.docs.forEach((pickDoc) => {
      const pick = pickDoc.data();
      const game = allCompletedGames.find((g) => g.eventId === pick.gameId);

      if (game) {
        // Convert scores to numbers for proper comparison
        const homeScore = Number(game.home.score ?? 0);
        const awayScore = Number(game.away.score ?? 0);

        // Determine winning team ID
        let winningTeamId: string | null = null;
        if (homeScore > awayScore) {
          winningTeamId = game.home.id;
        } else if (awayScore > homeScore) {
          winningTeamId = game.away.id;
        }

        if (winningTeamId) {
          // Normalize pick to team ID
          let userPickedTeamId = pick.selectedTeam;
          if (pick.selectedTeam === "home") {
            userPickedTeamId = game.home.id;
          } else if (pick.selectedTeam === "away") {
            userPickedTeamId = game.away.id;
          }

          // Compare team IDs
          if (userPickedTeamId === winningTeamId) {
            seasonWins++;
          } else {
            seasonLosses++;
          }
        }
      }
    });

    // Update user stats
    await adminDb
      .collection("users")
      .doc(userId)
      .set(
        {
          stats: {
            [`season${currentYear}`]: {
              wins: seasonWins,
              losses: seasonLosses,
              winPercentage:
                seasonWins + seasonLosses > 0
                  ? (seasonWins / (seasonWins + seasonLosses)) * 100
                  : 0,
            },
            allTime: {
              wins: seasonWins,
              losses: seasonLosses,
              winPercentage:
                seasonWins + seasonLosses > 0
                  ? (seasonWins / (seasonWins + seasonLosses)) * 100
                  : 0,
            },
          },
          lastStatsUpdate: new Date(),
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      userId,
      wins: seasonWins,
      losses: seasonLosses,
      completedGames: allCompletedGames.length,
    });
  } catch (error) {
    console.error("Error recalculating user stats:", error);
    return NextResponse.json(
      {
        error: "Failed to recalculate stats",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
