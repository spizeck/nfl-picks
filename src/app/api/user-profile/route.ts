import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(authHeader.slice(7));
    await adminDb.collection("users").doc(decodedToken.uid).set(
      {
        uid: decodedToken.uid,
        email: decodedToken.email || null,
        displayName:
          decodedToken.name || decodedToken.email?.split("@")[0] || "Anonymous",
        photoURL: decodedToken.picture || null,
        lastSignIn: Timestamp.now(),
      },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
