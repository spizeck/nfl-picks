"use client";

import { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { Box, Spinner } from "@chakra-ui/react";
import { getFirebaseAuth } from "@/lib/firebase";
import { AuthLanding } from "@/components/auth/auth-landing";
import { Dashboard } from "@/components/dashboard/dashboard";
import { AppShell } from "@/components/layout/app-shell";

export default function HomeClient() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ready, setReady] = useState(() => !getFirebaseAuth());

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
        <Box
          minH="60vh"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Spinner size="xl" />
        </Box>
      </AppShell>
    );
  }

  if (user) {
    return (
      <AppShell user={user}>
        <Dashboard user={user} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AuthLanding />
    </AppShell>
  );
}
