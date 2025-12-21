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
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {selectedWeek ? `Week ${selectedWeek}` : "Select Week"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-300px overflow-y-auto">
        {weeks.map((week) => (
          <DropdownMenuItem
            key={week}
            onClick={() => onWeekChange(week)}
            className={selectedWeek === week ? "bg-primary/10 font-bold" : ""}
          >
            Week {week}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
