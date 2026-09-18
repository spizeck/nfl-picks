import { cert, getApps, initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";

let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

// Function to initialize Firebase Admin SDK
function initializeAdmin() {
  if (getApps().length > 0) {
    return;
  }

  try {
    // Only initialize if all required environment variables are present
    if (process.env.FIREBASE_ADMIN_PROJECT_ID &&
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY) {

      const serviceAccount = {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

      const app = initializeApp({
        credential: cert(serviceAccount),
      });

      adminAuth = getAuth(app);
      adminDb = getFirestore(app);
    } else {
      console.warn("Firebase Admin SDK environment variables not found. Admin features will not work.");
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }
}

// Export getters that initialize on first use
export function getAdminAuth() {
  if (!adminAuth) {
    initializeAdmin();
  }
  return adminAuth;
}

export function getAdminDb() {
  if (!adminDb) {
    initializeAdmin();
  }
  return adminDb;
}
