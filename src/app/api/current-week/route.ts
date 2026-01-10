import { NextResponse } from "next/server";

const ESPN_API_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function GET() {
  try {
    const currentYear = new Date().getFullYear();
    const response = await fetch(`${ESPN_API_URL}?limit=1`);
    
    if (!response.ok) {
      throw new Error("Failed to fetch from ESPN API");
    }
    
    const data = await response.json();
    
    // ESPN returns the current week in the response
    let currentWeek = data.week?.number || 1;
    const seasonType = data.season?.type || 2; // 1=preseason, 2=regular, 3=postseason
    const seasonYear = data.season?.year || currentYear;
    
    // ESPN uses seasontype=3 with weeks 1-5 for postseason, but we use 19-22 internally
    // Convert ESPN's postseason weeks to our internal numbering
    if (seasonType === 3) {
      // Postseason: ESPN weeks map to our internal weeks
      if (currentWeek === 1) currentWeek = 19; // Wild Card
      else if (currentWeek === 2) currentWeek = 20; // Divisional
      else if (currentWeek === 3) currentWeek = 21; // Conference Championships
      else if (currentWeek === 5) currentWeek = 22; // Super Bowl (week 4 is Pro Bowl, skip it)
      else if (currentWeek === 4) currentWeek = 21; // Pro Bowl - treat as Conference week for now
    }
    
    return NextResponse.json({ 
      week: currentWeek,
      year: seasonYear,
      seasonType 
    });
  } catch (error) {
    console.error("Error fetching current week:", error);
    return NextResponse.json(
      { error: "Failed to fetch current week" },
      { status: 500 }
    );
  }
}
