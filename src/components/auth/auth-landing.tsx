"use client";

import { useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase";
import {
  Box,
  Button,
  VStack,
  Heading,
  Text,
  Flex,
  Spinner,
  Field,
  Input,
  Link,
  Separator,
  HStack,
} from "@chakra-ui/react";
import type { User as FirebaseUser } from "firebase/auth";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

type ViewMode = "login" | "signup" | "forgot";

export function AuthLanding() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const [mode, setMode] = useState<ViewMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setMessage(null);
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
      setError("Google sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailLogin = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setSigningIn(true);
    setError(null);
    setMessage(null);

    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = result.user;
      setUser({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
      });
    } catch (e) {
      console.error("Email login failed:", e);
      setError("Login failed. Check your email/password.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailSignup = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setSigningIn(true);
    setError(null);
    setMessage(null);

    if (!displayName.trim()) {
      setError("Please enter your name.");
      setSigningIn(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setSigningIn(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSigningIn(false);
      return;
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(result.user, { displayName: displayName.trim() });
      const u = result.user;
      setUser({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
      });
    } catch (e) {
      console.error("Signup failed:", e);
      setError("Sign up failed. Try a different email.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setSigningIn(true);
    setError(null);
    setMessage(null);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent.");
    } catch (e) {
      console.error("Password reset failed:", e);
      setError("Could not send reset email. Check the email address.");
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <Box h="100vh" display="flex" alignItems="center" justifyContent="center" bg="bg.muted">
        <VStack gap={4}>
          <Spinner size="xl" colorPalette="blue" />
          <Text color="fg.muted">Loading...</Text>
        </VStack>
      </Box>
    );
  }

  if (user) return null;

  return (
    <Box bg="bg" minH="100vh">
      {/* Hero Section */}
      <Flex
        direction="column"
        align="center"
        justify="center"
        minH="100vh"
        px={4}
        py={8}
      >
        <VStack gap={8} maxW="400px" w="full">
          {/* Logo/Icon */}
          <Box
            w="100px"
            h="100px"
            bg="blue.solid"
            rounded="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
            boxShadow="lg"
          >
            <Text fontSize="4xl" color="white" fontWeight="bold">
              🏈
            </Text>
          </Box>

          {/* Title and Description */}
          <VStack gap={4} textAlign="center">
            <Heading size="2xl" color="fg">
              NFL Picks Challenge
            </Heading>
            <Text fontSize="lg" color="fg.muted">
              Make your weekly picks and compete with family and friends!
            </Text>
          </VStack>

          {message && (
            <Box w="full" bg="green.subtle" borderWidth="1px" borderColor="green.muted" p={3} rounded="md">
              <Text color="green.fg" fontSize="sm">
                {message}
              </Text>
            </Box>
          )}

          {error && (
            <Box w="full" bg="red.subtle" borderWidth="1px" borderColor="red.muted" p={3} rounded="md">
              <Text color="red.fg" fontSize="sm">
                {error}
              </Text>
            </Box>
          )}

          {mode === "signup" && (
            <Field.Root>
              <Field.Label>Name</Field.Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </Field.Root>
          )}

          <Field.Root>
            <Field.Label>Email</Field.Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              type="email"
              autoComplete="email"
            />
          </Field.Root>

          {mode !== "forgot" && (
            <Field.Root>
              <Field.Label>Password</Field.Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </Field.Root>
          )}

          {mode === "signup" && (
            <Field.Root>
              <Field.Label>Confirm Password</Field.Label>
              <Input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                type="password"
                autoComplete="new-password"
              />
            </Field.Root>
          )}

          {mode === "login" && (
            <Flex w="full" justify="flex-end">
              <Link
                fontSize="sm"
                color="blue.fg"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setMessage(null);
                }}
              >
                Forgot password?
              </Link>
            </Flex>
          )}

          {mode === "login" && (
            <Button
              onClick={handleEmailLogin}
              loading={signingIn}
              colorPalette="blue"
              size="lg"
              w="full"
              h="56px"
              fontSize="md"
            >
              Log In
            </Button>
          )}

          {mode === "signup" && (
            <Button
              onClick={handleEmailSignup}
              loading={signingIn}
              colorPalette="blue"
              size="lg"
              w="full"
              h="56px"
              fontSize="md"
            >
              Sign Up
            </Button>
          )}

          {mode === "forgot" && (
            <Button
              onClick={handleForgotPassword}
              loading={signingIn}
              colorPalette="blue"
              size="lg"
              w="full"
              h="56px"
              fontSize="md"
            >
              Send Reset Email
            </Button>
          )}

          <Flex w="full" justify="center" gap={2}>
            {mode !== "login" && (
              <Link
                fontSize="sm"
                color="blue.fg"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setMessage(null);
                }}
              >
                Have an account? Log in
              </Link>
            )}
            {mode !== "signup" && (
              <Link
                fontSize="sm"
                color="blue.fg"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setMessage(null);
                }}
              >
                Need an account? Sign up
              </Link>
            )}
          </Flex>

          <Separator />

          {/* Sign In Button */}
          <Button
            onClick={handleGoogleSignIn}
            loading={signingIn}
            loadingText="Signing in..."
            colorPalette="blue"
            size="lg"
            w="full"
            h="56px"
            fontSize="md"
          >
            <HStack gap={3}>
              <Box w="5" h="5">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </Box>
              <Text>Sign in with Google</Text>
            </HStack>
          </Button>

          {/* Features */}
          <VStack gap={3} align="start" w="full" pt={4}>
            <Text color="fg.muted" fontSize="sm">
              ✓ View weekly NFL games
            </Text>
            <Text color="fg.muted" fontSize="sm">
              ✓ Make your picks
            </Text>
            <Text color="fg.muted" fontSize="sm">
              ✓ Track your record
            </Text>
            <Text color="fg.muted" fontSize="sm">
              ✓ Compete with family
            </Text>
          </VStack>
        </VStack>
      </Flex>
    </Box>
  );
}
