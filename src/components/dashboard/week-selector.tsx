"use client";

import { HStack, Button, Text } from "@chakra-ui/react";

interface WeekSelectorProps {
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function WeekSelector({ selectedWeek, onWeekChange }: WeekSelectorProps) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  return (
    <HStack gap={2} overflowX="auto" py={2}>
      {weeks.map((week) => (
        <Button
          key={week}
          onClick={() => onWeekChange(week)}
          variant={selectedWeek === week ? "solid" : "outline"}
          colorPalette="blue"
          size="sm"
          minW="60px"
        >
          <Text fontSize="sm">Week {week}</Text>
        </Button>
      ))}
    </HStack>
  );
}
