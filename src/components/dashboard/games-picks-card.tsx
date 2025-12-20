"use client";

import { useState } from "react";
import { Box, Heading, VStack, HStack, Text, Image, Collapsible, RadioGroup } from "@chakra-ui/react";

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

interface GamesPicksCardProps {
  games: NFLGame[];
  picks: Record<string, string>;
  onPickChange: (gameId: string, teamId: string) => void;
}

export function GamesPicksCard({ games, picks, onPickChange }: GamesPicksCardProps) {
  const [open, setOpen] = useState(true);

  const formatGameTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

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
                Games & Picks
              </Heading>
              <Text color="fg.muted" fontSize="sm">
                {open ? "▼" : "▶"}
              </Text>
            </HStack>
          </Box>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <Box p={4} borderTopWidth="1px" borderColor="border.muted">
            {games.length === 0 ? (
              <Text color="fg.muted" fontSize="sm" textAlign="center" py={4}>
                No games scheduled for this week yet.
              </Text>
            ) : (
              <VStack gap={4} align="stretch">
                {games.map((game) => (
                  <Box
                    key={game.id}
                    borderWidth="1px"
                    borderColor="border.muted"
                    rounded="md"
                    p={4}
                    bg={picks[game.id] ? "blue.subtle" : "bg"}
                  >
                    <VStack gap={3} align="stretch">
                      {/* Game time */}
                      <Text fontSize="xs" color="fg.muted" textAlign="center">
                        {formatGameTime(game.date)}
                      </Text>

                      {/* Teams */}
                      <RadioGroup.Root
                        value={picks[game.id] || ""}
                        onValueChange={(details) => {
                          if (details.value) onPickChange(game.id, details.value);
                        }}
                        disabled={game.completed}
                      >
                        <VStack gap={2} align="stretch">
                          {/* Away team */}
                          <RadioGroup.Item value={game.teams.away.id}>
                            <HStack justify="space-between" w="full">
                              <HStack gap={3}>
                                <RadioGroup.ItemControl />
                                <Image
                                  src={game.teams.away.logo}
                                  alt={game.teams.away.name}
                                  boxSize="32px"
                                />
                                <RadioGroup.ItemText>
                                  <Text color="fg">{game.teams.away.name}</Text>
                                </RadioGroup.ItemText>
                              </HStack>
                              {game.completed && (
                                <Text fontWeight="bold" color="fg">
                                  {game.teams.away.score}
                                </Text>
                              )}
                            </HStack>
                          </RadioGroup.Item>

                          {/* Home team */}
                          <RadioGroup.Item value={game.teams.home.id}>
                            <HStack justify="space-between" w="full">
                              <HStack gap={3}>
                                <RadioGroup.ItemControl />
                                <Image
                                  src={game.teams.home.logo}
                                  alt={game.teams.home.name}
                                  boxSize="32px"
                                />
                                <RadioGroup.ItemText>
                                  <Text color="fg">{game.teams.home.name}</Text>
                                </RadioGroup.ItemText>
                              </HStack>
                              {game.completed && (
                                <Text fontWeight="bold" color="fg">
                                  {game.teams.home.score}
                                </Text>
                              )}
                            </HStack>
                          </RadioGroup.Item>
                        </VStack>
                      </RadioGroup.Root>

                      {/* Game status */}
                      {game.completed && (
                        <Text fontSize="xs" color="fg.muted" textAlign="center">
                          Final
                        </Text>
                      )}
                    </VStack>
                  </Box>
                ))}
              </VStack>
            )}
          </Box>
        </Collapsible.Content>
      </Box>
    </Collapsible.Root>
  );
}
