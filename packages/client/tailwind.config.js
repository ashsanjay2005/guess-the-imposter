/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 10px 25px -5px rgba(0,0,0,0.30), 0 8px 10px -6px rgba(0,0,0,0.28)',
      },
    },
  },
  plugins: [],
};


