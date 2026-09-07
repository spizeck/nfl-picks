import { getAdminDb } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { ESPNEvent } from "./espn-data";
import {
  getScheduleRequest,
  isMatchingSchedule,
  isValidScheduleSync,
} from "./nfl-season";

export interface CacheEntry<T> {
  data: T;
  timestamp: Timestamp;
  expiresAt: Timestamp;
}

export interface ScheduleCacheKey {
  type: "schedule";
  year: number;
  week: number;
}

export interface ScoreUpdateMeta {
  timestamp: Timestamp;
  week: number;
  year: number;
}

export interface ScheduleSyncMeta {
  timestamp: Timestamp;
  expiresAt: Timestamp;
  eventIds: string[];
  seasonType: number;
  espnWeek: number;
  week: number;
  year: number;
}

const SCHEDULE_CACHE_DAYS = 7;
const SCORE_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedSchedule(
  year: number,
  week: number
): Promise<ESPNEvent[] | null> {
  const adminDb = getAdminDb();
  if (!adminDb) return null;

  const cacheKey = `schedule-${year}-${week}`;
  const cacheDoc = await adminDb.collection("cache").doc(cacheKey).get();

  if (!cacheDoc.exists) return null;

  const cachedData = cacheDoc.data();
  if (!cachedData) return null;

  const now = Timestamp.now();
  if (cachedData.expiresAt && cachedData.expiresAt.toMillis() < now.toMillis()) {
    return null;
  }

  const events = (cachedData.events || []) as ESPNEvent[];
  const selection = getScheduleRequest(year, week);
  return isMatchingSchedule(
    {
      season: { year, type: selection.seasonType },
      week: { number: selection.espnWeek },
      events,
    },
    selection
  )
    ? events
    : null;
}

export async function setCachedSchedule(
  year: number,
  week: number,
  events: ESPNEvent[]
): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const cacheKey = `schedule-${year}-${week}`;
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + SCHEDULE_CACHE_DAYS * 24 * 60 * 60 * 1000
  );

  await adminDb
    .collection("cache")
    .doc(cacheKey)
    .set({
      events,
      timestamp: now,
      expiresAt,
      week,
      year,
    });
}

export async function getFreshScheduleSync(
  year: number,
  week: number
): Promise<string[] | null> {
  const adminDb = getAdminDb();
  if (!adminDb) return null;

  const syncDoc = await adminDb.collection("cache").doc(`schedule-sync-${year}-${week}`).get();
  if (!syncDoc.exists) return null;

  const sync = syncDoc.data() as ScheduleSyncMeta | undefined;
  const selection = getScheduleRequest(year, week);
  if (
    !sync ||
    !Array.isArray(sync.eventIds) ||
    !sync.expiresAt ||
    !isValidScheduleSync(
      {
        year: sync.year,
        week: sync.week,
        seasonType: sync.seasonType,
        espnWeek: sync.espnWeek,
        eventIds: sync.eventIds,
        expiresAtMillis: sync.expiresAt.toMillis(),
      },
      selection
    )
  ) {
    return null;
  }
  return sync.eventIds;
}

export async function setScheduleSync(
  year: number,
  week: number,
  events: ESPNEvent[]
): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb || events.length === 0) return;

  const selection = getScheduleRequest(year, week);
  const now = Timestamp.now();
  await adminDb.collection("cache").doc(`schedule-sync-${year}-${week}`).set({
    timestamp: now,
    expiresAt: Timestamp.fromMillis(
      now.toMillis() + SCHEDULE_CACHE_DAYS * 24 * 60 * 60 * 1000
    ),
    eventIds: events.map((event) => event.id).sort(),
    seasonType: selection.seasonType,
    espnWeek: selection.espnWeek,
    week,
    year,
  } satisfies ScheduleSyncMeta);
}

export async function shouldUpdateScores(): Promise<boolean> {
  const adminDb = getAdminDb();
  if (!adminDb) return true;

  const lastUpdateDoc = await adminDb
    .collection("cache")
    .doc("scores-last-update")
    .get();

  if (!lastUpdateDoc.exists) return true;

  const lastUpdate = lastUpdateDoc.data() as ScoreUpdateMeta;
  if (!lastUpdate.timestamp) return true;

  const now = Date.now();
  const lastUpdateTime = lastUpdate.timestamp.toMillis();
  const timeSinceUpdate = now - lastUpdateTime;

  return timeSinceUpdate >= SCORE_UPDATE_INTERVAL_MS;
}

export async function markScoresUpdated(
  year: number,
  week: number
): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  await adminDb
    .collection("cache")
    .doc("scores-last-update")
    .set({
      timestamp: Timestamp.now(),
      week,
      year,
    });
}

export async function getActiveGames(
  year: number,
  week: number
): Promise<string[]> {
  const adminDb = getAdminDb();
  if (!adminDb) return [];

  const gamesSnapshot = await adminDb
    .collection("games")
    .where("year", "==", year)
    .where("week", "==", week)
    .where("status.state", "in", ["pre", "in"])
    .get();

  return gamesSnapshot.docs.map((doc) => doc.id);
}
