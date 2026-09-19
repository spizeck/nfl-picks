import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin-db";
import { resolveCurrentWeekSelection } from "@/lib/current-week";
import { isPickReminderWindow } from "@/lib/email-time";
import { runPickReminders } from "@/lib/email-service";
import { createResendTransport, getAppUrl } from "@/lib/email-transport";
import {
  isAuthorizedCronRequest,
  unauthorizedCronResponse,
} from "../auth";

export const dynamic = "force-dynamic";

/**
 * Scheduled by Vercel Cron (see vercel.json). The job fires weekly and the
 * America/Phoenix wall-clock check below decides whether it is actually
 * Wednesday 5:00 PM in Arizona before anything is sent.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorizedCronResponse();
  }

  const now = new Date();
  if (!isPickReminderWindow(now)) {
    return NextResponse.json({ skipped: "outside-reminder-window" });
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const selection = await resolveCurrentWeekSelection(now);
    const summary = await runPickReminders({
      db: adminDb,
      transport: createResendTransport(),
      selection,
      now,
      appUrl: getAppUrl(),
    });
    console.log(
      `Pick reminders complete: ${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed`
    );
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Pick reminder job failed:", error);
    return NextResponse.json(
      { error: "Pick reminder job failed" },
      { status: 500 }
    );
  }
}
