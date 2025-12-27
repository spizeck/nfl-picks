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
    record?: string;
    score?: number;
  };
  home: {
    id: string;
    name: string;
    logo: string;
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

interface ESPNEvent {
  id: string;
  date: string;
  name: string;
  shortName: string;
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

  return {
    eventId: event.id,
    date: event.date,
    away: {
      id: awayTeam.team.id,
      name: awayTeam.team.displayName,
      logo: awayTeam.team.logo,
      record: awayTeam.records?.[0]?.summary,
      score: awayTeam.score,
    },
    home: {
      id: homeTeam.team.id,
      name: homeTeam.team.displayName,
      logo: homeTeam.team.logo,
      record: homeTeam.records?.[0]?.summary,
      score: homeTeam.score,
    },
    status: {
      state,
      displayText,
      detail,
    },
  };
}

/**
 * Format game time for pre-game display
 */
function formatGameTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
