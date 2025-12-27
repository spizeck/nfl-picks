import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { UserPick } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    // Extract the token
    const token = authHeader.split("Bearer ")[1];
    
    // Verify the Firebase ID token
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const { gameId, selectedTeam, week, year } = await request.json();

    if (!gameId || !selectedTeam || !week || !year) {
      return NextResponse.json(
        { error: "Missing required fields: gameId, selectedTeam, week, year" },
        { status: 400 }
      );
    }

    const userId = decodedToken.uid;
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const gameDoc = await adminDb.collection("games").doc(gameId).get();
    if (!gameDoc.exists) {
      return NextResponse.json(
        { error: "Game not found" },
        { status: 404 }
      );
    }

    const gameData = gameDoc.data();
    const gameStartTime = Timestamp.fromDate(new Date(gameData!.date));
    const now = Timestamp.now();
    const isLocked = gameStartTime.toMillis() <= now.toMillis();

    const pickData: Partial<UserPick> = {
      gameId,
      selectedTeam,
      timestamp: now,
      result: "pending",
      locked: isLocked,
      gameStartTime,
    };

    const pickRef = adminDb
      .collection("users")
      .doc(userId)
      .collection("seasons")
      .doc(year.toString())
      .collection("weeks")
      .doc(week.toString())
      .collection("picks")
      .doc(gameId);

    await pickRef.set(pickData);

    await updateWeekStats(adminDb, userId, year, week);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving pick:", error);
    return NextResponse.json(
      { error: "Failed to save pick" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1];
    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get("week");
    const year = searchParams.get("year") || new Date().getFullYear().toString();

    if (!week) {
      return NextResponse.json(
        { error: "Week parameter is required" },
        { status: 400 }
      );
    }

    const picksSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .collection("seasons")
      .doc(year)
      .collection("weeks")
      .doc(week)
      .collection("picks")
      .get();
    
    const picks = picksSnapshot.docs.map(doc => ({
      gameId: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(picks);
  } catch (error) {
    console.error("Error fetching picks:", error);
    return NextResponse.json(
      { error: "Failed to fetch picks" },
      { status: 500 }
    );
  }
}

async function updateWeekStats(
  adminDb: FirebaseFirestore.Firestore,
  userId: string,
  year: number,
  week: number
) {
  const picksSnapshot = await adminDb
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .doc(week.toString())
    .collection("picks")
    .get();

  let wins = 0;
  let losses = 0;
  let pending = 0;

  picksSnapshot.docs.forEach((doc) => {
    const pick = doc.data();
    if (pick.result === "win") wins++;
    else if (pick.result === "loss") losses++;
    else pending++;
  });

  const weekStatsRef = adminDb
    .collection("users")
    .doc(userId)
    .collection("seasons")
    .doc(year.toString())
    .collection("weeks")
    .doc(week.toString());

  await weekStatsRef.set(
    {
      wins,
      losses,
      pending,
      total: wins + losses + pending,
    },
    { merge: true }
  );
}
