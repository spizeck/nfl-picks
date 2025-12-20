import admin from "firebase-admin";

let adminAuth: admin.auth.Auth | null = null;
let adminDb: admin.firestore.Firestore | null = null;

// Function to initialize Firebase Admin SDK
function initializeAdmin() {
  if (admin.apps.length > 0) {
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

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      adminAuth = admin.auth();
      adminDb = admin.firestore();
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
