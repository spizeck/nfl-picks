"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getFirestoreDb } from "@/lib/firebase";
import {
  EMAIL_PREFERENCE_DEFAULTS,
  resolveEmailPreferences,
  saveEmailPreference,
  withEmailPreference,
  type EmailPreferences,
} from "@/lib/email-preferences";
import { cn } from "@/lib/utils";

interface SettingsMenuProps {
  user: FirebaseUser;
}

type PreferenceStatus =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "load-error"
  | "save-error";

const STATUS_TEXT: Record<PreferenceStatus, string | null> = {
  loading: "Loading preferences…",
  ready: null,
  saving: "Saving…",
  saved: "Saved",
  "load-error": "Couldn't load saved preferences. Showing defaults.",
  "save-error": "Couldn't save. Try again.",
};

export function SettingsMenu({ user }: SettingsMenuProps) {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [status, setStatus] = useState<PreferenceStatus>("loading");
  const [pendingKey, setPendingKey] = useState<keyof EmailPreferences | null>(
    null
  );

  useEffect(() => {
    const db = getFirestoreDb();
    let cancelled = false;

    const load = db
      ? getDoc(doc(db, "users", user.uid)).then((snapshot) =>
          resolveEmailPreferences(snapshot.data())
        )
      : Promise.reject(new Error("Firestore is unavailable"));

    load
      .then((resolved) => {
        if (cancelled) return;
        setPrefs(resolved);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Error loading email preferences:", error);
        if (cancelled) return;
        setPrefs(EMAIL_PREFERENCE_DEFAULTS);
        setStatus("load-error");
      });
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const updatePreference = async (
    key: keyof EmailPreferences,
    value: boolean
  ) => {
    const db = getFirestoreDb();
    if (!db || pendingKey) return;

    setPendingKey(key);
    setStatus("saving");
    setPrefs((current) =>
      withEmailPreference(current ?? EMAIL_PREFERENCE_DEFAULTS, key, value)
    );

    const ref = doc(db, "users", user.uid);
    try {
      await saveEmailPreference(
        {
          update: (field, next) => updateDoc(ref, field, next),
          setMerge: (data) => setDoc(ref, data, { merge: true }),
        },
        key,
        value
      );
      setStatus("saved");
    } catch (error) {
      console.error("Error saving email preferences:", error);
      setPrefs((current) =>
        withEmailPreference(current ?? EMAIL_PREFERENCE_DEFAULTS, key, !value)
      );
      setStatus("save-error");
    } finally {
      setPendingKey(null);
    }
  };

  const busy = prefs === null || pendingKey !== null;
  const statusText = STATUS_TEXT[status];
  const isError = status === "load-error" || status === "save-error";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          className="hover:bg-muted/50"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Email notifications
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={prefs?.weeklyRecap ?? true}
          disabled={busy}
          onCheckedChange={(checked) =>
            updatePreference("weeklyRecap", checked === true)
          }
          onSelect={(event) => event.preventDefault()}
          className="py-2.5"
        >
          <div>
            <div>Weekly recap</div>
            <div className="text-xs text-muted-foreground">
              How your picks did after each week
            </div>
          </div>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs?.pickReminders ?? true}
          disabled={busy}
          onCheckedChange={(checked) =>
            updatePreference("pickReminders", checked === true)
          }
          onSelect={(event) => event.preventDefault()}
          className="py-2.5"
        >
          <div>
            <div>Pick reminders</div>
            <div className="text-xs text-muted-foreground">
              A nudge when games are still unpicked
            </div>
          </div>
        </DropdownMenuCheckboxItem>
        {statusText && (
          <>
            <DropdownMenuSeparator />
            <div
              aria-live="polite"
              className={cn(
                "px-2 py-1.5 text-xs",
                isError ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {statusText}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
