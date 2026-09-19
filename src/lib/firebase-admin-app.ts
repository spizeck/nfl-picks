import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let adminApp: App | null = null;

// Initialize the Firebase Admin app once. Service getters (Firestore, Auth)
// share this app so only this module owns env handling and initialization.
function initializeAdmin(): App | null {
  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
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

      adminApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      console.warn("Firebase Admin SDK environment variables not found. Admin features will not work.");
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin SDK:", error);
  }
  return adminApp;
}

// Export getter that initializes on first use
export function getAdminApp(): App | null {
  return adminApp ?? initializeAdmin();
}
