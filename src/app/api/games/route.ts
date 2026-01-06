import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";
import { shouldUpdateScores, markScoresUpdated } from "@/lib/espn-cache";
import { Timestamp } from "firebase-admin/firestore";

const ESPN_API_URL =
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get("week");
    const year =
      searchParams.get("year") || new Date().getFullYear().toString();
    const refreshScores = searchParams.get("refreshScores") === "true";

    if (!week) {
      return NextResponse.json(
        { error: "Week parameter is required" },
        { status: 400 }
      );
    }

    const weekNumber = parseInt(week, 10);
    const yearNumber = parseInt(year, 10);
    const adminDb = getAdminDb();

    if (!adminDb) {
      console.warn("Firebase Admin not configured, falling back to ESPN API");
      return await fetchFromESPN(yearNumber, weekNumber);
    }

    const query = adminDb
      .collection("games")
      .where("year", "==", yearNumber)
      .where("week", "==", weekNumber)
      .orderBy("date", "asc");

    const snapshot = await query.get();
    const games = snapshot.docs.map((doc) => {
      const data = doc.data();
      if (data.lastUpdated && data.lastUpdated.toDate) {
        data.lastUpdated = data.lastUpdated.toDate().toISOString();
      }

      // Ensure data matches NormalizedGame interface
      // Handle both old format (eventId) and new format (id)
      if (!data.eventId && data.id) {
        data.eventId = data.id;
      }

      // Ensure status has the correct structure
      if (data.status && typeof data.status === "string") {
        // Convert old string status to new object format
        const statusState =
          data.status === "post" ? "post" : data.status === "in" ? "in" : "pre";
        data.status = {
          state: statusState,
          displayText: data.status,
          detail:
            data.away && data.home
              ? `${data.away.score || 0}–${data.home.score || 0}`
              : undefined,
        };
      }

      return data;
    });

    if (games.length === 0) {
      console.log(
        `No games found in Firestore for week ${week}, year ${year}, fetching from ESPN`
      );
      return await fetchFromESPN(yearNumber, weekNumber);
    }

    if (refreshScores) {
      const canUpdate = await shouldUpdateScores();
      if (canUpdate) {
        await updateActiveGameScores(yearNumber, weekNumber, adminDb);
        await markScoresUpdated(yearNumber, weekNumber);

        const updatedSnapshot = await query.get();
        const updatedGames = updatedSnapshot.docs.map((doc) => {
          const data = doc.data();
          if (data.lastUpdated && data.lastUpdated.toDate) {
            data.lastUpdated = data.lastUpdated.toDate().toISOString();
          }
          return data;
        });
        return NextResponse.json(updatedGames);
      } else {
        console.log("Score update rate limit active, returning cached data");
      }
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

async function fetchFromESPN(year: number, week: number) {
  // Map our week numbers back to ESPN's format for the API call
  let espnWeekNumber = week;
  if (week > 18) {
    // Map back: 19->1, 20->2, 21->3, 22->4
    espnWeekNumber = week - 18;
  }
  
  const espnUrl = `${ESPN_API_URL}?week=${espnWeekNumber}&year=${year}`;
  const response = await fetch(espnUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch data from ESPN API");
  }

  const data = await response.json();
  const normalized = (data.events || [])
    .map((event: unknown) => {
      try {
        return normalizeESPNGame(event as never);
      } catch (error) {
        console.error(
          `Error normalizing event ${
            (event as { id?: string }).id || "unknown"
          }:`,
          error
        );
        return null;
      }
    })
    .filter(
      (game: NormalizedGame | null): game is NormalizedGame => game !== null
    );
  return NextResponse.json(normalized);
}

async function updateActiveGameScores(
  year: number,
  week: number,
  adminDb: FirebaseFirestore.Firestore
) {
  console.log(`Updating scores for active games in week ${week}, year ${year}`);

  const activeGamesSnapshot = await adminDb
    .collection("games")
    .where("year", "==", year)
    .where("week", "==", week)
    .where("status.state", "in", ["pre", "in"])
    .get();

  if (activeGamesSnapshot.empty) {
    console.log("No active games to update");
    return;
  }

  console.log(`Found ${activeGamesSnapshot.size} active games to update`);

  // Map our week numbers back to ESPN's format for the API call
  let espnWeekNumber = week;
  if (week > 18) {
    // Map back: 19->1, 20->2, 21->3, 22->4
    espnWeekNumber = week - 18;
  }
  
  const espnUrl = `${ESPN_API_URL}?week=${espnWeekNumber}&year=${year}`;
  const response = await fetch(espnUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch data from ESPN API");
  }

  const data = await response.json();
  const events = data.events || [];

  const batch = adminDb.batch();
  let updatedCount = 0;

  for (const event of events) {
    try {
      const normalized = normalizeESPNGame(event);

      const gameDoc = activeGamesSnapshot.docs.find(
        (doc) => doc.id === normalized.eventId
      );

      if (gameDoc) {
        const gameRef = adminDb.collection("games").doc(normalized.eventId);
        batch.set(
          gameRef,
          {
            ...normalized,
            week,
            year,
            lastUpdated: Timestamp.now(),
          },
          { merge: true }
        );
        updatedCount++;
      }
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error);
    }
  }

  await batch.commit();
  console.log(`Updated ${updatedCount} active games`);
}
