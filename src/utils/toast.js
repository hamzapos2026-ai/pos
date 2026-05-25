// File: src/utils/toast.js
// Plain JavaScript - No JSX - Works with .js extension

import React from 'react';
import hotToast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

// ─── Static color map (Tailwind safe) ─────────────────────
const TONE_STYLES = {
  green: {
    bg:     'bg-emerald-950/95',
    border: 'border-emerald-500/30',
    text:   'text-emerald-50',
    icon:   'text-emerald-400',
    glow:   'shadow-emerald-500/20',
  },
  red: {
    bg:     'bg-rose-950/95',
    border: 'border-rose-500/30',
    text:   'text-rose-50',
    icon:   'text-rose-400',
    glow:   'shadow-rose-500/20',
  },
  amber: {
    bg:     'bg-amber-950/95',
    border: 'border-amber-500/30',
    text:   'text-amber-50',
    icon:   'text-amber-400',
    glow:   'shadow-amber-500/20',
  },
  blue: {
    bg:     'bg-blue-950/95',
    border: 'border-blue-500/30',
    text:   'text-blue-50',
    icon:   'text-blue-400',
    glow:   'shadow-blue-500/20',
  },
};

// ─── Helper to join classNames ────────────────────────────
const cls = (...arr) => arr.filter(Boolean).join(' ');

// ─── Render function (No JSX) ─────────────────────────────
const renderToast = ({
  icon: Icon,
  message,
  tone = 'amber',
  action = null,
  loading = false,
}) => {
  const styles = TONE_STYLES[tone] || TONE_STYLES.amber;

  // Container div
  return React.createElement(
    'div',
    {
      className: cls(
        'flex w-full max-w-sm items-start gap-3',
        'rounded-2xl border px-4 py-3',
        'shadow-2xl backdrop-blur-xl',
        styles.bg,
        styles.border,
        styles.text,
        styles.glow
      ),
    },

    // Icon
    React.createElement(Icon, {
      className: cls(
        'mt-0.5 h-5 w-5 shrink-0',
        styles.icon,
        loading && 'animate-spin'
      ),
    }),

    // Content wrapper
    React.createElement(
      'div',
      { className: 'min-w-0 flex-1' },

      // Message
      React.createElement(
        'p',
        { className: 'text-sm font-semibold leading-5 text-white' },
        message
      ),

      // Optional action
      action &&
        React.createElement(
          'div',
          { className: 'mt-2' },
          action
        )
    )
  );
};

// ─── Render dismiss button (for offline toast) ────────────
const renderDismissBtn = (toastId) =>
  React.createElement(
    'button',
    {
      type: 'button',
      onClick: () => hotToast.dismiss(toastId),
      className: cls(
        'rounded-lg bg-rose-500 px-3 py-1',
        'text-xs font-semibold text-white',
        'transition hover:bg-rose-600'
      ),
    },
    'Dismiss'
  );

// ─── Public toast API ─────────────────────────────────────
export const showToast = {

  success: (message, options = {}) =>
    hotToast.custom(
      () => renderToast({
        icon: CheckCircle,
        message,
        tone: 'green',
      }),
      { duration: 3000, position: 'top-right', ...options }
    ),

  error: (message, options = {}) =>
    hotToast.custom(
      () => renderToast({
        icon: XCircle,
        message,
        tone: 'red',
      }),
      { duration: 5000, position: 'top-right', ...options }
    ),

  warning: (message, options = {}) =>
    hotToast.custom(
      () => renderToast({
        icon: AlertTriangle,
        message,
        tone: 'amber',
      }),
      { duration: 4000, position: 'top-right', ...options }
    ),

  info: (message, options = {}) =>
    hotToast.custom(
      () => renderToast({
        icon: Info,
        message,
        tone: 'blue',
      }),
      { duration: 3000, position: 'top-right', ...options }
    ),

  loading: (message = 'Loading...') =>
    hotToast.custom(
      () => renderToast({
        icon: Loader2,
        message,
        tone: 'amber',
        loading: true,
      }),
      { duration: Infinity, position: 'top-right' }
    ),

  offline: () =>
    hotToast.custom(
      (t) => renderToast({
        icon: WifiOff,
        message: 'No internet connection',
        tone: 'red',
        action: renderDismissBtn(t.id),
      }),
      {
        duration: Infinity,
        position: 'top-center',
        id: 'offline-toast',
      }
    ),

  online: () =>
    hotToast.custom(
      () => renderToast({
        icon: Wifi,
        message: 'Back online',
        tone: 'green',
      }),
      {
        duration: 2500,
        position: 'top-center',
        id: 'online-toast',
      }
    ),

  dismiss: (id) => hotToast.dismiss(id),
};

export const toast = showToast;

export default showToast;