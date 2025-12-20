import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const customConfig = defineConfig({
  theme: {
    tokens: {
      colors: {
        // Brand colors - customize these to your preference
        brand: {
          50: { value: "#e3f2fd" },
          100: { value: "#bbdefb" },
          200: { value: "#90caf9" },
          300: { value: "#64b5f6" },
          400: { value: "#42a5f5" },
          500: { value: "#2196f3" },  // Primary brand color
          600: { value: "#1e88e5" },
          700: { value: "#1976d2" },
          800: { value: "#1565c0" },
          900: { value: "#0d47a1" },
          950: { value: "#0a3d91" },
        },
      },
    },
    semanticTokens: {
      colors: {
        // Override semantic tokens to use your brand colors
        "blue.solid": {
          value: { base: "{colors.brand.500}", _dark: "{colors.brand.600}" },
        },
        "blue.fg": {
          value: { base: "{colors.brand.700}", _dark: "{colors.brand.300}" },
        },
        "blue.subtle": {
          value: { base: "{colors.brand.50}", _dark: "{colors.brand.950}" },
        },
        "blue.muted": {
          value: { base: "{colors.brand.200}", _dark: "{colors.brand.800}" },
        },
        bg: {
          value: { base: "{colors.gray.50}", _dark: "{colors.gray.950}" },
        },
        "bg.muted": {
          value: { base: "{colors.gray.100}", _dark: "{colors.gray.900}" },
        },
        "bg.panel": {
          value: { base: "{colors.white}", _dark: "{colors.gray.900}" },
        },
        fg: {
          value: { base: "{colors.gray.900}", _dark: "{colors.gray.50}" },
        },
        "fg.muted": {
          value: { base: "{colors.gray.600}", _dark: "{colors.gray.300}" },
        },
        "border.muted": {
          value: { base: "{colors.gray.200}", _dark: "{colors.gray.800}" },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, customConfig);
