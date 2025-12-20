import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

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

    const { gameId, selectedTeam } = await request.json();

    if (!gameId || !selectedTeam) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Use the verified user ID from the token
    const userId = decodedToken.uid;

    // Save the user's pick to Firestore using Admin SDK
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    
    await adminDb
      .collection("users")
      .doc(userId)
      .collection("picks")
      .doc(gameId)
      .set({
        gameId,
        selectedTeam,
        timestamp: Timestamp.now(),
      });

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
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized - No token provided" },
        { status: 401 }
      );
    }

    // Extract and verify the token
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

    // Use the verified user ID from the token
    const userId = decodedToken.uid;

    // Get all picks for the user using Admin SDK
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }
    
    const picksSnapshot = await adminDb
      .collection("users")
      .doc(userId)
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
