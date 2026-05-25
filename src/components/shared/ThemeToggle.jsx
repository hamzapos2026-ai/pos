// File: aone-jewelry-pos/src/components/shared/ThemeToggle.jsx
// Theme toggle component for switching between dark and light mode

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * ThemeToggle component
 * Toggle button for switching between dark and light themes
 */
const ThemeToggle = memo(({ className }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={cn(
        'relative p-2 rounded-lg transition-colors',
        isDark
          ? 'bg-[#2a1f0d] text-amber-400 hover:bg-[#3a2f1d]'
          : 'bg-amber-100 text-amber-600 hover:bg-amber-200',
        className
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        initial={false}
        animate={{
          rotate: isDark ? 0 : 180,
        }}
        transition={{ duration: 0.3 }}
      >
        {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </motion.div>
    </motion.button>
  );
});

ThemeToggle.displayName = 'ThemeToggle';

export default ThemeToggle;