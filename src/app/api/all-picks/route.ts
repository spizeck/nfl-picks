import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { PickWithUserInfo } from "@/lib/types";

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
      console.warn("Firebase Admin not configured, returning empty picks");
      return NextResponse.json({});
    }

    const weekNumber = parseInt(week);
    const yearNumber = parseInt(year);

    const gamesSnapshot = await adminDb
      .collection("games")
      .where("week", "==", weekNumber)
      .where("year", "==", yearNumber)
      .get();

    const now = new Date();
    const startedGames = new Map<string, boolean>();

    gamesSnapshot.docs.forEach((doc) => {
      const gameData = doc.data();
      const gameStartTime = new Date(gameData.date);
      startedGames.set(doc.id, gameStartTime <= now);
    });

    const usersSnapshot = await adminDb.collection("users").get();
    const allPicks: Record<string, PickWithUserInfo[]> = {};

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      const picksSnapshot = await adminDb
        .collection("users")
        .doc(userId)
        .collection("seasons")
        .doc(year)
        .collection("weeks")
        .doc(week)
        .collection("picks")
        .get();

      picksSnapshot.docs.forEach((pickDoc) => {
        const pick = pickDoc.data();
        const gameId = pick.gameId;

        if (startedGames.has(gameId) && startedGames.get(gameId)) {
          if (!allPicks[gameId]) {
            allPicks[gameId] = [];
          }

          allPicks[gameId].push({
            userId,
            displayName: userData.displayName || "Unknown",
            photoURL: userData.photoURL || "",
            selectedTeam: pick.selectedTeam,
            result: pick.result,
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
