import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // One neutral family: Tailwind `gray-*` classes render as slate, matching
        // the CSS tokens in styles/index.css and the inline slate hex values.
        gray: colors.slate,
        // `primary-*` is the same blue as `blue-*` and var(--blue).
        primary: colors.blue,
      },
      // Desktop-application corners: nearly square (was 6–16px on cards/buttons)
      borderRadius: {
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '6px',
      },
      fontFamily: {
        sans: ['Segoe UI', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
