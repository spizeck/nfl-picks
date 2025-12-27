import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp } from "firebase/app";

// Your web app's Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here or import from your config file
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// Create a callable function to trigger game updates
export const triggerGameUpdate = httpsCallable(functions, 'updateGameScores');

// Usage:
// const result = await triggerGameUpdate();
// console.log(result.data);
