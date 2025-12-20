"use client";

import { useState, useEffect } from "react";
import { Box, Heading, VStack, HStack, Text, Spinner, Button, Group } from "@chakra-ui/react";
import { Collapsible } from "@chakra-ui/react";
import { getFirestoreDb } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

interface LeaderboardEntry {
  uid: string;
  displayName: string;
  wins: number;
  losses: number;
  winPercentage: number;
}

type TimePeriod = "week" | "season" | "allTime";

export function LeaderboardCard() {
  const [open, setOpen] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"wins" | "percentage">("percentage");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("week");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const db = getFirestoreDb();
      if (!db) return;

      try {
        // Fetch all users and their picks
        const usersSnapshot = await getDocs(collection(db, "users"));
        const entries: LeaderboardEntry[] = [];

        for (const userDoc of usersSnapshot.docs) {
          const picksSnapshot = await getDocs(
            collection(db, "users", userDoc.id, "picks")
          );

          const wins = 0;
          const losses = 0;

          // TODO: Calculate wins/losses based on actual game results
          // For now, just count picks
          picksSnapshot.docs.forEach(() => {
            // This would need to compare picks against actual game results
            // Placeholder logic
          });

          entries.push({
            uid: userDoc.id,
            displayName: userDoc.data().displayName || "Anonymous",
            wins,
            losses,
            winPercentage: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
          });
        }

        setLeaderboard(entries);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    if (sortBy === "wins") {
      return b.wins - a.wins;
    }
    return b.winPercentage - a.winPercentage;
  });

  return (
    <Collapsible.Root open={open} onOpenChange={(e) => setOpen(e.open)}>
      <Box
        borderWidth="1px"
        borderColor="border.muted"
        rounded="lg"
        overflow="hidden"
        bg="bg.panel"
      >
        <Collapsible.Trigger asChild>
          <Box
            p={4}
            cursor="pointer"
            _hover={{ bg: "bg.muted" }}
            transition="background 0.2s"
          >
            <HStack justify="space-between">
              <Heading size="md" color="fg">
                Leaderboard
              </Heading>
              <Text color="fg.muted" fontSize="sm">
                {open ? "▼" : "▶"}
              </Text>
            </HStack>
          </Box>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <Box p={4} borderTopWidth="1px" borderColor="border.muted">
            {loading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <Spinner size="md" colorPalette="blue" />
              </Box>
            ) : (
              <VStack gap={4} align="stretch">
                {/* Time period tabs */}
                <Group attached w="full">
                  <Button
                    flex="1"
                    onClick={() => setTimePeriod("week")}
                    variant={timePeriod === "week" ? "solid" : "outline"}
                    colorPalette="blue"
                    size="sm"
                  >
                    Current Week
                  </Button>
                  <Button
                    flex="1"
                    onClick={() => setTimePeriod("season")}
                    variant={timePeriod === "season" ? "solid" : "outline"}
                    colorPalette="blue"
                    size="sm"
                  >
                    Season
                  </Button>
                  <Button
                    flex="1"
                    onClick={() => setTimePeriod("allTime")}
                    variant={timePeriod === "allTime" ? "solid" : "outline"}
                    colorPalette="blue"
                    size="sm"
                  >
                    All Time
                  </Button>
                </Group>

                {/* Sort buttons */}
                <HStack gap={2}>
                  <Text fontSize="sm" color="fg.muted">
                    Sort by:
                  </Text>
                  <HStack gap={1}>
                    <Box
                      as="button"
                      onClick={() => setSortBy("percentage")}
                      px={2}
                      py={1}
                      rounded="md"
                      bg={sortBy === "percentage" ? "blue.subtle" : "transparent"}
                      color={sortBy === "percentage" ? "blue.fg" : "fg.muted"}
                      fontSize="sm"
                      fontWeight={sortBy === "percentage" ? "bold" : "normal"}
                      _hover={{ bg: "bg.muted" }}
                    >
                      Win %
                    </Box>
                    <Box
                      as="button"
                      onClick={() => setSortBy("wins")}
                      px={2}
                      py={1}
                      rounded="md"
                      bg={sortBy === "wins" ? "blue.subtle" : "transparent"}
                      color={sortBy === "wins" ? "blue.fg" : "fg.muted"}
                      fontSize="sm"
                      fontWeight={sortBy === "wins" ? "bold" : "normal"}
                      _hover={{ bg: "bg.muted" }}
                    >
                      Wins
                    </Box>
                  </HStack>
                </HStack>

                {/* Leaderboard entries */}
                {sortedLeaderboard.length === 0 ? (
                  <Text color="fg.muted" fontSize="sm" textAlign="center" py={4}>
                    No picks yet. Be the first to make your picks!
                  </Text>
                ) : (
                  sortedLeaderboard.map((entry, index) => (
                    <HStack
                      key={entry.uid}
                      justify="space-between"
                      p={3}
                      bg={index % 2 === 0 ? "bg.muted" : "transparent"}
                      rounded="md"
                    >
                      <HStack gap={3}>
                        <Text fontWeight="bold" color="fg.muted" fontSize="sm">
                          #{index + 1}
                        </Text>
                        <Text color="fg">{entry.displayName}</Text>
                      </HStack>
                      <HStack gap={4}>
                        <Text fontSize="sm" color="fg.muted">
                          {entry.wins}-{entry.losses}
                        </Text>
                        <Text fontSize="sm" color="fg.muted">
                          {entry.winPercentage.toFixed(1)}%
                        </Text>
                      </HStack>
                    </HStack>
                  ))
                )}
              </VStack>
            )}
          </Box>
        </Collapsible.Content>
      </Box>
    </Collapsible.Root>
  );
}
