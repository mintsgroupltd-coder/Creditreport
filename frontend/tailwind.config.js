/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#161B22",
        surface: "#0B0D11",
        panel: "#171B22",
        border: "#262B33",
        accent: "#6C93F5",
        good: "#2FAE72",
        warn: "#E0A62A",
        critical: "#E5484D",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      // Rounder than Tailwind's defaults — every existing `rounded-md`/
      // `rounded-lg` in the app (used consistently for cards, buttons and
      // inputs) picks this up automatically, giving the whole app a
      // softer, more modern feel from one place rather than editing every
      // page's className.
      borderRadius: {
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
