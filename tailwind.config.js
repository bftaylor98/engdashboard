/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#60a5fa',
          muted: '#1d4ed8',
        },
        hot: '#f97316',
        surface: {
          DEFAULT: '#18181b',
          elevated: '#27272a',
        },
      },
      borderColor: {
        subtle: 'rgba(255,255,255,0.06)',
        DEFAULT: 'rgba(255,255,255,0.10)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'fire-flicker': 'fireFlicker 1.2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fireFlicker: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '25%': { opacity: '0.85', transform: 'scale(1.05)' },
          '50%': { opacity: '1', transform: 'scale(0.98)' },
          '75%': { opacity: '0.9', transform: 'scale(1.03)' },
        },
      },
    },
  },
  plugins: [],
}

