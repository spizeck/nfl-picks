/**
 * Idempotent email send records in the `emailSends` collection.
 *
 * Each sendable email has a deterministic document ID derived from
 * season + week + user + email type, e.g. `2026-3-user123-weekly-recap`.
 * A send is claimed inside a transaction before the provider call so that
 * retried or duplicated cron invocations cannot deliver the same email twice.
 */

export type EmailKind = "weekly-recap" | "incomplete-picks-reminder";

export type EmailSendStatus = "sending" | "sent" | "failed";

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
  lastError?: string;
  providerId?: string;
}

export const EMAIL_SENDS_COLLECTION = "emailSends";

/**
 * How long a "sending" claim stays fresh. A crashed send can be reclaimed
 * after this lease expires; a fresh claim means another invocation owns it.
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

export type ClaimResult = "claimed" | "already-sent" | "in-flight";

/**
 * Claim the right to send this email. Returns:
 * - "claimed": caller may send now.
 * - "already-sent": a previous invocation delivered it; do not resend.
 * - "in-flight": another invocation claimed it recently; do not resend.
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
