import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Info,
  Loader2,
  Mail,
  ShieldAlert,
  X,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const VARIANTS = {
  error: {
    Icon: AlertTriangle,
    iconWrap: 'bg-red-500/15 border-red-500/30',
    iconColor: 'text-red-400',
    ring: 'border-red-500/25',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.15)]',
    btn: 'bg-red-500 hover:bg-red-400 text-white',
  },
  success: {
    Icon: CheckCircle2,
    iconWrap: 'bg-emerald-500/15 border-emerald-500/30',
    iconColor: 'text-emerald-400',
    ring: 'border-emerald-500/25',
    glow: 'shadow-[0_0_60px_rgba(16,185,129,0.15)]',
    btn: 'bg-emerald-500 hover:bg-emerald-400 text-[#0a0805]',
  },
  warning: {
    Icon: ShieldAlert,
    iconWrap: 'bg-amber-500/15 border-amber-500/30',
    iconColor: 'text-amber-400',
    ring: 'border-amber-500/30',
    glow: 'shadow-[0_0_60px_rgba(245,158,11,0.18)]',
    btn: 'bg-amber-500 hover:bg-amber-400 text-[#0a0805]',
  },
  superAdmin: {
    Icon: Crown,
    iconWrap: 'bg-violet-500/15 border-violet-400/35',
    iconColor: 'text-violet-300',
    ring: 'border-violet-400/30',
    glow: 'shadow-[0_0_70px_rgba(139,92,246,0.22)]',
    btn: 'bg-gradient-to-r from-violet-500 to-amber-500 hover:from-violet-400 hover:to-amber-400 text-white',
  },
  info: {
    Icon: Info,
    iconWrap: 'bg-sky-500/15 border-sky-500/30',
    iconColor: 'text-sky-400',
    ring: 'border-sky-500/25',
    glow: 'shadow-[0_0_50px_rgba(56,189,248,0.12)]',
    btn: 'bg-sky-500 hover:bg-sky-400 text-[#0a0805]',
  },
  loading: {
    Icon: Loader2,
    iconWrap: 'bg-amber-500/15 border-amber-500/30',
    iconColor: 'text-amber-400',
    ring: 'border-amber-500/25',
    glow: 'shadow-[0_0_50px_rgba(245,158,11,0.15)]',
    btn: 'bg-amber-500/50 text-[#0a0805] cursor-not-allowed',
  },
  duplicate: {
    Icon: Mail,
    iconWrap: 'bg-orange-500/15 border-orange-400/35',
    iconColor: 'text-orange-300',
    ring: 'border-orange-400/30',
    glow: 'shadow-[0_0_60px_rgba(251,146,60,0.18)]',
    btn: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-[#0a0805]',
  },
};

const CenterAlert = ({
  open,
  onClose,
  variant = 'error',
  title,
  message,
  fieldLabel,
  confirmLabel = 'Got it',
  hideClose = false,
  loading = false,
}) => {
  const cfg = VARIANTS[variant] || VARIANTS.error;
  const { Icon } = cfg;
  const isLoading = loading || variant === 'loading';

  useEffect(() => {
    if (!open || isLoading) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isLoading, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={isLoading ? undefined : onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative w-full max-w-md overflow-hidden rounded-3xl border bg-[#12100c]/95',
              cfg.ring,
              cfg.glow,
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-violet-500/[0.05]" />

            {!hideClose && !isLoading && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-gray-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <div className="relative px-6 pb-6 pt-8 text-center">
              <div
                className={cn(
                  'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border',
                  cfg.iconWrap,
                )}
              >
                <Icon
                  className={cn(
                    'h-8 w-8',
                    cfg.iconColor,
                    isLoading && 'animate-spin',
                  )}
                />
              </div>

              {fieldLabel && (
                <span className="mb-3 inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                  {fieldLabel}
                </span>
              )}

              {title && (
                <h3 className="mb-2 text-lg font-bold tracking-tight text-white">
                  {title}
                </h3>
              )}

              {message && (
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-gray-300 whitespace-pre-line">
                  {message}
                </p>
              )}

              {!isLoading && (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    cfg.btn,
                  )}
                >
                  {confirmLabel}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CenterAlert;
