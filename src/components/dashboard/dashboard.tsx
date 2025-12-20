"use client";

import { useState, useEffect } from "react";
import { Box, Heading, VStack, HStack, Button, Text, Spinner } from "@chakra-ui/react";
import { WeekSelector } from "./week-selector";
import { LeaderboardCard } from "./leaderboard-card";
import { GamePickCard } from "./game-pick-card";
import { getFirebaseAuth } from "@/lib/firebase";
import { normalizeESPNGame, type NormalizedGame } from "@/lib/espn-data";
import type { User as FirebaseUser } from "firebase/auth";

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp?: { seconds: number; nanoseconds: number };
}

export function Dashboard({ user }: { user: FirebaseUser }) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [currentYear] = useState(new Date().getFullYear());
  const [games, setGames] = useState<NormalizedGame[]>([]);
  const [picks, setPicks] = useState<Record<string, "away" | "home">>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize with current week on mount
  useEffect(() => {
    const fetchCurrentWeek = async () => {
      try {
        const response = await fetch(`/api/nfl-games?year=${currentYear}`);
        if (response.ok) {
          const rawEvents = await response.json();
          if (rawEvents.length > 0) {
            const normalized = (rawEvents as any[])
              .map((event) => {
                try {
                  return normalizeESPNGame(event);
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
            setSelectedWeek(currentWeek);
          } else {
            setSelectedWeek(1);
          }
        } else {
          setSelectedWeek(1);
        }
      } catch (error) {
        console.error("Error fetching current week:", error);
        setSelectedWeek(1);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentWeek();
  }, [currentYear]);

  // Fetch games for selected week
  useEffect(() => {
    if (selectedWeek === null) return;

    const fetchGames = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/nfl-games?week=${selectedWeek}&year=${currentYear}`);
        if (response.ok) {
          const rawEvents = await response.json();
          const normalized = (rawEvents as unknown[])
            .map((event) => {
              try {
                return normalizeESPNGame(event);
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

  // Fetch user's saved picks
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

  // Check for unsaved changes
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

      // Save each pick
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
      setSavedPicks({ ...picks });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Error saving picks:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={6} align="stretch">
      <Box
        borderWidth="1px"
        borderColor="border.muted"
        bg="bg.panel"
        rounded="xl"
        px={{ base: 4, md: 6 }}
        py={{ base: 4, md: 5 }}
        boxShadow="xs"
      >
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="fg">
            Weekly Picks
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            {user.displayName || user.email}
          </Text>
        </HStack>
      </Box>

      <Box
        borderWidth="1px"
        borderColor="border.muted"
        bg="bg.panel"
        rounded="xl"
        px={{ base: 4, md: 6 }}
        py={{ base: 4, md: 5 }}
        boxShadow="xs"
      >
        <WeekSelector selectedWeek={selectedWeek} onWeekChange={setSelectedWeek} />
      </Box>

      <LeaderboardCard />

      {loading ? (
        <Box
          borderWidth="1px"
          borderColor="border.muted"
          rounded="xl"
          bg="bg.panel"
          py={16}
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <VStack gap={4}>
            <Spinner size="xl" colorPalette="blue" />
            <Text color="fg.muted" fontSize="sm">Loading games...</Text>
          </VStack>
        </Box>
      ) : (
        <VStack gap={3} align="stretch">
          {games.map((game) => (
            <GamePickCard
              key={game.eventId}
              game={game}
              selectedSide={picks[game.eventId]}
              onPickChange={handlePickChange}
              disabled={game.status.state === "post"}
            />
          ))}
        </VStack>
      )}

      {hasUnsavedChanges && (
        <Button
          onClick={handleSavePicks}
          loading={saving}
          colorPalette="blue"
          size="lg"
          alignSelf="flex-end"
        >
          Save Picks
        </Button>
      )}
    </VStack>
  );
}
