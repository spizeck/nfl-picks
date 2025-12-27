"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WeekDropdownProps {
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function WeekDropdown({ selectedWeek, onWeekChange }: WeekDropdownProps) {
  const regularSeasonWeeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const playoffWeeks = [
    { value: 19, label: "Wild Card" },
    { value: 20, label: "Divisional" },
    { value: 21, label: "Conference" },
    { value: 22, label: "Super Bowl" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {selectedWeek ? `Week ${selectedWeek}` : "Select Week"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-300px overflow-y-auto">
        {regularSeasonWeeks.map((week) => (
          <DropdownMenuItem
            key={week}
            onClick={() => onWeekChange(week)}
            className={selectedWeek === week ? "bg-primary/10 font-bold" : ""}
          >
            Week {week}
          </DropdownMenuItem>
        ))}
        {playoffWeeks.map((playoff) => (
          <DropdownMenuItem
            key={playoff.value}
            onClick={() => onWeekChange(playoff.value)}
            className={selectedWeek === playoff.value ? "bg-primary/10 font-bold" : ""}
          >
            Week {playoff.value} - {playoff.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
