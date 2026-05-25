// File: aone-jewelry-pos/tailwind.config.js
// Tailwind CSS configuration for A One Jewelry POS with custom colors and dark mode

/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode is controlled by class on the root element
  darkMode: 'class',
  
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  
  theme: {
    extend: {
      // Custom color palette for A One Jewelry POS
      colors: {
        // Dark mode colors
        dark: {
          bg: '#0a0805',
          card: '#1a1208',
          border: '#2a1f0d',
          text: '#f5f5f4',
          muted: '#a8a29e',
        },
        // Light mode colors
        light: {
          bg: '#fafaf9',
          card: '#ffffff',
          border: '#e7e5e4',
          text: '#1c1917',
          muted: '#78716c',
        },
        // Primary amber colors
        primary: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b', // Main primary color
          600: '#d97706', // Hover state
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Status colors
        status: {
          success: '#22c55e',    // Green - Paid
          warning: '#f59e0b',    // Amber - Pending
          error: '#ef4444',      // Red - Cancelled
          info: '#3b82f6',       // Blue - Info
          edited: '#a855f7',     // Purple - Edited
        }
      },
      
      // Custom font family
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      
      // Custom animations
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'slide-in-up': 'slideInUp 0.3s ease-out',
        'slide-in-down': 'slideInDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shake': 'shake 0.5s ease-in-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      
      // Custom keyframes
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
      },
      
      // Custom box shadows
      boxShadow: {
        'glow': '0 0 20px rgba(245, 158, 11, 0.3)',
        'glow-lg': '0 0 40px rgba(245, 158, 11, 0.4)',
      },
      
      // Custom border radius
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  
  plugins: [
    require('tailwindcss-rtl'),
  ],
  
  // Important for proper CSS specificity
  important: true,
}