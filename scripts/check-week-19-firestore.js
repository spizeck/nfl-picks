const admin = require('firebase-admin');
const serviceAccount = require('../functions/service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function checkWeek19() {
  try {
    const db = admin.firestore();
    
    console.log('Checking for week 19 games in Firestore...\n');
    
    const week19Snapshot = await db
      .collection('games')
      .where('year', '==', 2024)
      .where('week', '==', 19)
      .get();
    
    console.log(`=== Week 19 Games (year 2024) ===`);
    console.log(`Found ${week19Snapshot.size} games\n`);
    
    if (week19Snapshot.size > 0) {
      week19Snapshot.forEach(doc => {
        const game = doc.data();
        console.log(`${game.awayTeam?.name || 'Unknown'} @ ${game.homeTeam?.name || 'Unknown'}`);
        console.log(`  Week: ${game.week}, Year: ${game.year}`);
        console.log(`  Date: ${game.date}`);
        console.log(`  Status: ${game.status?.state}\n`);
      });
    }
    
    // Also check if there are any week 1 games that might be leftover
    console.log('\n=== Checking for week 1 games (year 2024) ===');
    const week1Snapshot = await db
      .collection('games')
      .where('year', '==', 2024)
      .where('week', '==', 1)
      .get();
    
    console.log(`Found ${week1Snapshot.size} games with week 1, year 2024`);
    
    if (week1Snapshot.size > 0) {
      console.log('\nThese might be old postseason games with wrong week numbers:');
      week1Snapshot.forEach(doc => {
        const game = doc.data();
        const gameDate = new Date(game.date);
        if (gameDate.getMonth() === 0) { // January
          console.log(`  ${game.awayTeam?.name} @ ${game.homeTeam?.name} - ${game.date}`);
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkWeek19();
