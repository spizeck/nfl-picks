import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { NormalizedGame } from "@/lib/espn-data";

export async function POST() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    // Fetch all completed games from ESPN API
    const gamesResponse = await fetch(
      `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/api/nfl-games`
    );
    const rawEvents = await gamesResponse.json();

    // Import normalizeESPNGame dynamically to avoid client-side imports
    const { normalizeESPNGame } = await import("@/lib/espn-data");

    const normalizedGames = (rawEvents as Array<Record<string, unknown>>)
      .map((event) => {
        try {
          return normalizeESPNGame(event as never);
        } catch (err) {
          console.error("Error normalizing event:", err);
          return null;
        }
      })
      .filter((game): game is NormalizedGame => game !== null);

    const completedGames = normalizedGames.filter(
      (game) => game.status.state === "post"
    );

    console.log(`Processing ${completedGames.length} completed games`);

    // Get all users
    const usersSnapshot = await adminDb.collection("users").get();
    const updates: Promise<unknown>[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Get user's picks
      const picksSnapshot = await adminDb
        .collection("users")
        .doc(userId)
        .collection("picks")
        .get();

      let seasonWins = 0;
      let seasonLosses = 0;

      // Calculate wins/losses for each pick
      picksSnapshot.docs.forEach((pickDoc) => {
        const pick = pickDoc.data();
        const game = completedGames.find((g) => g.eventId === pick.gameId);

        if (game) {
          const homeScore = game.home.score ?? 0;
          const awayScore = game.away.score ?? 0;

          let winningSide: "away" | "home" | null = null;
          if (homeScore > awayScore) {
            winningSide = "home";
          } else if (awayScore > homeScore) {
            winningSide = "away";
          }

          if (winningSide) {
            const userPickedCorrectly =
              pick.selectedTeam === winningSide ||
              pick.selectedTeam ===
                (winningSide === "home" ? game.home.id : game.away.id);

            if (userPickedCorrectly) {
              seasonWins++;
            } else {
              seasonLosses++;
            }
          }
        }
      });

      // Update user stats
      const currentYear = new Date().getFullYear();
      const updatePromise = adminDb
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

      updates.push(updatePromise);
    }

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      usersUpdated: usersSnapshot.docs.length,
      completedGames: completedGames.length,
    });
  } catch (error) {
    console.error("Error updating stats:", error);
    return NextResponse.json(
      {
        error: "Failed to update stats",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
