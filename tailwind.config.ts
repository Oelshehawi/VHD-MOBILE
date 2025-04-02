import { type Config } from 'tailwindcss';

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        black: '#000000',
        darkGreen: '#003e29',
        borderGreen: '#467061',
        darkWhite: '#d9d9d9',
        darkGray: '#222a27',
        lightGray: '#dde2e0',
        darkBlue: '#0a003e',
        success: {
          25: '#F6FEF9',
          50: '#ECFDF3',
          100: '#D1FADF',
          600: '#039855',
          700: '#027A48',
          900: '#054F31',
        },
        indigo: {
          500: '#6172F3',
          700: '#3538CD',
        },
        pink: {
          25: '#FEF6FB',
          100: '#FCE7F6',
          500: '#EE46BC',
          600: '#DD2590',
          700: '#C11574',
          900: '#851651',
        },
        blue: {
          25: '#F5FAFF',
          100: '#D1E9FF',
          500: '#2E90FA',
          600: '#1570EF',
          700: '#175CD3',
          900: '#194185',
        },
        sky: {
          1: '#F3F9FF',
        },
        gray: {
          25: '#FCFCFD',
          200: '#EAECF0',
          300: '#D0D5DD',
          500: '#667085',
          600: '#475467',
          700: '#344054',
          900: '#101828',
        },
      },
      boxShadow: {
        custom:
          '0 1px 1px 0 rgba(65,69,73,.3), 0 1px 3px 1px rgba(65,69,73,.15)',
      },
      keyframes: {
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
