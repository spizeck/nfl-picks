import { Timestamp } from "firebase-admin/firestore";
import { normalizeESPNGame, type ESPNEvent, type NormalizedGame } from "./espn-data";
import { setCachedSchedule, setScheduleSync } from "./espn-cache";
import {
  buildESPNScoreboardUrl,
  getScheduleRequest,
  getScheduleResponseStatus,
  type ESPNScoreboard,
} from "./nfl-season";

export class ScheduleUnavailableError extends Error {}
export class ScheduleNormalizationError extends Error {}

interface ScheduleSyncOptions {
  fetchImpl?: typeof fetch;
  afterCommit?: (events: ESPNEvent[]) => Promise<void>;
}

export async function synchronizeSchedule(
  adminDb: FirebaseFirestore.Firestore,
  year: number,
  week: number,
  options: ScheduleSyncOptions = {}
): Promise<{ events: ESPNEvent[]; games: Array<NormalizedGame & { week: number; year: number }> }> {
  const selection = getScheduleRequest(year, week);
  const response = await (options.fetchImpl || fetch)(buildESPNScoreboardUrl(selection), {
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);

  const data = (await response.json()) as ESPNScoreboard;
  const responseStatus = getScheduleResponseStatus(data, selection);
  if (responseStatus === "unavailable") {
    throw new ScheduleUnavailableError("The requested NFL schedule is not available yet.");
  }
  if (responseStatus === "invalid") {
    throw new Error(`ESPN returned the wrong season or week for ${year}/${week}`);
  }

  const events = data.events || [];
  const games: Array<NormalizedGame & { week: number; year: number }> = [];
  let invalidEventCount = 0;
  for (const event of events) {
    try {
      games.push({ ...normalizeESPNGame(event), week, year });
    } catch (error) {
      invalidEventCount++;
      const reason = error instanceof Error ? error.message : "Unknown normalization error";
      console.error(`Failed to normalize ESPN event ${event.id}: ${reason}`);
    }
  }
  if (invalidEventCount > 0) {
    throw new ScheduleNormalizationError(
      `ESPN returned ${invalidEventCount} malformed event${invalidEventCount === 1 ? "" : "s"}; retry schedule synchronization.`
    );
  }

  const batch = adminDb.batch();
  for (const game of games) {
    batch.set(
      adminDb.collection("games").doc(game.eventId),
      { ...game, lastUpdated: Timestamp.now() },
      { merge: true }
    );
  }
  await batch.commit();
  if (options.afterCommit) {
    await options.afterCommit(events);
  } else {
    await Promise.all([
      setCachedSchedule(year, week, events),
      setScheduleSync(year, week, events),
    ]);
  }
  return { events, games };
}
