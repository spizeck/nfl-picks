// Simple script to manually fetch week 19 games
// Run with: node scripts/fetch-week-19.js

const fetch = require('node-fetch');

async function fetchWeek19() {
  try {
    console.log('Checking current ESPN scoreboard...');
    
    // First check what ESPN returns for current scoreboard
    const currentUrl = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
    console.log(`URL: ${currentUrl}`);
    
    const currentResponse = await fetch(currentUrl);
    const currentData = await currentResponse.json();
    
    console.log('\n=== Current ESPN Scoreboard ===');
    console.log(`Week: ${currentData.week?.number}`);
    console.log(`Season Year: ${currentData.season?.year}`);
    console.log(`Season Type: ${currentData.season?.type} (1=preseason, 2=regular, 3=postseason)`);
    console.log(`Events found: ${currentData.events?.length || 0}`);
    
    if (currentData.events && currentData.events.length > 0) {
      console.log('\n=== Current Games ===');
      currentData.events.forEach(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        console.log(`${awayTeam.team.displayName} @ ${homeTeam.team.displayName}`);
        console.log(`  Date: ${event.date}`);
        console.log(`  Status: ${competition.status.type.description}`);
      });
    }
    
    console.log('\n\nNow trying Wild Card with correct API format...');
    
    // Use seasontype=3 and dates with calendar year for postseason
    const url = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=3&week=1&dates=2025';
    console.log(`URL: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('\n=== ESPN API Response ===');
    console.log(`Week: ${data.week?.number}`);
    console.log(`Season Year: ${data.season?.year}`);
    console.log(`Season Type: ${data.season?.type}`);
    console.log(`Events found: ${data.events?.length || 0}`);
    
    if (data.events && data.events.length > 0) {
      console.log('\n=== Games ===');
      data.events.forEach(event => {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
        const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
        console.log(`${awayTeam.team.displayName} @ ${homeTeam.team.displayName}`);
        console.log(`  Date: ${event.date}`);
        console.log(`  Status: ${competition.status.type.description}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fetchWeek19();
