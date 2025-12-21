"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
        const usersSnapshot = await getDocs(collection(db, "users"));
        const entries: LeaderboardEntry[] = [];

        for (const userDoc of usersSnapshot.docs) {
          const picksSnapshot = await getDocs(
            collection(db, "users", userDoc.id, "picks")
          );

          const wins = 0;
          const losses = 0;

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
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg overflow-hidden bg-card mb-4">
        <CollapsibleTrigger asChild>
          <div className="p-4 cursor-pointer hover:bg-muted transition-colors border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Leaderboard</h3>
              <span className="text-muted-foreground">
                {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </span>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={timePeriod === "week" ? "default" : "outline"}
                onClick={() => setTimePeriod("week")}
                className="font-semibold"
              >
                Week
              </Button>
              <Button
                size="sm"
                variant={timePeriod === "season" ? "default" : "outline"}
                onClick={() => setTimePeriod("season")}
                className="font-semibold"
              >
                Season
              </Button>
              <Button
                size="sm"
                variant={timePeriod === "allTime" ? "default" : "outline"}
                onClick={() => setTimePeriod("allTime")}
                className="font-semibold"
              >
                All Time
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={sortBy === "percentage" ? "default" : "outline"}
                onClick={() => setSortBy("percentage")}
                className="font-semibold"
              >
                Win %
              </Button>
              <Button
                size="sm"
                variant={sortBy === "wins" ? "default" : "outline"}
                onClick={() => setSortBy("wins")}
                className="font-semibold"
              >
                Total Wins
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {sortedLeaderboard.map((entry, index) => (
                  <div
                    key={entry.uid}
                    className="flex items-center justify-between p-3 hover:bg-muted transition-colors border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                        index === 0 ? 'bg-yellow-500 text-yellow-950' :
                        index === 1 ? 'bg-gray-400 text-gray-950' :
                        index === 2 ? 'bg-orange-600 text-orange-950' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="font-semibold text-base">{entry.displayName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground font-medium">
                        {entry.wins}W - {entry.losses}L
                      </span>
                      <span className="font-bold text-base min-w-[50px] text-right">
                        {entry.winPercentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
                {sortedLeaderboard.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No leaderboard data available
                  </p>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
