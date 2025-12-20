"use client";

import { Box, Grid, VStack, Text, Image } from "@chakra-ui/react";
import type { NormalizedGame } from "@/lib/espn-data";

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
    <Box
      borderWidth="1px"
      borderColor="border.muted"
      rounded="lg"
      overflow="hidden"
      bg="bg.panel"
    >
      <Grid
        templateColumns="1fr 1fr 1fr"
        gap={0}
        alignItems="stretch"
        minH="100px"
      >
        {/* LEFT: Away Team */}
        <Box
          as="button"
          onClick={handleAwayClick}
          data-disabled={disabled}
          cursor={disabled ? "not-allowed" : "pointer"}
          p={4}
          bg={isAwaySelected ? "blue.subtle" : "transparent"}
          borderWidth={isAwaySelected ? "2px" : "0"}
          borderColor={isAwaySelected ? "blue.solid" : "transparent"}
          borderRightWidth="1px"
          borderRightColor="border.muted"
          transition="all 0.2s"
          _hover={!disabled ? { bg: isAwaySelected ? "blue.subtle" : "bg.muted" } : {}}
          _focus={{
            outline: "2px solid",
            outlineColor: "blue.solid",
            outlineOffset: "-2px",
          }}
          aria-pressed={isAwaySelected}
          opacity={disabled ? 0.6 : 1}
        >
          <VStack gap={2} align="center" justify="center" h="full">
            <Image
              src={game.away.logo}
              alt={game.away.name}
              boxSize="40px"
              objectFit="contain"
            />
            <VStack gap={0.5} align="center">
              <Text
                fontSize="sm"
                fontWeight={isAwaySelected ? "bold" : "medium"}
                color="fg"
                textAlign="center"
                lineHeight="1.2"
              >
                {game.away.name}
              </Text>
              {game.away.record && (
                <Text fontSize="xs" color="fg.muted">
                  {game.away.record}
                </Text>
              )}
            </VStack>
          </VStack>
        </Box>

        {/* CENTER: Status */}
        <VStack
          gap={1}
          align="center"
          justify="center"
          px={4}
          py={2}
          bg="bg"
        >
          {isGameFinal ? (
            <>
              <Text fontSize="xs" color="fg.muted" fontWeight="medium">
                Final
              </Text>
              {game.status.detail && (
                <Text fontSize="lg" fontWeight="bold" color="fg">
                  {game.status.detail}
                </Text>
              )}
            </>
          ) : isGameLive ? (
            <>
              <Text fontSize="lg" fontWeight="bold" color="fg">
                {game.status.displayText}
              </Text>
              {game.status.detail && (
                <Text fontSize="xs" color="fg.muted">
                  {game.status.detail}
                </Text>
              )}
            </>
          ) : (
            <Text fontSize="xs" color="fg.muted" textAlign="center">
              {game.status.displayText}
            </Text>
          )}
        </VStack>

        {/* RIGHT: Home Team */}
        <Box
          as="button"
          onClick={handleHomeClick}
          data-disabled={disabled}
          cursor={disabled ? "not-allowed" : "pointer"}
          p={4}
          bg={isHomeSelected ? "blue.subtle" : "transparent"}
          borderWidth={isHomeSelected ? "2px" : "0"}
          borderColor={isHomeSelected ? "blue.solid" : "transparent"}
          borderLeftWidth="1px"
          borderLeftColor="border.muted"
          transition="all 0.2s"
          _hover={!disabled ? { bg: isHomeSelected ? "blue.subtle" : "bg.muted" } : {}}
          _focus={{
            outline: "2px solid",
            outlineColor: "blue.solid",
            outlineOffset: "-2px",
          }}
          aria-pressed={isHomeSelected}
          opacity={disabled ? 0.6 : 1}
        >
          <VStack gap={2} align="center" justify="center" h="full">
            <Image
              src={game.home.logo}
              alt={game.home.name}
              boxSize="40px"
              objectFit="contain"
            />
            <VStack gap={0.5} align="center">
              <Text
                fontSize="sm"
                fontWeight={isHomeSelected ? "bold" : "medium"}
                color="fg"
                textAlign="center"
                lineHeight="1.2"
              >
                {game.home.name}
              </Text>
              {game.home.record && (
                <Text fontSize="xs" color="fg.muted">
                  {game.home.record}
                </Text>
              )}
            </VStack>
          </VStack>
        </Box>
      </Grid>
    </Box>
  );
}
