// File: src/components/ui/Modal.jsx
// Centered, scrollable, responsive modal

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

// ─── Size mapping ─────────────────────────────────────────
const SIZE_MAP = {
  small:   'max-w-md',
  medium:  'max-w-xl',
  large:   'max-w-2xl',
  xlarge:  'max-w-3xl',
  xxlarge: 'max-w-4xl',
  full:    'max-w-6xl',
};

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  showClose = true,
  footer = null,
}) => {

  // ─── ESC + body lock ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleEsc);

    // Lock body scroll
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = original;
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[100]
                     flex items-start justify-center
                     md:items-center
                     bg-black/70 backdrop-blur-sm
                     p-3 sm:p-4
                     overflow-y-auto"
        >
          <motion.div
            key="card"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1,    opacity: 1, y: 0  }}
            exit={{    scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative w-full my-auto',
              'flex flex-col',
              'max-h-[92vh] sm:max-h-[88vh]',
              'rounded-2xl border border-[#2a1f0d]',
              'bg-[#1a1208] shadow-2xl shadow-black/50',
              'overflow-hidden',
              SIZE_MAP[size]
            )}
          >

            {/* HEADER */}
            {(title || showClose) && (
              <div className="flex shrink-0 items-center justify-between gap-3
                              border-b border-[#2a1f0d]
                              bg-[#0f0a04]
                              px-4 py-3 sm:px-6 sm:py-4">
                <h2 className="text-base font-semibold text-[#f5f5f4] sm:text-lg">
                  {title}
                </h2>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center
                               rounded-xl border border-[#2a1f0d] bg-[#1a1208]
                               text-[#a8a29e] transition
                               hover:border-amber-500/40 hover:text-amber-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto
                            px-4 py-4 sm:px-6 sm:py-5
                            scrollbar-thin
                            scrollbar-thumb-amber-500/30
                            scrollbar-track-transparent">
              {children}
            </div>

            {/* FOOTER */}
            {footer && (
              <div className="shrink-0 border-t border-[#2a1f0d]
                              bg-[#0f0a04]
                              px-4 py-3 sm:px-6 sm:py-4">
                {footer}
              </div>
            )}

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;