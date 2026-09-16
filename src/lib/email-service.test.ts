import assert from "node:assert/strict";
import test from "node:test";
import {
  findLatestCompletedWeek,
  runPickReminders,
  runWeeklyRecaps,
} from "./email-service";
import type { StoredGame } from "./email-reminder";
import type {
  EmailTransport,
  OutboundEmail,
} from "./email-transport";
import type { NFLWeekSelection } from "./nfl-season";
import { asFirestore, MemoryFirestore } from "./testing/memory-firestore";

const APP_URL = "https://picks.example.com";

function makeTransport(failFor?: Set<string>) {
  const sent: OutboundEmail[] = [];
  const transport: EmailTransport = {
    async send(email) {
      if (failFor?.has(email.to)) {
        throw new Error("provider rejected the message");
      }
      sent.push(email);
      return { id: `resend-${sent.length}` };
    },
  };
  return { sent, transport };
}

function addUser(
  db: MemoryFirestore,
  uid: string,
  data: Record<string, unknown>
) {
  db.set(`users/${uid}`, data);
}

function addGame(
  db: MemoryFirestore,
  game: Partial<StoredGame> & { eventId: string }
) {
  db.set(`games/${game.eventId}`, {
    week: 3,
    year: 2026,
    date: "2026-09-18T00:20:00Z",
    away: { id: "a", name: `Away ${game.eventId}`, logo: "" },
    home: { id: "h", name: `Home ${game.eventId}`, logo: "" },
    status: { state: "pre", displayText: "pre" },
    ...game,
  });
}

function addPick(
  db: MemoryFirestore,
  uid: string,
  year: number,
  week: number,
  gameId: string,
  selectedTeam: string,
  result?: "win" | "loss" | "pending"
) {
  db.set(`users/${uid}/seasons/${year}/weeks/${week}/picks/${gameId}`, {
    gameId,
    selectedTeam,
    result: result ?? "pending",
    locked: false,
  });
}

const SELECTION: NFLWeekSelection = {
  year: 2026,
  week: 3,
  seasonType: 2,
  espnWeek: 3,
};

// Wednesday 2026-09-16 20:00 UTC: g1 already kicked off, g2/g3 upcoming.
const NOW = new Date("2026-09-16T20:00:00Z");

function seedReminderScenario() {
  const db = new MemoryFirestore();
  addGame(db, { eventId: "g1", date: "2026-09-15T00:20:00Z" });
  addGame(db, { eventId: "g2", date: "2026-09-18T00:20:00Z" });
  addGame(db, { eventId: "g3", date: "2026-09-20T17:00:00Z" });

  addUser(db, "alice", { email: "alice@example.com", displayName: "Alice" });
  addUser(db, "bob", { email: "bob@example.com", displayName: "Bob" });
  addUser(db, "carol", { email: "carol@example.com", displayName: "Carol" });
  addUser(db, "dave", { displayName: "Dave" }); // no usable email
  addUser(db, "erin", {
    email: "erin@example.com",
    displayName: "Erin",
    emailPreferences: { pickReminders: false },
  });

  addPick(db, "alice", 2026, 3, "g1", "h");
  addPick(db, "alice", 2026, 3, "g2", "h");
  addPick(db, "bob", 2026, 3, "g2", "h");
  addPick(db, "bob", 2026, 3, "g3", "a");
  addPick(db, "carol", 2026, 3, "g1", "h");
  return db;
}

test("reminder goes only to users with eligible unpicked games", async () => {
  const db = seedReminderScenario();
  const { sent, transport } = makeTransport();

  const summary = await runPickReminders({
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  });

  assert.equal(summary.sent, 2);
  assert.equal(summary.failed, 0);
  assert.deepEqual(
    sent.map((e) => e.to).sort(),
    ["alice@example.com", "carol@example.com"]
  );

  // Alice is missing only g3; the kicked-off g1 is not her problem and g2 is picked.
  const alice = sent.find((e) => e.to === "alice@example.com")!;
  assert.match(alice.subject, /1 pick left for Week 3/);
  assert.match(alice.html, /Away g3/);
  assert.equal(alice.html.includes("Away g1"), false);
  assert.equal(alice.html.includes("Away g2"), false);
  assert.match(alice.html, /href="https:\/\/picks\.example\.com\/"/);

  // Carol is missing both remaining eligible games.
  const carol = sent.find((e) => e.to === "carol@example.com")!;
  assert.match(carol.subject, /2 picks left for Week 3/);
  assert.match(carol.html, /Away g2/);
  assert.match(carol.html, /Away g3/);
  assert.equal(carol.html.includes("Away g1"), false);
});

test("no reminders are sent when every pickable game is picked", async () => {
  const db = new MemoryFirestore();
  addGame(db, { eventId: "g1", date: "2026-09-15T00:20:00Z" });
  addGame(db, { eventId: "g2", date: "2026-09-18T00:20:00Z" });
  addUser(db, "bob", { email: "bob@example.com", displayName: "Bob" });
  addPick(db, "bob", 2026, 3, "g2", "h");

  const { sent, transport } = makeTransport();
  const summary = await runPickReminders({
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  });

  assert.equal(summary.sent, 0);
  assert.equal(sent.length, 0);
});

test("no reminders are sent once every game has kicked off", async () => {
  const db = new MemoryFirestore();
  addGame(db, { eventId: "g1", date: "2026-09-15T00:20:00Z" });
  addUser(db, "carol", { email: "carol@example.com", displayName: "Carol" });

  const { sent, transport } = makeTransport();
  const summary = await runPickReminders({
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: new Date("2026-09-21T12:00:00Z"),
    appUrl: APP_URL,
  });

  assert.equal(summary.sent, 0);
  assert.equal(sent.length, 0);
});

test("rerunning the reminder does not resend successful deliveries", async () => {
  const db = seedReminderScenario();
  const { sent, transport } = makeTransport();
  const ctx = {
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  };

  await runPickReminders(ctx);
  const second = await runPickReminders(ctx);

  assert.equal(second.sent, 0);
  assert.equal(sent.length, 2);
});

test("one failed send does not stop the batch and stays retryable", async () => {
  const db = seedReminderScenario();
  const { transport } = makeTransport(new Set(["carol@example.com"]));
  const ctx = {
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  };

  const first = await runPickReminders(ctx);
  assert.equal(first.sent, 1);
  assert.equal(first.failed, 1);
  assert.equal(first.failures.length, 1);

  // Carol's failure left a retryable record; a later run can deliver it.
  const { transport: retryTransport, sent: retried } = makeTransport();
  const second = await runPickReminders({ ...ctx, transport: retryTransport });
  assert.equal(second.sent, 1);
  assert.deepEqual(retried.map((e) => e.to), ["carol@example.com"]);
});

function seedRecapScenario() {
  const db = new MemoryFirestore();
  // Week 2 is fully final; week 3 is underway.
  addGame(db, {
    eventId: "h1",
    week: 2,
    date: "2026-09-10T00:20:00Z",
    status: { state: "post", displayText: "Final" },
    away: { id: "a1", name: "Away h1", logo: "", score: 10 },
    home: { id: "h1t", name: "Home h1", logo: "", score: 24 },
  });
  addGame(db, {
    eventId: "h2",
    week: 2,
    date: "2026-09-14T00:15:00Z",
    status: { state: "post", displayText: "Final" },
    away: { id: "a2", name: "Away h2", logo: "", score: 27 },
    home: { id: "h2t", name: "Home h2", logo: "", score: 20 },
  });
  addGame(db, { eventId: "g1", week: 3, date: "2026-09-18T00:20:00Z" });

  addUser(db, "alice", { email: "alice@example.com", displayName: "Alice" });
  addUser(db, "bob", { email: "bob@example.com", displayName: "Bob" });
  addUser(db, "dave", { email: "dave@example.com", displayName: "Dave" });
  addUser(db, "erin", {
    email: "erin@example.com",
    displayName: "Erin",
    emailPreferences: { weeklyRecap: false },
  });

  db.set("users/alice/seasons/2026", { totalWins: 1, totalLosses: 1 });
  db.set("users/bob/seasons/2026", { totalWins: 2, totalLosses: 0 });
  db.set("users/dave/seasons/2026", { totalWins: 0, totalLosses: 0 });
  db.set("users/erin/seasons/2026", { totalWins: 1, totalLosses: 1 });

  addPick(db, "alice", 2026, 2, "h1", "h1t", "win");
  addPick(db, "alice", 2026, 2, "h2", "h2t", "loss");
  addPick(db, "bob", 2026, 2, "h1", "h1t", "win");
  addPick(db, "bob", 2026, 2, "h2", "a2", "win");
  addPick(db, "erin", 2026, 2, "h1", "h1t", "win");
  addPick(db, "erin", 2026, 2, "h2", "h2t", "loss");
  return db;
}

test("recap targets the most recent fully completed week", async () => {
  const db = seedRecapScenario();
  const completed = await findLatestCompletedWeek(
    asFirestore(db),
    SELECTION
  );
  assert.deepEqual(completed, { year: 2026, week: 2 });
});

test("recap emails go to players who picked that week", async () => {
  const db = seedRecapScenario();
  const { sent, transport } = makeTransport();

  const summary = await runWeeklyRecaps({
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  });

  assert.equal(summary.week, 2);
  assert.equal(summary.sent, 2);
  assert.equal(summary.failed, 0);
  assert.deepEqual(
    sent.map((e) => e.to).sort(),
    ["alice@example.com", "bob@example.com"]
  );

  const alice = sent.find((e) => e.to === "alice@example.com")!;
  assert.match(alice.subject, /Week 2 recap: 1-1/);
  assert.match(alice.html, /9-4|1-1/);
  // Bob leads the season at 2-0 and tops the leaderboard table.
  const bob = sent.find((e) => e.to === "bob@example.com")!;
  assert.match(bob.subject, /Week 2 recap: 2-0/);
  assert.match(bob.html, /Bob/);
});

test("recap reruns stay idempotent and incomplete weeks send nothing", async () => {
  const db = seedRecapScenario();
  const { sent, transport } = makeTransport();
  const ctx = {
    db: asFirestore(db),
    transport,
    selection: SELECTION,
    now: NOW,
    appUrl: APP_URL,
  };

  await runWeeklyRecaps(ctx);
  const second = await runWeeklyRecaps(ctx);
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 2);

  // A selection whose trailing weeks are unfinished finds no completed week.
  const empty = new MemoryFirestore();
  addGame(empty, { eventId: "g9", week: 1, status: { state: "in", displayText: "in" } });
  const none = await runWeeklyRecaps({
    db: asFirestore(empty),
    transport,
    selection: { year: 2026, week: 1, seasonType: 2, espnWeek: 1 },
    now: NOW,
    appUrl: APP_URL,
  });
  assert.equal(none.sent, 0);
  assert.equal(none.week, undefined);
});
