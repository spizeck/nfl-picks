"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";
import { AuthLanding } from "@/components/auth/auth-landing";
import { Dashboard } from "@/components/dashboard/dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function HomeClient() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ready, setReady] = useState(() => !getFirebaseAuth());
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (ready) return;
    const timeoutId = setTimeout(() => {
      setReady(true);
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [ready]);

  if (!ready) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (user) {
    return (
      <AppShell user={user}>
        <Dashboard user={user} selectedWeek={selectedWeek} onWeekChange={setSelectedWeek} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AuthLanding />
    </AppShell>
  );
}
