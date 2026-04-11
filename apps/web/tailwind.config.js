/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warm rose-tinted grays (replaces cold grays across all pages)
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
        // Muted rose/mauve brand (inspired by sucre.no)
        brand: {
          50:  "#fdf0f1",
          100: "#f8e2e4",
          300: "#dba8b0",
          400: "#c98f97",
          500: "#b67b7f",
          600: "#9d6569",
          700: "#7d4e52",
        },
      },
    },
  },
  plugins: [],
};
