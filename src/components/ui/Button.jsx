// File: aone-jewelry-pos/src/components/ui/Button.jsx
// Reusable Button component for A One Jewelry POS

import { memo, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Button component with multiple variants and sizes
 */
const Button = forwardRef(({
  children,
  className,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  type = 'button',
  onClick,
  ...props
}, ref) => {
  const { isDark } = useTheme();

  // Base styles for all buttons
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg whitespace-nowrap active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  // Variant styles
  const variantStyles = {
    primary: isDark
      ? 'bg-amber-500 text-[#0a0805] hover:bg-amber-400 focus:ring-amber-500'
      : 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500',
    secondary: isDark
      ? 'bg-[#2a1f0d] text-[#f5f5f4] hover:bg-[#3a2f1d] focus:ring-[#2a1f0d] border border-[#3a2f1d]'
      : 'bg-white text-[#1c1917] hover:bg-amber-50 focus:ring-amber-200 border border-amber-200',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
    success: 'bg-green-500 text-white hover:bg-green-600 focus:ring-green-500',
    ghost: isDark
      ? 'bg-transparent text-[#f5f5f4] hover:bg-[#2a1f0d] focus:ring-[#2a1f0d]'
      : 'bg-transparent text-[#1c1917] hover:bg-amber-50 focus:ring-amber-200',
    outline: isDark
      ? 'bg-transparent border border-[#2a1f0d] text-[#f5f5f4] hover:bg-[#2a1f0d] focus:ring-[#2a1f0d]'
      : 'bg-transparent border border-amber-200 text-[#1c1917] hover:bg-amber-50 focus:ring-amber-200',
  };

  // Size styles
  const sizeStyles = {
    small: 'px-3 py-1.5 text-xs gap-1.5',
    medium: 'px-4 py-2 text-sm gap-2',
    large: 'px-6 py-3 text-base gap-2.5',
  };

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : leftIcon ? (
        leftIcon
      ) : null}
      {children}
      {!loading && rightIcon && rightIcon}
    </button>
  );
});

Button.displayName = 'Button';

export default memo(Button);