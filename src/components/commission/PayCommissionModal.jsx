import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR, getInitials } from '../../utils/managerHelpers';

const PayCommissionModal = ({ user, onClose, onSaved, canEdit, t }) => {
  const [amount, setAmount] = useState(Number(user?.commissionPending || 0));
  const [branchId, setBranchId] = useState(
    user?.storeId || (user?.storeIds && user.storeIds[0]) || 'default',
  );
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!amount || amount <= 0) {
      toast.error(t('manager.salespersons.validAmount', 'Valid amount required'));
      return;
    }
    if (!branchId) {
      toast.error(t('manager.salespersons.branchRequired', 'Branch ID required'));
      return;
    }
    setLoading(true);
    try {
      const res = await managerService.markCommissionPaid(user.uid, amount, branchId, note);
      if (res.success) {
        toast.success(`${t('manager.salespersons.paidSuccess', 'Commission paid')} ${formatPKR(amount)}`);
        onSaved?.();
        onClose();
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;
  const pending = Number(user.commissionPending || 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a]"
        >
          <div className="flex justify-between items-center p-4 border-b border-[#2a1f0d]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
                {getInitials(user.name || user.displayName)}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100">
                  {t('manager.salespersons.payTitle', 'Pay Commission')}
                </h3>
                <p className="text-[10px] text-gray-500">{user.name || user.displayName}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-lg bg-orange-500/5 p-3 border border-orange-500/20">
              <p className="text-[10px] text-orange-500/70 uppercase">
                {t('manager.salespersons.pending', 'Pending Commission')}
              </p>
              <p className="text-xl font-bold text-orange-400">{formatPKR(pending)}</p>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                {t('manager.salespersons.amountToPay', 'Amount to Pay')}
              </label>
              <input
                type="number"
                value={amount}
                disabled={!canEdit}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2.5 text-sm font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
              />
              {canEdit && (
                <div className="flex gap-1.5 mt-2">
                  {[0.25, 0.5, 0.75, 1].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setAmount(Number((pending * pct).toFixed(2)))}
                      className="text-[10px] px-2 py-1 rounded-md border border-[#2a1f0d] text-gray-500 hover:text-amber-400"
                    >
                      {pct === 1 ? t('common.full', 'Full') : `${Math.round(pct * 100)}%`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                {t('manager.salespersons.branchId', 'Branch ID')}
              </label>
              <input
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                {t('manager.salespersons.note', 'Note (optional)')}
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('manager.salespersons.notePh', 'e.g. Monthly payout')}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm text-gray-400"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-600 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              {t('manager.salespersons.pay', 'Pay')} {formatPKR(amount)}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PayCommissionModal;
