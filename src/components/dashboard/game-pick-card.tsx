"use client";

import type { NormalizedGame } from "@/lib/espn-data";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Image from "next/image";

interface UserPickInfo {
  userId: string;
  displayName: string;
  photoURL: string;
  selectedTeam: string;
}

interface GamePickCardProps {
  game: NormalizedGame;
  selectedSide?: "away" | "home";
  onPickChange: (gameId: string, side: "away" | "home") => void;
  disabled?: boolean;
  userPicks?: UserPickInfo[];
}

export function GamePickCard({ game, selectedSide, onPickChange, disabled, userPicks = [] }: GamePickCardProps) {
  const isAwaySelected = selectedSide === "away";
  const isHomeSelected = selectedSide === "home";
  const isGameLive = game.status.state === "in";
  const isGameFinal = game.status.state === "post";
  const isGameLocked = isGameLive || isGameFinal;

  // Filter picks by team for locked games
  const awayPicks = isGameLocked ? userPicks.filter(p => p.selectedTeam === game.away.id) : [];
  const homePicks = isGameLocked ? userPicks.filter(p => p.selectedTeam === game.home.id) : [];

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
      <div className="grid grid-cols-3 items-stretch min-h-120px">
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
            <Image
              src={game.away.logo}
              alt={game.away.name}
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <div className="flex flex-col items-center gap-0.5">
              <p className={cn(
                "text-sm text-center leading-tight",
                isAwaySelected ? "font-bold text-foreground" : "font-medium text-muted-foreground"
              )}>
                {game.away.name}
              </p>
              {game.away.record && (
                <p className="text-xs text-muted-foreground">
                  {game.away.record}
                </p>
              )}
            </div>
            {isGameLocked && awayPicks.length > 0 && (
              <div className="flex gap-1 mt-1">
                {awayPicks.map((pick) => (
                  <Avatar key={pick.userId} className="h-6 w-6 border-2 border-background">
                    <AvatarImage src={pick.photoURL} alt={pick.displayName} />
                    <AvatarFallback className="text-xs">
                      {pick.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
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
            <Image
              src={game.home.logo}
              alt={game.home.name}
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <div className="flex flex-col items-center gap-0.5">
              <p className={cn(
                "text-sm text-center leading-tight",
                isHomeSelected ? "font-bold text-foreground" : "font-medium text-muted-foreground"
              )}>
                {game.home.name}
              </p>
              {game.home.record && (
                <p className="text-xs text-muted-foreground">
                  {game.home.record}
                </p>
              )}
            </div>
            {isGameLocked && homePicks.length > 0 && (
              <div className="flex gap-1 mt-1">
                {homePicks.map((pick) => (
                  <Avatar key={pick.userId} className="h-6 w-6 border-2 border-background">
                    <AvatarImage src={pick.photoURL} alt={pick.displayName} />
                    <AvatarFallback className="text-xs">
                      {pick.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
