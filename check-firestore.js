// Quick script to check what's in Firestore for week 17 games
import admin from 'firebase-admin';

// Initialize with your service account
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'cj-nfl-picks'
});

const db = admin.firestore();

async function checkWeek17Games() {
  try {
    console.log('Fetching week 17 games from Firestore...');
    
    const snapshot = await db
      .collection('games')
      .where('week', '==', 17)
      .where('year', '==', 2024)
      .get();
    
    console.log(`Found ${snapshot.docs.length} games`);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`\nGame ID: ${doc.id}`);
      console.log(`Date: ${data.date}`);
      console.log(`Away: ${data.away?.name} (${data.away?.score})`);
      console.log(`Home: ${data.home?.name} (${data.home?.score})`);
      console.log(`Status: ${data.status?.state} - ${data.status?.displayText}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkWeek17Games();
