/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2f36a8",
          container: "#e0e1fa",
          "on-container": "#141a6b",
        },
        success: "#22c55e",
        "success-light": "#f0fdf4",
        danger: "#ef4444",
        warning: "#f59e0b",
        "warning-light": "#fffbeb",
      },
      fontFamily: {
        cairo: ["Cairo", "System"],
      },
    },
  },
  plugins: [],
};
