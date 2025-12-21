"use client"

import { useState, type ReactNode } from "react"
import type { User as FirebaseUser } from "firebase/auth"
import { signOut } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
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
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto min-h-screen px-4 md:px-8 lg:px-12 py-6 md:py-8">
        <div className="flex flex-col gap-8 min-h-full">
          <AppHeader 
            user={user ?? null} 
            selectedWeek={selectedWeek}
            onWeekChange={onWeekChange}
          />
          <main className="flex-1 pb-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

interface AppHeaderProps {
  user: FirebaseUser | null
  selectedWeek?: number | null
  onWeekChange?: (week: number) => void
}

function AppHeader({ user, selectedWeek, onWeekChange }: AppHeaderProps) {
  const { theme, setTheme } = useTheme()
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

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <div className="flex items-center gap-3 md:gap-4 border-b bg-card px-4 md:px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted border">
          <span className="text-xl">🏈</span>
        </div>
        <h1 className="text-xl md:text-2xl font-semibold">
          NFL Picks
        </h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 md:gap-3">
        {user && selectedWeek !== undefined && onWeekChange && (
          <WeekDropdown selectedWeek={selectedWeek} onWeekChange={onWeekChange} />
        )}
        {user && (
          <span className="text-sm text-muted-foreground px-2 py-1">
            {user.displayName || user.email}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="hover:bg-muted/50"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
        {user && (
          <Button
            size="sm"
            onClick={handleLogout}
            disabled={signingOut}
            variant="outline"
            className="font-semibold"
          >
            Logout
          </Button>
        )}
      </div>
    </div>
  )
}
