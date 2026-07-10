// File: src/pages/manager/PaymentModal.jsx
// Purpose: Modern payment collection dialog with method selection

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Loader2, Banknote, CreditCard, Smartphone, Landmark, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR } from '../../utils/managerHelpers';
import { useSettings } from '../../context/SettingsContext';
import { getEnabledPaymentMethods } from '../../utils/paymentMethodsUtils';

const ALL_METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote, keys: ['cash'] },
  { id: 'easypaisa', label: 'EasyPaisa', icon: Smartphone, keys: ['easypaisa'] },
  { id: 'jazzcash', label: 'JazzCash', icon: Smartphone, keys: ['jazzcash'] },
  { id: 'bank', label: 'Bank', icon: Landmark, keys: ['bankTransfer', 'bank'] },
  { id: 'card', label: 'Card', icon: CreditCard, keys: ['creditCard', 'card'] },
];

const PaymentModal = ({ localId, total, outstanding, onClose, onSaved }) => {
  const { settings } = useSettings();
  const methods = useMemo(() => {
    const enabled = new Set(getEnabledPaymentMethods(settings).flatMap((m) => [m.key, ...m.aliases]));
    return ALL_METHODS.filter((m) => m.keys.some((k) => enabled.has(k)));
  }, [settings?.paymentMethods]);
  const defaultMethod = methods[0]?.id || 'cash';
  const [amount, setAmount] = useState(outstanding || 0);
  const [method, setMethod] = useState(defaultMethod);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error('Enter a valid amount');
      if (amt > outstanding + 0.001) throw new Error('Amount exceeds outstanding (' + formatPKR(outstanding) + ')');

      const res = await managerService.collectPayment({
        localBillId: localId,
        amount: amt,
        paymentMethod: method,
        reference,
        note,
      });

      if (res.success) {
        toast.success('Payment of ' + formatPKR(amt) + ' collected!', { icon: '💰' });
        onSaved?.(res);
      } else throw new Error(res.error || 'Failed');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#2a1f0d]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100">Collect Payment</h3>
                <p className="text-[10px] text-gray-500">Outstanding: {formatPKR(outstanding)}</p>
              </div>
            </div>
            <button onClick={onClose} disabled={loading} className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Total summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#1a1208] p-2.5 border border-[#2a1f0d]">
                <p className="text-[10px] text-gray-500 uppercase">Bill Total</p>
                <p className="text-sm font-bold text-gray-100">{formatPKR(total)}</p>
              </div>
              <div className="rounded-lg bg-red-500/5 p-2.5 border border-red-500/20">
                <p className="text-[10px] text-red-500/70 uppercase">Outstanding</p>
                <p className="text-sm font-bold text-red-400">{formatPKR(outstanding)}</p>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rs</span>
                <input
                  type="number"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-9 pr-3 py-2.5 text-lg font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[0.25, 0.5, 0.75, 1].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setAmount((outstanding * pct).toFixed(2))}
                    className="text-[10px] px-2 py-1 rounded-md border border-[#2a1f0d] text-gray-500 hover:text-amber-400 hover:border-amber-500/30 transition-colors"
                  >
                    {pct === 1 ? 'Full' : Math.round(pct * 100) + '%'}
                  </button>
                ))}
              </div>
            </div>

            {/* Method */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Payment Method</label>
              <div className="grid grid-cols-5 gap-1.5">
                {methods.map(m => {
                  const Icon = m.icon;
                  const active = method === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={
                        'flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ' +
                        (active
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-[#0a0805] border-[#2a1f0d] text-gray-500 hover:text-gray-300')
                      }
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[9px] font-medium">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reference (for non-cash) */}
            {method !== 'cash' && (
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Reference / Transaction ID</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. TXN123456"
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            )}

            {/* Note */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Any notes…"
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !amount}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:from-green-400 hover:to-green-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              {loading ? 'Saving…' : 'Collect ' + formatPKR(amount)}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentModal;