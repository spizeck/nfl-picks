/**
 * Data normalization utilities for ESPN API responses
 */

export interface NormalizedGame {
  eventId: string;
  date: string;
  away: {
    id: string;
    name: string;
    logo: string;
    abbreviation?: string;
    // Season record the team carried into this game (e.g. "1-1" or "1-0-1").
    record?: string;
    score?: number;
  };
  home: {
    id: string;
    name: string;
    logo: string;
    abbreviation?: string;
    // Season record the team carried into this game (e.g. "1-1" or "1-0-1").
    record?: string;
    score?: number;
  };
  status: {
    state: "pre" | "in" | "post";
    displayText: string;
    detail?: string;
  };
}

interface ESPNCompetitor {
  team: {
    id: string;
    displayName: string;
    logo: string;
  };
  score?: number;
  homeAway: "home" | "away";
  records?: Array<{
    summary?: string;
  }>;
}

export interface ESPNEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  competitions: Array<{
    competitors: ESPNCompetitor[];
  }>;
  status: {
    type: {
      state: string;
      completed: boolean;
      description: string;
      detail?: string;
      shortDetail?: string;
    };
    displayClock?: string;
    period?: number;
  };
}

/**
 * Normalize ESPN event data into a clean game model
 */
export function normalizeESPNGame(event: ESPNEvent): NormalizedGame {
  // Validate event structure
  if (!event.competitions || event.competitions.length === 0) {
    throw new Error(`Invalid game data: missing competitions array for event ${event.id}`);
  }

  const competition = event.competitions[0];
  
  if (!competition.competitors || competition.competitors.length === 0) {
    throw new Error(`Invalid game data: missing competitors for event ${event.id}`);
  }

  const competitors = competition.competitors;

  // Find away and home teams (ESPN ordering can vary)
  const awayTeam = competitors.find((c) => c.homeAway === "away");
  const homeTeam = competitors.find((c) => c.homeAway === "home");

  if (!awayTeam || !homeTeam) {
    throw new Error(`Invalid game data: missing away or home team for event ${event.id}`);
  }

  // Determine game state
  const statusType = event.status.type;
  let state: "pre" | "in" | "post";
  if (statusType.completed) {
    state = "post";
  } else if (statusType.state === "pre") {
    state = "pre";
  } else {
    state = "in";
  }

  // Build display text for center column
  let displayText: string;
  let detail: string | undefined;

  if (state === "post") {
    displayText = "Final";
    detail = `${awayTeam.score ?? 0}–${homeTeam.score ?? 0}`;
  } else if (state === "in") {
    const awayScore = awayTeam.score ?? 0;
    const homeScore = homeTeam.score ?? 0;
    displayText = `${awayScore}–${homeScore}`;
    
    // Add quarter/period and clock if available
    if (event.status.period && event.status.displayClock) {
      const quarter = getQuarterLabel(event.status.period);
      detail = `${quarter} ${event.status.displayClock}`;
    } else if (statusType.shortDetail) {
      detail = statusType.shortDetail;
    }
  } else {
    // Pre-game: show date/time
    const gameDate = new Date(event.date);
    displayText = formatGameTime(gameDate);
  }

  const awayRecord = enteringGameRecord(
    awayTeam,
    state,
    awayTeam.score,
    homeTeam.score
  );
  const homeRecord = enteringGameRecord(
    homeTeam,
    state,
    homeTeam.score,
    awayTeam.score
  );

  return {
    eventId: event.id,
    date: event.date,
    away: {
      id: awayTeam.team.id,
      name: awayTeam.team.displayName,
      logo: awayTeam.team.logo,
      ...(awayRecord !== undefined && { record: awayRecord }),
      ...(awayTeam.score !== undefined && { score: awayTeam.score }),
    },
    home: {
      id: homeTeam.team.id,
      name: homeTeam.team.displayName,
      logo: homeTeam.team.logo,
      ...(homeRecord !== undefined && { record: homeRecord }),
      ...(homeTeam.score !== undefined && { score: homeTeam.score }),
    },
    status: {
      state,
      displayText,
      ...(detail && { detail }),
    },
  };
}

/**
 * Resolve the season record a team carried into a game.
 *
 * ESPN's overall record summary means different things depending on game
 * state: for upcoming and in-progress games it is the record entering the
 * game, but once a game is final ESPN folds that game's own result in. The
 * matchup cards display the entering-game record, so undo the result for
 * completed games ("2-0" after a win becomes "1-0").
 */
function enteringGameRecord(
  competitor: ESPNCompetitor,
  state: "pre" | "in" | "post",
  teamScore: number | undefined,
  opponentScore: number | undefined
): string | undefined {
  const summary = competitor.records?.[0]?.summary;
  if (
    summary === undefined ||
    state !== "post" ||
    teamScore === undefined ||
    opponentScore === undefined
  ) {
    return summary;
  }
  const outcome =
    teamScore > opponentScore
      ? "win"
      : teamScore < opponentScore
        ? "loss"
        : "tie";
  return subtractGameResult(summary, outcome);
}

/**
 * Remove a game's own result from a post-game record summary.
 * Returns the original summary when it cannot be safely adjusted.
 */
function subtractGameResult(
  summary: string,
  outcome: "win" | "loss" | "tie"
): string {
  const match = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(summary.trim());
  if (!match) return summary;

  let wins = Number(match[1]);
  let losses = Number(match[2]);
  let ties = match[3] === undefined ? 0 : Number(match[3]);

  if (outcome === "win") wins -= 1;
  else if (outcome === "loss") losses -= 1;
  else ties -= 1;

  // Inconsistent data (e.g. ESPN had not folded the result in yet): keep the
  // reported summary rather than deriving an impossible record.
  if (wins < 0 || losses < 0 || ties < 0) return summary;

  // ESPN only renders the tie column when the team has a tie.
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/**
 * Format game time for pre-game display
 */
export function formatGameTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

/**
 * Get quarter label from period number
 */
function getQuarterLabel(period: number): string {
  if (period <= 4) {
    return `${period}${getOrdinalSuffix(period)}`;
  }
  return `OT${period > 5 ? period - 4 : ""}`;
}

/**
 * Get ordinal suffix for numbers (1st, 2nd, 3rd, 4th)
 */
function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
