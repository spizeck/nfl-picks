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
    const currentWeek = data.week?.number || 1;
    const seasonType = data.season?.type || 2; // 1=preseason, 2=regular, 3=postseason
    
    return NextResponse.json({ 
      week: currentWeek,
      year: currentYear,
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
