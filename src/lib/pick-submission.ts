export interface SubmissionGame {
  eventId: string;
  home: { id: string; name?: string };
  away: { id: string; name?: string };
}

export type PickSide = "away" | "home";

export interface DirtyPick {
  gameId: string;
  side: PickSide;
}

export type PickSaveFailureKind = "locked" | "rejected" | "network";

export interface PickSaveFailure {
  gameId: string;
  kind: PickSaveFailureKind;
  message: string;
}

export interface PickSaveOutcome {
  savedGameIds: string[];
  failures: PickSaveFailure[];
}

/**
 * The picks that actually need to be persisted: entries whose current
 * selection differs from the last known persisted selection.
 *
 * Previously the save handler submitted the entire pick map — including
 * unchanged picks for games that had already kicked off — so editing one
 * future game produced a "this game has already started" error for a
 * different, untouched game.
 */
export function getDirtyPicks(
  picks: Record<string, PickSide>,
  savedPicks: Record<string, PickSide>
): DirtyPick[] {
  const dirty: DirtyPick[] = [];
  for (const [gameId, side] of Object.entries(picks)) {
    if (savedPicks[gameId] !== side) dirty.push({ gameId, side });
  }
  return dirty;
}

function resolveTeamId(
  side: PickSide,
  game: SubmissionGame | undefined
): string {
  if (side === "home") return game?.home.id ?? side;
  return game?.away.id ?? side;
}

function matchupLabel(
  game: SubmissionGame | undefined,
  gameId: string
): string {
  if (!game) return gameId;
  return `${game.away.name ?? "Away"} @ ${game.home.name ?? "Home"}`;
}

/**
 * Submit every unsaved pick as an independent request and reconcile the
 * outcome per game. Picks are stored per game document, so one game's failure
 * must never mask another game's success — a locked game's rejection must not
 * report or roll back an unrelated pick that actually saved.
 */
export async function submitPickChanges(options: {
  picks: Record<string, PickSide>;
  savedPicks: Record<string, PickSide>;
  games: SubmissionGame[];
  week: number;
  year: number;
  getIdToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}): Promise<PickSaveOutcome> {
  const {
    picks,
    savedPicks,
    games,
    week,
    year,
    getIdToken,
    fetchImpl = fetch,
  } = options;

  const dirty = getDirtyPicks(picks, savedPicks);
  if (dirty.length === 0) return { savedGameIds: [], failures: [] };

  const token = await getIdToken();
  const gamesById = new Map(games.map((game) => [game.eventId, game]));

  const results = await Promise.all(
    dirty.map(async ({ gameId, side }): Promise<PickSaveOutcome> => {
      const game = gamesById.get(gameId);
      const label = matchupLabel(game, gameId);
      try {
        const response = await fetchImpl("/api/user-picks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId,
            selectedTeam: resolveTeamId(side, game),
            week,
            year,
          }),
        });

        if (response.ok) return { savedGameIds: [gameId], failures: [] };

        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (response.status === 403) {
          return {
            savedGameIds: [],
            failures: [
              {
                gameId,
                kind: "locked",
                message: `${label} has already started, so that pick is locked.`,
              },
            ],
          };
        }

        return {
          savedGameIds: [],
          failures: [
            {
              gameId,
              kind: "rejected",
              message: body?.error
                ? `${label}: ${body.error}`
                : `${label}: couldn't be saved (${response.status}).`,
            },
          ],
        };
      } catch {
        return {
          savedGameIds: [],
          failures: [
            {
              gameId,
              kind: "network",
              message: `${label} couldn't be saved — check your connection and try again.`,
            },
          ],
        };
      }
    })
  );

  const savedGameIds: string[] = [];
  const failures: PickSaveFailure[] = [];
  for (const result of results) {
    savedGameIds.push(...result.savedGameIds);
    failures.push(...result.failures);
  }
  return { savedGameIds, failures };
}
