"use client";

import { useState, useEffect } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import { Button, Text, Box, Avatar } from "@chakra-ui/react";
import type { User as FirebaseUser } from "firebase/auth";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function SignIn() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if user is already signed in
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

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();
    const googleProvider = getGoogleProvider();
    if (!auth || !googleProvider) {
      console.error("Firebase auth not initialized");
      return;
    }
    
    setLoading(true);
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
      <Box display="flex" alignItems="center" gap={4}>
        <Avatar.Root size="sm">
          {user.photoURL ? <Avatar.Image src={user.photoURL} /> : null}
          <Avatar.Fallback name={user.displayName || user.email || "User"} />
        </Avatar.Root>
        <Text>{user.displayName || user.email}</Text>
        <Button onClick={handleSignOut} colorPalette="red" variant="outline">
          Sign Out
        </Button>
      </Box>
    );
  }

  return (
    <Button
      onClick={handleGoogleSignIn}
      loading={loading}
      colorPalette="blue"
      size="lg"
    >
      Sign in with Google
    </Button>
  );
}
