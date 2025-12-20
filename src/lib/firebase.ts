// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// We'll get these from environment variables for security
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy client-side initialization to avoid server/client module-eval differences
let app: import("firebase/app").FirebaseApp | null = null;
let auth: import("firebase/auth").Auth | null = null;
let db: import("firebase/firestore").Firestore | null = null;
let googleProvider: import("firebase/auth").GoogleAuthProvider | null = null;

function initFirebaseClient() {
  if (app && auth && db && googleProvider) return;
  if (typeof window === "undefined") return;
  if (!firebaseConfig.apiKey) return;

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
}

export function getFirebaseAuth() {
  initFirebaseClient();
  return auth;
}

export function getFirestoreDb() {
  initFirebaseClient();
  return db;
}

export function getGoogleProvider() {
  initFirebaseClient();
  return googleProvider;
}

export function getFirebaseApp() {
  initFirebaseClient();
  return app;
}
