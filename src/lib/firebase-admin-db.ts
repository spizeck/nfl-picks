import { Firestore, getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "./firebase-admin-app";

let adminDb: Firestore | null = null;

// Export getter that initializes on first use. Kept in its own module so
// Firestore-only consumers never pull firebase-admin/auth (and its
// jwks-rsa -> ESM-only jose chain) into their dependency graph.
export function getAdminDb() {
  if (!adminDb) {
    const app = getAdminApp();
    adminDb = app ? getFirestore(app) : null;
  }
  return adminDb;
}
