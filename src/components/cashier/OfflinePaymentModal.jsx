// Offline payment — local pending list OR receipt verify (cross-PC)

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  X, WifiOff, Save, AlertTriangle, User, Phone,
  Banknote, Smartphone, CreditCard, Building2, Loader2,
  Hash, Receipt, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { showFieldAlert, showValidationAlert } from "../../utils/fieldAlert";
import { toast } from "react-hot-toast";
import { useSettings } from "../../context/SettingsContext";
import { isCashierOfflinePaymentEnabled } from "../../utils/roleUiSettings";
import { useLanguage } from "../../hooks/useLanguage";
import { decodeAndVerifyQR } from "../../services/qrHashService";
import {
  findOrdersBySerialInput,
  resolveUniqueSerialMatch,
  normalizeSerial,
  serialMatches,
} from "../../utils/serialMatch";
import { getPendingOrdersForCashier, findCashierBillBySerial } from "../../services/localBillService";
import { isCashierPendingBill } from "../../utils/cashierOrderUtils";
import { getOrderDisplayTotal } from "../../utils/invoiceUtils";

import { getEnabledPaymentMethods } from "../../utils/paymentMethodsUtils";

const PAY_METHOD_UI = {
  cash: { icon: Banknote },
  easypaisa: { icon: Smartphone },
  jazzcash: { icon: Smartphone },
  bankTransfer: { icon: Building2 },
  creditCard: { icon: CreditCard },
};

const findPendingBySerial = (orders, serial, effectiveStatus) => {
  const pendingOnly = orders.filter((o) => isCashierPendingBill(o));
  const matches = findOrdersBySerialInput(pendingOnly, serial);
  if (!matches.length) return null;
  const found = resolveUniqueSerialMatch(pendingOnly, serial) || (matches.length === 1 ? matches[0] : null);
  if (!found) return null;
  const status = effectiveStatus ? effectiveStatus(found) : found.status;
  if (status !== "pending") return { ...found, _notPending: true };
  return found;
};

const OfflinePaymentModal = ({
  isDark,
  storeId = "",
  orders = [],
  prefilledSerial = "",
  effectiveStatus,
  onClose,
  onPayPending,
  onPayReceipt,
  onRefreshPending,
}) => {
  const { t } = useLanguage();
  const [billSerial, setBillSerial] = useState(prefilledSerial);
  const [receiptAmount, setReceiptAmount] = useState("");
  const { settings } = useSettings();
  const payMethods = useMemo(() => getEnabledPaymentMethods(settings).map((m) => {
    const ui = PAY_METHOD_UI[m.key] || PAY_METHOD_UI.cash;
    return { v: m.label, icon: ui.icon };
  }), [settings?.paymentMethods]);
  const defaultPay = payMethods[0]?.v || "Cash";
  const [paymentMethod, setPaymentMethod] = useState(defaultPay);
  useEffect(() => {
    setPaymentMethod(defaultPay);
  }, [defaultPay]);

  const [saving, setSaving] = useState(false);
  const [dexieBills, setDexieBills] = useState([]);
  const [lookedUpBill, setLookedUpBill] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const loadDexieBills = useCallback(async () => {
    if (!storeId) return;
    try {
      const bills = await getPendingOrdersForCashier(storeId);
      setDexieBills(bills || []);
    } catch {
      setDexieBills([]);
    }
  }, [storeId]);

  const refreshPendingRef = useRef(onRefreshPending);
  refreshPendingRef.current = onRefreshPending;

  useEffect(() => {
    loadDexieBills();
    refreshPendingRef.current?.();
  }, [storeId, loadDexieBills]);

  const mergedOrders = useMemo(() => {
    const map = new Map();
    [...orders, ...dexieBills].forEach((o) => {
      const key = o.id || o.localId || o.billSerial || o.serialNo;
      if (key) map.set(key, o);
    });
    if (lookedUpBill) {
      const key = lookedUpBill.id || lookedUpBill.localId || lookedUpBill.billSerial;
      if (key) map.set(key, lookedUpBill);
    }
    return Array.from(map.values());
  }, [orders, dexieBills, lookedUpBill]);

  const pendingBills = useMemo(() => {
    return mergedOrders.filter((o) => {
      if (!isCashierPendingBill(o)) return false;
      const st = effectiveStatus ? effectiveStatus(o) : o.status;
      return st === "pending";
    });
  }, [mergedOrders, effectiveStatus]);

  const filteredPendingBills = useMemo(() => {
    if (!billSerial.trim()) return pendingBills;
    return findOrdersBySerialInput(pendingBills, billSerial, { limit: 20 });
  }, [pendingBills, billSerial]);

  const serialSuggestions = useMemo(() => {
    if (!billSerial.trim() || billSerial.length < 2) return [];
    return findOrdersBySerialInput(pendingBills, billSerial, { limit: 8 });
  }, [pendingBills, billSerial]);

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#120d06] border-[#2a1f0f] text-gray-100 placeholder:text-gray-600"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400";

  const matched = useMemo(
    () => findPendingBySerial(mergedOrders, billSerial, effectiveStatus),
    [mergedOrders, billSerial, effectiveStatus]
  );

  useEffect(() => {
    if (!storeId || !billSerial.trim() || billSerial.length < 3) {
      setLookedUpBill(null);
      return;
    }
    if (matched && !matched._notPending) {
      setLookedUpBill(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const found = await findCashierBillBySerial(storeId, billSerial);
        if (!cancelled) setLookedUpBill(found);
      } catch {
        if (!cancelled) setLookedUpBill(null);
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [storeId, billSerial, matched]);

  const resolvedBill = (matched && !matched._notPending) ? matched : lookedUpBill;
  const isLocalPending = Boolean(resolvedBill && isCashierPendingBill(resolvedBill)
    && (!effectiveStatus || effectiveStatus(resolvedBill) === "pending"));
  const plainSerial = useMemo(() => {
    const decoded = decodeAndVerifyQR(billSerial);
    if (decoded.valid && decoded.billId) return normalizeSerial(decoded.billId);
    return normalizeSerial(billSerial);
  }, [billSerial]);

  const receiptReady = useMemo(() => {
    if (isLocalPending) return false;
    if (!plainSerial) return false;
    const amt = Number(receiptAmount);
    return amt > 0;
  }, [isLocalPending, plainSerial, receiptAmount]);

  const amount = isLocalPending
    ? (resolvedBill?.totalAmount || resolvedBill?.grandTotal || 0)
    : receiptReady
    ? Number(receiptAmount)
    : 0;

  const canSave = isLocalPending || receiptReady;

  useEffect(() => {
    setBillSerial(prefilledSerial);
  }, [prefilledSerial]);

  const handleSerialChange = useCallback((raw) => {
    const val = raw.toUpperCase().replace(/^#+/, "");
    setBillSerial(val);
    const decoded = decodeAndVerifyQR(val);
    if (decoded.valid && decoded.billId) {
      setBillSerial(normalizeSerial(decoded.billId));
      setReceiptAmount(String(decoded.amount ?? ""));
    }
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    if (!isCashierOfflinePaymentEnabled(settings)) {
      showValidationAlert(
        t("offlinePayDisabled", "Manual / offline bill is disabled by Super Admin"),
        { variant: "superAdmin", title: "Feature Disabled", fieldLabel: "Super Admin" },
      );
      return;
    }

    if (!canSave) {
      if (matched?._notPending) {
        showValidationAlert(
          t("offlinePayNotPending", "This bill is not pending — cannot pay"),
          { variant: "warning", title: "Bill Not Pending", fieldLabel: "Status" },
        );
      } else if (!isLocalPending) {
        showFieldAlert("offlineSerial", {
          message: t("offlineReceiptVerifyRequired", "Enter serial and amount from printed bill"),
        });
      }
      return;
    }

    setSaving(true);
    try {
      if (isLocalPending && onPayPending) {
        await onPayPending(resolvedBill, paymentMethod);
        onClose();
        return;
      }
      if (receiptReady && onPayReceipt) {
        const ok = await onPayReceipt({
          billSerial: plainSerial,
          amount: Number(receiptAmount),
          paymentMethod,
          qrVerified: true,
          allowCrossPc: true,
        });
        if (ok) onClose();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || t("offlinePaySaveFailed", "Save failed"));
    } finally {
      setSaving(false);
    }
  }, [
    canSave, isLocalPending, matched, resolvedBill, receiptReady, plainSerial, receiptAmount,
    paymentMethod, onPayPending, onPayReceipt, onClose, settings, t,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" data-modal-open="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-md ${cardBg} rounded-2xl border ${border} shadow-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "95vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3 border-b ${border} flex-shrink-0 ${
          isDark ? "bg-blue-900/20" : "bg-blue-50/50"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <WifiOff className="text-blue-500 w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-bold text-sm ${text}`}>{t("offlinePayTitle", "Offline Payment")}</h2>
              <p className={`text-[10px] ${subText}`}>
                {t("offlinePaySubtitleCrossPc", "Biller offline bills show here · Other PC: serial + amount")}
              </p>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} disabled={saving}
            className={`p-1.5 rounded-lg ${subText} hover:text-red-500 disabled:opacity-50`}>
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <div className={`px-5 py-2 flex items-start gap-2 border-b ${border} ${
          canSave
            ? isDark ? "bg-emerald-900/15" : "bg-emerald-50"
            : isDark ? "bg-amber-900/15" : "bg-amber-50"
        }`}>
          {canSave ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className={`text-[11px] ${text}`}>
                {isLocalPending
                  ? t("offlinePayBillFound", "Pending bill found — amount is fixed from bill.")
                  : t("offlineReceiptVerified", "Serial + amount ready — save payment.")}
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className={`text-[11px] ${text}`}>
                {matched?._notPending
                  ? t("offlinePayNotPending", "This bill is not pending — cannot pay")
                  : t("offlineReceiptHint", "Other PC? Enter serial + amount from printed bill (or scan QR).")}
              </p>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
              <Hash className="inline w-3 h-3 mr-0.5" /> {t("offlinePaySerialLabel", "Bill Serial")} *
            </label>
            <input
              type="text"
              value={billSerial}
              onChange={(e) => handleSerialChange(e.target.value)}
              placeholder="000030 or AON-BIL-050626-000030"
              autoFocus
              className={`w-full px-3 py-2 rounded-lg border text-sm font-mono font-bold uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${inputBg}`}
            />
            <p className={`text-[10px] mt-1 ${subText}`}>
              {t("offlineSerialPartialHint", "Type last digits e.g. 000030")}
            </p>
            {serialSuggestions.length > 0 && !isLocalPending && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {serialSuggestions.map((bill) => {
                  const serial = normalizeSerial(bill.billSerial || bill.serialNo);
                  return (
                    <button
                      key={bill.id || serial}
                      type="button"
                      onClick={() => {
                        setBillSerial(serial);
                        setReceiptAmount("");
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold border ${
                        isDark
                          ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                          : "border-amber-300 text-amber-700 hover:bg-amber-50"
                      }`}
                    >
                      #{serial}
                    </button>
                  );
                })}
              </div>
            )}
            {lookupLoading && (
              <p className={`text-[10px] mt-1 ${subText} flex items-center gap-1`}>
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("offlineSerialSearching", "Searching local & cloud bills...")}
              </p>
            )}
            {isLocalPending && resolvedBill && !serialMatches(billSerial, resolvedBill.billSerial || resolvedBill.serialNo) && (
              <p className="text-[10px] mt-1 text-emerald-500 font-semibold">
                ✓ {t("offlineSerialMatched", "Matched")}: #{resolvedBill.billSerial || resolvedBill.serialNo}
              </p>
            )}
          </div>

          {(filteredPendingBills.length > 0 || pendingBills.length > 0) && (
            <div>
              <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 ${subText}`}>
                {t("offlinePayPendingList", "Pending bills (offline + online)")} ({pendingBills.length})
              </label>
              <div className={`max-h-28 overflow-y-auto rounded-xl border ${border} divide-y ${isDark ? "divide-white/5" : "divide-gray-100"}`}>
                {(filteredPendingBills.length ? filteredPendingBills : pendingBills).map((bill) => {
                  const serial = normalizeSerial(bill.billSerial || bill.serialNo);
                  const selected = plainSerial === serial || serialMatches(billSerial, serial);
                  return (
                    <button
                      key={bill.id || serial}
                      type="button"
                      onClick={() => {
                        setBillSerial(serial);
                        setReceiptAmount("");
                      }}
                      className={`w-full px-3 py-2 text-start flex items-center justify-between gap-2 transition-colors ${
                        selected ? isDark ? "bg-amber-500/15" : "bg-amber-50" : isDark ? "hover:bg-white/[0.03]" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className={`text-xs font-mono font-bold ${text}`}>#{serial}</span>
                      <span className="text-xs font-black text-amber-500 tabular-nums">
                        Rs.{getOrderDisplayTotal(bill).toLocaleString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isLocalPending && (
            <div className={`rounded-xl border ${border} p-3 space-y-2 ${isDark ? "bg-white/[0.02]" : "bg-gray-50/80"}`}>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-500" />
                <span className={`text-xs font-bold ${text}`}>#{resolvedBill.billSerial || resolvedBill.serialNo}</span>
                {(resolvedBill.isLocalOnly || resolvedBill.source === 'dexie') && (
                  <span className={`text-[9px] px-1.5 py-0 rounded font-bold ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                    {t("offlinePayBillerBill", "BILLER OFFLINE")}
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-amber-500 tabular-nums">Rs.{amount.toLocaleString()}</p>
              <div className="text-[11px]">
                <span className={subText}>
                  <User className="inline w-3 h-3 mr-0.5" />
                  {resolvedBill.customer?.name || t("walkInCustomer", "Walk-in")}
                </span>
              </div>
            </div>
          )}

          {!isLocalPending && (
            <div className={`rounded-xl border ${border} p-3 space-y-3 ${isDark ? "bg-white/[0.02]" : "bg-gray-50/80"}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <span className={`text-xs font-bold ${text}`}>
                  {t("offlineReceiptSection", "From printed bill (other PC)")}
                </span>
              </div>
              <div>
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
                  {t("offlineReceiptAmount", "Amount (Rs.) from bill")} *
                </label>
                <input
                  type="number"
                  min="1"
                  value={receiptAmount}
                  onChange={(e) => setReceiptAmount(e.target.value)}
                  placeholder="0"
                  className={`w-full px-3 py-2 rounded-lg border text-lg font-extrabold text-amber-500 focus:outline-none focus:border-amber-500 ${inputBg}`}
                />
              </div>
              {receiptReady && (
                <p className="text-[11px] text-emerald-500 font-semibold">
                  ✓ {plainSerial} · Rs.{Number(receiptAmount).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 ${subText}`}>
              {t("offlinePayMethod", "Payment Method")}
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {payMethods.map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.v;
                return (
                  <motion.button
                    key={m.v}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPaymentMethod(m.v)}
                    disabled={!canSave && !receiptAmount}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-40 ${
                      active
                        ? "border-amber-500 bg-amber-500/15 text-amber-500"
                        : isDark ? "border-[#2a1f0f] text-gray-400" : "border-gray-200 text-gray-500"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {m.v}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`px-5 py-3 border-t ${border} flex items-center gap-2 flex-shrink-0`}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} disabled={saving}
            className={`px-4 py-2 rounded-lg border ${border} text-xs font-medium ${subText} disabled:opacity-50`}>
            {t("cancel", "Cancel")}
          </motion.button>
          <motion.button whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={saving || !canSave}
            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? t("offlinePaySaving", "Saving...") : t("offlinePaySave", "Save Offline")}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default OfflinePaymentModal;
