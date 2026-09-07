"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User as FirebaseUser } from "firebase/auth";
import { Loader2 } from "lucide-react";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function SignIn() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

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
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();
    const googleProvider = getGoogleProvider();
    if (!auth || !googleProvider) {
      setSignInError("Google sign-in is not configured for this environment.");
      return;
    }
    
    setLoading(true);
    setSignInError(null);
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
      const code = (error as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setSignInError(
          code === "auth/unauthorized-domain"
            ? "Google sign-in is not authorized for this domain."
            : "Google sign-in failed. Please retry."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      console.error("Firebase auth not initialized");
      return;
    }
    
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <Avatar className="h-8 w-8">
          {user.photoURL && <AvatarImage src={user.photoURL} />}
          <AvatarFallback>{user.displayName?.[0] || user.email?.[0] || "U"}</AvatarFallback>
        </Avatar>
        <span className="text-sm">{user.displayName || user.email}</span>
        <Button onClick={handleSignOut} variant="outline" size="sm">
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button
        onClick={handleGoogleSignIn}
        disabled={loading}
        size="lg"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign in with Google
      </Button>
      {signInError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {signInError}
        </p>
      )}
    </div>
  );
}
