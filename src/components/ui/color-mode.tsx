"use client";

import { ThemeProvider, useTheme } from "next-themes";

export function ColorModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

export function useColorMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const colorMode = (resolvedTheme ?? theme) as "light" | "dark" | undefined;

  return {
    colorMode,
    setColorMode: (value: "light" | "dark") => setTheme(value),
    toggleColorMode: () => setTheme(colorMode === "dark" ? "light" : "dark"),
  };
}

export function useColorModeValue<T>(light: T, dark: T): T {
  const { resolvedTheme, theme } = useTheme();
  const mode = (resolvedTheme ?? theme) as "light" | "dark" | undefined;
  return mode === "dark" ? dark : light;
}
