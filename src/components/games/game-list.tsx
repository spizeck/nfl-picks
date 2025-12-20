"use client";

import { useState, useEffect } from "react";
import { Box, Button, Card, Heading, Image, Text, VStack, HStack, Spinner, Alert } from "@chakra-ui/react";
import { getFirebaseAuth } from "@/lib/firebase";

interface Team {
  id: string;
  name: string;
  logo: string;
  score?: number;
}

interface Game {
  id: string;
  date: string;
  name: string;
  shortName: string;
  teams: {
    home: Team;
    away: Team;
  };
  status: string;
  completed: boolean;
}

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp: Date;
}

export function GameList() {
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGames();
    fetchUserPicks();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await fetch("/api/nfl-games");
      if (!response.ok) {
        throw new Error("Failed to fetch games");
      }
      const data = await response.json();
      setGames(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPicks = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      // Get the user's ID token
      const token = await user.getIdToken();
      
      const response = await fetch("/api/user-picks", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const userPicks = await response.json();
        const picksMap: { [key: string]: string } = {};
        userPicks.forEach((pick: UserPick) => {
          picksMap[pick.gameId] = pick.selectedTeam;
        });
        setPicks(picksMap);
      }
    } catch (err) {
      console.error("Failed to fetch user picks:", err);
    }
  };

  const handlePick = async (gameId: string, teamId: string) => {
    const auth = getFirebaseAuth();
    if (!auth) {
      alert("Authentication not ready. Please try again.");
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
      alert("Please sign in to make picks");
      return;
    }

    if (games.find(g => g.id === gameId)?.completed) {
      alert("Cannot make picks for completed games");
      return;
    }

    setSaving(true);
    try {
      // Get the user's ID token
      const token = await user.getIdToken();
      
      const response = await fetch("/api/user-picks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          gameId,
          selectedTeam: teamId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save pick");
      }

      // Update local state
      setPicks(prev => ({
        ...prev,
        [gameId]: teamId,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save pick");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <Spinner size="xl" />
      </Box>
    );
  }

  // Check if user is authenticated
  const auth = getFirebaseAuth();
  if (!auth) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <Spinner size="xl" />
      </Box>
    );
  }
  
  const user = auth.currentUser;
  if (!user) {
    return (
      <Box textAlign="center" py={16}>
        <Heading size="lg" color="gray.600" mb={4}>
          Please sign in to view games and make picks
        </Heading>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert.Root status="error" title={error} my={4}>
        <Alert.Indicator />
        <Alert.Title>{error}</Alert.Title>
      </Alert.Root>
    );
  }

  return (
    <VStack gap={4} align="stretch">
      <Heading size="lg" textAlign="center" mb={4}>
        NFL Games - Make Your Picks
      </Heading>
      
      {games.map((game) => {
        const hasPick = picks[game.id];
        const isHomePicked = hasPick === game.teams.home.id;
        const isAwayPicked = hasPick === game.teams.away.id;

        return (
          <Card.Root key={game.id} variant="outline">
            <Card.Body gap={4}>
              <VStack gap={4}>
                <Text fontWeight="bold" color="gray.600">
                  {new Date(game.date).toLocaleDateString()} • {game.shortName}
                </Text>
                
                {game.completed && (
                  <Text color="red.500" fontWeight="bold">
                    Game Final
                  </Text>
                )}

                <HStack gap={8} justify="center" w="full">
                  {/* Away Team */}
                  <Button
                    variant={isAwayPicked ? "solid" : "outline"}
                    colorPalette={isAwayPicked ? "green" : "gray"}
                    onClick={() => handlePick(game.id, game.teams.away.id)}
                    disabled={game.completed || saving}
                    minW="150px"
                  >
                    <VStack gap={2}>
                      <Image src={game.teams.away.logo} alt={game.teams.away.name} h="40px" />
                      <Text fontWeight="bold">{game.teams.away.name}</Text>
                      {game.completed && (
                        <Text fontSize="2xl">{game.teams.away.score}</Text>
                      )}
                    </VStack>
                  </Button>

                  <Text fontSize="xl" fontWeight="bold" color="gray.500">
                    @
                  </Text>

                  {/* Home Team */}
                  <Button
                    variant={isHomePicked ? "solid" : "outline"}
                    colorPalette={isHomePicked ? "green" : "gray"}
                    onClick={() => handlePick(game.id, game.teams.home.id)}
                    disabled={game.completed || saving}
                    minW="150px"
                  >
                    <VStack gap={2}>
                      <Image src={game.teams.home.logo} alt={game.teams.home.name} h="40px" />
                      <Text fontWeight="bold">{game.teams.home.name}</Text>
                      {game.completed && (
                        <Text fontSize="2xl">{game.teams.home.score}</Text>
                      )}
                    </VStack>
                  </Button>
                </HStack>

                {hasPick && !game.completed && (
                  <Text color="green.500" fontWeight="bold">
                    ✓ Pick Locked In
                  </Text>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        );
      })}
    </VStack>
  );
}
