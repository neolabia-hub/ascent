import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: 'var(--ink-900)',
          700: 'var(--ink-700)',
          500: 'var(--ink-500)',
          300: 'var(--ink-300)',
        },
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          soft: 'var(--ok-soft)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          soft: 'var(--warn-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
        },
        primary: {
          DEFAULT: 'var(--brand-primary)',
          soft: 'var(--brand-primary-soft)',
          strong: 'var(--brand-primary-strong)',
        },
        accent: {
          DEFAULT: 'var(--brand-accent)',
          soft: 'var(--brand-accent-soft)',
        },
      },
      fontFamily: {
        display: ['var(--font-manrope)', ...defaultTheme.fontFamily.sans],
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        none: '0px',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      transitionTimingFunction: {
        pulse: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'drawer-out': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'overlay-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'overlay-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'card-in': 'card-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'drawer-out': 'drawer-out 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'overlay-in': 'overlay-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'overlay-out': 'overlay-out 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
