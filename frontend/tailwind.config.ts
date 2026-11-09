import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)',
      },
      colors: {
        bg: {
          light: '#F8FAFC',
          dark: '#0B1220',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#111A2E',
        },
        border: {
          light: '#E2E8F0',
          dark: '#1F2A44',
        },
        text: {
          light: '#0F172A',
          dark: '#E5E7EB',
        },
        muted: {
          light: '#64748B',
          dark: '#94A3B8',
        },
        accent: {
          light: '#4F46E5',
          dark: '#818CF8',
        },
        danger: {
          light: '#DC2626',
          dark: '#F87171',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
