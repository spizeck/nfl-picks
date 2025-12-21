"use client";

import { useState, useEffect } from "react";
import {
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function AuthLanding() {
  const [, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged((firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();
    const googleProvider = getGoogleProvider();
    if (!auth || !googleProvider) {
      console.error("Firebase auth not initialized");
      return;
    }

    setSigningIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      setUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
    } catch (error) {
      console.error("Error signing in with Google:", error);
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-lg flex items-center justify-center bg-muted border">
              <span className="text-5xl">🏈</span>
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold">
              Welcome to NFL Picks
            </h1>
            <p className="text-xl text-muted-foreground">
              Make your picks and compete with friends
            </p>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-center">Get Started</h2>
            <Button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              size="lg"
              className="w-full h-12 text-base font-semibold"
            >
              {signingIn && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </Button>
          </div>
          
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground text-center">
              Track your picks, compete on the leaderboard, and prove you&apos;re the ultimate NFL expert
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
