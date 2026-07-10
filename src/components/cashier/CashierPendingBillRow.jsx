import React, { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Eye, Edit3, Zap, XCircle, User, Loader2, Flag, CheckCircle2,
} from 'lucide-react';
import PaymentMethodMenu from './PaymentMethodMenu';
import { getOrderDisplayTotal, computeOrderSubtotalFromItems } from '../../utils/invoiceUtils';
import {
  getBillerDiscountDisplay, getCashierExtraDiscount, getBillerBillDiscount,
} from '../../utils/orderDiscountUtils';
import { useLanguage } from '../../hooks/useLanguage';

const getOrderDisplayTs = (order) =>
  order?.createdAt || order?.savedAt || order?.billerSubmittedAt || order?.billEndTime;

const computeLiveTotal = (order, extraDisc) => {
  const billerBase = getBillerBillDiscount(order);
  const extra = Number(extraDisc) || 0;
  const subtotal = computeOrderSubtotalFromItems(order) || Number(order?.subtotal) || 0;
  return Math.max(0, Math.round(subtotal - billerBase - extra));
};

const CashierPendingBillRow = memo(({
  index, style, order, isDark, text, subText, mutedText, accent,
  effectiveStatus, fmtTS, getStatusColors, StatusBadge,
  setViewModal, setEditModal, setCancelModal, handleInstantPay,
  t: tProp, fontScale, pageOffset = 0,
  getRowPayment, setRowPayment, paymentOptions,
  onSaveExtraDiscount, savingDiscountId,
  getMaxExtra, discountRule,
  rowMode = 'pending',
  onAcknowledge, onFlag,
}) => {
  const { t: tLang } = useLanguage();
  const t = tProp ?? tLang;
  const [extraInput, setExtraInput] = useState('');
  const saveTimerRef = useRef(null);

  const isCancelledRow = rowMode === 'cancelled';
  const eff = isCancelledRow ? 'cancelled' : effectiveStatus(order);
  const sc = getStatusColors(eff);
  const fs = (px) => ({ fontSize: `${Math.round(px * fontScale)}px` });
  const iconSz = Math.max(14, Math.round(14 * fontScale));
  const isPending = rowMode === 'pending' && eff === 'pending';
  const isEdited = Boolean(order.isEdited || order.wasEdited || order.lastEditedBy);
  const acked = Boolean(order.cashierCancelAcknowledged);
  const flagged = Boolean(order.cashierCancelFlagged);
  const billerDisc = getBillerDiscountDisplay(order);
  const savedExtra = getCashierExtraDiscount(order);
  const payMethod = getRowPayment(order);
  const liveTotal = useMemo(
    () => (extraInput !== '' && extraInput !== String(savedExtra)
      ? computeLiveTotal(order, extraInput)
      : getOrderDisplayTotal(order)),
    [order, extraInput, savedExtra],
  );
  const isSaving = savingDiscountId === order.id;
  const maxExtra = useMemo(
    () => (getMaxExtra ? getMaxExtra(order) : null),
    [order, getMaxExtra],
  );
  const extraDisabled = discountRule && !discountRule.enabled;

  useEffect(() => {
    setExtraInput(savedExtra > 0 ? String(savedExtra) : '');
  }, [order.id, savedExtra]);

  const scheduleSave = useCallback((val) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      let num = Math.max(0, Number(val) || 0);
      if (maxExtra != null && Number.isFinite(maxExtra)) num = Math.min(num, maxExtra);
      if (num !== savedExtra) onSaveExtraDiscount?.(order, num);
    }, 700);
  }, [order, savedExtra, onSaveExtraDiscount, maxExtra]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const rowBg = isCancelledRow
    ? isDark
      ? 'bg-gradient-to-r from-red-500/[0.08] via-rose-500/[0.04] to-transparent border-red-500/25'
      : 'bg-gradient-to-r from-red-50 via-rose-50/50 to-white border-red-200/60'
    : isEdited
    ? isDark
      ? 'bg-gradient-to-r from-purple-500/[0.12] via-violet-500/[0.06] to-transparent border-purple-500/25'
      : 'bg-gradient-to-r from-purple-50 via-violet-50/80 to-white border-purple-200/60'
    : isDark
      ? 'bg-gradient-to-r from-amber-500/[0.06] via-white/[0.02] to-transparent border-white/[0.06]'
      : 'bg-gradient-to-r from-amber-50/90 via-white to-white border-black/[0.05]';

  if (!order) return null;

  if (isCancelledRow) {
    const serial = order.billSerial || order.serialNo || '—';
    const cancelledDate = fmtTS(order.cashierCancelledAt || order.cancelledAt);
    const cancelReason = order.cashierCancelReason || order.cancelReason || '—';
    const cashierName = order.cancelledByName || order.cashierCancelledBy || '—';

    return (
      <div style={style}>
        <div
          className={`mx-1 my-0.5 rounded-xl border-l-[3px] ${sc.borderLeft} border ${rowBg} shadow-sm`}
        >
          <div className="px-2.5 py-2 flex items-center gap-2 min-h-[3.5rem]">
            <div
              className={`rounded-lg flex items-center justify-center flex-shrink-0 font-black ${
                isDark
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-red-100 text-red-700 border border-red-200'
              }`}
              style={{ width: iconSz + 10, height: iconSz + 10, ...fs(10) }}
            >
              {pageOffset + index + 1}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`font-black font-mono whitespace-nowrap ${accent}`} style={fs(13)}>
                #{serial}
              </p>
              <p className={`${text} truncate`} style={fs(10)}>
                <span className={subText}>{t('biller', 'Biller')}: </span>{order.billerName || '—'}
                <span className={`${subText} mx-1.5`}>·</span>
                <span className={subText}>{t('cashier', 'Cashier')}: </span>{cashierName}
                <span className={`${subText} mx-1.5`}>·</span>
                <span className={mutedText}>{cancelledDate}</span>
              </p>
              <p className="truncate" style={fs(10)}>
                <span className={`${subText} font-semibold`}>{t('reason', 'Reason')}: </span>
                <span className="text-red-400 font-semibold">{cancelReason}</span>
                {flagged && order.cashierCancelFlagReason && (
                  <span className="ml-1.5 text-[9px] font-bold text-orange-400">
                    Flag: {order.cashierCancelFlagReason}
                  </span>
                )}
                {acked && <span className="ml-2 text-[9px] font-bold text-emerald-400">ACK</span>}
                {flagged && !order.cashierCancelFlagReason && (
                  <span className="ml-1 text-[9px] font-bold text-orange-400">FLAG</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 flex-nowrap">
              {!acked && (
                <button
                  type="button"
                  onClick={() => onAcknowledge?.(order)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 hover:bg-emerald-500/25 active:scale-95 whitespace-nowrap"
                >
                  <CheckCircle2 className="inline w-3.5 h-3.5 mr-0.5" />
                  {t('acknowledge', 'Ack')}
                </button>
              )}
              {!flagged && (
                <button
                  type="button"
                  onClick={() => onFlag?.(order)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/35 hover:bg-orange-500/25 active:scale-95 whitespace-nowrap"
                >
                  <Flag className="inline w-3.5 h-3.5 mr-0.5" />
                  {t('flag', 'Flag')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={style}>
      <div
        className={`mx-1 my-0.5 rounded-xl border-l-[3px] ${sc.borderLeft} border ${rowBg} shadow-sm hover:shadow-md transition-all duration-200`}
      >
        <div className="px-2 py-1.5 flex items-center gap-2 min-h-[4.5rem]">
          {/* Index */}
          <div
            className={`rounded-xl flex items-center justify-center flex-shrink-0 font-black ${
              isDark
                ? 'bg-gradient-to-br from-amber-500/25 to-orange-600/15 text-amber-300 border border-amber-500/25 shadow-inner'
                : 'bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-md'
            }`}
            style={{ width: iconSz + 14, height: iconSz + 14, ...fs(11) }}
          >
            {pageOffset + index + 1}
          </div>

          {/* Bill meta */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`font-black ${accent} tracking-tight`} style={fs(13)}>
                #{order.billSerial || order.serialNo}
              </span>
              <StatusBadge status={eff} />
              {isEdited && (
                <span
                  className={`px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wide ${
                    isDark ? 'bg-purple-500/25 text-purple-300 border border-purple-400/30' : 'bg-purple-100 text-purple-700 border border-purple-200'
                  }`}
                  style={fs(8)}
                >
                  {t('editedLabel', 'Edited')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap" style={fs(10)}>
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold ${
                isDark ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-100'
              }`}>
                <User className="w-2.5 h-2.5" />
                {order.billerName || t('biller', 'Biller')}
              </span>
              <span className={`${text} font-semibold truncate max-w-[8rem]`}>
                {order.customer?.name || t('walkInCustomer', 'Walk-in')}
              </span>
              <span className={`${mutedText} hidden sm:inline`}>
                {fmtTS(getOrderDisplayTs(order))}
              </span>
            </div>
          </div>

          {/* Discounts + payment */}
          {isPending && (
            <div className="flex items-stretch gap-2.5 sm:gap-3 flex-shrink-0 mx-1">
              <div
                className={`flex flex-col items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border-2 min-w-[3.5rem] sm:min-w-[5rem] ${
                  isDark ? 'bg-[#0d2818] border-emerald-600/50' : 'bg-emerald-50 border-emerald-300'
                }`}
                title={t('billerDiscount', 'Biller discount')}
              >
                <span className="text-[8px] font-bold uppercase tracking-wide text-emerald-400">
                  {t('billerDiscShort', 'Biller')}
                </span>
                <span className="font-black tabular-nums text-emerald-400" style={fs(11)}>
                  {billerDisc > 0 ? billerDisc.toLocaleString() : '0'}
                </span>
              </div>

              <div
                className={`flex flex-col items-center justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border-2 min-w-[3.5rem] sm:min-w-[5rem] relative ${
                  isDark ? 'bg-[#2a1a0a] border-orange-500/50' : 'bg-orange-50 border-orange-300'
                } ${extraDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                title={maxExtra != null ? `Max extra: Rs ${maxExtra.toLocaleString()}` : t('extraDiscount', 'Extra discount')}
              >
                <span className="text-[8px] font-bold uppercase tracking-wide text-orange-400">
                  {t('extraDiscShort', 'Extra')}
                </span>
                <input
                  type="number"
                  min="0"
                  max={maxExtra != null && maxExtra > 0 ? maxExtra : undefined}
                  value={extraInput}
                  disabled={extraDisabled}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (maxExtra != null && Number(v) > maxExtra) v = String(maxExtra);
                    setExtraInput(v);
                    scheduleSave(v);
                  }}
                  onBlur={() => {
                    let num = Math.max(0, Number(extraInput) || 0);
                    if (maxExtra != null) num = Math.min(num, maxExtra);
                    setExtraInput(num > 0 ? String(num) : '');
                    if (num !== savedExtra) onSaveExtraDiscount?.(order, num);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="0"
                  className={`w-12 sm:w-16 text-center font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                    isDark ? 'bg-transparent text-orange-200 placeholder:text-orange-600/50' : 'bg-transparent text-orange-700 placeholder:text-orange-300'
                  }`}
                  style={fs(11)}
                />
                {maxExtra != null && maxExtra > 0 && (
                  <span className="text-[7px] text-orange-400/80 font-bold">max {maxExtra}</span>
                )}
                {isSaving && <Loader2 className="w-3 h-3 text-orange-400 animate-spin absolute -right-1 -top-1" />}
              </div>

              <PaymentMethodMenu
                value={payMethod}
                options={paymentOptions}
                onChange={(m) => setRowPayment(order.id, m)}
                isDark={isDark}
                fontSize={Math.round(10 * fontScale)}
              />
            </div>
          )}

          {/* Total */}
          <div className="text-right flex-shrink-0 min-w-[5rem]">
            <p
              className={`font-black tabular-nums tracking-tight transition-colors ${
                liveTotal < 0 ? 'text-orange-500' : isEdited ? 'text-purple-400' : accent
              }`}
              style={fs(15)}
            >
              Rs.{liveTotal.toLocaleString()}
            </p>
            <p className={`${subText} font-medium`} style={fs(9)}>
              {order.items?.length || order.itemCount || 0} {t('items', 'items')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setViewModal({ open: true, order })}
              title={t('viewBill', 'View')}
              className={`rounded-xl p-1.5 transition-all active:scale-90 ${
                isDark
                  ? 'bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:bg-blue-500/20 hover:text-blue-400'
                  : 'bg-black/[0.03] border border-black/[0.06] text-gray-500 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <Eye style={{ width: iconSz, height: iconSz }} />
            </button>
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={() => setEditModal({ open: true, order })}
                  title={t('editBill', 'Edit')}
                  className="rounded-xl p-1.5 bg-amber-500/20 text-amber-500 border border-amber-500/35 hover:bg-amber-500/30 transition-all active:scale-90"
                >
                  <Edit3 style={{ width: iconSz, height: iconSz }} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInstantPay({ ...order, paymentType: payMethod, totalAmount: liveTotal })}
                  title={`${t('pay', 'Pay')} — ${payMethod}`}
                  className="rounded-xl p-1.5 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all active:scale-90"
                >
                  <Zap style={{ width: iconSz, height: iconSz }} />
                </button>
                <button
                  type="button"
                  onClick={() => setCancelModal({ open: true, order })}
                  title={t('cancelBill', 'Cancel')}
                  className="rounded-xl p-1.5 bg-red-500/15 text-red-500 border border-red-500/30 hover:bg-red-500/25 transition-all active:scale-90"
                >
                  <XCircle style={{ width: iconSz, height: iconSz }} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  const p = prev.order;
  const n = next.order;
  if (!p || !n) return false;
  return p.id === n.id
    && p.status === n.status
    && p.cashierCancelAcknowledged === n.cashierCancelAcknowledged
    && p.cashierCancelFlagged === n.cashierCancelFlagged
    && getOrderDisplayTotal(p) === getOrderDisplayTotal(n)
    && prev.getRowPayment?.(p) === next.getRowPayment?.(n)
    && prev.savingDiscountId === next.savingDiscountId
    && prev.rowMode === next.rowMode
    && prev.index === next.index;
});

CashierPendingBillRow.displayName = 'CashierPendingBillRow';

export default CashierPendingBillRow;
