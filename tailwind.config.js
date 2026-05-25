/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a5c38',
          dark: '#0f3d24',
          light: '#2a7a4e',
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#f0d060',
        },
      },
    },
  },
  plugins: [],
};

