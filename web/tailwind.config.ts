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
        brand: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
