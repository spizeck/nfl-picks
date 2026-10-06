import type { NormalizedGame } from "./espn-data";

type LockableGame = Pick<NormalizedGame, "date" | "status">;

function toMillis(now: number | Date): number {
  return typeof now === "number" ? now : now.getTime();
}

/**
 * True once the game's scheduled kickoff time has passed, regardless of what
 * the last-synced ESPN status says. The same rule the server uses to reveal
 * other users' picks.
 */
export function hasGameStarted(
  game: Pick<LockableGame, "date">,
  now: number | Date = Date.now()
): boolean {
  const kickoff = new Date(game.date).getTime();
  if (Number.isNaN(kickoff)) return false;
  return kickoff <= toMillis(now);
}

/**
 * Authoritative client-side mirror of the server's per-game pick lock: a game
 * stops accepting picks the moment its kickoff time passes, or once ESPN
 * reports it as in-progress/final (whichever we learn about first). A game
 * still showing status "pre" past its kickoff (stale feed, stale page) must
 * still render as locked — the server will reject the write anyway.
 *
 * Lock decisions are always per game. Never derive them from week-level or
 * "any game started" aggregates.
 */
export function isGameLocked(
  game: LockableGame,
  now: number | Date = Date.now()
): boolean {
  if (game.status.state !== "pre") return true;
  return hasGameStarted(game, now);
}
