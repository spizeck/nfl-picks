"use client";

import { Button, Menu, Portal, Text } from "@chakra-ui/react";

interface WeekDropdownProps {
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function WeekDropdown({ selectedWeek, onWeekChange }: WeekDropdownProps) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="outline" size="sm" colorPalette="blue">
          <Text fontSize="sm">
            {selectedWeek ? `Week ${selectedWeek}` : "Select Week"}
          </Text>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content maxH="300px">
            {weeks.map((week) => (
              <Menu.Item
                key={week}
                value={week.toString()}
                onClick={() => onWeekChange(week)}
                bg={selectedWeek === week ? "blue.subtle" : undefined}
                fontWeight={selectedWeek === week ? "bold" : "normal"}
              >
                Week {week}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
