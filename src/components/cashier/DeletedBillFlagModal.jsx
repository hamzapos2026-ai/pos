import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flag, Loader2 } from 'lucide-react';
import { showFieldAlert, showValidationAlert } from '../../utils/fieldAlert';
import { toast } from 'react-hot-toast';

const DeletedBillFlagModal = ({ bill, isDark, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      showFieldAlert('cancelReason', {
        title: 'Reason Required',
        message: 'Please write why you are flagging this bill.',
        fieldLabel: 'Flag Reason',
        confirmLabel: 'Add Reason',
      });
      return;
    }
    setSaving(true);
    try {
      await onSubmit(reason.trim());
      toast.success('Flag sent to Super Admin & Manager');
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Could not send flag');
    } finally {
      setSaving(false);
    }
  };

  const modalBg = isDark ? 'bg-[#110d08]/95' : 'bg-white/95';
  const border = isDark ? 'border-white/10' : 'border-gray-200';
  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const sub = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-md rounded-2xl border ${border} ${modalBg} shadow-2xl p-5`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-orange-500" />
              <h3 className={`font-bold ${text}`}>Flag Cancelled Bill</h3>
            </div>
            <button type="button" onClick={onClose} className={`p-1 rounded-lg ${sub} hover:bg-white/10`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className={`text-sm ${sub} mb-3`}>
            Bill <span className="font-bold text-amber-500">#{bill?.billSerial || bill?.serialNo || '—'}</span> was cancelled.
            Tell Super Admin if something looks wrong.
          </p>

          <label className={`block text-xs font-semibold mb-1.5 ${sub}`}>Reason (required)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Customer already paid, bill deleted by mistake, wrong amount..."
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none resize-none ${
              isDark
                ? 'bg-white/5 border-white/10 text-gray-100 placeholder:text-gray-600'
                : 'bg-black/5 border-gray-200 text-gray-900 placeholder:text-gray-400'
            }`}
          />

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border ${border} ${sub}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
              Send to Super Admin
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DeletedBillFlagModal;
