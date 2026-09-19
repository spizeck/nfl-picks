import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin-db";
import { resolveCurrentWeekSelection } from "@/lib/current-week";
import { runWeeklyRecaps } from "@/lib/email-service";
import { createResendTransport, getAppUrl } from "@/lib/email-transport";
import {
  isAuthorizedCronRequest,
  unauthorizedCronResponse,
} from "../auth";

export const dynamic = "force-dynamic";

/**
 * Scheduled by Vercel Cron (see vercel.json) to run daily. Each invocation
 * finds the most recent NFL week whose games are all final and sends one
 * recap per eligible user; Firestore send records make repeats idempotent.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorizedCronResponse();
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const selection = await resolveCurrentWeekSelection(new Date());
    const summary = await runWeeklyRecaps({
      db: adminDb,
      transport: createResendTransport(),
      selection,
      appUrl: getAppUrl(),
    });
    console.log(
      `Weekly recaps complete: ${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed` +
        (summary.week !== undefined ? ` for ${summary.year} week ${summary.week}` : "")
    );
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Weekly recap job failed:", error);
    return NextResponse.json(
      { error: "Weekly recap job failed" },
      { status: 500 }
    );
  }
}
