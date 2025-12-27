"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { LeaderboardCard } from "./leaderboard-card";
import { GamePickCard } from "./game-pick-card";
import { WeekDropdown } from "../layout/week-dropdown";
import { getFirebaseAuth } from "@/lib/firebase";
import { type NormalizedGame } from "@/lib/espn-data";
import type { User as FirebaseUser } from "firebase/auth";

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp?: { seconds: number; nanoseconds: number };
}

interface UserPickInfo {
  userId: string;
  displayName: string;
  photoURL: string;
  selectedTeam: string;
}

interface DashboardProps {
  user: FirebaseUser;
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function Dashboard({ selectedWeek, onWeekChange }: DashboardProps) {
  const [currentYear] = useState(2025); // Updated to 2025 for current NFL season
  const [games, setGames] = useState<NormalizedGame[]>([]);
  const [picks, setPicks] = useState<Record<string, "away" | "home">>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [allUsersPicks, setAllUsersPicks] = useState<
    Record<string, UserPickInfo[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const response = await fetch('/api/current-week');
        if (response.ok) {
          const data = await response.json();
          if (selectedWeek === null) {
            onWeekChange(data.week);
          }
        } else if (selectedWeek === null) {
          onWeekChange(17); // Default to week 17 if API fails
        }
      } catch (error) {
        console.error("Error fetching current week:", error);
        if (selectedWeek === null) {
          onWeekChange(17); // Default to week 17 if API fails
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentWeek();
  }, [currentYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedWeek === null) return;

    const fetchGames = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/games?week=${selectedWeek}&year=${currentYear}`
        );
        if (response.ok) {
          const rawEvents = await response.json();
          // The games API returns normalized data directly
          const normalized = rawEvents;
          setGames(normalized);
        }
      } catch (error) {
        console.error("Error fetching games:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchAllPicks = async () => {
      try {
        const response = await fetch(
          `/api/all-picks?week=${selectedWeek}&year=${currentYear}`
        );
        if (response.ok) {
          const data = await response.json();
          setAllUsersPicks(data);
        }
      } catch (error) {
        console.error("Error fetching all picks:", error);
      }
    };

    fetchGames();
    fetchAllPicks();
  }, [selectedWeek, currentYear]);

  useEffect(() => {
    if (selectedWeek === null || games.length === 0) return;

    const fetchPicks = async () => {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;

      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(
          `/api/user-picks?week=${selectedWeek}&year=${currentYear}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data: UserPick[] = await response.json();
          const picksMap: Record<string, "away" | "home"> = {};

          data.forEach((pick) => {
            if (pick.selectedTeam === "home" || pick.selectedTeam === "away") {
              picksMap[pick.gameId] = pick.selectedTeam;
            } else {
              // Convert team ID back to "away" or "home"
              const game = games.find((g) => g.eventId === pick.gameId);
              if (game) {
                if (pick.selectedTeam === game.home.id) {
                  picksMap[pick.gameId] = "home";
                } else if (pick.selectedTeam === game.away.id) {
                  picksMap[pick.gameId] = "away";
                }
              }
            }
          });

          setPicks(picksMap);
          setSavedPicks(picksMap);
        }
      } catch (error) {
        console.error("Error fetching picks:", error);
      }
    };

    fetchPicks();
  }, [games, selectedWeek, currentYear]);

  useEffect(() => {
    const hasChanges =
      Object.keys(picks).some(
        (gameId) => picks[gameId] !== savedPicks[gameId]
      ) ||
      Object.keys(savedPicks).some(
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
    if (!auth?.currentUser || selectedWeek === null) return;

    setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();

      const savePromises = Object.entries(picks).map(([gameId, selectedTeam]) => {
        const game = games.find((g) => g.eventId === gameId);
        const teamId =
          selectedTeam === "home"
            ? game?.home.id
            : selectedTeam === "away"
            ? game?.away.id
            : selectedTeam;

        return fetch("/api/user-picks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            gameId,
            selectedTeam: teamId,
            week: selectedWeek,
            year: currentYear,
          }),
        });
      });

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
          <WeekDropdown
            selectedWeek={selectedWeek}
            onWeekChange={onWeekChange}
          />
        </div>
        {hasUnsavedChanges && (
          <Button
            onClick={handleSavePicks}
            disabled={saving}
            className="font-semibold"
          >
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Save Picks
          </Button>
        )}
      </div>

      <LeaderboardCard selectedWeek={selectedWeek} selectedYear={currentYear} />

      <div>
        {games.map((game) => (
          <GamePickCard
            key={game.eventId}
            game={game}
            selectedSide={picks[game.eventId]}
            onPickChange={handlePickChange}
            disabled={game.status.state !== "pre"}
            userPicks={allUsersPicks[game.eventId] || []}
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
