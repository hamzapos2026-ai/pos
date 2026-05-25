// src/components/cashier/ViewBillModal.jsx
// ✨ NEW: Full bill view with expandable payment info + Framer Motion
// ✅ Shows customer, items, discounts, status, payment details if PAID
// ✅ Action buttons for pending bills (Pay/Edit/Cancel)

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, Phone, MapPin, Hash, Package, Clock,
  CheckCircle, XCircle, Edit3, Zap, ChevronDown, Printer,
  Calendar, Banknote, CreditCard, FileText, Receipt,
  ShieldCheck, Sparkles,
} from "lucide-react";

const cleanName = (name) => {
  if (!name) return "Product";
  let clean = name.replace(/^Item\s*[-–—]\s*/i, "").trim();
  if (/^ITEM-\d+/i.test(clean)) {
    const id = clean.replace(/^ITEM-/i, "");
    return `Product #${id.slice(-6)}`;
  }
  return clean || "Product";
};

const fmtTS = (ts) => {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("en-PK", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const ViewBillModal = ({
  order, isDark, userData, storeData,
  onClose, onPayment, onEdit, onCancel,
}) => {
  const [showPayment, setShowPayment] = useState(true);
  const [showItems, setShowItems] = useState(true);

  const effectiveStatus = (o) => {
    try {
      if (!o) return 'pending';
      if (o.status === 'cancelled') return 'cancelled';
      if (o.status === 'approved') return 'approved';
      if (o.status === 'paid') return 'paid';
      if (o.paymentStatus === 'paid') return 'paid';
      if (o.offlineSyncPending === true) return 'paid';
      if (o.synced === true && (o.paymentStatus === 'paid' || o.syncStatus === 'synced')) return 'paid';
      return o.status || 'pending';
    } catch { return o.status || 'pending'; }
  };

  const isPaid = effectiveStatus(order) === "paid";
  const isCancelled = effectiveStatus(order) === "cancelled";
  const isPending = effectiveStatus(order) === "pending";
  const isEdited = order.isEdited || order.wasEdited || order.lastEditedBy;

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const glassBg = isDark
    ? "bg-white/[0.03] border-white/[0.06]"
    : "bg-gray-50/80 border-gray-200/40";

  // ESC close
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Print
  const handlePrint = () => {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Bill #${order.billSerial}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:16px;max-width:320px}.c{text-align:center}.d{border-top:1px dashed #000;margin:8px 0}.r{display:flex;justify-content:space-between;margin:3px 0}.t{font-size:14px;font-weight:bold}</style></head><body>
<div class="c"><h2>${storeData?.name || "POS"}</h2><p>#${order.billSerial || order.serialNo}</p><p>${new Date().toLocaleString("en-PK")}</p></div><div class="d"></div>
<div class="r"><span>Customer:</span><span>${order.customer?.name || "Walk-in"}</span></div>
${order.customer?.phone ? `<div class="r"><span>Phone:</span><span>${order.customer.phone}</span></div>` : ""}
<div class="d"></div>
${(order.items || []).map(i => `<div class="r"><span>${cleanName(i.productName)}</span><span>Rs.${(i.qty * i.price).toLocaleString()}</span></div>`).join("")}
<div class="d"></div>
<div class="r t"><span>TOTAL:</span><span>Rs.${(order.totalAmount || 0).toLocaleString()}</span></div>
<div class="d"></div><div class="c" style="font-size:10px;margin-top:8px">Thank you!</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    w.document.close();
  };

  const StatusBadge = () => {
    if (isPaid)
      return (
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-emerald-500/15 border-emerald-500/30 text-emerald-500 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> PAID
        </span>
      );
    if (isCancelled)
      return (
        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-red-500/15 border-red-500/30 text-red-500 flex items-center gap-1">
          <XCircle className="w-3 h-3" /> CANCELLED
        </span>
      );
    return (
      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-amber-500/15 border-amber-500/30 text-amber-500 flex items-center gap-1">
        <Clock className="w-3 h-3" /> PENDING
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" data-modal-open="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-lg ${cardBg} rounded-3xl border ${border} shadow-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "95vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Receipt className="text-white w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`font-bold text-base ${text}`}>
                    #{order.billSerial || order.serialNo}
                  </h2>
                  <StatusBadge />
                  {isEdited && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                      isDark ? "bg-purple-900/30 text-purple-400" : "bg-purple-50 text-purple-700"
                    }`}>
                      <Edit3 className="w-2.5 h-2.5" /> EDITED
                    </span>
                  )}
                </div>
                <p className={`text-xs ${subText} mt-0.5 flex items-center gap-1`}>
                  <Calendar className="w-3 h-3" />
                  {fmtTS(order.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handlePrint}
                className={`p-2 rounded-xl border ${border} ${subText} hover:text-amber-500 hover:border-amber-500/50 transition-all`}
                title="Print"
              >
                <Printer className="w-4 h-4" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className={`p-2 rounded-xl ${subText} hover:text-red-500 ${isDark ? "hover:bg-red-500/15" : "hover:bg-red-50"}`}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Customer */}
          <div className={`rounded-2xl p-4 border ${glassBg}`}>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-amber-500" />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${subText}`}>
                Customer
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={`text-[10px] ${subText} uppercase font-bold`}>Name</p>
                <p className={`text-sm font-semibold ${text}`}>
                  {order.customer?.name || "Walk-in"}
                </p>
              </div>
              {order.customer?.phone && (
                <div>
                  <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  <p className={`text-sm font-semibold ${text}`}>
                    {order.customer.phone}
                  </p>
                </div>
              )}
              {order.customer?.market && (
                <div>
                  <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                    <MapPin className="w-3 h-3" /> Market
                  </p>
                  <p className={`text-sm font-semibold ${text}`}>
                    {order.customer.market}
                  </p>
                </div>
              )}
              {order.customer?.city && (
                <div>
                  <p className={`text-[10px] ${subText} uppercase font-bold`}>City</p>
                  <p className={`text-sm font-semibold ${text}`}>
                    {order.customer.city}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className={`rounded-2xl border ${glassBg} overflow-hidden`}>
            <button
              onClick={() => setShowItems(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                <span className={`text-sm font-bold ${text}`}>Items</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500">
                  {order.items?.length || 0}
                </span>
              </div>
              <motion.div animate={{ rotate: showItems ? 180 : 0 }}>
                <ChevronDown className={`w-4 h-4 ${subText}`} />
              </motion.div>
            </button>

            <AnimatePresence>
              {showItems && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className={`border-t ${border} divide-y ${isDark ? "divide-white/5" : "divide-gray-100"}`}>
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 ${
                            isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-600"
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${text} truncate`}>
                              {cleanName(item.productName)}
                            </p>
                            <p className={`text-[10px] ${subText} flex items-center gap-2 mt-0.5`}>
                              {item.serialId && (
                                <span className="flex items-center gap-0.5">
                                  <Hash className="w-2.5 h-2.5" />
                                  {item.serialId}
                                </span>
                              )}
                              <span>Qty: {item.qty}</span>
                              <span>×</span>
                              <span>Rs.{item.price?.toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-amber-500 tabular-nums ml-2">
                          Rs.{((item.qty || 0) * (item.price || 0)).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Totals */}
          <div className={`rounded-2xl p-4 border ${glassBg}`}>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className={subText}>Subtotal</span>
                <span className={`${text} font-semibold tabular-nums`}>
                  Rs.{(order.subtotal || 0).toLocaleString()}
                </span>
              </div>
              {(order.billDiscount || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className={subText}>Discount</span>
                  <span className="text-emerald-500 font-semibold tabular-nums">
                    -Rs.{(order.billDiscount || 0).toLocaleString()}
                  </span>
                </div>
              )}
              {order.discountReason && (
                <div className={`text-[10px] ${subText} italic`}>
                  Reason: {order.discountReason}
                </div>
              )}
              <div className={`flex justify-between font-bold pt-2 mt-1 border-t ${border}`}>
                <span className={text}>Total</span>
                <span className="text-amber-500 text-lg tabular-nums">
                  Rs.{(order.totalAmount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ✨ Payment Info (only if PAID) */}
          {isPaid && (
            <div className={`rounded-2xl border overflow-hidden ${
              isDark
                ? "bg-emerald-900/10 border-emerald-700/30"
                : "bg-emerald-50/50 border-emerald-200/50"
            }`}>
              <button
                onClick={() => setShowPayment(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-500/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className={`text-sm font-bold text-emerald-500`}>
                    Payment Details
                  </span>
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                </div>
                <motion.div animate={{ rotate: showPayment ? 180 : 0 }}>
                  <ChevronDown className="w-4 h-4 text-emerald-500" />
                </motion.div>
              </button>

              <AnimatePresence>
                {showPayment && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={`border-t ${isDark ? "border-emerald-700/30" : "border-emerald-200/50"} p-4 grid grid-cols-2 gap-3`}>
                      <div>
                        <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                          <CreditCard className="w-3 h-3" /> Method
                        </p>
                        <p className={`text-sm font-bold ${text} mt-0.5`}>
                          {order.paymentType || "Cash"}
                        </p>
                      </div>
                      <div>
                        <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                          <Banknote className="w-3 h-3" /> Received
                        </p>
                        <p className="text-sm font-bold text-emerald-500 mt-0.5">
                          Rs.{(order.amountReceived || order.totalAmount || 0).toLocaleString()}
                        </p>
                      </div>
                      {(order.changeGiven || 0) > 0 && (
                        <div>
                          <p className={`text-[10px] ${subText} uppercase font-bold`}>Change</p>
                          <p className={`text-sm font-bold ${text} mt-0.5`}>
                            Rs.{(order.changeGiven || 0).toLocaleString()}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                          <User className="w-3 h-3" /> Paid By
                        </p>
                        <p className={`text-sm font-bold ${text} mt-0.5`}>
                          {order.paidByName || order.cashierName || "—"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className={`text-[10px] ${subText} uppercase font-bold flex items-center gap-1`}>
                          <Clock className="w-3 h-3" /> Paid At
                        </p>
                        <p className={`text-sm font-bold ${text} mt-0.5`}>
                          {fmtTS(order.paidAt)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Cancel info (if cancelled) */}
          {isCancelled && (
            <div className={`rounded-2xl p-4 border ${
              isDark
                ? "bg-red-900/10 border-red-700/30"
                : "bg-red-50/50 border-red-200/50"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-bold text-red-500">Cancellation</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className={`text-[10px] ${subText} uppercase font-bold`}>Reason</p>
                  <p className={`${text} font-semibold`}>{order.cancelReason || "—"}</p>
                </div>
                <div>
                  <p className={`text-[10px] ${subText} uppercase font-bold`}>By</p>
                  <p className={`${text} font-semibold`}>{order.cancelledBy || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className={`text-[10px] ${subText} uppercase font-bold`}>At</p>
                  <p className={`${text} font-semibold`}>{fmtTS(order.cancelledAt)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {order.comments && (
            <div className={`rounded-2xl p-4 border ${glassBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${subText}`}>
                  Notes
                </span>
              </div>
              <p className={`text-sm ${text}`}>{order.comments}</p>
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        {isPending && (onPayment || onEdit || onCancel) && (
          <div className={`px-5 py-4 border-t ${border} flex-shrink-0 ${
            isDark ? "bg-white/[0.02]" : "bg-gray-50/30"
          }`}>
            <div className="flex items-center gap-2">
              {onCancel && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onCancel(order)}
                  className="px-3 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm font-bold flex items-center gap-1.5 hover:bg-red-500/20 transition-all"
                >
                  <XCircle className="w-4 h-4" /> Cancel
                </motion.button>
              )}
              {onEdit && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onEdit(order)}
                  className="px-3 py-2.5 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 text-sm font-bold flex items-center gap-1.5 hover:bg-amber-500/25 transition-all"
                >
                  <Edit3 className="w-4 h-4" /> Edit
                </motion.button>
              )}
              {onPayment && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onPayment(order)}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
                >
                  <Zap className="w-4 h-4" /> Pay Rs.{(order.totalAmount || 0).toLocaleString()}
                </motion.button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ViewBillModal;