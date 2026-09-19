import assert from "node:assert/strict";
import test from "node:test";
import { renderRecapEmail, renderReminderEmail } from "./email-templates";
import type { StoredGame } from "./email-reminder";
import type { WeeklyRecapModel } from "./email-recap";

const reminderGame: StoredGame = {
  eventId: "g1",
  date: "2026-09-18T00:20:00Z",
  week: 3,
  year: 2026,
  away: { id: "cle", name: "Cleveland Browns", logo: "" },
  home: { id: "pit", name: "Pittsburgh Steelers", logo: "" },
  status: { state: "pre", displayText: "pre" },
};

test("reminder email lists missing matchups and links to the picks page", () => {
  const rendered = renderReminderEmail({
    displayName: "Alice",
    weekLabel: "Week 3",
    missingGames: [reminderGame],
    appUrl: "https://picks.example.com",
  });

  assert.match(rendered.subject, /1 pick left for Week 3/);
  assert.match(rendered.html, /Cleveland Browns/);
  assert.match(rendered.html, /Pittsburgh Steelers/);
  assert.match(rendered.html, /href="https:\/\/picks\.example\.com\/"/);
  assert.match(rendered.text, /Cleveland Browns at Pittsburgh Steelers/);
  assert.match(rendered.text, /https:\/\/picks\.example\.com\//);
});

test("emails escape user-controlled content", () => {
  const rendered = renderReminderEmail({
    displayName: '<img src=x onerror="alert(1)">',
    weekLabel: "Week 3",
    missingGames: [reminderGame],
    appUrl: "https://picks.example.com",
  });
  assert.equal(rendered.html.includes('<img src=x onerror="alert(1)">'), false);
  assert.match(rendered.html, /&lt;img/);
});

const recapModel: WeeklyRecapModel = {
  displayName: "Alice",
  year: 2026,
  week: 3,
  weekLabel: "Week 3",
  headline: "Clean Sweep! 🧹",
  weeklyWins: 2,
  weeklyLosses: 0,
  weeklyPending: 0,
  weeklyRank: 1,
  seasonWins: 9,
  seasonLosses: 4,
  overallRank: 2,
  totalPlayers: 4,
  rankDelta: 1,
  previousRank: 3,
  topThree: [
    { rank: 1, displayName: "Bob", wins: 11, losses: 3, isUser: false },
    { rank: 2, displayName: "Alice", wins: 9, losses: 4, isUser: true },
    { rank: 3, displayName: "Carol", wins: 8, losses: 6, isUser: false },
  ],
  bestPick: {
    matchup: "Cleveland Browns at Pittsburgh Steelers",
    pickedTeamName: "Pittsburgh Steelers",
    pickersForTeam: 1,
    totalPickers: 4,
  },
  results: [
    {
      eventId: "g1",
      matchup: "Cleveland Browns at Pittsburgh Steelers",
      pickedTeamName: "Pittsburgh Steelers",
      result: "win",
      scoreText: "10–24",
    },
    {
      eventId: "g2",
      matchup: "Dallas Cowboys at New York Giants",
      pickedTeamName: "Dallas Cowboys",
      result: "win",
      scoreText: "27–20",
    },
  ],
  appUrl: "https://picks.example.com",
};

test("recap email renders records, ranks, movement, top 3, and best pick", () => {
  const rendered = renderRecapEmail(recapModel);

  assert.match(rendered.subject, /Week 3 recap: 2-0/);
  assert.match(rendered.html, /Clean Sweep!/);
  assert.match(rendered.html, /#2 of 4/);
  assert.match(rendered.html, /▲ 1/);
  assert.match(rendered.html, /was #3/);
  assert.match(rendered.html, /Bob/);
  assert.match(rendered.html, /Carol/);
  assert.match(rendered.html, /Boldest call/);
  assert.match(rendered.html, /Only 1 of 4 pickers/);
  assert.match(rendered.html, /10–24/);
  assert.match(rendered.html, /href="https:\/\/picks\.example\.com\/"/);
  assert.match(rendered.text, /This week: 2-0/);
});

test("recap boldest call names the picked team naturally in html and text", () => {
  const rendered = renderRecapEmail(recapModel);

  const sentence =
    "Your boldest call was to pick the Pittsburgh Steelers to win.";
  assert.ok(rendered.html.includes(sentence));
  assert.ok(rendered.text.includes(sentence));
  // Picker-share copy is preserved alongside the natural sentence.
  const share = "Only 1 of 4 pickers took them.";
  assert.ok(rendered.html.includes(share));
  assert.ok(rendered.text.includes(share));
});

test("recap boldest call never renders 'Team over Team at Opponent'", () => {
  const rendered = renderRecapEmail({
    ...recapModel,
    bestPick: {
      matchup: "Arizona Cardinals at Los Angeles Chargers",
      pickedTeamName: "Arizona Cardinals",
      pickersForTeam: 3,
      totalPickers: 10,
    },
  });

  assert.doesNotMatch(rendered.html, / over /);
  assert.doesNotMatch(rendered.text, / over /);
  assert.equal(
    rendered.html.includes(
      "Arizona Cardinals over Arizona Cardinals at Los Angeles Chargers"
    ),
    false
  );
  assert.ok(
    rendered.html.includes(
      "Your boldest call was to pick the Arizona Cardinals to win."
    )
  );
  assert.ok(rendered.html.includes("Only 3 of 10 pickers took them."));
  assert.ok(
    rendered.text.includes(
      "Your boldest call was to pick the Arizona Cardinals to win."
    )
  );
  assert.ok(rendered.text.includes("Only 3 of 10 pickers took them."));
});

test("recap email omits optional blocks when data is unavailable", () => {
  const rendered = renderRecapEmail({
    ...recapModel,
    rankDelta: null,
    previousRank: null,
    bestPick: null,
    results: [],
    headline: "The Tape Is In 📼",
  });
  assert.equal(rendered.html.includes("Boldest call"), false);
  assert.equal(rendered.html.includes("was #"), false);
  assert.match(rendered.html, /Leaderboard movement: —/);
});
