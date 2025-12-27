import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";
import {
  getCachedSchedule,
  setCachedSchedule,
  shouldUpdateScores,
  markScoresUpdated,
} from "@/lib/espn-cache";

const ESPN_API_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get("week");
    const year = searchParams.get("year") || new Date().getFullYear().toString();
    const forceRefresh = searchParams.get("refresh") === "true";
    
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
      console.warn("Firebase Admin not configured, fetching directly from ESPN");
      return await fetchFromESPN(yearNumber, weekNumber);
    }

    const cachedSchedule = await getCachedSchedule(yearNumber, weekNumber);

    if (cachedSchedule && !forceRefresh) {
      console.log(`Returning cached schedule for week ${week}, year ${year}`);
      return NextResponse.json(cachedSchedule);
    }

    console.log(`Fetching fresh schedule from ESPN for week ${week}, year ${year}`);
    const espnUrl = `${ESPN_API_URL}?week=${week}&year=${year}`;
    const response = await fetch(espnUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch data from ESPN API");
    }

    const data = await response.json();
    const events = data.events || [];

    const normalizedGames: (NormalizedGame & { week: number; year: number })[] = [];

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
      }
    }

    const batch = adminDb.batch();

    for (const game of normalizedGames) {
      const gameRef = adminDb.collection("games").doc(game.eventId);
      batch.set(
        gameRef,
        {
          ...game,
          lastUpdated: Timestamp.now(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    await setCachedSchedule(yearNumber, weekNumber, events);

    console.log(
      `Cached ${events.length} events and ${normalizedGames.length} games for week ${week}, year ${year}`
    );

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching NFL games:", error);
    return NextResponse.json(
      { error: "Failed to fetch NFL games" },
      { status: 500 }
    );
  }
}

async function fetchFromESPN(year: number, week: number) {
  const espnUrl = `${ESPN_API_URL}?week=${week}&year=${year}`;
  const response = await fetch(espnUrl);

  if (!response.ok) {
    throw new Error("Failed to fetch data from ESPN API");
  }

  const data = await response.json();
  return NextResponse.json(data.events || []);
}
