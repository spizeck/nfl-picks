/**
 * Incomplete-picks reminder domain logic.
 *
 * A game is still pickable until its kickoff time passes — this mirrors the
 * server-side pick validation in `pick-storage.ts`, which rejects picks once
 * `gameStartTime <= now`. Locked or kicked-off games are never counted as
 * picks a user can still make.
 */

import type { NormalizedGame } from "./espn-data";

export type StoredGame = NormalizedGame & { week: number; year: number };

/**
 * Games whose picks can still be submitted (kickoff is in the future).
 */
export function getPickableGames(
  games: StoredGame[],
  now = new Date()
): StoredGame[] {
  const nowMillis = now.getTime();
  return games.filter(
    (game) => new Date(game.date).getTime() > nowMillis
  );
}

/**
 * Pickable games the user has not picked yet.
 */
export function getMissingPickGames(
  games: StoredGame[],
  pickedGameIds: ReadonlySet<string>,
  now = new Date()
): StoredGame[] {
  return getPickableGames(games, now).filter(
    (game) => !pickedGameIds.has(game.eventId)
  );
}
