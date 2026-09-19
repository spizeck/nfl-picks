import type { Auth } from "firebase-admin/auth";
import { getAdminApp } from "./firebase-admin-app";

let adminAuth: Auth | null = null;

// Auth is loaded lazily: firebase-admin/auth transitively requires
// jwks-rsa -> jose (ESM only), which can fail to load in the Vercel
// serverless runtime (ERR_REQUIRE_ESM). Importing it here at call time —
// rather than statically — keeps the route bundle healthy for requests
// that never touch Admin Auth, and a failed load degrades to a null
// getter instead of crashing the route chunk at evaluation time.
export async function getAdminAuth(): Promise<Auth | null> {
  if (adminAuth) return adminAuth;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    adminAuth = getAuth(app);
  } catch (error) {
    console.error("Error loading Firebase Admin Auth:", error);
  }
  return adminAuth;
}
