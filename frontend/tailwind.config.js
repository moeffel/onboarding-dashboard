/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff5f5',
          100: '#ffe3e3',
          200: '#ffc9c9',
          300: '#fda4a4',
          400: '#f87171',
          500: '#ef3e3e',
          600: '#e30613',
          700: '#c40510',
          800: '#a0030c',
          900: '#7b0209',
          950: '#450a0a',
        },
      },
    },
  },
  plugins: [],
}
