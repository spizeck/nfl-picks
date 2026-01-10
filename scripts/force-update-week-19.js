const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function forceUpdateWeek19() {
  try {
    console.log('Calling forceUpdateWeek function for week 19, year 2024...');
    
    const functions = admin.functions();
    const forceUpdate = functions.httpsCallable('forceUpdateWeek');
    
    const result = await forceUpdate({ week: 19, year: 2024 });
    
    console.log('\n=== Force Update Result ===');
    console.log(JSON.stringify(result.data, null, 2));
    
    // Check what's in Firestore now
    console.log('\n=== Checking Firestore ===');
    const db = admin.firestore();
    const gamesSnapshot = await db
      .collection('games')
      .where('year', '==', 2024)
      .where('week', '==', 19)
      .get();
    
    console.log(`Found ${gamesSnapshot.size} games with week 19, year 2024`);
    
    if (gamesSnapshot.size > 0) {
      console.log('\n=== Games ===');
      gamesSnapshot.forEach(doc => {
        const game = doc.data();
        console.log(`${game.awayTeam?.name} @ ${game.homeTeam?.name} - Week ${game.week}, Year ${game.year}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

forceUpdateWeek19();
