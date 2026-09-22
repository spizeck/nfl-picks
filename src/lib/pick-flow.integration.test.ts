import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { saveValidatedPick } from "./pick-storage";
import {
  ScheduleNormalizationError,
  synchronizeSchedule,
} from "./schedule-sync";
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

test("resyncing a week rolls stored records forward and keeps entering-week records", async () => {
  const memory = new MemoryFirestore();
  const db = memory as unknown as FirebaseFirestore.Firestore;

  // Stale doc left over from a Week 3 sync that ran before Week 2 finished.
  memory.records.set("games/game-3", {
    eventId: "game-3",
    date: "2026-09-21T17:00:00Z",
    week: 3,
    year: 2026,
    away: { id: "away", name: "Away", logo: "away.svg", record: "0-1" },
    home: { id: "home", name: "Home", logo: "home.svg", record: "1-0" },
    status: { state: "pre", displayText: "Sun 1:00 PM" },
  });

  const week3Pre: ESPNScoreboard = {
    season: { year: 2026, type: 2 },
    week: { number: 3 },
    events: [
      {
        id: "game-3",
        date: "2026-09-21T17:00:00Z",
        name: "Away at Home",
        shortName: "AWY @ HOM",
        season: { year: 2026, type: 2 },
        week: { number: 3 },
        competitions: [
          {
            competitors: [
              {
                homeAway: "away",
                score: 0,
                team: { id: "away", displayName: "Away", logo: "away.svg" },
                records: [{ summary: "0-2" }],
              },
              {
                homeAway: "home",
                score: 0,
                team: { id: "home", displayName: "Home", logo: "home.svg" },
                records: [{ summary: "1-1" }],
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
  const fetchImpl = (payload: ESPNScoreboard) =>
    (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

  // Weekly rollover: the resync must overwrite the stale Week 1 snapshot with
  // records through Week 2.
  const { games } = await synchronizeSchedule(db, 2026, 3, {
    fetchImpl: fetchImpl(week3Pre),
    afterCommit: async () => undefined,
  });
  assert.equal(games[0].away.record, "0-2");
  assert.equal(
    (memory.records.get("games/game-3")?.away as { record?: string })?.record,
    "0-2"
  );

  // Historical view after the game finished: ESPN folds the result into its
  // record summary, but the stored record must stay the entering-week record.
  const week3Post = structuredClone(week3Pre);
  const event = week3Post.events![0];
  event.status = {
    type: { state: "post", completed: true, description: "Final" },
  };
  const [away, home] = event.competitions[0].competitors;
  away.score = 34;
  away.records = [{ summary: "1-2" }];
  home.score = 3;
  home.records = [{ summary: "1-2" }];

  await synchronizeSchedule(db, 2026, 3, {
    fetchImpl: fetchImpl(week3Post),
    afterCommit: async () => undefined,
  });
  const stored = memory.records.get("games/game-3") as {
    away: { record?: string };
    home: { record?: string };
  };
  assert.equal(stored.away.record, "0-2");
  assert.equal(stored.home.record, "1-1");
});

test("one malformed ESPN event prevents all writes and completeness updates", async () => {
  const memory = new MemoryFirestore();
  const db = memory as unknown as FirebaseFirestore.Firestore;
  const response = structuredClone(scoreboard);
  response.events!.push({
    id: "malformed-game",
    season: { year: 2026, type: 2 },
    week: { number: 2 },
  } as never);
  let markedComplete = false;

  await assert.rejects(
    synchronizeSchedule(db, 2026, 2, {
      fetchImpl: (async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
      afterCommit: async () => {
        markedComplete = true;
      },
    }),
    ScheduleNormalizationError
  );

  assert.equal(memory.records.size, 0);
  assert.equal(memory.records.has("games/game-2"), false);
  assert.equal(memory.records.has("games/malformed-game"), false);
  assert.equal(markedComplete, false);
});
