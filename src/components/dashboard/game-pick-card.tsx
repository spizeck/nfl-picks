"use client";

import type { NormalizedGame } from "@/lib/espn-data";
import { cn } from "@/lib/utils";

interface GamePickCardProps {
  game: NormalizedGame;
  selectedSide?: "away" | "home";
  onPickChange: (gameId: string, side: "away" | "home") => void;
  disabled?: boolean;
}

export function GamePickCard({ game, selectedSide, onPickChange, disabled }: GamePickCardProps) {
  const isAwaySelected = selectedSide === "away";
  const isHomeSelected = selectedSide === "home";
  const isGameLive = game.status.state === "in";
  const isGameFinal = game.status.state === "post";

  const handleAwayClick = () => {
    if (!disabled) {
      onPickChange(game.eventId, "away");
    }
  };

  const handleHomeClick = () => {
    if (!disabled) {
      onPickChange(game.eventId, "home");
    }
  };

  return (
    <div className="border rounded-none border-b-0 last:border-b overflow-hidden bg-card hover:bg-muted/50 transition-colors">
      <div className="grid grid-cols-3 items-stretch min-h-[120px]">
        {/* LEFT: Away Team */}
        <button
          onClick={handleAwayClick}
          disabled={disabled}
          className={cn(
            "p-4 border-r transition-all",
            isAwaySelected ? "bg-muted border-l-4 border-l-foreground" : "bg-transparent",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted"
          )}
          aria-pressed={isAwaySelected}
        >
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <img
              src={game.away.logo}
              alt={game.away.name}
              className="h-10 w-10 object-contain"
            />
            <div className="flex flex-col items-center gap-0.5">
              <p className={cn(
                "text-sm text-center leading-tight",
                isAwaySelected ? "font-bold" : "font-medium"
              )}>
                {game.away.name}
              </p>
              {game.away.record && (
                <p className="text-xs text-muted-foreground">
                  {game.away.record}
                </p>
              )}
            </div>
          </div>
        </button>

        {/* CENTER: Status */}
        <div className="flex flex-col items-center justify-center px-4 py-2 gap-1 bg-background">
          {isGameFinal ? (
            <>
              <p className="text-xs text-muted-foreground font-medium">
                Final
              </p>
              {game.status.detail && (
                <p className="text-lg font-bold">
                  {game.status.detail}
                </p>
              )}
            </>
          ) : isGameLive ? (
            <>
              <p className="text-lg font-bold">
                {game.status.displayText}
              </p>
              {game.status.detail && (
                <p className="text-xs text-muted-foreground">
                  {game.status.detail}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              {game.status.displayText}
            </p>
          )}
        </div>

        {/* RIGHT: Home Team */}
        <button
          onClick={handleHomeClick}
          disabled={disabled}
          className={cn(
            "p-4 border-l transition-all",
            isHomeSelected ? "bg-muted border-l-4 border-l-foreground" : "bg-transparent",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted"
          )}
          aria-pressed={isHomeSelected}
        >
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <img
              src={game.home.logo}
              alt={game.home.name}
              className="h-10 w-10 object-contain"
            />
            <div className="flex flex-col items-center gap-0.5">
              <p className={cn(
                "text-sm text-center leading-tight",
                isHomeSelected ? "font-bold" : "font-medium"
              )}>
                {game.home.name}
              </p>
              {game.home.record && (
                <p className="text-xs text-muted-foreground">
                  {game.home.record}
                </p>
              )}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
