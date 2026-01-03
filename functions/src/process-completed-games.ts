import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Manually process completed games and update user stats
 * Use this when the onGameComplete trigger doesn't fire
 */
export const processCompletedGames = onCall(async (request) => {
  const { week, year } = request.data;
  
  console.log(`Processing completed games for week ${week}, year ${year}`);
  
  const db = admin.firestore();
  
  try {
    // Get all games for the specified week
    const gamesSnapshot = await db
      .collection("games")
      .where("week", "==", week)
      .where("year", "==", year)
      .where("status.state", "==", "post")
      .get();
    
    console.log(`Found ${gamesSnapshot.size} completed games`);
    
    const usersSnapshot = await db.collection("users").get();
    const allUsersStats = new Map<string, { wins: number; losses: number; pending: number }>();
    
    // Initialize stats for all users
    usersSnapshot.docs.forEach(userDoc => {
      allUsersStats.set(userDoc.id, { wins: 0, losses: 0, pending: 0 });
    });
    
    // Process each completed game
    for (const gameDoc of gamesSnapshot.docs) {
      const gameData = gameDoc.data();
      const gameId = gameDoc.id;
      const homeScore = Number(gameData.home?.score ?? 0);
      const awayScore = Number(gameData.away?.score ?? 0);
      
      let winningTeamId: string | null = null;
      if (homeScore > awayScore) {
        winningTeamId = gameData.home.id;
      } else if (awayScore > homeScore) {
        winningTeamId = gameData.away.id;
      }
      
      if (!winningTeamId) {
        console.log(`Game ${gameId} ended in a tie, skipping`);
        continue;
      }
      
      console.log(`Processing game ${gameId}: Winner is ${winningTeamId}`);
      
      // Check all users' picks for this game
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const pickRef = db
          .collection("users")
          .doc(userId)
          .collection("seasons")
          .doc(year.toString())
          .collection("weeks")
          .doc(week.toString())
          .collection("picks")
          .doc(gameId);
        
        const pickDoc = await pickRef.get();
        if (!pickDoc.exists) {
          continue;
        }
        
        const pick = pickDoc.data();
        let userPickedTeamId = pick!.selectedTeam;
        
        if (pick!.selectedTeam === "home") {
          userPickedTeamId = gameData.home.id;
        } else if (pick!.selectedTeam === "away") {
          userPickedTeamId = gameData.away.id;
        }
        
        const didWin = userPickedTeamId === winningTeamId;
        const result = didWin ? "win" : "loss";
        
        // Update the pick with result
        await pickRef.update({
          result: result,
          locked: true,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Update stats
        const stats = allUsersStats.get(userId)!;
        if (didWin) {
          stats.wins++;
        } else {
          stats.losses++;
        }
        
        console.log(`User ${userId}: ${result} for game ${gameId}`);
      }
    }
    
    // Update weekly stats for all users
    const batch = db.batch();
    
    for (const [userId, stats] of allUsersStats) {
      const weekStatsRef = db
        .collection("users")
        .doc(userId)
        .collection("seasons")
        .doc(year.toString())
        .collection("weeks")
        .doc(week.toString());
      
      // Calculate total games (wins + losses + pending)
      const totalPicksSnapshot = await weekStatsRef.collection("picks").get();
      const pending = totalPicksSnapshot.size - stats.wins - stats.losses;
      
      batch.set(weekStatsRef, {
        wins: stats.wins,
        losses: stats.losses,
        pending: pending,
        total: stats.wins + stats.losses + pending,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      console.log(`Updated week ${week} stats for user ${userId}: ${stats.wins}-${stats.losses}-${pending}`);
    }
    
    await batch.commit();
    
    return {
      success: true,
      message: `Processed ${gamesSnapshot.size} completed games for ${usersSnapshot.size} users`,
      summary: Array.from(allUsersStats.entries()).map(([userId, stats]) => ({
        userId,
        record: `${stats.wins}-${stats.losses}`
      }))
    };
  } catch (error) {
    console.error("Error processing completed games:", error);
    throw error;
  }
});
