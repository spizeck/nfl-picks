import assert from "node:assert/strict";
import test from "node:test";
import { normalizeESPNGame, type ESPNEvent } from "./espn-data";

interface CompetitorSpec {
  homeAway: "home" | "away";
  record?: string;
  score?: number;
}

function espnEvent(
  state: "pre" | "in" | "post",
  competitors: [CompetitorSpec, CompetitorSpec]
): ESPNEvent {
  return {
    id: "event-1",
    date: "2026-09-21T17:00:00Z",
    name: "Away at Home",
    shortName: "AWY @ HOM",
    season: { year: 2026, type: 2 },
    week: { number: 3 },
    competitions: [
      {
        competitors: competitors.map((spec) => ({
          homeAway: spec.homeAway,
          ...(spec.score !== undefined && { score: spec.score }),
          team: {
            id: spec.homeAway,
            displayName: spec.homeAway === "home" ? "Home" : "Away",
            logo: `${spec.homeAway}.svg`,
          },
          ...(spec.record !== undefined && {
            records: [{ name: "overall", type: "total", summary: spec.record }],
          }),
        })),
      },
    ],
    status: {
      type: {
        state,
        completed: state === "post",
        description: "desc",
      },
    },
  };
}

test("pre-game records pass through as the entering-week record", () => {
  // Week 3 matchup synced during Week 3: ESPN reports records through Week 2.
  const game = normalizeESPNGame(
    espnEvent("pre", [
      { homeAway: "away", record: "0-2", score: 0 },
      { homeAway: "home", record: "1-1", score: 0 },
    ])
  );
  assert.equal(game.away.record, "0-2");
  assert.equal(game.home.record, "1-1");
});

test("in-progress games keep the entering-game record", () => {
  const game = normalizeESPNGame(
    espnEvent("in", [
      { homeAway: "away", record: "1-1", score: 14 },
      { homeAway: "home", record: "0-2", score: 10 },
    ])
  );
  assert.equal(game.away.record, "1-1");
  assert.equal(game.home.record, "0-2");
});

test("completed games do not contaminate the entering-week record", () => {
  // ESPN folds the result in once a game is final: the away team entered at
  // 0-1 and won (1-1), the home team entered at 0-1 and lost (0-2).
  const game = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "1-1", score: 34 },
      { homeAway: "home", record: "0-2", score: 3 },
    ])
  );
  assert.equal(game.away.record, "0-1");
  assert.equal(game.home.record, "0-1");
});

test("ties subtract from the tie column and drop it when empty", () => {
  const game = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "1-1-1", score: 20 },
      { homeAway: "home", record: "2-0-1", score: 20 },
    ])
  );
  assert.equal(game.away.record, "1-1");
  assert.equal(game.home.record, "2-0");

  const priorTie = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "1-1-2", score: 17 },
      { homeAway: "home", record: "0-2-2", score: 17 },
    ])
  );
  assert.equal(priorTie.away.record, "1-1-1");
  assert.equal(priorTie.home.record, "0-2-1");
});

test("postseason records keep full-season wins and losses", () => {
  const game = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "12-6", score: 27 },
      { homeAway: "home", record: "9-9", score: 24 },
    ])
  );
  assert.equal(game.away.record, "11-6");
  assert.equal(game.home.record, "9-8");
});

test("missing, malformed, and inconsistent records are preserved or omitted", () => {
  const noRecords = normalizeESPNGame(
    espnEvent("pre", [{ homeAway: "away" }, { homeAway: "home" }])
  );
  assert.equal(noRecords.away.record, undefined);
  assert.equal(noRecords.home.record, undefined);

  const malformed = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "first place", score: 30 },
      { homeAway: "home", record: "0-2", score: 20 },
    ])
  );
  assert.equal(malformed.away.record, "first place");
  assert.equal(malformed.home.record, "0-1");

  // ESPN reports a result that was never folded into the record: keep the
  // summary rather than deriving a negative record.
  const inconsistent = normalizeESPNGame(
    espnEvent("post", [
      { homeAway: "away", record: "0-1", score: 30 },
      { homeAway: "home", record: "1-0", score: 20 },
    ])
  );
  assert.equal(inconsistent.away.record, "0-1");
  assert.equal(inconsistent.home.record, "1-0");
});
