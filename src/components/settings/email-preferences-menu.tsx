"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { Mail } from "lucide-react";
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
  emailPreferenceField,
  resolveEmailPreferences,
  withEmailPreference,
  type EmailPreferences,
} from "@/lib/email-preferences";

interface EmailPreferencesMenuProps {
  user: FirebaseUser;
}

export function EmailPreferencesMenu({ user }: EmailPreferencesMenuProps) {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db) return;

    let cancelled = false;
    getDoc(doc(db, "users", user.uid))
      .then((snapshot) => {
        if (!cancelled) {
          setPrefs(resolveEmailPreferences(snapshot.data()));
        }
      })
      .catch((error) => {
        console.error("Error loading email preferences:", error);
        if (!cancelled) setPrefs(EMAIL_PREFERENCE_DEFAULTS);
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
    if (!db) return;

    setPrefs((current) =>
      withEmailPreference(current ?? EMAIL_PREFERENCE_DEFAULTS, key, value)
    );
    const ref = doc(db, "users", user.uid);
    try {
      // Dotted-path update writes only the changed leaf field so the sibling
      // preference is preserved even when it was explicitly set.
      await updateDoc(ref, emailPreferenceField(key), value);
    } catch {
      try {
        // The user document may not exist yet; create it with just this key.
        await setDoc(
          ref,
          { emailPreferences: { [key]: value } },
          { merge: true }
        );
      } catch (fallbackError) {
        console.error("Error saving email preferences:", fallbackError);
        setPrefs((current) =>
          withEmailPreference(
            current ?? EMAIL_PREFERENCE_DEFAULTS,
            key,
            !value
          )
        );
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Email preferences"
          className="hover:bg-muted/50"
        >
          <Mail className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Email notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs?.weeklyRecap ?? true}
          onCheckedChange={(checked) =>
            updatePreference("weeklyRecap", checked === true)
          }
          onSelect={(event) => event.preventDefault()}
        >
          Weekly recap
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs?.pickReminders ?? true}
          onCheckedChange={(checked) =>
            updatePreference("pickReminders", checked === true)
          }
          onSelect={(event) => event.preventDefault()}
        >
          Pick reminders
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
