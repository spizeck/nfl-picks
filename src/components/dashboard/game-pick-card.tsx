"use client";

import type { NormalizedGame } from "@/lib/espn-data";
import { hasGameStarted } from "@/lib/game-lock";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";
import { Check, Lock, X } from "lucide-react";

interface UserPickInfo {
  userId: string;
  displayName: string;
  photoURL: string;
  selectedTeam: string;
  result?: "win" | "loss" | "pending";
}

interface GamePickCardProps {
  game: NormalizedGame;
  selectedSide?: "away" | "home";
  onPickChange: (gameId: string, side: "away" | "home") => void;
  /** Per-game pick lock: kicked off or no longer in a pre-game state. */
  locked?: boolean;
  /** Shared clock tick from the parent so all cards lock together on time. */
  now: number;
  /** The selected pick differs from the last persisted pick. */
  unsaved?: boolean;
  /** Save failure specific to this game, shown inline under the status. */
  saveError?: string;
  userPicks?: UserPickInfo[];
}

export function GamePickCard({
  game,
  selectedSide,
  onPickChange,
  locked = false,
  now,
  unsaved = false,
  saveError,
  userPicks = [],
}: GamePickCardProps) {
  const isAwaySelected = selectedSide === "away";
  const isHomeSelected = selectedSide === "home";
  const isGameLive = game.status.state === "in";
  const isGameFinal = game.status.state === "post";
  const started = hasGameStarted(game, now);

  // Format the display time in user's local timezone
  const formatLocalTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get the local time for display
  const localDisplayTime = !isGameFinal && !isGameLive ? formatLocalTime(game.date) : game.status.displayText;

  const awayPicks = started
    ? userPicks.filter((p) => p.selectedTeam === game.away.id)
    : [];
  const homePicks = started
    ? userPicks.filter((p) => p.selectedTeam === game.home.id)
    : [];

  // Determine if user picked correctly (only for final games)
  let userPickedCorrectly: boolean | null = null;
  if (
    isGameFinal &&
    selectedSide &&
    game.away.score !== undefined &&
    game.home.score !== undefined
  ) {
    // Convert scores to numbers for proper comparison
    const awayScore = Number(game.away.score);
    const homeScore = Number(game.home.score);

    // Determine which team won based on scores
    const winningTeamId =
      awayScore > homeScore
        ? game.away.id
        : homeScore > awayScore
        ? game.home.id
        : null;

    // Get the team ID the user selected
    const userSelectedTeamId =
      selectedSide === "away" ? game.away.id : game.home.id;

    // User picked correctly if their selected team won
    userPickedCorrectly =
      winningTeamId !== null && userSelectedTeamId === winningTeamId;
  }

  const handleAwayClick = () => {
    if (!locked) {
      onPickChange(game.eventId, "away");
    }
  };

  const handleHomeClick = () => {
    if (!locked) {
      onPickChange(game.eventId, "home");
    }
  };

  const teamButtonClass = (selected: boolean) =>
    cn(
      "group relative p-4 transition-colors touch-manipulation",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      selected ? "bg-muted" : "bg-transparent",
      locked
        ? "cursor-not-allowed opacity-60"
        : "cursor-pointer hover:bg-muted active:bg-muted/80"
    );

  const selectionBarClass = (side: "away" | "home") =>
    cn(
      "absolute top-0 h-full w-1 bg-foreground",
      side === "away" ? "left-0" : "right-0"
    );

  const teamInnerClass =
    "flex flex-col items-center justify-center h-full gap-2 transition-transform duration-100 ease-out motion-safe:group-active:scale-[0.96]";

  return (
    <div
      className={cn(
        "border rounded-none border-b-0 last:border-b overflow-hidden bg-card transition-colors",
        !locked && "hover:bg-muted/50"
      )}
    >
      <div className="grid grid-cols-3 items-stretch min-h-[120px]">
        {/* LEFT: Away Team */}
        <button
          onClick={handleAwayClick}
          disabled={locked}
          className={cn(teamButtonClass(isAwaySelected), "border-r")}
          aria-pressed={isAwaySelected}
          aria-label={`Pick ${game.away.name}`}
          title={locked ? "Picks are locked for this game" : undefined}
        >
          {isAwaySelected && (
            <span className={selectionBarClass("away")} aria-hidden="true" />
          )}
          <div className={teamInnerClass}>
            {game.away.logo ? (
              <Image
                src={game.away.logo}
                alt={game.away.name}
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            ) : (
              <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-full">
                <span className="text-xs font-bold">
                  {game.away.abbreviation ||
                    game.away.name.substring(0, 3).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <p
                className={cn(
                  "text-sm text-center leading-tight",
                  isAwaySelected
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground"
                )}
              >
                {game.away.name}
              </p>
              {game.away.record && (
                <p className="text-xs text-muted-foreground">
                  {game.away.record}
                </p>
              )}
              {isAwaySelected && unsaved && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Unsaved
                </p>
              )}
            </div>
            {started && awayPicks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 justify-center">
                {awayPicks.map((pick) => (
                  <div key={pick.userId} className="relative">
                    <Avatar className="h-6 w-6 border-2 border-background">
                      <AvatarImage src={pick.photoURL} alt={pick.displayName} />
                      <AvatarFallback className="text-xs">
                        {pick.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isGameFinal && pick.result && (
                      <div className="absolute -top-1 -right-1 bg-background rounded-full">
                        {pick.result === "win" ? (
                          <Check
                            className="h-3 w-3 text-green-600"
                            strokeWidth={3}
                          />
                        ) : (
                          <X className="h-3 w-3 text-red-600" strokeWidth={3} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </button>

        {/* CENTER: Status */}
        <div className="flex flex-col items-center justify-center px-4 py-2 gap-1 bg-background">
          {isGameFinal ? (
            <>
              {userPickedCorrectly !== null && (
                <div className="mb-1">
                  {userPickedCorrectly ? (
                    <Check className="h-6 w-6 text-green-600" strokeWidth={3} />
                  ) : (
                    <X className="h-6 w-6 text-red-600" strokeWidth={3} />
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground font-medium">Final</p>
              {game.status.detail && (
                <p className="text-lg font-bold">{game.status.detail}</p>
              )}
            </>
          ) : isGameLive ? (
            <>
              <p className="text-lg font-bold">{game.status.displayText}</p>
              {game.status.detail && (
                <p className="text-xs text-muted-foreground">
                  {game.status.detail}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground text-center">
                {localDisplayTime}
              </p>
              {locked && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Locked
                </p>
              )}
            </>
          )}
          {locked && !selectedSide && !isGameFinal && (
            <p className="text-[11px] text-muted-foreground">No pick</p>
          )}
          {saveError && (
            <p role="alert" className="text-xs text-destructive text-center">
              {saveError}
            </p>
          )}
        </div>

        {/* RIGHT: Home Team */}
        <button
          onClick={handleHomeClick}
          disabled={locked}
          className={cn(teamButtonClass(isHomeSelected), "border-l")}
          aria-pressed={isHomeSelected}
          aria-label={`Pick ${game.home.name}`}
          title={locked ? "Picks are locked for this game" : undefined}
        >
          {isHomeSelected && (
            <span className={selectionBarClass("home")} aria-hidden="true" />
          )}
          <div className={teamInnerClass}>
            {game.home.logo ? (
              <Image
                src={game.home.logo}
                alt={game.home.name}
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            ) : (
              <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-full">
                <span className="text-xs font-bold">
                  {game.home.abbreviation ||
                    game.home.name.substring(0, 3).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <p
                className={cn(
                  "text-sm text-center leading-tight",
                  isHomeSelected
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground"
                )}
              >
                {game.home.name}
              </p>
              {game.home.record && (
                <p className="text-xs text-muted-foreground">
                  {game.home.record}
                </p>
              )}
              {isHomeSelected && unsaved && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Unsaved
                </p>
              )}
            </div>
            {started && homePicks.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 justify-center">
                {homePicks.map((pick) => (
                  <div key={pick.userId} className="relative">
                    <Avatar className="h-6 w-6 border-2 border-background">
                      <AvatarImage src={pick.photoURL} alt={pick.displayName} />
                      <AvatarFallback className="text-xs">
                        {pick.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isGameFinal && pick.result && (
                      <div className="absolute -top-1 -right-1 bg-background rounded-full">
                        {pick.result === "win" ? (
                          <Check
                            className="h-3 w-3 text-green-600"
                            strokeWidth={3}
                          />
                        ) : (
                          <X className="h-3 w-3 text-red-600" strokeWidth={3} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
