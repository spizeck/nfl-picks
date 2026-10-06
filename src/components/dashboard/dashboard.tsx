"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, X } from "lucide-react";
import { LeaderboardCard } from "./leaderboard-card";
import { GamePickCard } from "./game-pick-card";
import { WeekDropdown } from "../layout/week-dropdown";
import { getFirebaseAuth } from "@/lib/firebase";
import { type NormalizedGame } from "@/lib/espn-data";
import { isGameLocked } from "@/lib/game-lock";
import { submitPickChanges, type PickSide } from "@/lib/pick-submission";
import { useNow } from "@/lib/use-now";
import type { User as FirebaseUser } from "firebase/auth";

interface UserPick {
  gameId: string;
  selectedTeam: string;
  timestamp?: { seconds: number; nanoseconds: number };
}

interface UserPickInfo {
  userId: string;
  displayName: string;
  photoURL: string;
  selectedTeam: string;
}

interface DashboardProps {
  user: FirebaseUser;
  selectedWeek: number | null;
  onWeekChange: (week: number) => void;
}

export function Dashboard({ user, selectedWeek, onWeekChange }: DashboardProps) {
  // Resolved on the client only (via the effect below) to avoid deriving
  // the year from Date() during render, which could differ between the
  // server and client around year boundaries.
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [games, setGames] = useState<NormalizedGame[]>([]);
  const [picks, setPicks] = useState<Record<string, PickSide>>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, PickSide>>({});
  const [allUsersPicks, setAllUsersPicks] = useState<
    Record<string, UserPickInfo[]>
  >({});
  const [bootstrapping, setBootstrapping] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickErrors, setPickErrors] = useState<Record<string, string>>({});
  const [retryCount, setRetryCount] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  // Set by the visibilitychange handler so the next games fetch refreshes
  // in place instead of blanking the list.
  const silentRefreshRef = useRef(false);
  const loadedWeekKeyRef = useRef<string | null>(null);
  const hasGamesRef = useRef(false);
  // Mirror of savedPicks so async refetches can tell which local selections
  // are unsaved edits that must survive a refresh.
  const savedPicksRef = useRef<Record<string, PickSide>>({});
  // Bumped after every successful save so a pick fetch started before the
  // save can't overwrite the newer baseline when it lands.
  const pickSaveVersionRef = useRef(0);
  const now = useNow();

  useEffect(() => {
    savedPicksRef.current = savedPicks;
  }, [savedPicks]);

  useEffect(() => {
    const fetchCurrentWeek = async () => {
      setBootstrapping(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/current-week");
        if (!response.ok) throw new Error(`Current week request failed (${response.status})`);
        const data = await response.json();
        if (!Number.isInteger(data.year) || !Number.isInteger(data.week)) {
          throw new Error("Current week response was invalid");
        }
        setCurrentYear(data.year);
        if (selectedWeek === null) onWeekChange(data.week);
      } catch (error) {
        console.error("Error fetching current week:", error);
        setLoadError("Current NFL schedule is temporarily unavailable.");
      } finally {
        setBootstrapping(false);
      }
    };

    fetchCurrentWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  useEffect(() => {
    if (!showSaveConfirmation) return;
    const timeoutId = window.setTimeout(() => setShowSaveConfirmation(false), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [showSaveConfirmation]);

  // When the user returns to the tab, quietly re-sync games (a game may have
  // kicked off while the page was open) and picks without blanking the list.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      silentRefreshRef.current = true;
      setRefreshTick((tick) => tick + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (selectedWeek === null || currentYear === null) return;

    // True when this run was triggered by the visibility refresh rather than
    // a week/year change — keep existing games on screen during the refetch.
    // Only silent if we already loaded this same week; otherwise treat it as
    // a fresh navigation with a loading state.
    const weekKey = `${currentYear}:${selectedWeek}`;
    const silent =
      silentRefreshRef.current &&
      loadedWeekKeyRef.current === weekKey &&
      hasGamesRef.current;
    silentRefreshRef.current = false;
    loadedWeekKeyRef.current = weekKey;

    const fetchGames = async () => {
      if (!silent) {
        setGamesLoading(true);
        setGames([]);
        setPicks({});
        setSavedPicks({});
        setAllUsersPicks({});
        setPickErrors({});
        setSaveError(null);
      }
      try {
        const response = await fetch(
          `/api/games?week=${selectedWeek}&year=${currentYear}`
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Games request failed (${response.status})`);
        }
        const rawEvents = await response.json();
        // The games API returns normalized data directly
        const normalized = rawEvents;
        setGames(normalized);
        hasGamesRef.current = normalized.length > 0;
        setLoadError(null);
      } catch (error) {
        console.error("Error fetching games:", error);
        setLoadError("Games are temporarily unavailable. Please retry.");
      } finally {
        setGamesLoading(false);
      }
    };

    const fetchAllPicks = async () => {
      try {
        const response = await fetch(
          `/api/all-picks?week=${selectedWeek}&year=${currentYear}`
        );
        if (response.ok) {
          const data = await response.json();
          setAllUsersPicks(data);
        }
      } catch (error) {
        console.error("Error fetching all picks:", error);
      }
    };

    fetchGames();
    fetchAllPicks();
  }, [selectedWeek, currentYear, retryCount, refreshTick]);

  useEffect(() => {
    if (selectedWeek === null || games.length === 0) return;

    const fetchPicks = async () => {
      const auth = getFirebaseAuth();
      if (!auth?.currentUser) return;

      const saveVersion = pickSaveVersionRef.current;
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch(
          `/api/user-picks?week=${selectedWeek}&year=${currentYear}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // A save completed while this request was in flight — the response
        // predates it, so applying it would roll the baseline backwards.
        if (saveVersion !== pickSaveVersionRef.current) return;

        if (response.ok) {
          const data: UserPick[] = await response.json();
          const picksMap: Record<string, PickSide> = {};

          data.forEach((pick) => {
            if (pick.selectedTeam === "home" || pick.selectedTeam === "away") {
              picksMap[pick.gameId] = pick.selectedTeam;
            } else {
              // Convert team ID back to "away" or "home"
              const game = games.find((g) => g.eventId === pick.gameId);
              if (game) {
                if (pick.selectedTeam === game.home.id) {
                  picksMap[pick.gameId] = "home";
                } else if (pick.selectedTeam === game.away.id) {
                  picksMap[pick.gameId] = "away";
                }
              }
            }
          });

          // Merge rather than replace: selections the user changed since the
          // last known persisted state are unsaved edits and must survive a
          // background refetch.
          const previouslySaved = savedPicksRef.current;
          setPicks((prev) => {
            const merged = { ...picksMap };
            for (const [gameId, side] of Object.entries(prev)) {
              if (previouslySaved[gameId] !== side) merged[gameId] = side;
            }
            return merged;
          });
          setSavedPicks(picksMap);
        }
      } catch (error) {
        console.error("Error fetching picks:", error);
      }
    };

    fetchPicks();
  }, [games, selectedWeek, currentYear]);

  const hasUnsavedChanges =
    Object.keys(picks).some(
      (gameId) => picks[gameId] !== savedPicks[gameId]
    ) ||
    Object.keys(savedPicks).some(
      (gameId) => picks[gameId] !== savedPicks[gameId]
    );

  useEffect(() => {
    document.documentElement.dataset.hasUnsavedPicks = hasUnsavedChanges.toString();
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      delete document.documentElement.dataset.hasUnsavedPicks;
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const handleWeekChange = (week: number) => {
    if (week === selectedWeek) return;
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "You have unsaved pick changes. Leave this week without saving them?"
      )
    ) {
      return;
    }
    setSaveError(null);
    onWeekChange(week);
  };

  const handlePickChange = (gameId: string, side: PickSide) => {
    setPicks((prev) => ({
      ...prev,
      [gameId]: side,
    }));
    setPickErrors((prev) => {
      if (!(gameId in prev)) return prev;
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
    setSaveError(null);
  };

  const handleSavePicks = async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser || selectedWeek === null || currentYear === null || saving) return;

    const submittedPicks = picks;
    const baseline = savedPicks;
    const currentUser = auth.currentUser;
    const submittedWeekKey = `${currentYear}:${selectedWeek}`;

    setSaving(true);
    setSaveError(null);
    try {
      const outcome = await submitPickChanges({
        picks,
        savedPicks,
        games,
        week: selectedWeek,
        year: currentYear,
        getIdToken: () => currentUser.getIdToken(),
      });

      // The user navigated to a different week while the save was in flight;
      // that week's state was already reset, so don't apply this week's
      // results into it.
      if (loadedWeekKeyRef.current !== submittedWeekKey) return;

      pickSaveVersionRef.current += 1;

      // Mark only the picks that actually persisted as saved; a failure on
      // one game must not mask another game's successful write.
      if (outcome.savedGameIds.length > 0) {
        setSavedPicks((prev) => {
          const next = { ...prev };
          for (const gameId of outcome.savedGameIds) {
            next[gameId] = submittedPicks[gameId];
          }
          return next;
        });
      }

      // A locked game's pick can never be saved — revert its selection so the
      // UI reflects the authoritative persisted pick instead of a value the
      // server rejected.
      const lockedFailures = outcome.failures.filter((f) => f.kind === "locked");
      if (lockedFailures.length > 0) {
        setPicks((prev) => {
          const next = { ...prev };
          for (const failure of lockedFailures) {
            const savedSide = baseline[failure.gameId];
            if (savedSide === undefined) delete next[failure.gameId];
            else next[failure.gameId] = savedSide;
          }
          return next;
        });
      }

      setPickErrors(
        Object.fromEntries(
          outcome.failures.map((f) => [f.gameId, f.message] as const)
        )
      );

      if (outcome.failures.length === 0) {
        setShowSaveConfirmation(true);
      } else {
        setSaveError(
          outcome.failures.length === 1
            ? outcome.failures[0].message
            : `${outcome.failures.length} picks couldn't be saved — see the affected games below.`
        );
      }
    } catch (error) {
      console.error("Error saving picks:", error);
      setSaveError("We couldn't save your picks. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (bootstrapping) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (loadError && currentYear === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => setRetryCount((count) => count + 1)}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {showSaveConfirmation && (
        <div
          role="status"
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-md border bg-card px-4 py-3 font-medium shadow-lg"
        >
          <Check className="h-4 w-4 text-green-600" strokeWidth={3} />
          Picks saved.
        </div>
      )}
      {loadError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 border p-4">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" onClick={() => setRetryCount((count) => count + 1)}>
            Retry
          </Button>
        </div>
      )}
      {saveError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 border border-destructive/50 p-4">
          <p className="text-sm text-destructive">{saveError}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            onClick={() => setSaveError(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="sticky top-0 z-30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b bg-card p-4 mb-4">
        <div className="flex items-center gap-3">
          <WeekDropdown
            selectedWeek={selectedWeek}
            onWeekChange={handleWeekChange}
          />
        </div>
        {hasUnsavedChanges && (
          <Button
            onClick={handleSavePicks}
            disabled={saving}
            className="min-w-[8.5rem] font-semibold"
          >
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {saving ? "Saving…" : "Save Picks"}
          </Button>
        )}
      </div>

      <LeaderboardCard
        selectedWeek={selectedWeek}
        selectedYear={currentYear}
        currentUserId={user.uid}
      />

      {gamesLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div>
          {games.map((game) => (
            <GamePickCard
              key={game.eventId}
              game={game}
              selectedSide={picks[game.eventId]}
              onPickChange={handlePickChange}
              locked={isGameLocked(game, now)}
              now={now}
              unsaved={
                picks[game.eventId] !== undefined &&
                picks[game.eventId] !== savedPicks[game.eventId]
              }
              saveError={pickErrors[game.eventId]}
              userPicks={allUsersPicks[game.eventId] || []}
            />
          ))}
        </div>
      )}

      {!gamesLoading && games.length === 0 && !loadError && (
        <div className="text-center py-16 border rounded-lg">
          <p className="text-muted-foreground">
            No games available for this week
          </p>
        </div>
      )}
    </div>
  );
}
