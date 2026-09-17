import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on every scheduled
 * invocation. The job refuses to run when CRON_SECRET is not configured.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedCronResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
