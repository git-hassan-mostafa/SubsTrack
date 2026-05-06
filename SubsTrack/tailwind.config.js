/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', dark: '#4f46e5' },
        success: '#22c55e',
        danger: '#ef4444',
      },
      fontFamily: {
        cairo: ['Cairo', 'System'],
      },
    },
  },
  plugins: [],
};
