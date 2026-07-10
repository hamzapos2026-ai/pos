// Unified bill view — same InvoicePrint UI as Biller
import React, { useEffect } from 'react';
import { warmInvoiceQr } from '../../utils/invoiceQrCache';
import { Zap, Edit3, XCircle, Clock } from 'lucide-react';
import InvoicePrint from '../biller/InvoicePrint';
import { buildInvoicePrintProps } from '../../utils/invoiceUtils';
import { getCashierEffectiveStatus } from '../../utils/cashierOrderUtils';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../hooks/useLanguage';

const ViewBillModal = ({
  order,
  isDark,
  storeData,
  onClose,
  onPayment,
  onEdit,
  onCancel,
  effectiveStatusFn = getCashierEffectiveStatus,
}) => {
  const { settings } = useSettings();
  const { t } = useLanguage();

  useEffect(() => {
    if (order) warmInvoiceQr(order);
  }, [order?.id, order?.billSerial, order?.serialNo, order?.totalAmount]);

  if (!order) return null;

  const status = effectiveStatusFn(order);
  const isPending = status === 'pending';
  const isCancelled = status === 'cancelled';
  const isEdited = order?.isEdited || order?.wasEdited || order?.lastEditedBy;

  const actionBar = (
    <div className={`border-t flex-shrink-0 ${isDark ? 'border-yellow-500/20 bg-[#15120d]' : 'border-yellow-200 bg-gray-50'}`}>
      {isPending && (onPayment || onEdit || onCancel) && (
        <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2">
          {onPayment && (
            <button
              type="button"
              onClick={() => onPayment(order)}
              className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-bold text-white hover:from-emerald-400 hover:to-green-500 active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/25"
            >
              <Zap size={15} /> {t('cashier.instantPay', 'Instant Pay')}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold active:scale-[0.98] transition-all ${
                isDark
                  ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
                  : 'border-amber-300 text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Edit3 size={15} /> {t('cashier.editBill', 'Edit Bill')}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all"
            >
              <XCircle size={15} /> {t('cashier.cancelBill', 'Cancel Bill')}
            </button>
          )}
        </div>
      )}
      {!isPending && (
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
          {isCancelled && (
            <span className="inline-flex items-center gap-1.5 text-xs text-red-400 font-semibold px-2">
              <XCircle size={12} /> {t('cashier.billCancelled', 'Bill Cancelled')}
            </span>
          )}
          {isEdited && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              <Edit3 size={12} /> {t('cashier.editedBill', 'Edited Bill')}
            </span>
          )}
          {!isCancelled && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              <Clock size={12} /> {status.toUpperCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <InvoicePrint
      {...buildInvoicePrintProps({
        order,
        store: storeData,
        onClose,
        settings,
        extra: { isReprint: true, extraFooter: actionBar },
      })}
    />
  );
};

export default ViewBillModal;
