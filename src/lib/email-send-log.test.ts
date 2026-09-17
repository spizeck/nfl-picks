import assert from "node:assert/strict";
import test from "node:test";
import {
  claimEmailSend,
  emailSendDocId,
  EMAIL_SENDS_COLLECTION,
  markEmailAccepted,
  markEmailFailed,
  markEmailSent,
  type EmailSendRecord,
} from "./email-send-log";
import { asFirestore, MemoryFirestore } from "./testing/memory-firestore";

const baseRecord = {
  key: emailSendDocId("weekly-recap", 2026, 3, "alice"),
  kind: "weekly-recap" as const,
  year: 2026,
  week: 3,
  userId: "alice",
  createdAtMillis: 1_000,
};

test("deterministic send keys follow season+week+user+type", () => {
  assert.equal(
    emailSendDocId("weekly-recap", 2026, 3, "alice"),
    "2026-3-alice-weekly-recap"
  );
  assert.equal(
    emailSendDocId("incomplete-picks-reminder", 2026, 3, "alice"),
    "2026-3-alice-incomplete-picks-reminder"
  );
});

test("a claimed send cannot be claimed again after success", async () => {
  const memory = new MemoryFirestore();
  const db = asFirestore(memory);

  assert.equal(await claimEmailSend(db, baseRecord, 2_000), "claimed");

  await markEmailSent(db, baseRecord.key, "resend-id-1", 3_000);

  assert.equal(await claimEmailSend(db, baseRecord, 4_000), "already-sent");

  const stored = memory.get(
    `${EMAIL_SENDS_COLLECTION}/${baseRecord.key}`
  ) as unknown as EmailSendRecord;
  assert.equal(stored.status, "sent");
  assert.equal(stored.attempts, 1);
  assert.equal(stored.providerId, "resend-id-1");
  assert.equal(stored.sentAtMillis, 3_000);
});

test("a fresh sending claim blocks concurrent senders", async () => {
  const memory = new MemoryFirestore();
  const db = asFirestore(memory);

  assert.equal(await claimEmailSend(db, baseRecord, 2_000), "claimed");
  // Still inside the 10-minute lease.
  assert.equal(await claimEmailSend(db, baseRecord, 3_000), "in-flight");
});

test("a failed send can be retried without duplicating after success", async () => {
  const memory = new MemoryFirestore();
  const db = asFirestore(memory);

  assert.equal(await claimEmailSend(db, baseRecord, 2_000), "claimed");
  await markEmailFailed(db, baseRecord.key, new Error("provider 500"), 2_500);

  // Retry is allowed and bumps the attempt count.
  assert.equal(await claimEmailSend(db, baseRecord, 3_000), "claimed");
  await markEmailSent(db, baseRecord.key, "resend-id-2", 3_500);

  assert.equal(await claimEmailSend(db, baseRecord, 4_000), "already-sent");

  const stored = memory.get(
    `${EMAIL_SENDS_COLLECTION}/${baseRecord.key}`
  ) as unknown as EmailSendRecord;
  assert.equal(stored.status, "sent");
  assert.equal(stored.attempts, 2);
  assert.equal(stored.lastError, "provider 500");
});

test("a stale sending claim can be reclaimed after the lease expires", async () => {
  const memory = new MemoryFirestore();
  const db = asFirestore(memory);

  assert.equal(await claimEmailSend(db, baseRecord, 2_000), "claimed");
  // 11 minutes later: the original claim is presumed crashed.
  assert.equal(
    await claimEmailSend(db, baseRecord, 2_000 + 11 * 60 * 1000),
    "claimed"
  );
});

test("an accepted-but-unrecorded send reconciles instead of resending", async () => {
  const memory = new MemoryFirestore();
  const db = asFirestore(memory);

  assert.equal(await claimEmailSend(db, baseRecord, 2_000), "claimed");
  // Provider accepted; persisting `sent` failed, so the record is `accepted`.
  await markEmailAccepted(db, baseRecord.key, "resend-id-9", 2_500);

  // A later run must NOT claim this for a resend.
  assert.equal(await claimEmailSend(db, baseRecord, 4_000), "reconcile");

  // Reconciliation repairs the record without another provider call.
  await markEmailSent(db, baseRecord.key, undefined, 4_500);
  assert.equal(await claimEmailSend(db, baseRecord, 5_000), "already-sent");

  const stored = memory.get(
    `${EMAIL_SENDS_COLLECTION}/${baseRecord.key}`
  ) as unknown as EmailSendRecord;
  assert.equal(stored.status, "sent");
  assert.equal(stored.providerId, "resend-id-9");
  assert.equal(stored.sentAtMillis, 4_500);
});
