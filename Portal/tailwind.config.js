/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        primaryLight: "#eef2ff",
        success: "#22c55e",
        successLight: "#f0fdf4",
        danger: "#ef4444",
        warning: "#f59e0b",
        warningLight: "#fffbeb",
      },
    },
  },
  plugins: [],
};
