import { getAdminDb } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

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

const SCHEDULE_CACHE_DAYS = 7;
const SCORE_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function getCachedSchedule(
  year: number,
  week: number
): Promise<any[] | null> {
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

  return cachedData.events || null;
}

export async function setCachedSchedule(
  year: number,
  week: number,
  events: any[]
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
