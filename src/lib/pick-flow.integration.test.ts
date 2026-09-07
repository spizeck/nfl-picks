import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { saveValidatedPick } from "./pick-storage";
import { synchronizeSchedule } from "./schedule-sync";
import type { ESPNScoreboard } from "./nfl-season";

class MemoryDocument {
  constructor(
    readonly path: string,
    private readonly records: Map<string, Record<string, unknown>>
  ) {}

  collection(name: string) {
    return new MemoryCollection(`${this.path}/${name}`, this.records);
  }

  async get() {
    const data = this.records.get(this.path);
    return { exists: data !== undefined, data: () => data };
  }

  async set(data: Record<string, unknown>) {
    this.records.set(this.path, data);
  }
}

class MemoryCollection {
  constructor(
    readonly path: string,
    private readonly records: Map<string, Record<string, unknown>>
  ) {}

  doc(id: string) {
    return new MemoryDocument(`${this.path}/${id}`, this.records);
  }
}

class MemoryFirestore {
  readonly records = new Map<string, Record<string, unknown>>();

  collection(name: string) {
    return new MemoryCollection(name, this.records);
  }

  batch() {
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
    return {
      set: (document: MemoryDocument, data: Record<string, unknown>) => {
        writes.push({ path: document.path, data });
      },
      commit: async () => {
        writes.forEach(({ path, data }) => this.records.set(path, data));
      },
    };
  }
}

const scoreboard: ESPNScoreboard = {
  season: { year: 2026, type: 2 },
  week: { number: 2 },
  events: [
    {
      id: "game-2",
      date: "2026-09-20T17:00:00Z",
      name: "Away at Home",
      shortName: "AWY @ HOM",
      season: { year: 2026, type: 2 },
      week: { number: 2 },
      competitions: [
        {
          competitors: [
            {
              homeAway: "away",
              score: 0,
              team: { id: "away", displayName: "Away", logo: "away.svg" },
            },
            {
              homeAway: "home",
              score: 0,
              team: { id: "home", displayName: "Home", logo: "home.svg" },
            },
          ],
        },
      ],
      status: {
        type: { state: "pre", completed: false, description: "Scheduled" },
      },
    },
  ],
};

test("a fresh schedule can be loaded, picked, and reloaded without pre-seeded games", async () => {
  const memory = new MemoryFirestore();
  const db = memory as unknown as FirebaseFirestore.Firestore;
  assert.equal(memory.records.has("games/game-2"), false);

  const { games } = await synchronizeSchedule(db, 2026, 2, {
    fetchImpl: (async () =>
      new Response(JSON.stringify(scoreboard), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    afterCommit: async () => undefined,
  });
  assert.equal(games[0].eventId, "game-2");
  assert.equal(memory.records.has("games/game-2"), true);

  await saveValidatedPick(
    db,
    "test-user",
    { gameId: "game-2", selectedTeam: "home", week: 2, year: 2026 },
    Timestamp.fromDate(new Date("2026-09-07T12:00:00Z"))
  );

  const reloaded = await memory
    .collection("users")
    .doc("test-user")
    .collection("seasons")
    .doc("2026")
    .collection("weeks")
    .doc("2")
    .collection("picks")
    .doc("game-2")
    .get();
  assert.equal(reloaded.exists, true);
  assert.equal(reloaded.data()?.selectedTeam, "home");
});
