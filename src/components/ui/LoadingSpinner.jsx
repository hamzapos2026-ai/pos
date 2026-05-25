// File: aone-jewelry-pos/src/components/ui/LoadingSpinner.jsx
// Loading spinner component for A One Jewelry POS

import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * LoadingSpinner component
 * Displays a centered loading spinner with optional text
 */
const LoadingSpinner = memo(({
  size = 'medium',
  text = '',
  fullWidth = false,
  className,
}) => {
  const { isDark } = useTheme();

  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
    xlarge: 'w-16 h-16',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        fullWidth && 'w-full',
        className
      )}
    >
      <Loader2
        className={cn(
          'animate-spin text-primary-500',
          sizeClasses[size]
        )}
      />
      {text && (
        <p
          className={cn(
            'text-sm',
            isDark ? 'text-[#a8a29e]' : 'text-[#78716c]'
          )}
        >
          {text}
        </p>
      )}
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

export default LoadingSpinner;