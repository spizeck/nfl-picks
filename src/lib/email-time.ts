/**
 * Time helpers for email scheduling.
 *
 * The pick-reminder job is defined in `America/Phoenix` civil time
 * (Wednesday 5:00 PM). Arizona does not observe daylight saving time, so the
 * UTC offset never changes, but we still resolve the wall-clock through the
 * IANA timezone instead of assuming a fixed offset.
 */

export const PHOENIX_TIME_ZONE = "America/Phoenix";

export const PICK_REMINDER_WEEKDAY = "Wednesday";
export const PICK_REMINDER_HOUR = 17;

export interface PhoenixDateTimeParts {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const phoenixFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHOENIX_TIME_ZONE,
  weekday: "long",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export function getPhoenixDateTimeParts(now = new Date()): PhoenixDateTimeParts {
  const parts: Record<string, string> = {};
  for (const part of phoenixFormatter.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    weekday: parts.weekday,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * True when `now` falls inside the Wednesday 5:00 PM hour in Phoenix.
 */
export function isPickReminderWindow(now = new Date()): boolean {
  const phoenix = getPhoenixDateTimeParts(now);
  return (
    phoenix.weekday === PICK_REMINDER_WEEKDAY &&
    phoenix.hour === PICK_REMINDER_HOUR
  );
}

const phoenixGameTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PHOENIX_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * Kickoff display for reminder emails, e.g. "Thu, Sep 17, 6:15 PM MST".
 */
export function formatPhoenixGameTime(date: Date): string {
  return phoenixGameTimeFormatter.format(date);
}
