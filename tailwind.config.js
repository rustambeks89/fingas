// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: TailwindCSS config — mobile-first design tokens, dark theme default,
// premium luxury crimson dark red palette, safe-area utilities, custom shadows.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg-default)',
          soft: 'var(--color-bg-soft)',
          card: 'var(--color-bg-card)',
          elevated: 'var(--color-bg-elevated)',
        },
        ink: {
          DEFAULT: 'var(--color-ink-default)',
          muted: 'var(--color-ink-muted)',
          soft: 'var(--color-ink-soft)',
        },
        line: 'var(--color-line)',
        brand: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          400: '#E11D48',
          500: '#9F1239', // Premium Deep Crimson Red
          600: '#881337', // Deep Crimson Red
          700: '#4C0519', // Ultra Dark Crimson Red
        },
        success: '#10B981',
        warning: '#9F1239', // Coordinated Crimson Red
        danger: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: [
          'Trebuchet MS',
          'Trebuchet',
          'Plus Jakarta Sans',
          'Inter',
          'SF Pro Text',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        display: [
          'Trebuchet MS',
          'Trebuchet',
          'Outfit',
          'SF Pro Display',
          'sans-serif',
        ],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.04)',
        'card-premium': '0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 20px rgba(159, 12, 57, 0.05), inset 0 1px 0px 0px rgba(255, 255, 255, 0.08)',
        'glass-shadow': 'inset 0 1px 1px 0px rgba(255, 255, 255, 0.12), 0 12px 40px -12px rgba(0, 0, 0, 0.4)',
        glow: '0 0 30px 4px rgba(159, 18, 57, 0.35)',
        sheet: '0 -8px 40px rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
};
