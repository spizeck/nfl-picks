"use client";

import { Button } from "@/components/ui/button";

interface WeekSelectorProps {
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function WeekSelector({
  selectedWeek,
  onWeekChange,
}: WeekSelectorProps) {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {weeks.map((week) => {
        const isSelected = selectedWeek === week;
        return (
          <Button
            key={week}
            onClick={() => onWeekChange(week)}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className={`min-w-60px ${isSelected ? "font-bold" : "font-medium"}`}
          >
            Week {week}
          </Button>
        );
      })}
    </div>
  );
}
