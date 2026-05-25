// src/components/cashier/EditBillModal.jsx
// ✅ MERGED: Old glass UI + Framer Motion + audit logs + Lucide icons
// ✨ NEW: Edited badge support, audit trail, ESC safe, responsive

import React, {
  useState, useCallback, useMemo, useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import {
  X, Save, Edit3, User, Phone, ChevronDown, MapPin,
  Package, Hash, BarChart3, Loader2, AlertCircle,
  Banknote, Smartphone, CreditCard, Building2, Wallet,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { logCashierAction } from "../../services/cashierAuditService";

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

// ✅ Receipt printer
const doPrint = (order, items, total, disc, name, phone, market, city) => {
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) { toast.error("Allow popups"); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Bill #${order.billSerial || order.serialNo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:16px;max-width:320px}.c{text-align:center}.d{border-top:1px dashed #000;margin:8px 0}.r{display:flex;justify-content:space-between;margin:3px 0}.t{font-size:14px;font-weight:bold}@media print{body{padding:0}}</style></head><body>
<div class="c"><h2>${order.storeName || "POS"}</h2><p>#${order.billSerial || order.serialNo}</p><p>${new Date().toLocaleString("en-PK")}</p></div><div class="d"></div>
<div class="r"><span>Customer:</span><span>${name}</span></div>
${phone ? `<div class="r"><span>Phone:</span><span>${phone}</span></div>` : ""}
${market ? `<div class="r"><span>Market:</span><span>${market}</span></div>` : ""}
${city ? `<div class="r"><span>City:</span><span>${city}</span></div>` : ""}
<div class="d"></div>
${items.map(i => `<div class="r"><span>${cleanName(i.productName)}</span><span>Rs.${(i.qty * i.price).toLocaleString()}</span></div><div style="color:#666;font-size:10px;margin-left:8px">Qty:${i.qty} × Rs.${i.price}</div>`).join("")}
<div class="d"></div>
${disc > 0 ? `<div class="r"><span>Discount:</span><span>-Rs.${disc}</span></div>` : ""}
<div class="r t"><span>TOTAL:</span><span>Rs.${total.toLocaleString()}</span></div>
<div class="d"></div><div class="c" style="font-size:10px;margin-top:8px">Thank you!</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
  w.document.close();
};

// Payment methods config
const PAY_METHODS = [
  { v: "Cash", icon: Banknote, color: "emerald" },
  { v: "EasyPaisa", icon: Smartphone, color: "green" },
  { v: "JazzCash", icon: Smartphone, color: "orange" },
  { v: "Bank Transfer", icon: Building2, color: "blue" },
  { v: "Card", icon: CreditCard, color: "purple" },
];

const EditBillModal = ({ order, isDark, userData, storeData, onClose }) => {
  const [cName, setCName] = useState(order.customer?.name || "Walking Customer");
  const [cPhone, setCPhone] = useState(order.customer?.phone || "");
  const [cMarket, setCMarket] = useState(order.customer?.market || "");
  const [cCity, setCCity] = useState(order.customer?.city || "");
  const [payM, setPayM] = useState(order.paymentType || "Cash");
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

  const handleSave = useCallback(async () => {
    if (items.length === 0) {
      toast.error("Need items", { icon: <AlertCircle className="w-4 h-4" /> });
      return;
    }
    if (Number(extraDisc) > 0 && !discReason.trim()) {
      toast.error("Discount reason required");
      return;
    }
    setSaving(true);
    const tid = toast.loading("Saving...");
    const cn = userData?.displayName || userData?.name || "Cashier";
    const fi = items.map(i => ({
      productName: i.productName,
      serialId: i.serialId || "",
      price: Number(i.price),
      qty: Number(i.qty),
      total: i.qty * i.price,
    }));
    try {
      await Promise.all([
        // ✨ Update with isEdited flag (purple badge)
        updateDoc(doc(db, "orders", order.id), {
          items: fi,
          "customer.name": cName,
          "customer.phone": cPhone,
          "customer.market": cMarket,
          "customer.city": cCity,
          paymentType: payM,
          comments: notes,
          subtotal: newSub,
          billDiscount: totalDisc,
          discountReason: extraDisc > 0 ? discReason : (order.discountReason || ""),
          totalAmount: newTotal,
          totalQty: fi.reduce((s, i) => s + i.qty, 0),
          isEdited: true,        // ✨ NEW
          wasEdited: true,       // ✨ NEW
          lastEditedBy: cn,
          lastEditedAt: serverTimestamp(),
          lastEditedUserId: userData?.uid || "",
          editedByName: cn,      // ✨ NEW
          editHistory: [
            ...(order.editHistory || []),
            {
              editedBy: cn,
              editedAt: new Date().toISOString(),
              previousTotal: origTotal,
              newTotal,
              reason: notes || discReason || "Edited",
            },
          ],
        }),
        // ✨ NEW: Audit log
        logCashierAction({
          action: "BILL_EDITED",
          orderId: order.id,
          billSerial: order.billSerial || order.serialNo,
          userId: userData?.uid || "",
          userName: cn,
          storeId: userData?.storeId || "",
          amount: newTotal,
          before: { totalAmount: origTotal, subtotal: origSub, discount: origDisc },
          after: { totalAmount: newTotal, subtotal: newSub, discount: totalDisc },
          metadata: { difference: diff, discountReason: discReason, notes },
        }),
      ]);
      toast.success("Saved! Printing...", { id: tid, duration: 1500 });
      doPrint(order, fi, newTotal, totalDisc, cName, cPhone, cMarket, cCity);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Save failed", { id: tid });
    } finally {
      setSaving(false);
    }
  }, [
    items, extraDisc, discReason, cName, cPhone, cMarket, cCity,
    payM, notes, newSub, totalDisc, newTotal, order, userData,
    origTotal, origSub, origDisc, diff, onClose,
  ]);

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
                Edit #{order.billSerial || order.serialNo}
              </h2>
              <p className={`text-xs ${subText}`}>
                {items.length} item{items.length !== 1 ? "s" : ""} · ESC to close
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
                Customer
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: "Name", v: cName, s: setCName, t: "text", p: "Name", ic: <User className="inline w-3 h-3 mr-0.5 opacity-50" /> },
                { l: "Phone", v: cPhone, s: setCPhone, t: "tel", p: "03XX", ic: <Phone className="inline w-3 h-3 mr-0.5 opacity-50" /> },
                { l: "Market", v: cMarket, s: setCMarket, t: "text", p: "Market", ic: <MapPin className="inline w-3 h-3 mr-0.5 opacity-50" /> },
                { l: "City", v: cCity, s: setCCity, t: "text", p: "City", ic: <MapPin className="inline w-3 h-3 mr-0.5 opacity-50" /> },
              ].map(({ l, v, s, t, p, ic }) => (
                <div key={l}>
                  <label className={`text-[10px] font-bold uppercase tracking-wider
                    block mb-1 ${subText}`}>
                    {ic}{l}
                  </label>
                  <input
                    type={t}
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
              Payment Method
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {PAY_METHODS.map(m => {
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
              label="Items & Discount"
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
                      Edit Qty & Price
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
                              Qty
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
                              Price (Rs.)
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
            <span className={`text-sm font-bold ${subText}`}>New Total</span>
            <span className="text-xl font-extrabold text-amber-500 tabular-nums">
              Rs.{newTotal.toLocaleString()}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              disabled={saving}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium
                transition-all disabled:opacity-50
                ${isDark
                  ? "border-white/10 text-gray-400 hover:bg-white/5"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500
                hover:from-amber-600 hover:to-orange-600 disabled:opacity-50
                text-white text-sm font-bold flex items-center justify-center gap-2
                shadow-lg shadow-amber-500/25 transition-all"
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save & Print"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default EditBillModal;