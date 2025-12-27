// Test script to manually trigger the game update function
// Run this with: node test-game-update.js

import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp } from "firebase/app";

// Your Firebase configuration
const firebaseConfig = {
  projectId: "cj-nfl-picks",
  // Add other config if needed
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// Get the callable function
const updateScoresNow = httpsCallable(functions, 'updateScoresNow');

// Call the function
async function testUpdate() {
  try {
    console.log("Triggering game score update...");
    const result = await updateScoresNow();
    console.log("Update result:", result.data);
  } catch (error) {
    console.error("Error updating scores:", error);
  }
}

testUpdate();
