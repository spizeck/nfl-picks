"use client";

import { useState, useEffect } from "react";
import { Box, Container, Heading, VStack, HStack, Button, Text, Spinner } from "@chakra-ui/react";
import { WeekSelector } from "./week-selector";
import { LeaderboardCard } from "./leaderboard-card";
import { GamesPicksCard } from "./games-picks-card";
import { getFirebaseAuth } from "@/lib/firebase";
import type { User as FirebaseUser } from "firebase/auth";

interface NFLGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  teams: {
    home: { id: string; name: string; logo: string; score?: number };
    away: { id: string; name: string; logo: string; score?: number };
  };
  status: string;
  completed: boolean;
}

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp?: { seconds: number; nanoseconds: number };
}

export function Dashboard({ user }: { user: FirebaseUser }) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [currentYear] = useState(new Date().getFullYear());
  const [games, setGames] = useState<NFLGame[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch games for selected week
  useEffect(() => {
    const fetchGames = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/nfl-games?week=${selectedWeek}&year=${currentYear}`);
        if (response.ok) {
          const data = await response.json();
          setGames(data);
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
          const picksMap: Record<string, string> = {};
          data.forEach((pick) => {
            picksMap[pick.gameId] = pick.selectedTeam;
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

  const handlePickChange = (gameId: string, teamId: string) => {
    setPicks((prev) => ({
      ...prev,
      [gameId]: teamId,
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
    <Container maxW="container.lg" py={6}>
      <VStack gap={6} align="stretch">
        {/* Header */}
        <HStack justify="space-between" align="center">
          <Heading size="xl" color="fg">
            NFL Picks Challenge
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            {user.displayName || user.email}
          </Text>
        </HStack>

        {/* Week Selector */}
        <WeekSelector
          selectedWeek={selectedWeek}
          onWeekChange={setSelectedWeek}
        />

        {/* Leaderboard Card */}
        <LeaderboardCard />

        {/* Games & Picks Card */}
        {loading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <Spinner size="lg" colorPalette="blue" />
          </Box>
        ) : (
          <GamesPicksCard
            games={games}
            picks={picks}
            onPickChange={handlePickChange}
          />
        )}

        {/* Save Button */}
        {hasUnsavedChanges && (
          <Button
            onClick={handleSavePicks}
            loading={saving}
            colorPalette="blue"
            size="lg"
            w="full"
          >
            Save Picks
          </Button>
        )}
      </VStack>
    </Container>
  );
}
