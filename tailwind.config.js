/** @type {import('tailwindcss').Config} */
export default {
  // Match ThemeContext / index.html: `data-theme="dark"` on <html> (Tailwind wraps as :where(..., ... *)).
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
