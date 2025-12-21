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

    const currentYear = new Date().getFullYear();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    // Check last update timestamp from a metadata document
    const metadataRef = adminDb.collection("metadata").doc("statsUpdate");
    const metadataDoc = await metadataRef.get();
    const lastUpdate = metadataDoc.exists ? metadataDoc.data()?.lastUpdate?.toDate() : null;
    const lastCompletedGamesCount = metadataDoc.exists ? metadataDoc.data()?.completedGamesCount || 0 : 0;
    
    // Rate limit: Don't update more than once per minute
    if (lastUpdate) {
      const timeSinceLastUpdate = Date.now() - lastUpdate.getTime();
      const oneMinuteInMs = 60 * 1000;
      
      if (timeSinceLastUpdate < oneMinuteInMs) {
        const secondsRemaining = Math.ceil((oneMinuteInMs - timeSinceLastUpdate) / 1000);
        console.log(`Rate limit: Last update was ${Math.floor(timeSinceLastUpdate / 1000)}s ago. Try again in ${secondsRemaining}s.`);
        return NextResponse.json({
          success: true,
          usersUpdated: 0,
          completedGames: lastCompletedGamesCount,
          rateLimited: true,
          message: `Rate limited. Try again in ${secondsRemaining} seconds.`,
          secondsRemaining
        });
      }
    }
    
    const { normalizeESPNGame } = await import("@/lib/espn-data");
    
    const allCompletedGames: NormalizedGame[] = [];
    
    // Fetch games from all 18 weeks
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
              console.error("Error normalizing event:", err);
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

    console.log(`Total completed games: ${allCompletedGames.length}, Last count: ${lastCompletedGamesCount}`);
    
    // Early exit if no new completed games
    if (allCompletedGames.length === lastCompletedGamesCount && lastUpdate) {
      console.log("No new completed games since last update. Skipping stats update.");
      return NextResponse.json({
        success: true,
        usersUpdated: 0,
        completedGames: allCompletedGames.length,
        skipped: true,
        message: "No changes detected"
      });
    }
    
    console.log(`Processing ${allCompletedGames.length} completed games (${allCompletedGames.length - lastCompletedGamesCount} new)`);

    // Get all users
    const usersSnapshot = await adminDb.collection("users").get();
    const updates: Promise<unknown>[] = [];
    let usersUpdatedCount = 0;

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
            // Normalize pick.selectedTeam to team ID if it's "home" or "away"
            let userPickedTeamId = pick.selectedTeam;
            if (pick.selectedTeam === "home") {
              userPickedTeamId = game.home.id;
            } else if (pick.selectedTeam === "away") {
              userPickedTeamId = game.away.id;
            }

            // Simple team ID comparison
            if (userPickedTeamId === winningTeamId) {
              seasonWins++;
            } else {
              seasonLosses++;
            }
          }
        }
      });

      // Check if stats have changed before updating
      const userData = userDoc.data();
      const currentStats = userData.stats?.[`season${currentYear}`];
      const statsChanged = 
        !currentStats ||
        currentStats.wins !== seasonWins ||
        currentStats.losses !== seasonLosses;
      
      if (statsChanged) {
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
        usersUpdatedCount++;
      }
    }

    await Promise.all(updates);
    
    // Update metadata with current timestamp and game count
    await metadataRef.set({
      lastUpdate: new Date(),
      completedGamesCount: allCompletedGames.length,
    }, { merge: true });

    return NextResponse.json({
      success: true,
      usersUpdated: usersUpdatedCount,
      totalUsers: usersSnapshot.docs.length,
      completedGames: allCompletedGames.length,
      newGames: allCompletedGames.length - lastCompletedGamesCount,
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
