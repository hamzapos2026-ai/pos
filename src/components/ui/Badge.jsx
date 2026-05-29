// File: aone-jewelry-pos/src/components/ui/Badge.jsx
// Badge component for status indicators in A One Jewelry POS

import { memo } from 'react';
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
 * Badge component for displaying status indicators
 */
const Badge = memo(({
  children,
  variant = 'default',
  size = 'medium',
  className,
}) => {
  const { isDark } = useTheme();

  const variantStyles = {
    default: isDark
      ? 'bg-[#2a1f0d] text-[#f5f5f4]'
      : 'bg-amber-100 text-[#1c1917]',
    primary: 'bg-primary-500 text-white',
    success: 'bg-green-500/20 text-green-500',
    warning: 'bg-amber-500/20 text-amber-500',
    error: 'bg-red-500/20 text-red-500',
    info: 'bg-blue-500/20 text-blue-500',
    purple: 'bg-purple-500/20 text-purple-500',
  };

  const sizeStyles = {
    small: 'px-2 py-0.5 text-xs',
    medium: 'px-2.5 py-1 text-sm',
    large: 'px-3 py-1.5 text-base',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-full whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';

export default Badge;