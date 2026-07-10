import { useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, X, Send, Loader2, Banknote, Wallet, Globe } from 'lucide-react';
import { cn } from '../../utils/cn';

const METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'online', label: 'Online', icon: Globe },
];

const BillerCollectPaymentModal = memo(({
  open,
  onClose,
  onConfirm,
  billSerial,
  finalTotal,
  paymentType = 'cash',
  onPaymentTypeChange,
  isDark,
  isRTL,
  submitting = false,
  t = (k, fb) => fb || k,
}) => {
  const total = Math.max(0, Number(finalTotal) || 0);

  const handleConfirm = useCallback(() => {
    if (submitting) return;
    onConfirm?.();
  }, [submitting, onConfirm]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, handleConfirm, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] flex items-center justify-center p-4"
          data-biller-modal="true"
          data-biller-payment-modal="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-payment-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          />

          <motion.div
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={cn(
              'relative w-full max-w-md rounded-3xl p-6 shadow-2xl border',
              isDark
                ? 'bg-gradient-to-b from-[#1a1610] to-[#0f0d09] border-amber-500/25 shadow-amber-500/10'
                : 'bg-white border-amber-200 shadow-xl',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn('flex items-start justify-between mb-5', isRTL && 'flex-row-reverse')}>
              <div className={cn('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
                <div className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl',
                  isDark ? 'bg-emerald-500/15' : 'bg-emerald-50',
                )}>
                  <Wallet size={22} className="text-emerald-400" />
                </div>
                <div className={isRTL ? 'text-right' : ''}>
                  <h2
                    id="collect-payment-title"
                    className={cn('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}
                  >
                    {t('collectPayment', 'Collect Payment')}
                  </h2>
                  {billSerial && (
                    <p className={cn('text-[11px] font-mono mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      #{billSerial}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'rounded-xl p-2 transition-colors',
                  isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
                )}
                aria-label={t('close', 'Close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className={cn(
              'rounded-2xl p-5 mb-5 text-center border',
              isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200',
            )}>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                {t('totalDue', 'Total Due')}
              </p>
              <p className="text-4xl font-black text-amber-500 tabular-nums">
                Rs.{total.toLocaleString()}
              </p>
              <p className="text-[10px] text-emerald-400/90 mt-2 font-medium">
                {t('amountAutoFilled', 'Amount auto-filled — press Enter to pay')}
              </p>
            </div>

            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t('paymentMethod', 'Payment Method')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(({ id, label, icon: Icon }) => {
                  const active = paymentType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onPaymentTypeChange?.(id)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-bold transition-all border',
                        active
                          ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/25'
                          : isDark
                            ? 'bg-white/[0.03] text-gray-300 border-white/10 hover:border-amber-500/30'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-amber-300',
                      )}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={cn(
              'rounded-xl px-4 py-3 mb-4 flex items-center justify-between border',
              isDark ? 'bg-[#0a0805] border-white/10' : 'bg-gray-50 border-gray-200',
              isRTL && 'flex-row-reverse',
            )}>
              <span className="text-xs font-semibold text-gray-500 uppercase">
                {t('amountReceived', 'Amount Received')}
              </span>
              <span className="text-2xl font-black text-amber-500 tabular-nums">
                Rs.{total.toLocaleString()}
              </span>
            </div>

            <p className="text-[10px] text-center text-gray-500 mb-3">
              <kbd className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[9px]">Enter</kbd>
              {' '}{t('or', 'or')}{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[9px]">F8</kbd>
              {' '}{t('toConfirmPay', 'to confirm & print')}
            </p>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className={cn(
                'w-full rounded-2xl px-4 py-3.5 text-base font-bold text-white',
                'bg-gradient-to-r from-emerald-500 to-green-500',
                'hover:from-emerald-400 hover:to-green-400',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-emerald-500/20',
              )}
            >
              {submitting
                ? <><Loader2 size={18} className="animate-spin" /> {t('processing', 'Processing...')}</>
                : <><Send size={16} /> {t('confirmPrint', 'Confirm & Print')}</>}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

BillerCollectPaymentModal.displayName = 'BillerCollectPaymentModal';

export default BillerCollectPaymentModal;
