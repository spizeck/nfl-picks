import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getCachedSchedule } from "@/lib/espn-cache";
import {
  ScheduleUnavailableError,
  synchronizeSchedule,
} from "@/lib/schedule-sync";

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
      return NextResponse.json(
        { error: "Schedule storage is temporarily unavailable." },
        { status: 503 }
      );
    }

    const cachedSchedule = await getCachedSchedule(yearNumber, weekNumber);

    if (cachedSchedule && !forceRefresh) {
      console.log(`Returning cached schedule for week ${week}, year ${year}`);
      return NextResponse.json(cachedSchedule);
    }

    console.log(`Fetching fresh schedule from ESPN for week ${week}, year ${year}`);
    const { events, games } = await synchronizeSchedule(
      adminDb,
      yearNumber,
      weekNumber
    );

    console.log(
      `Cached ${events.length} events and ${games.length} games for week ${week}, year ${year}`
    );

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching NFL games:", error);
    if (error instanceof ScheduleUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to synchronize the requested NFL schedule." },
      { status: 502 }
    );
  }
}
