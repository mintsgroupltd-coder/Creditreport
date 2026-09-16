/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#161B22",
        surface: "#0F1115",
        panel: "#171B22",
        border: "#262B33",
        accent: "#5B8DEF",
        good: "#2FAE72",
        warn: "#E0A62A",
        critical: "#E5484D",
      },
    },
  },
  plugins: [],
};
