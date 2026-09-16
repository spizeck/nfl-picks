import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPhoenixGameTime,
  getPhoenixDateTimeParts,
  isPickReminderWindow,
} from "./email-time";

// Phoenix is always UTC-7 (Arizona does not observe DST).

test("Wednesday 5 PM hour in Phoenix is inside the reminder window", () => {
  // 2026-09-16 is a Wednesday; 00:30 UTC Thursday = 17:30 Phoenix Wednesday.
  assert.equal(
    isPickReminderWindow(new Date("2026-09-17T00:30:00Z")),
    true
  );
  // Start of the window: 17:00 Phoenix = 00:00 UTC next day.
  assert.equal(
    isPickReminderWindow(new Date("2026-09-17T00:00:00Z")),
    true
  );
});

test("times outside the Wednesday 5 PM hour are rejected", () => {
  // 16:59 Phoenix Wednesday.
  assert.equal(
    isPickReminderWindow(new Date("2026-09-16T23:59:00Z")),
    false
  );
  // 18:00 Phoenix Wednesday (01:00 UTC Thursday).
  assert.equal(
    isPickReminderWindow(new Date("2026-09-17T01:00:00Z")),
    false
  );
  // 17:30 Phoenix Thursday.
  assert.equal(
    isPickReminderWindow(new Date("2026-09-18T00:30:00Z")),
    false
  );
  // 17:30 Phoenix Tuesday.
  assert.equal(
    isPickReminderWindow(new Date("2026-09-16T00:30:00Z")),
    false
  );
});

test("the window holds in both summer and winter (no DST drift)", () => {
  // July: the US observes DST but Phoenix stays UTC-7. 2026-07-01 = Wednesday.
  assert.equal(
    isPickReminderWindow(new Date("2026-07-02T00:15:00Z")),
    true
  );
  // January: standard time elsewhere, Phoenix still UTC-7. 2027-01-13 = Wednesday.
  assert.equal(
    isPickReminderWindow(new Date("2027-01-14T00:45:00Z")),
    true
  );
});

test("Phoenix parts expose civil wall-clock fields", () => {
  const parts = getPhoenixDateTimeParts(new Date("2026-09-17T00:30:00Z"));
  assert.equal(parts.weekday, "Wednesday");
  assert.equal(parts.hour, 17);
  assert.equal(parts.minute, 30);
});

test("kickoff formatting uses the Phoenix timezone label", () => {
  const text = formatPhoenixGameTime(new Date("2026-09-17T17:00:00Z"));
  assert.match(text, /Thu/);
  assert.match(text, /Sep 17/);
  assert.match(text, /10:00 AM MST/);
});
