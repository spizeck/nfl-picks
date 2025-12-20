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
      {weeks.map((week) => {
        const isSelected = selectedWeek === week;
        return (
          <Button
            key={week}
            onClick={() => onWeekChange(week)}
            variant={isSelected ? "solid" : "outline"}
            colorPalette="blue"
            size="sm"
            minW="60px"
            borderWidth={isSelected ? "2px" : "1px"}
            fontWeight={isSelected ? "bold" : "medium"}
          >
            <Text fontSize="sm">Week {week}</Text>
          </Button>
        );
      })}
    </HStack>
  );
}
