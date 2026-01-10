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
    const month = now.getMonth(); // 0 = January, 1 = February
    const calendarYear = now.getFullYear();
    const seasonYear = data.season?.year || currentYear;
    
    // Postseason runs from early January through early February
    // If we're in January/February and the season year is the previous calendar year, we're in postseason
    if ((month === 0 || month === 1) && seasonYear === calendarYear - 1) {
      // Determine which postseason week based on date
      const date = now.getDate();
      if (month === 0) { // January
        if (date <= 17) currentWeek = 19; // Wild Card (Jan 11-13)
        else if (date <= 24) currentWeek = 20; // Divisional (Jan 18-19)
        else currentWeek = 21; // Conference Championship (Jan 26)
      } else if (month === 1) { // February
        currentWeek = 22; // Super Bowl (early Feb)
      }
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
