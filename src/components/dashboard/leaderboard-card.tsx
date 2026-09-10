"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getFirestoreDb } from "@/lib/firebase";
import {
  getDisplayedLeaderboard,
  rankLeaderboard,
  type LeaderboardEntry,
  type LeaderboardSort,
} from "@/lib/leaderboard-ranking";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

type TimePeriod = "week" | "season" | "allTime";

interface LeaderboardCardProps {
  selectedWeek?: number | null;
  // The current season year, resolved by the parent. `null` means it
  // hasn't been resolved yet, in which case we simply wait.
  selectedYear: number | null;
  currentUserId: string;
}

// Debounce fetches so rapidly toggling between time periods (or other
// quick successive prop changes) doesn't fire a burst of Firestore reads.
const FETCH_DEBOUNCE_MS = 300;

export function LeaderboardCard({
  selectedWeek,
  selectedYear,
  currentUserId,
}: LeaderboardCardProps) {
  const [open, setOpen] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<LeaderboardSort>("percentage");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("season");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache leaderboard results per (timePeriod, week, year) so switching
  // back to a previously-viewed tab doesn't re-hit Firestore.
  const cacheRef = useRef<Map<string, LeaderboardEntry[]>>(new Map());

  useEffect(() => {
    if (selectedYear === null) return;

    const cacheKey = `${timePeriod}:${selectedWeek ?? "none"}:${selectedYear}`;

    const timeoutId = setTimeout(() => {
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setLeaderboard(cached);
        setLoading(false);
        return;
      }

      const fetchLeaderboard = async () => {
        const db = getFirestoreDb();
        if (!db) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);
        try {
          const usersSnapshot = await getDocs(collection(db, "users"));
          const entries: LeaderboardEntry[] = [];

          for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            let wins = 0;
            let losses = 0;

            if (timePeriod === "week" && selectedWeek) {
              // Fetch weekly stats from new hierarchical structure
              const weekDocRef = doc(
                db,
                `users/${userDoc.id}/seasons/${selectedYear}/weeks/${selectedWeek}`
              );
              const weekDoc = await getDoc(weekDocRef);

              if (weekDoc.exists()) {
                const weekData = weekDoc.data();
                wins = weekData.wins || 0;
                losses = weekData.losses || 0;
              }
            } else if (timePeriod === "season") {
              // Fetch season stats from new hierarchical structure
              const seasonDocRef = doc(
                db,
                `users/${userDoc.id}/seasons/${selectedYear}`
              );
              const seasonDoc = await getDoc(seasonDocRef);

              if (seasonDoc.exists()) {
                const seasonData = seasonDoc.data();
                wins = seasonData.totalWins || 0;
                losses = seasonData.totalLosses || 0;
              }
            } else {
              // All time - sum all seasons
              const seasonsSnapshot = await getDocs(
                collection(db, `users/${userDoc.id}/seasons`)
              );

              seasonsSnapshot.docs.forEach((seasonDoc) => {
                const seasonData = seasonDoc.data();
                wins += seasonData.totalWins || 0;
                losses += seasonData.totalLosses || 0;
              });
            }

            const totalGames = wins + losses;
            const winPercentage = totalGames > 0 ? (wins / totalGames) * 100 : 0;

            entries.push({
              uid: userDoc.id,
              displayName: userData.displayName || "Anonymous",
              wins,
              losses,
              winPercentage,
            });
          }

          cacheRef.current.set(cacheKey, entries);
          setLeaderboard(entries);
        } catch (error) {
          console.error("Error fetching leaderboard:", error);
          setError("Leaderboard data could not be loaded.");
        } finally {
          setLoading(false);
        }
      };

      fetchLeaderboard();
    }, FETCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [timePeriod, selectedWeek, selectedYear]);

  const sortedLeaderboard = rankLeaderboard(leaderboard, sortBy);
  const displayedLeaderboard = getDisplayedLeaderboard(
    sortedLeaderboard,
    currentUserId,
    showAll
  );
  const hasHiddenEntries = displayedLeaderboard.length < sortedLeaderboard.length;

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
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <h2 className="text-lg font-semibold text-foreground">
                  Leaderboard
                </h2>
              </div>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={timePeriod === "week" ? "default" : "outline"}
                  onClick={() => setTimePeriod("week")}
                  className="font-semibold"
                  disabled={!selectedWeek}
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
                {displayedLeaderboard.map((entry) => (
                  <Fragment key={entry.uid}>
                    {entry.separated && (
                      <div
                        aria-label="Rankings omitted"
                        className="border-t border-dashed pt-2 text-center text-muted-foreground"
                      >
                        ···
                      </div>
                    )}
                    <div
                      className={`flex items-center justify-between gap-2 p-3 hover:bg-muted transition-colors border-b last:border-b-0 ${
                        entry.uid === currentUserId ? "bg-muted/50" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            entry.rank === 1
                              ? "bg-yellow-500 text-yellow-950"
                              : entry.rank === 2
                              ? "bg-gray-400 text-gray-950"
                              : entry.rank === 3
                              ? "bg-orange-600 text-orange-950"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.rank}
                        </div>
                        <span className="truncate text-sm font-semibold sm:text-base">
                          {entry.displayName}
                          {entry.uid === currentUserId && (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              (You)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs sm:gap-4 sm:text-sm">
                        <span className="text-muted-foreground font-medium">
                          {entry.wins}W - {entry.losses}L
                        </span>
                        <span className="min-w-[3.25rem] text-right text-sm font-bold sm:text-base">
                          {entry.winPercentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </Fragment>
                ))}
                {error ? (
                  <p role="alert" className="text-center text-destructive py-4">
                    {error}
                  </p>
                ) : displayedLeaderboard.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No leaderboard data available yet
                  </p>
                ) : null}
                {(hasHiddenEntries || showAll) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAll(!showAll)}
                    className="w-full font-semibold"
                    aria-expanded={showAll}
                  >
                    {showAll ? "Show less" : "View full leaderboard"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
