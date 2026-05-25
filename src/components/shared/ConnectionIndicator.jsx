// File: aone-jewelry-pos/src/components/shared/ConnectionIndicator.jsx
// Connection indicator component showing online/offline status

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * ConnectionIndicator component
 * Shows online/offline status with icon and text
 */
const ConnectionIndicator = memo(({ className, showText = true }) => {
  const { isOnline } = useNetwork();
  const { isDark } = useTheme();
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-2',
        className
      )}
    >
      <motion.div
        animate={{
          scale: isOnline ? [1, 1.1, 1] : 1,
        }}
        transition={{
          duration: 2,
          repeat: isOnline ? Infinity : 0,
          repeatDelay: 3,
        }}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
          isOnline
            ? isDark
              ? 'bg-green-500/20 text-green-400'
              : 'bg-green-100 text-green-700'
            : isDark
            ? 'bg-red-500/20 text-red-400'
            : 'bg-red-100 text-red-700'
        )}
      >
        {isOnline ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        {showText && (
          <span>{isOnline ? t('network.online', 'Online') : t('network.offline', 'Offline')}</span>
        )}
      </motion.div>
    </motion.div>
  );
});

ConnectionIndicator.displayName = 'ConnectionIndicator';

export default ConnectionIndicator;