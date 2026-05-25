// File: src/components/ui/Input.jsx
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/cn';

const Input = forwardRef(({
  label, leftIcon, rightIcon, error, hint, type = 'text',
  showPasswordToggle, fullWidth = true, className, ...props
}, ref) => {
  const [showPwd, setShowPwd] = useState(false);
  const inputType = showPasswordToggle && showPwd ? 'text' : type;

  return (
    <div className={cn('space-y-1.5', fullWidth && 'w-full')}>
      {label && (
        <label className="block text-xs font-medium text-[#a8a29e]">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716c]">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          type={inputType}
          className={cn(
            'w-full rounded-xl border bg-[#0a0805]',
            'py-2.5 text-sm text-[#f5f5f4]',
            'outline-none transition placeholder:text-[#4a4540]',
            'focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20',
            leftIcon ? 'pl-9' : 'pl-3',
            (showPasswordToggle || type === 'password' || rightIcon) ? 'pr-10' : 'pr-3',
            error ? 'border-rose-500' : 'border-[#2a1f0d]',
            props.disabled && 'cursor-not-allowed opacity-50',
            className
          )}
          {...props}
        />
        {rightIcon ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-amber-400">
            {rightIcon}
          </div>
        ) : (showPasswordToggle || type === 'password') && (
          <button
            type="button"
            onClick={() => setShowPwd(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#78716c] hover:text-amber-400"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && !error && (
        <p className="text-xs text-[#78716c]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-rose-400">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;