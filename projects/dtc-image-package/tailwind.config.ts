import type { Config } from "tailwindcss";

// Theme matches https://www.runflow.io/contests
//   bg = warm cream, accents = amber, borders = warm tan, fonts = Outfit + Space Mono
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F4EFE5",
        panel: "#FFFFFF",
        "panel-2": "#ECE6D7",
        "panel-dark": "#18181B",
        "panel-deep": "#0F0F11",
        ink: "#18181B",
        "ink-2": "#52525B",
        muted: "#71717A",
        faint: "#A1A1AA",
        "on-dark": "#FAFAFA",
        "on-dark-muted": "#A1A1AA",
        line: "#D9D0BC",
        "line-strong": "#7A6E4F",
        "line-hover": "#B5A887",
        amber: {
          DEFAULT: "#D97706",
          50: "#FDE68A",
          100: "#FCD34D",
          400: "#F59E0B",
          500: "#D97706",
          700: "#92400E",
          soft: "rgba(245,158,11,0.08)",
          border: "rgba(217,119,6,0.30)",
          glow: "#F59E0B",
        },
        green: {
          DEFAULT: "#16A34A",
          400: "#4ADE80",
          500: "#22C55E",
          soft: "rgba(34,197,94,0.10)",
        },
        red: { DEFAULT: "#B91C1C", soft: "rgba(185,28,28,0.08)" },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Space Mono", "SF Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(24,24,27,0.05), 0 1px 3px rgba(24,24,27,0.06)",
        card: "0 2px 8px rgba(24,24,27,0.06), 0 1px 2px rgba(24,24,27,0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
