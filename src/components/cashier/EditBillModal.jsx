// src/components/cashier/EditBillModal.jsx
// ✅ MERGED: Old glass UI + Framer Motion + audit logs + Lucide icons
// ✨ NEW: Edited badge support, audit trail, ESC safe, responsive

import React, {
  useState, useCallback, useMemo, useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs, limit,
} from "firebase/firestore";
import { db, auth } from "../../services/firebase";
import {
  X, Save, Edit3, User, Phone, ChevronDown, MapPin,
  Package, Hash, BarChart3, Loader2, AlertCircle,
  Banknote, Smartphone, CreditCard, Building2, Wallet,
} from "lucide-react";
import { showFieldAlert, showValidationAlert } from "../../utils/fieldAlert";
import { toast } from "react-hot-toast";
import { logCashierAction } from "../../services/cashierAuditService";
import { saveOfflinePayment } from "../../services/offlinePaymentService";
import { applyTrustedInstantPaymentToCloud } from "../../services/paidBillIndexService";
import { normalizeOrderForInvoice } from "../../utils/invoiceUtils";
import { useLanguage } from "../../hooks/useLanguage";
import { useSettings } from "../../context/SettingsContext";
import { getEnabledPaymentMethods } from "../../utils/paymentMethodsUtils";
import { getHasInternet } from "../../utils/networkReachability";
import { buildCashierPaymentPatch, CASHIER_PAYMENT_STATUS } from "../../utils/cashierOrderUtils";
import { getBillSerialKey } from "../../utils/serialMatch";

const resolveAllOrderDocIds = async (order, serial) => {
  const ids = new Set();
  if (order?.id) ids.add(order.id);
  if (order?.firebaseId) ids.add(order.firebaseId);
  if (order?.localId) ids.add(order.localId);

  const needle = serial || order?.billSerial || order?.serialNo;
  if (!needle) return [...ids];

  for (const field of ["billSerial", "serialNo"]) {
    try {
      const snap = await getDocs(query(
        collection(db, "orders"),
        where(field, "==", needle),
        limit(12),
      ));
      snap.docs.forEach((d) => ids.add(d.id));
    } catch { /* index may be missing */ }
  }
  return [...ids];
};

let _c = 0;
const uid = () => `i_${Date.now()}_${++_c}_${Math.random().toString(36).slice(2, 5)}`;

// ✅ Strip "Item - " prefix from product names
const cleanName = (name) => {
  if (!name) return "Product";
  let clean = name.replace(/^Item\s*[-–—]\s*/i, "").trim();
  if (/^ITEM-\d+/i.test(clean)) {
    const id = clean.replace(/^ITEM-/i, "");
    return `Product #${id.slice(-6)}`;
  }
  return clean || "Product";
};

const PAY_METHOD_UI = {
  cash: { icon: Banknote, color: "emerald" },
  easypaisa: { icon: Smartphone, color: "green" },
  jazzcash: { icon: Smartphone, color: "orange" },
  bankTransfer: { icon: Building2, color: "blue" },
  creditCard: { icon: CreditCard, color: "purple" },
};

const EditBillModal = ({ order, isDark, userData, storeData, onClose, onComplete }) => {
  const { t } = useLanguage();
  const { settings } = useSettings();
  const payMethods = useMemo(() => getEnabledPaymentMethods(settings).map((m) => {
    const ui = PAY_METHOD_UI[m.key] || PAY_METHOD_UI.cash;
    return { v: m.label, icon: ui.icon, color: ui.color };
  }), [settings?.paymentMethods]);
  const defaultPay = payMethods[0]?.v || "Cash";
  const [cName, setCName] = useState(order.customer?.name || t('walkingCustomer', 'Walking Customer'));
  const [cPhone, setCPhone] = useState(order.customer?.phone || "");
  const [cMarket, setCMarket] = useState(order.customer?.market || "");
  const [cCity, setCCity] = useState(order.customer?.city || "");
  const [payM, setPayM] = useState(defaultPay);
  const [notes, setNotes] = useState(order.comments || "");

  const [showItemsDiscount, setShowItemsDiscount] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const [extraDisc, setExtraDisc] = useState(0);
  const [discReason, setDiscReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState(() => {
    const seen = new Set();
    return (order.items || []).map(item => {
      let id = uid();
      while (seen.has(id)) id = uid();
      seen.add(id);
      return {
        ...item,
        _id: id,
        qty: Number(item.qty) || 1,
        price: Number(item.price) || 0,
      };
    });
  });

  useEffect(() => {
    if (!order) return;
    const c = order.customer || {};
    setCName(c.name || t('walkingCustomer', 'Walking Customer'));
    setCPhone(c.phone || "");
    setCMarket(c.market || "");
    setCCity(c.city || "");
    setNotes(order.comments || "");
    const saved = order.paymentType || order.paymentMethod;
    const match = payMethods.find((m) => m.v.toLowerCase() === String(saved || '').toLowerCase());
    setPayM(match?.v || defaultPay);
  }, [order?.id, order?.customer, order?.comments, order?.paymentType, order?.paymentMethod, t, payMethods, defaultPay]);

  // ── Glass theme classes ──
  const modalBg = isDark
    ? "bg-[#110d08]/95 backdrop-blur-2xl"
    : "bg-white/95 backdrop-blur-2xl";
  const border = isDark ? "border-white/10" : "border-gray-200/60";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-500" : "text-gray-400";
  const inputBg = isDark
    ? "bg-white/5 border-white/10 text-gray-100 placeholder:text-gray-600"
    : "bg-black/5 border-gray-200/60 text-gray-900 placeholder:text-gray-400";
  const glassBg = isDark
    ? "bg-white/[0.03] border-white/[0.06]"
    : "bg-black/[0.02] border-gray-200/40";
  const glassCard = isDark
    ? "bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.08]"
    : "bg-white/70 border-gray-200/50 hover:bg-white/90";
  const glassActive = isDark
    ? "bg-amber-500/10 border-amber-500/20 ring-1 ring-amber-500/20"
    : "bg-amber-50/80 border-amber-200/60 ring-1 ring-amber-500/20";

  // ESC handler
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);

  // Always default to Cash when edit modal opens for a bill.
  useEffect(() => {
    setPayM("Cash");
  }, [order?.id]);

  const origTotal = order.totalAmount || 0;
  const origDisc = order.billDiscount || 0;
  const origSub = useMemo(
    () => order.subtotal || (order.items || []).reduce((s, i) => s + (i.total || 0), 0),
    [order],
  );
  const newSub = useMemo(() => items.reduce((s, i) => s + i.qty * i.price, 0), [items]);
  const totalDisc = useMemo(() => origDisc + Number(extraDisc || 0), [origDisc, extraDisc]);
  const newTotal = useMemo(() => Math.max(0, newSub - totalDisc), [newSub, totalDisc]);
  const diff = newTotal - origTotal;

  const setQty = useCallback((id, v) =>
    setItems(p => p.map(i => i._id === id
      ? { ...i, qty: Math.max(1, Math.floor(Number(v) || 1)) } : i
    )), []);

  const setPrice = useCallback((id, v) =>
    setItems(p => p.map(i => i._id === id
      ? { ...i, price: Math.max(0, Number(v) || 0) } : i
    )), []);

  const buildSavePayload = useCallback(() => {
    const cn = userData?.displayName || userData?.name || "Cashier";
    const fi = items.map(i => ({
      productName: i.productName,
      serialId: i.serialId || "",
      price: Number(i.price),
      qty: Number(i.qty),
      total: i.qty * i.price,
    }));
    return { cn, fi, totalQty: fi.reduce((s, i) => s + i.qty, 0) };
  }, [items, userData]);

  const buildUpdatedOrder = useCallback((fi, markPaid) => normalizeOrderForInvoice({
    ...order,
    items: fi,
    customer: { name: cName, phone: cPhone, market: cMarket, city: cCity },
    paymentType: payM,
    comments: notes,
    subtotal: newSub,
    billDiscount: totalDisc,
    billerBillDiscount: order.billerBillDiscount ?? order.billDiscountValue ?? origDisc,
    cashierExtraDiscount: Number(order.cashierExtraDiscount || 0) + Number(extraDisc || 0),
    totalAmount: newTotal,
    totalQty: fi.reduce((s, i) => s + i.qty, 0),
    previousTotal: origTotal,
    editedTotalDifference: diff,
    newTotalAfterEdit: newTotal,
    isEdited: true,
    wasEdited: true,
    ...(markPaid ? buildCashierPaymentPatch({
      amount: newTotal,
      paymentType: payM,
      cashierId: userData?.uid || order.paidBy || "",
      cashierName: userData?.displayName || userData?.name || order.paidByName || "Cashier",
    }) : { status: order.status, paymentStatus: order.paymentStatus }),
  }), [order, cName, cPhone, cMarket, cCity, payM, notes, newSub, totalDisc, newTotal, origTotal, diff, userData]);

  const persistBillEdit = useCallback(async (shouldPrint = false) => {
    if (items.length === 0) {
      showFieldAlert("items", { message: "Add at least one item before saving." });
      return;
    }
    if (Number(extraDisc) > 0 && !discReason.trim()) {
      showFieldAlert("discountReason", { message: "Discount reason is required when applying extra discount." });
      return;
    }
    if (!order?.id) {
      showValidationAlert("Bill ID missing — refresh and try again.", {
        variant: "error",
        title: "Bill Not Found",
        fieldLabel: "Bill",
      });
      return;
    }

    setSaving(true);
    const tid = toast.loading(shouldPrint ? "Saving, paying & printing..." : "Saving & marking paid...");
    const { cn, fi, totalQty } = buildSavePayload();
    const cashierId = auth?.currentUser?.uid || userData?.uid || "";
    const sid = userData?.storeId || userData?.primaryStore || order.storeId || "default";
    const now = new Date();

    const editPayload = {
      items: fi,
      "customer.name": cName,
      "customer.phone": cPhone,
      "customer.market": cMarket,
      "customer.city": cCity,
      paymentType: payM,
      comments: notes,
      subtotal: newSub,
      billDiscount: totalDisc,
      billerBillDiscount: order.billerBillDiscount ?? order.billDiscountValue ?? origDisc,
      cashierExtraDiscount: Number(order.cashierExtraDiscount || 0) + Number(extraDisc || 0),
      discountReason: extraDisc > 0 ? discReason : (order.discountReason || ""),
      totalAmount: newTotal,
      totalQty,
      previousTotal: origTotal,
      editedTotalDifference: diff,
      newTotalAfterEdit: newTotal,
      isEdited: true,
      wasEdited: true,
      lastEditedBy: cn,
      lastEditedAt: serverTimestamp(),
      lastEditedUserId: userData?.uid || "",
      editedByName: cn,
      editHistory: [
        ...(order.editHistory || []),
        {
          editedBy: cn,
          editedAt: now.toISOString(),
          previousTotal: origTotal,
          newTotal,
          reason: notes || discReason || "Edited & paid",
        },
      ],
      ...buildCashierPaymentPatch({
        amount: newTotal,
        paymentType: payM,
        cashierId,
        cashierName: cn,
        nowISO: now.toISOString(),
      }),
      paidAt: serverTimestamp(),
      cashierPaidAt: serverTimestamp(),
      editedBeforePay: true,
    };

    const billSerial = getBillSerialKey(order) || order.billSerial || order.serialNo || "";

    const writeOrder = async () => {
      const docIds = await resolveAllOrderDocIds(order, billSerial);
      for (const docId of docIds) {
        await updateDoc(doc(db, "orders", docId), editPayload);
      }
    };

    try {
      const updated = normalizeOrderForInvoice(buildUpdatedOrder(fi, true));
      toast.success(
        shouldPrint
          ? `Paid Rs.${newTotal.toLocaleString()} — opening print...`
          : `Saved & paid Rs.${newTotal.toLocaleString()}`,
        { id: tid, duration: 1500 },
      );
      setSaving(false);
      onComplete?.({ order: updated, shouldPrint, markPaid: true });

      void (async () => {
        try {
          try {
            await writeOrder();
          } catch (writeErr) {
            if (writeErr?.code === "permission-denied" && auth?.currentUser) {
              await auth.currentUser.getIdToken(true);
              await writeOrder();
            } else {
              throw writeErr;
            }
          }

          await applyTrustedInstantPaymentToCloud({
            order: {
              ...order,
              items: fi,
              customer: { name: cName, phone: cPhone, market: cMarket, city: cCity },
              totalAmount: newTotal,
              paymentType: payM,
            },
            cashierId,
            cashierName: cn,
            storeId: sid,
          }).catch(() => {});

          if (!getHasInternet()) {
            const saved = await saveOfflinePayment({
              billId: order.id,
              billSerial: order.billSerial || order.serialNo,
              enteredAmount: newTotal,
              paymentMethod: payM,
              cashierId,
              cashierName: cn,
              storeId: sid,
            });
            if (!saved?.success && !saved?.duplicate) {
              throw new Error(saved?.error || "Offline payment save failed");
            }
          } else {
            void saveOfflinePayment({
              billId: order.id,
              billSerial: order.billSerial || order.serialNo,
              enteredAmount: newTotal,
              paymentMethod: payM,
              cashierId,
              cashierName: cn,
              storeId: sid,
            }).catch(() => {});
            void addDoc(collection(db, "cashierActions"), {
              actionType: "PAID",
              orderId: order.id,
              billSerial: billSerial || order.billSerial || order.serialNo || "",
              serialNo: billSerial || order.serialNo || order.billSerial || "",
              storeId: sid,
              cashierId,
              cashierName: cn,
              totalAmount: newTotal,
              totalDiscount: order.totalDiscount || 0,
              totalQty,
              paymentType: payM,
              customer: { name: cName, phone: cPhone, market: cMarket, city: cCity },
              items: fi,
              billerName: order.billerName || "",
              billerId: order.billerId || "",
              date: now.toISOString().split("T")[0],
              time: now.toLocaleTimeString("en-PK"),
              timestamp: serverTimestamp(),
              editedBeforePay: true,
            }).catch(() => {});
          }
          void logCashierAction({
            action: "BILL_EDITED",
            orderId: order.id,
            billSerial: order.billSerial || order.serialNo,
            userId: cashierId,
            userName: cn,
            storeId: sid,
            amount: newTotal,
            before: { totalAmount: origTotal, subtotal: origSub, discount: origDisc },
            after: { totalAmount: newTotal, subtotal: newSub, discount: totalDisc },
            metadata: { difference: diff, discountReason: discReason, notes, markPaid: true, shouldPrint },
          }).catch(() => {});
          void logCashierAction({
            action: "PAYMENT_RECEIVED",
            orderId: order.id,
            billSerial: order.billSerial || order.serialNo,
            userId: cashierId,
            userName: cn,
            storeId: sid,
            amount: newTotal,
            paymentType: payM,
            metadata: { editedBeforePay: true, shouldPrint },
          }).catch(() => {});
        } catch (err) {
          console.error("[EditBill] background save:", err);
          toast.error(err?.message || "Saved locally — cloud sync pending", { duration: 3000 });
        }
      })();
    } catch (err) {
      console.error("[EditBill]", err);
      const msg = err?.code === "permission-denied"
        ? "Permission denied — please re-login"
        : (err?.message || "Save & pay failed");
      toast.error(msg, { id: tid });
      setSaving(false);
    }
  }, [
    items, extraDisc, discReason, cName, cPhone, cMarket, cCity,
    payM, notes, newSub, totalDisc, newTotal, order, userData,
    origTotal, origSub, origDisc, diff, buildSavePayload, buildUpdatedOrder, onComplete,
  ]);

  const handleSave = useCallback(() => persistBillEdit(true), [persistBillEdit]);
  const handleSaveAndCash = useCallback(() => persistBillEdit(false), [persistBillEdit]);

  // ✅ Glassmorphism Toggle
  const GlassToggle = ({ open, toggle, icon, label, badge }) => (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={toggle}
      className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border
        transition-all duration-300 backdrop-blur-xl
        ${open ? glassActive : glassCard}`}
    >
      <span className="flex items-center gap-3">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all
          duration-300 ${
          open
            ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 scale-110"
            : isDark
            ? "bg-white/10 text-amber-400"
            : "bg-amber-100/80 text-amber-600"
        }`}>
          {icon}
        </span>
        <span className={`text-sm font-bold ${text}`}>{label}</span>
        {badge && (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide
            ${isDark
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              : "bg-amber-100 text-amber-700 border border-amber-200/60"
            }`}>
            {badge}
          </span>
        )}
      </span>
      <motion.div
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        className={`w-7 h-7 rounded-full flex items-center justify-center
          ${open ? "bg-amber-500/20" : ""} ${isDark ? "bg-white/10" : "bg-black/5"}`}
      >
        <ChevronDown className={`w-4 h-4 ${open ? "text-amber-500" : subText}`} />
      </motion.div>
    </motion.button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" data-modal-open="true">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-lg ${modalBg} rounded-3xl border ${border}
          shadow-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "95vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-5 py-4
          border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600
              rounded-2xl flex items-center justify-center
              shadow-lg shadow-amber-500/25">
              <Edit3 className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-bold text-base ${text}`}>
                {t('cashier.editBill', 'Edit Bill')} #{order.billSerial || order.serialNo}
              </h2>
              <p className={`text-xs ${subText}`}>
                {items.length} {t('items', 'items')} · {t('escClose', 'ESC to close')}
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className={`w-9 h-9 rounded-xl flex items-center justify-center
              transition-all ${isDark ? "hover:bg-red-500/20" : "hover:bg-red-50"}
              ${subText} hover:text-red-500`}
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Customer */}
          <div className={`rounded-2xl p-4 border ${glassBg} backdrop-blur-sm`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center
                ${isDark ? "bg-amber-500/15" : "bg-amber-100/80"}`}>
                <User className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${subText}`}>
                {t('customer.name', 'Customer')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: t('name', 'Name'), v: cName, s: setCName, t: "text", p: t('name', 'Name'), ic: <User className="inline w-3 h-3 me-0.5 opacity-50" /> },
                { l: t('phone', 'Phone'), v: cPhone, s: setCPhone, t: "tel", p: "03XX", ic: <Phone className="inline w-3 h-3 me-0.5 opacity-50" /> },
                { l: t('market', 'Market'), v: cMarket, s: setCMarket, t: "text", p: t('market', 'Market'), ic: <MapPin className="inline w-3 h-3 me-0.5 opacity-50" /> },
                { l: t('city', 'City'), v: cCity, s: setCCity, t: "text", p: t('city', 'City'), ic: <MapPin className="inline w-3 h-3 me-0.5 opacity-50" /> },
              ].map(({ l, v, s, t: inputType, p, ic }) => (
                <div key={l}>
                  <label className={`text-[10px] font-bold uppercase tracking-wider
                    block mb-1 ${subText}`}>
                    {ic}{l}
                  </label>
                  <input
                    type={inputType}
                    value={v}
                    onChange={e => s(e.target.value)}
                    placeholder={p}
                    className={`w-full px-3 py-2 rounded-xl border text-sm
                      transition-all focus:outline-none focus:border-amber-500
                      focus:ring-2 focus:ring-amber-500/20 ${inputBg}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className={`rounded-2xl p-4 border ${glassBg} backdrop-blur-sm`}>
            <label className={`text-[10px] font-bold uppercase tracking-widest
              block mb-2.5 ${subText}`}>
              {t('paymentMethod', 'Payment Method')}
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {payMethods.map(m => {
                const Icon = m.icon;
                return (
                  <motion.button
                    key={m.v}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setPayM(m.v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs
                      font-semibold transition-all duration-200 ${
                      payM === m.v
                        ? `border-amber-500/40 bg-amber-500/15 text-amber-500
                           shadow-sm shadow-amber-500/10 ${isDark ? "ring-1 ring-amber-500/20" : ""}`
                        : `${isDark ? "border-white/10 text-gray-400 hover:border-white/20 hover:bg-white/5"
                                    : "border-gray-200/60 text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {m.v}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Items + Discount Combined Toggle */}
          <div className="space-y-2">
            <GlassToggle
              open={showItemsDiscount}
              toggle={() => setShowItemsDiscount(v => !v)}
              icon={<Package className="w-4 h-4" />}
              label={t('cashier.itemsAndDiscount', 'Items & Discount')}
              badge={`${items.length}${totalDisc > 0 ? ` · -${totalDisc}` : ""}`}
            />

            <AnimatePresence>
              {showItemsDiscount && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-2xl border p-4 space-y-4 ${glassBg} backdrop-blur-sm overflow-hidden`}
                >
                  {/* Items */}
                  <div className="space-y-2">
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${subText}
                      flex items-center gap-1.5`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {t('cashier.editQtyPrice', 'Edit Qty & Price')}
                    </p>

                    {items.map((item, idx) => (
                      <div
                        key={item._id}
                        className={`rounded-xl border p-3.5 transition-all duration-200 ${
                          isDark
                            ? "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                            : "bg-white/50 border-gray-200/40 hover:bg-white/80"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center
                              text-[10px] font-extrabold flex-shrink-0
                              ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-600"}`}>
                              {idx + 1}
                            </span>
                            <span className={`text-sm font-semibold ${text} truncate`}>
                              {cleanName(item.productName)}
                            </span>
                          </div>
                          <span className={`text-sm font-bold text-amber-500 ml-2 tabular-nums`}>
                            Rs.{(item.qty * item.price).toLocaleString()}
                          </span>
                        </div>

                        {item.serialId && (
                          <div className={`flex items-center gap-1 mb-2.5 ${subText}`}>
                            <Hash className="w-3 h-3 opacity-50" />
                            <span className="text-[10px] font-mono tracking-wider opacity-70">
                              {item.serialId}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={`text-[9px] font-bold uppercase tracking-widest
                              block mb-1 ${subText}`}>
                              {t('qty', 'Qty')}
                            </label>
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => setQty(item._id, e.target.value)}
                              min={1}
                              max={999999}
                              className={`w-full px-3 py-2.5 rounded-xl border text-base font-bold
                                text-center transition-all focus:outline-none
                                focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20
                                ${inputBg}`}
                            />
                          </div>
                          <div>
                            <label className={`text-[9px] font-bold uppercase tracking-widest
                              block mb-1 ${subText}`}>
                              {t('price', 'Price')} (Rs.)
                            </label>
                            <input
                              type="number"
                              value={item.price}
                              onChange={e => setPrice(item._id, e.target.value)}
                              min={0}
                              className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold
                                transition-all focus:outline-none focus:border-amber-500
                                focus:ring-2 focus:ring-amber-500/20 ${inputBg}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className={`flex-1 h-px ${isDark ? "bg-white/10" : "bg-gray-200/50"}`} />
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${subText}`}>
                      Discount
                    </span>
                    <div className={`flex-1 h-px ${isDark ? "bg-white/10" : "bg-gray-200/50"}`} />
                  </div>

                  {/* Discount */}
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest
                          block mb-1 text-blue-400">
                          Biller Discount
                        </label>
                        <div className={`px-3 py-2.5 rounded-xl border text-sm font-bold
                          text-blue-400 ${
                          isDark
                            ? "bg-blue-500/10 border-blue-500/15"
                            : "bg-blue-50/80 border-blue-100"
                        }`}>
                          Rs.{origDisc.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest
                          block mb-1 text-emerald-400">
                          Extra Discount
                        </label>
                        <input
                          type="number"
                          value={extraDisc}
                          onChange={e => setExtraDisc(
                            Math.min(Math.max(0, Number(e.target.value)), newSub)
                          )}
                          min={0}
                          max={newSub}
                          className={`w-full px-3 py-2.5 rounded-xl border text-sm font-bold
                            transition-all focus:outline-none focus:border-emerald-500
                            focus:ring-2 focus:ring-emerald-500/20 ${inputBg}`}
                        />
                      </div>
                    </div>

                    {Number(extraDisc) > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <label className="text-[9px] font-bold uppercase tracking-widest
                          block mb-1 text-red-400">
                          Reason <span className="text-red-500">*required</span>
                        </label>
                        <input
                          type="text"
                          value={discReason}
                          onChange={e => setDiscReason(e.target.value)}
                          placeholder="Why extra discount?"
                          className={`w-full px-3 py-2.5 rounded-xl border text-sm
                            transition-all focus:outline-none focus:border-red-500
                            focus:ring-2 focus:ring-red-500/20 ${inputBg}`}
                        />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notes */}
          <div className={`rounded-2xl p-4 border ${glassBg} backdrop-blur-sm`}>
            <label className={`text-[10px] font-bold uppercase tracking-widest
              block mb-1.5 ${subText}`}>
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className={`w-full px-3 py-2 rounded-xl border text-sm
                transition-all focus:outline-none focus:border-amber-500
                focus:ring-2 focus:ring-amber-500/20 ${inputBg}`}
            />
          </div>

          {/* Summary Toggle */}
          <div className="space-y-2">
            <GlassToggle
              open={showSummary}
              toggle={() => setShowSummary(v => !v)}
              icon={<BarChart3 className="w-4 h-4" />}
              label="Summary"
              badge={diff !== 0
                ? `${diff > 0 ? "+" : ""}Rs.${diff.toLocaleString()}`
                : null}
            />

            <AnimatePresence>
              {showSummary && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-2xl border overflow-hidden ${glassBg} backdrop-blur-sm`}
                >
                  <div className="grid grid-cols-2">
                    {/* Before */}
                    <div className={`p-3.5 ${isDark ? "bg-white/[0.02]" : "bg-gray-50/50"}`}>
                      <p className={`text-[9px] font-bold uppercase tracking-widest
                        ${subText} mb-2 flex items-center gap-1`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Before
                      </p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className={subText}>Subtotal</span>
                          <span className={`${text} tabular-nums`}>Rs.{origSub.toLocaleString()}</span>
                        </div>
                        {origDisc > 0 && (
                          <div className="flex justify-between">
                            <span className={subText}>Discount</span>
                            <span className="text-emerald-500 tabular-nums">-Rs.{origDisc}</span>
                          </div>
                        )}
                        <div className={`flex justify-between font-bold pt-1.5 mt-1
                          border-t ${isDark ? "border-white/10" : "border-gray-200/50"}`}>
                          <span className={text}>Total</span>
                          <span className={`${text} tabular-nums`}>Rs.{origTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* After */}
                    <div className={`p-3.5 ${isDark ? "bg-amber-500/[0.03]" : "bg-amber-50/30"}`}>
                      <p className="text-[9px] font-bold uppercase tracking-widest
                        text-amber-500 mb-2 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        After
                      </p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className={subText}>Subtotal</span>
                          <span className={`${text} tabular-nums`}>Rs.{newSub.toLocaleString()}</span>
                        </div>
                        {totalDisc > 0 && (
                          <div className="flex justify-between">
                            <span className={subText}>Discount</span>
                            <span className="text-emerald-500 tabular-nums">-Rs.{totalDisc}</span>
                          </div>
                        )}
                        <div className={`flex justify-between font-bold pt-1.5 mt-1
                          border-t ${isDark ? "border-white/10" : "border-gray-200/50"}`}>
                          <span className="text-amber-500">Total</span>
                          <span className="text-amber-500 text-base tabular-nums">
                            Rs.{newTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {diff !== 0 && (
                    <div className={`flex items-center justify-center gap-2 py-2
                      border-t ${isDark ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-gray-50/30"}`}>
                      <span className={`text-xs font-bold ${
                        diff < 0 ? "text-red-500" : "text-emerald-500"
                      }`}>
                        {diff > 0 ? "▲" : "▼"} Rs.{Math.abs(diff).toLocaleString()}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className={`px-5 py-4 border-t ${border} flex-shrink-0
          ${isDark ? "bg-white/[0.02]" : "bg-gray-50/30"}`}>
          {/* Total bar */}
          <div className={`flex items-center justify-between mb-3 px-4 py-2.5 rounded-2xl ${
            isDark
              ? "bg-amber-500/10 border border-amber-500/15"
              : "bg-amber-50/80 border border-amber-200/50"
          }`}>
            <span className={`text-sm font-bold ${subText}`}>{t('cashier.newTotal', 'New Total')}</span>
            <span className="text-xl font-extrabold text-amber-500 tabular-nums">
              Rs.{newTotal.toLocaleString()}
            </span>
          </div>
          <div className={`mb-3 px-4 py-2 rounded-xl border text-xs ${
            isDark ? "border-white/10 bg-white/[0.03]" : "border-gray-200/70 bg-white/80"
          }`}>
            <div className="flex items-center justify-between">
              <span className={subText}>Previous Total</span>
              <span className={`${text} font-semibold tabular-nums`}>Rs.{origTotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className={subText}>Difference</span>
              <span className={`font-bold tabular-nums ${diff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {diff >= 0 ? "+" : "-"}Rs.{Math.abs(diff).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              disabled={saving}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium
                transition-all disabled:opacity-50 flex-shrink-0
                ${isDark
                  ? "border-white/10 text-gray-400 hover:bg-white/5"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
            >
              {t('common.cancel', 'Cancel')}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500
                hover:from-amber-600 hover:to-orange-600 disabled:opacity-50
                text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5
                shadow-lg shadow-amber-500/25 transition-all min-w-0"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                : <Save className="w-4 h-4 flex-shrink-0" />}
              <span className="truncate">{saving ? t('billSaving', 'Saving...') : t('cashier.saveAndPrint', 'Save & Print')}</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSaveAndCash}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600
                hover:from-emerald-600 hover:to-green-700 disabled:opacity-50
                text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5
                shadow-lg shadow-emerald-500/25 transition-all min-w-0"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                : <Wallet className="w-4 h-4 flex-shrink-0" />}
              <span className="truncate">{saving ? t('processing', 'Processing...') : t('cashier.saveAndCash', 'Save & Cash')}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default EditBillModal;