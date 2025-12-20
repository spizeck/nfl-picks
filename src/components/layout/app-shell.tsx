"use client"

import { useState, type ReactNode } from "react"
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  IconButton,
  Spacer,
  Text,
} from "@chakra-ui/react"
import type { User as FirebaseUser } from "firebase/auth"
import { signOut } from "firebase/auth"

import { ColorModeIcon, useColorMode } from "@/components/ui/color-mode"
import { getFirebaseAuth } from "@/lib/firebase"
import { WeekDropdown } from "./week-dropdown"

interface AppShellProps {
  children: ReactNode
  user?: FirebaseUser | null
  selectedWeek?: number | null
  onWeekChange?: (week: number) => void
}

export function AppShell({ children, user, selectedWeek, onWeekChange }: AppShellProps) {
  return (
    <Box bg="bg" color="fg" minH="100vh">
      <Container
        maxW="6xl"
        minH="100vh"
        px={{ base: 4, md: 6 }}
        py={{ base: 4, md: 8 }}
      >
        <Flex direction="column" gap={6} minH="100%">
          <AppHeader 
            user={user ?? null} 
            selectedWeek={selectedWeek}
            onWeekChange={onWeekChange}
          />
          <Box as="main" flex="1">
            {children}
          </Box>
        </Flex>
      </Container>
    </Box>
  )
}

interface AppHeaderProps {
  user: FirebaseUser | null
  selectedWeek?: number | null
  onWeekChange?: (week: number) => void
}

function AppHeader({ user, selectedWeek, onWeekChange }: AppHeaderProps) {
  const { toggleColorMode } = useColorMode()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    const auth = getFirebaseAuth()
    if (!auth?.currentUser) return

    try {
      setSigningOut(true)
      await signOut(auth)
    } catch (error) {
      console.error("Error signing out:", error)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Flex
      align="center"
      gap={{ base: 3, md: 4 }}
      borderWidth="1px"
      borderColor="border.muted"
      rounded="xl"
      bg="bg.panel"
      px={{ base: 4, md: 6 }}
      py={{ base: 3, md: 4 }}
      boxShadow="sm"
    >
      <HStack gap={3}>
        <Box
          w="10"
          h="10"
          rounded="full"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="blue.subtle"
        >
          <Text fontSize="xl">🏈</Text>
        </Box>
        <Heading size="lg">NFL Picks</Heading>
      </HStack>

      <Spacer />

      <HStack gap={2}>
        {user && selectedWeek !== undefined && onWeekChange && (
          <WeekDropdown selectedWeek={selectedWeek} onWeekChange={onWeekChange} />
        )}
        {user && (
          <Text color="fg.muted" fontSize="sm" display={{ base: "none", md: "block" }}>
            {user.displayName || user.email}
          </Text>
        )}
        <IconButton
          aria-label="Toggle color mode"
          variant="ghost"
          size="sm"
          onClick={toggleColorMode}
        >
          <ColorModeIcon />
        </IconButton>
        {user && (
          <Button
            size="sm"
            variant="solid"
            colorPalette="blue"
            onClick={handleLogout}
            loading={signingOut}
          >
            Logout
          </Button>
        )}
      </HStack>
    </Flex>
  )
}
