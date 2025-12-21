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
  const [updating, setUpdating] = useState(false);
  const [sortBy, setSortBy] = useState<"wins" | "percentage">("percentage");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("season");
  const [showAll, setShowAll] = useState(false);

  const fetchLeaderboard = async () => {
    const db = getFirestoreDb();
    if (!db) return;

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const entries: LeaderboardEntry[] = [];
      const currentYear = new Date().getFullYear();

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Get stats based on selected time period
        let stats;
        if (timePeriod === "allTime") {
          stats = userData.stats?.allTime || { wins: 0, losses: 0, winPercentage: 0 };
        } else {
          // Both "week" and "season" use season stats for now
          // TODO: Implement per-week stats in the future
          stats = userData.stats?.[`season${currentYear}`] || { wins: 0, losses: 0, winPercentage: 0 };
        }

        entries.push({
          uid: userDoc.id,
          displayName: userData.displayName || "Anonymous",
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          winPercentage: stats.winPercentage || 0,
        });
      }

      setLeaderboard(entries);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStats = async () => {
    setUpdating(true);
    try {
      const response = await fetch("/api/update-stats", { method: "POST" });
      const result = await response.json();
      
      if (result.success) {
        console.log(`Updated stats for ${result.usersUpdated} users based on ${result.completedGames} completed games`);
        // Refresh leaderboard after update
        await fetchLeaderboard();
      } else {
        console.error("Failed to update stats:", result.error);
      }
    } catch (error) {
      console.error("Error updating stats:", error);
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod]);

  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    if (sortBy === "wins") {
      return b.wins - a.wins;
    }
    return b.winPercentage - a.winPercentage;
  });

  // Limit to top 10 unless "Show All" is enabled
  const displayedLeaderboard = showAll ? sortedLeaderboard : sortedLeaderboard.slice(0, 10);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg overflow-hidden bg-card mb-4">
        <div className="flex items-center justify-between border-b bg-card">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex-1 flex items-center justify-start p-4 hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <h2 className="text-lg font-semibold text-foreground">Leaderboard</h2>
              </div>
            </Button>
          </CollapsibleTrigger>
          <div className="flex gap-2 mr-4">
            <Button
              variant="outline"
              size="sm"
              onClick={updateStats}
              disabled={updating}
              className="text-xs"
            >
              {updating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Stats"
              )}
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
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
              {sortedLeaderboard.length > 10 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAll(!showAll)}
                  className="font-semibold text-xs"
                >
                  {showAll ? "Show Top 10" : `Show All (${sortedLeaderboard.length})`}
                </Button>
              )}
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
                {displayedLeaderboard.map((entry, index) => (
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
                {displayedLeaderboard.length === 0 && (
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
