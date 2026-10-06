import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  getDirtyPicks,
  submitPickChanges,
  type PickSide,
} from "./pick-submission";
import { hasGameStarted, isGameLocked } from "./game-lock";
import { PickValidationError, saveValidatedPick } from "./pick-storage";
import { MemoryFirestore, asFirestore } from "./testing/memory-firestore";

const NOW = new Date("2026-09-20T17:30:00Z");

// Game A kicked off at 17:00 UTC — already started at NOW.
const startedGame = {
  eventId: "game-started",
  date: "2026-09-20T17:00:00Z",
  home: { id: "home-a", name: "Home A" },
  away: { id: "away-a", name: "Away A" },
  status: { state: "in" as const, displayText: "Q1 10:24" },
};

// Game B kicks off at 20:25 UTC — still open at NOW.
const futureGame = {
  eventId: "game-future",
  date: "2026-09-20T20:25:00Z",
  home: { id: "home-b", name: "Home B" },
  away: { id: "away-b", name: "Away B" },
  status: { state: "pre" as const, displayText: "Sun 4:25 PM" },
};

const games = [startedGame, futureGame];

function makeFetch(
  responder: (
    gameId: string
  ) => { status: number; body?: unknown } | Promise<never>
) {
  const calls: Array<{ url: string; gameId?: string }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url: String(url), gameId: body.gameId });
    const result = await responder(body.gameId);
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const getIdToken = async () => "test-token";

test("mixed week: changing a future game submits only that pick and produces no error", async () => {
  // The user already had a saved pick on the started game and a saved pick on
  // the future game. They then changed only the future game.
  const picks: Record<string, PickSide> = {
    "game-started": "home", // unchanged saved pick on a locked game
    "game-future": "away", // freshly changed
  };
  const savedPicks: Record<string, PickSide> = {
    "game-started": "home",
    "game-future": "home",
  };

  const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: { success: true } }));
  const outcome = await submitPickChanges({
    picks,
    savedPicks,
    games,
    week: 2,
    year: 2026,
    getIdToken,
    fetchImpl,
  });

  // Only the changed game is submitted — the locked game's saved pick is
  // never re-sent, so no "game already started" error can surface for it.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gameId, "game-future");
  assert.deepEqual(outcome.savedGameIds, ["game-future"]);
  assert.deepEqual(outcome.failures, []);
});

test("mixed week: a locked game's rejection does not mask a future game's success", async () => {
  const picks: Record<string, PickSide> = {
    "game-started": "away", // changed, but the game is locked
    "game-future": "away", // changed, still open
  };
  const savedPicks: Record<string, PickSide> = {
    "game-started": "home",
    "game-future": "home",
  };

  const { fetchImpl } = makeFetch((gameId) =>
    gameId === "game-started"
      ? {
          status: 403,
          body: { error: "Picks are locked - this game has already started" },
        }
      : { status: 200, body: { success: true } }
  );
  const outcome = await submitPickChanges({
    picks,
    savedPicks,
    games,
    week: 2,
    year: 2026,
    getIdToken,
    fetchImpl,
  });

  assert.deepEqual(outcome.savedGameIds, ["game-future"]);
  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0].gameId, "game-started");
  assert.equal(outcome.failures[0].kind, "locked");
  assert.match(outcome.failures[0].message, /Away A @ Home A/);
});

test("locked game: the failure identifies the specific matchup", async () => {
  const picks: Record<string, PickSide> = { "game-started": "away" };
  const savedPicks: Record<string, PickSide> = { "game-started": "home" };

  const { fetchImpl } = makeFetch(() => ({
    status: 403,
    body: { error: "Picks are locked - this game has already started" },
  }));
  const outcome = await submitPickChanges({
    picks,
    savedPicks,
    games,
    week: 2,
    year: 2026,
    getIdToken,
    fetchImpl,
  });

  assert.deepEqual(outcome.savedGameIds, []);
  assert.equal(outcome.failures.length, 1);
  assert.equal(outcome.failures[0].kind, "locked");
  assert.match(outcome.failures[0].message, /has already started/);
});

test("network failure is reported per pick without losing other saves", async () => {
  const picks: Record<string, PickSide> = { "game-future": "away" };
  const savedPicks: Record<string, PickSide> = {};

  const { fetchImpl } = makeFetch(() => Promise.reject(new Error("offline")));
  const outcome = await submitPickChanges({
    picks,
    savedPicks,
    games,
    week: 2,
    year: 2026,
    getIdToken,
    fetchImpl,
  });

  assert.deepEqual(outcome.savedGameIds, []);
  assert.equal(outcome.failures[0].kind, "network");
});

test("getDirtyPicks returns only changed or new selections", () => {
  assert.deepEqual(
    getDirtyPicks(
      { a: "home", b: "away", c: "home" },
      { a: "home", b: "home", c: "home" }
    ),
    [{ gameId: "b", side: "away" }]
  );
  assert.deepEqual(getDirtyPicks({ a: "home" }, { a: "home" }), []);
});

test("isGameLocked mirrors the per-game server rule", () => {
  const at = NOW.getTime();
  assert.equal(isGameLocked(futureGame, at), false);
  assert.equal(isGameLocked(startedGame, at), true);

  // Kickoff boundary: locked at exactly kickoff, open one ms before.
  const edge = { ...futureGame };
  assert.equal(isGameLocked(edge, new Date(edge.date).getTime()), true);
  assert.equal(isGameLocked(edge, new Date(edge.date).getTime() - 1), false);

  // A stale "pre" status cannot keep a past-kickoff game editable.
  const stalePre = { ...startedGame, status: { state: "pre" as const, displayText: "" } };
  assert.equal(isGameLocked(stalePre, at), true);

  // Conversely a reported live/final game is locked even if the date is odd.
  const inFuture = {
    ...futureGame,
    status: { state: "in" as const, displayText: "Q1" },
  };
  assert.equal(isGameLocked(inFuture, at), true);

  assert.equal(hasGameStarted(futureGame, at), false);
  assert.equal(hasGameStarted(startedGame, at), true);
});

test("server: future pick saves while started game is rejected and its pick stays authoritative", async () => {
  const memory = new MemoryFirestore();
  memory.set("games/game-started", {
    eventId: "game-started",
    date: startedGame.date,
    week: 2,
    year: 2026,
    home: { id: "home-a" },
    away: { id: "away-a" },
    status: { state: "in", displayText: "Q1" },
  });
  memory.set("games/game-future", {
    eventId: "game-future",
    date: futureGame.date,
    week: 2,
    year: 2026,
    home: { id: "home-b" },
    away: { id: "away-b" },
    status: { state: "pre", displayText: "Sun 4:25 PM" },
  });
  // An existing pick on the started game must remain untouched.
  memory.set(
    "users/u1/seasons/2026/weeks/2/picks/game-started",
    { gameId: "game-started", selectedTeam: "home-a", result: "pending" }
  );

  const db = asFirestore(memory);
  const now = Timestamp.fromDate(NOW);

  // The future game accepts the change.
  await saveValidatedPick(
    db,
    "u1",
    { gameId: "game-future", selectedTeam: "away-b", week: 2, year: 2026 },
    now
  );
  assert.equal(
    memory.get("users/u1/seasons/2026/weeks/2/picks/game-future")?.selectedTeam,
    "away-b"
  );

  // The started game rejects the mutation with a per-game lock error.
  await assert.rejects(
    saveValidatedPick(
      db,
      "u1",
      { gameId: "game-started", selectedTeam: "away-a", week: 2, year: 2026 },
      now
    ),
    (error: unknown) =>
      error instanceof PickValidationError &&
      error.status === 403 &&
      /already started/.test(error.message)
  );
  assert.equal(
    memory.get("users/u1/seasons/2026/weeks/2/picks/game-started")?.selectedTeam,
    "home-a"
  );

  // Exactly at kickoff, picks are already locked.
  await assert.rejects(
    saveValidatedPick(
      db,
      "u1",
      { gameId: "game-future", selectedTeam: "home-b", week: 2, year: 2026 },
      Timestamp.fromDate(new Date(futureGame.date))
    ),
    PickValidationError
  );
});
