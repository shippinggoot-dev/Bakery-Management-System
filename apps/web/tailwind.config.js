/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warm rose-tinted grays — used for body text across all themes
        gray: {
          50:  "#f8f2f3",
          100: "#f0e8e9",
          200: "#ddd0d1",
          300: "#c2a8aa",
          400: "#9a7e80",
          500: "#785659",
          600: "#57393c",
          700: "#3a2326",
          800: "#2b1a1d",
          900: "#1c1012",
          950: "#100b0c",
        },
        // Brand accent — driven by CSS variables, supports opacity modifiers
        brand: {
          50:  "rgb(var(--brand-50)  / <alpha-value>)",
          100: "rgb(var(--brand-100) / <alpha-value>)",
          200: "rgb(var(--brand-200) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
        },
        // Rose background tones — driven by CSS variables
        rose: {
          50:  "rgb(var(--rose-50)  / <alpha-value>)",
          100: "rgb(var(--rose-100) / <alpha-value>)",
          200: "rgb(var(--rose-200) / <alpha-value>)",
        },
      },
      fontFamily: {
        script: ['"Dancing Script"', "cursive"],
      },
    },
  },
  plugins: [],
};
