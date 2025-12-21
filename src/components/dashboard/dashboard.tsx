"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { LeaderboardCard } from "./leaderboard-card";
import { GamePickCard } from "./game-pick-card";
import { WeekDropdown } from "../layout/week-dropdown";
import { getFirebaseAuth } from "@/lib/firebase";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";
import type { User as FirebaseUser } from "firebase/auth";

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp?: { seconds: number; nanoseconds: number };
}

interface DashboardProps {
  user: FirebaseUser;
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function Dashboard({ user, selectedWeek, onWeekChange }: DashboardProps) {
  const [currentYear] = useState(new Date().getFullYear());
  const [games, setGames] = useState<NormalizedGame[]>([]);
  const [picks, setPicks] = useState<Record<string, "away" | "home">>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const response = await fetch(`/api/nfl-games?year=${currentYear}`);
        if (response.ok) {
          const rawEvents = await response.json();
          if (rawEvents.length > 0) {
            const normalized = (rawEvents as Array<Record<string, unknown>>)
              .map((event) => {
                try {
                  return normalizeESPNGame(event as never);
                } catch (err) {
                  console.error("Error normalizing event:", err);
                  return null;
                }
              })
              .filter((game: NormalizedGame | null): game is NormalizedGame => game !== null);
            
            setGames(normalized);
            const firstGameDate = new Date(rawEvents[0].date);
            const seasonStart = new Date(currentYear, 8, 1);
            const weeksSinceStart = Math.floor(
              (firstGameDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
            );
            const currentWeek = Math.max(1, Math.min(18, weeksSinceStart + 1));
            if (selectedWeek === null) {
              onWeekChange(currentWeek);
            }
          } else if (selectedWeek === null) {
            onWeekChange(1);
          }
        } else if (selectedWeek === null) {
          onWeekChange(1);
        }
      } catch (error) {
        console.error("Error fetching current week:", error);
        if (selectedWeek === null) {
          onWeekChange(1);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentWeek();
  }, [currentYear]);

  useEffect(() => {
    if (selectedWeek === null) return;

    const fetchGames = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/nfl-games?week=${selectedWeek}&year=${currentYear}`);
        if (response.ok) {
          const rawEvents = await response.json();
          const normalized = (rawEvents as Array<Record<string, unknown>>)
            .map((event) => {
              try {
                return normalizeESPNGame(event as never);
              } catch (err) {
                console.error("Error normalizing event:", err);
                return null;
              }
            })
            .filter((game: NormalizedGame | null): game is NormalizedGame => game !== null);
          setGames(normalized);
        }
      } catch (error) {
        console.error("Error fetching games:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, [selectedWeek, currentYear]);

  useEffect(() => {
    const fetchPicks = async () => {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;

      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch("/api/user-picks", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data: UserPick[] = await response.json();
          const picksMap: Record<string, "away" | "home"> = {};
          data.forEach((pick) => {
            picksMap[pick.gameId] = pick.selectedTeam as "away" | "home";
          });
          setPicks(picksMap);
          setSavedPicks(picksMap);
        }
      } catch (error) {
        console.error("Error fetching picks:", error);
      }
    };

    fetchPicks();
  }, []);

  useEffect(() => {
    const hasChanges = Object.keys(picks).some(
      (gameId) => picks[gameId] !== savedPicks[gameId]
    ) || Object.keys(savedPicks).some(
      (gameId) => picks[gameId] !== savedPicks[gameId]
    );
    setHasUnsavedChanges(hasChanges);
  }, [picks, savedPicks]);

  const handlePickChange = (gameId: string, side: "away" | "home") => {
    setPicks((prev) => ({
      ...prev,
      [gameId]: side,
    }));
  };

  const handleSavePicks = async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return;

    setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();

      const savePromises = Object.entries(picks).map(([gameId, selectedTeam]) =>
        fetch("/api/user-picks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ gameId, selectedTeam }),
        })
      );

      await Promise.all(savePromises);
      setSavedPicks(picks);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error saving picks:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b bg-card p-4 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold">
            Week {selectedWeek}
          </h2>
          <WeekDropdown selectedWeek={selectedWeek} onWeekChange={onWeekChange} />
        </div>
        {hasUnsavedChanges && (
          <Button onClick={handleSavePicks} disabled={saving} className="font-semibold">
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Save Picks
          </Button>
        )}
      </div>

      <LeaderboardCard />

      <div>
        {games.map((game) => (
          <GamePickCard
            key={game.eventId}
            game={game}
            selectedSide={picks[game.eventId]}
            onPickChange={handlePickChange}
            disabled={game.status.state !== "pre"}
          />
        ))}
      </div>

      {games.length === 0 && (
        <div className="text-center py-16 border rounded-lg">
          <p className="text-muted-foreground">
            No games available for this week
          </p>
        </div>
      )}
    </div>
  );
}
