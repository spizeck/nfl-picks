/**
 * Idempotent email send records in the `emailSends` collection.
 *
 * Each sendable email has a deterministic document ID derived from
 * season + week + user + email type, e.g. `2026-3-user123-weekly-recap`.
 * A send is claimed inside a transaction before the provider call so that
 * retried or duplicated cron invocations do not deliver the same email twice.
 *
 * State machine:
 *   sending -> sent    provider accepted and the outcome was persisted
 *   sending -> failed  provider rejected or errored before acceptance;
 *                      safe to retry
 *   sending -> accepted  provider accepted but persisting `sent` failed;
 *                        a later run reconciles it to `sent` WITHOUT resending
 *   failed  -> sending retry of a provider-level failure
 *   sending -> sending stale-lease reclaim of a crashed attempt
 *
 * There is an unavoidable provider/database distributed-transaction
 * boundary: if the process dies between provider acceptance and the state
 * write, the record can remain `sending`. The Resend `Idempotency-Key` header
 * (the same deterministic send key) dedupes a later replay at the provider
 * for Resend's retention window, so the honest guarantee is at-least-once
 * with provider-level dedupe — not absolute exactly-once.
 */

export type EmailKind = "weekly-recap" | "incomplete-picks-reminder";

export type EmailSendStatus = "sending" | "sent" | "failed" | "accepted";

export interface EmailSendRecord {
  key: string;
  kind: EmailKind;
  year: number;
  week: number;
  userId: string;
  status: EmailSendStatus;
  attempts: number;
  createdAtMillis: number;
  claimedAtMillis: number;
  sentAtMillis?: number;
  failedAtMillis?: number;
  acceptedAtMillis?: number;
  lastError?: string;
  providerId?: string;
}

export const EMAIL_SENDS_COLLECTION = "emailSends";

/**
 * How long a "sending" claim stays fresh. A crashed attempt can be reclaimed
 * after this lease expires; a fresh claim means another invocation owns it.
 * Reclaimed replays reuse the same provider idempotency key, so a slow but
 * still-running send is deduped by Resend rather than delivered twice.
 */
const SEND_LEASE_MS = 10 * 60 * 1000;

export function emailSendDocId(
  kind: EmailKind,
  year: number,
  week: number,
  userId: string
): string {
  return `${year}-${week}-${userId}-${kind}`;
}

export type ClaimResult = "claimed" | "already-sent" | "in-flight" | "reconcile";

/**
 * Claim the right to send this email. Returns:
 * - "claimed": caller may send now.
 * - "already-sent": a previous invocation delivered and recorded it.
 * - "in-flight": another invocation claimed it recently.
 * - "reconcile": the provider already accepted it but `sent` was not
 *   persisted; repair the record, do NOT resend.
 */
export async function claimEmailSend(
  db: FirebaseFirestore.Firestore,
  record: Omit<EmailSendRecord, "status" | "attempts" | "claimedAtMillis">,
  nowMillis = Date.now()
): Promise<ClaimResult> {
  const ref = db.collection(EMAIL_SENDS_COLLECTION).doc(record.key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        ...record,
        status: "sending",
        attempts: 1,
        claimedAtMillis: nowMillis,
      } satisfies Omit<EmailSendRecord, never>);
      return "claimed" as const;
    }

    const data = snap.data() as EmailSendRecord;
    if (data.status === "sent") return "already-sent" as const;
    if (data.status === "accepted") return "reconcile" as const;
    if (
      data.status === "sending" &&
      typeof data.claimedAtMillis === "number" &&
      nowMillis - data.claimedAtMillis < SEND_LEASE_MS
    ) {
      return "in-flight" as const;
    }

    // Failed or stale "sending" record: retry is allowed. `lastError` is
    // kept as diagnostic history from the previous attempt.
    tx.update(ref, {
      status: "sending",
      attempts: (data.attempts ?? 0) + 1,
      claimedAtMillis: nowMillis,
    });
    return "claimed" as const;
  });
}

export async function markEmailSent(
  db: FirebaseFirestore.Firestore,
  key: string,
  providerId?: string,
  nowMillis = Date.now()
): Promise<void> {
  await db.collection(EMAIL_SENDS_COLLECTION).doc(key).update({
    status: "sent",
    sentAtMillis: nowMillis,
    ...(providerId ? { providerId } : {}),
  });
}

/**
 * The provider accepted the email but persisting `sent` failed. The record
 * must NOT go back to `failed`: a retry would duplicate the delivery. A later
 * run sees `accepted` and reconciles the record without resending.
 */
export async function markEmailAccepted(
  db: FirebaseFirestore.Firestore,
  key: string,
  providerId?: string,
  nowMillis = Date.now()
): Promise<void> {
  await db.collection(EMAIL_SENDS_COLLECTION).doc(key).update({
    status: "accepted",
    acceptedAtMillis: nowMillis,
    ...(providerId ? { providerId } : {}),
  });
}

export async function markEmailFailed(
  db: FirebaseFirestore.Firestore,
  key: string,
  error: unknown,
  nowMillis = Date.now()
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.collection(EMAIL_SENDS_COLLECTION).doc(key).update({
    status: "failed",
    failedAtMillis: nowMillis,
    lastError: message.slice(0, 500),
  });
}
