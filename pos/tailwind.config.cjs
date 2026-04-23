/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  prefix: 'tw-',
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        bg: '#f8f9fb',
        ink: '#0f172a',
        muted: '#64748b',
        line: 'rgba(15, 23, 42, 0.10)',
        accent: '#fde7ea',
        primary: '#111827'
      },
      boxShadow: {
        soft: '0 14px 40px rgba(15, 23, 42, 0.08)'
      },
      borderRadius: {
        card: '16px',
        control: '12px'
      }
    }
  },
  plugins: []
};

