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
    
    // Check if we're actually in postseason based on date
    const now = new Date();
    const january = now.getMonth() === 0; // January
    const actualYear = now.getFullYear();
    
    // If it's January 2025, we're in postseason
    if (january && actualYear === 2025) {
      // Determine which postseason week based on date
      const date = now.getDate();
      if (date <= 7) currentWeek = 19; // Wild Card
      else if (date <= 14) currentWeek = 20; // Divisional
      else if (date <= 21) currentWeek = 21; // Conference
      else currentWeek = 22; // Super Bowl
    }
    
    return NextResponse.json({ 
      week: currentWeek,
      year: actualYear,
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
