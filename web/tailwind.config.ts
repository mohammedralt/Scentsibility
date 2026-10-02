import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm near-black neutrals for the dark theme (in place of Tailwind's cool grays)
        gray: {
          50:  '#faf9f7',
          100: '#f2f0ed',
          200: '#e3dfda',
          300: '#cbc5be',
          400: '#a39c94',
          500: '#7d766f',
          600: '#5a544e',
          700: '#3d3834',
          800: '#2b2724',
          900: '#1c1a18',
          950: '#0e0d0c',
        },
        // Champagne gold, like a perfume cap
        brand: {
          50:  '#fbf7ee',
          100: '#f6ecd5',
          200: '#eedaab',
          300: '#e4c47f',
          400: '#d8ac5a',
          500: '#c4933d',
          600: '#a5772f',
          700: '#835c28',
          800: '#6a4a25',
          900: '#573d21',
          950: '#2f200f',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
