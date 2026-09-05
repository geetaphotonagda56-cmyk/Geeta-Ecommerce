import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Safelist grid column classes for dynamic sections
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-6',
    'grid-cols-8',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'md:grid-cols-6',
    'md:grid-cols-8',
    'lg:grid-cols-2',
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'lg:grid-cols-6',
    'lg:grid-cols-8',
  ],
  theme: {
    extend: {
      colors: {
        // Mapped to the admin's customer Theme Settings so Tailwind colour
        // utilities stay in sync with the runtime CSS variables. Opacity
        // modifiers are not supported on these — use the --customer-*-alpha-*
        // variables for translucency.
        primary: {
          DEFAULT: 'var(--customer-primary)',
          dark: 'var(--customer-primary-dark)',
          light: 'var(--customer-primary-light)',
        },
        accent: {
          DEFAULT: 'var(--customer-accent)',
        },
      },
      fontFamily: {
        // Storefront-only type system (AppLayout applies these classes so
        // admin/seller/delivery keep their existing system-font look).
        body: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

