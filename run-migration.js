const https = require('https');

// Get your Firebase auth token by running:
// firebase login:ci
// This will give you a token that you can use here
const FIREBASE_AUTH_TOKEN = 'YOUR_FIREBASE_AUTH_TOKEN_HERE';

const functionUrl = 'https://us-central1-cj-nfl-picks.cloudfunctions.net/runMigrationHttp';

const options = {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${FIREBASE_AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

console.log('Starting migration...');

const req = https.request(functionUrl, options, (res) => {
  let data = '';

  res.on('data', chunk => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Migration completed successfully!');
      console.log('Response:', JSON.parse(data));
    } else {
      console.error('❌ Migration failed!');
      console.error('Status:', res.statusCode);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.end();
