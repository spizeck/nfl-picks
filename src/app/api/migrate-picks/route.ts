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

    // Fetch all games from all weeks to get team IDs
    const currentYear = new Date().getFullYear();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    
    const { normalizeESPNGame } = await import("@/lib/espn-data");
    
    const allGames: NormalizedGame[] = [];
    
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

        allGames.push(...normalizedGames);
      } catch (err) {
        console.error(`Error fetching week ${week}:`, err);
      }
    }

    console.log(`Loaded ${allGames.length} games for migration`);

    // Create a map of gameId -> game for quick lookup
    const gameMap = new Map(allGames.map(g => [g.eventId, g]));
    console.log(`Game map has ${gameMap.size} entries`);

    // Get all users
    const usersSnapshot = await adminDb.collection("users").get();
    console.log(`Found ${usersSnapshot.docs.length} users`);
    let totalPicksMigrated = 0;
    let totalPicksSkipped = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`Processing user: ${userId}`);

      // Get user's picks
      const picksSnapshot = await adminDb
        .collection("users")
        .doc(userId)
        .collection("picks")
        .get();

      console.log(`User ${userId} has ${picksSnapshot.docs.length} picks`);
      const updates: Promise<unknown>[] = [];

      picksSnapshot.docs.forEach((pickDoc) => {
        const pick = pickDoc.data();
        const game = gameMap.get(pick.gameId);

        console.log(`Pick ${pickDoc.id}: gameId=${pick.gameId}, selectedTeam=${pick.selectedTeam}, gameFound=${!!game}`);

        // Only migrate if pick is "home" or "away" and we have the game data
        if (game && (pick.selectedTeam === "home" || pick.selectedTeam === "away")) {
          const newTeamId = pick.selectedTeam === "home" ? game.home.id : game.away.id;
          console.log(`  -> Migrating ${pick.selectedTeam} to team ID ${newTeamId}`);
          
          const updatePromise = adminDb
            .collection("users")
            .doc(userId)
            .collection("picks")
            .doc(pickDoc.id)
            .update({
              selectedTeam: newTeamId,
              migratedAt: new Date(),
            });

          updates.push(updatePromise);
          totalPicksMigrated++;
        } else {
          console.log(`  -> Skipping (game=${!!game}, selectedTeam=${pick.selectedTeam})`);
          totalPicksSkipped++;
        }
      });

      console.log(`Executing ${updates.length} updates for user ${userId}`);
      await Promise.all(updates);
    }

    console.log(`Migration complete: ${totalPicksMigrated} migrated, ${totalPicksSkipped} skipped`);

    return NextResponse.json({
      success: true,
      totalPicksMigrated,
      totalPicksSkipped,
      message: `Migrated ${totalPicksMigrated} picks from home/away to team IDs`,
    });
  } catch (error) {
    console.error("Error migrating picks:", error);
    return NextResponse.json(
      {
        error: "Failed to migrate picks",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
