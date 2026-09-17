import { NextResponse } from "next/server";
import { resolveCurrentWeekSelection } from "@/lib/current-week";

export const revalidate = 300;

export async function GET() {
  try {
    const selection = await resolveCurrentWeekSelection(new Date());

    return NextResponse.json({
      week: selection.week,
      year: selection.year,
      seasonType: selection.seasonType,
    });
  } catch (error) {
    console.error("Error fetching current week:", error);
    return NextResponse.json(
      { error: "Current NFL week is temporarily unavailable. Please retry." },
      { status: 503 }
    );
  }
}
