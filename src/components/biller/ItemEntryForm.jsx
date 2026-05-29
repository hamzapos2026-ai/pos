// src/components/biller/ItemEntryForm.jsx
// ✅ FINAL FIX v7 — Big fonts, compact spacing, SP integrated

import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Mic, User, X,
  Search, Loader2, UserCheck, AlertCircle, Lock, Percent,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import {
  isSpeechSupported, parseSpokenNumber, parseDiscount,
} from "../../hooks/useSpeech";
import { useSound } from "../../hooks/useSound";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

const CITY_MARKETS = {
  Karachi: ["Saddar", "Tariq Road", "Hyderi", "Clifton", "Garden", "Bahadurabad"],
  Lahore: ["Anarkali", "Liberty", "Mall Road", "Gulberg", "Johar Town", "DHA"],
  Islamabad: ["F-10 Markaz", "G-9 Markaz", "Blue Area", "I-8 Markaz"],
  Rawalpindi: ["Raja Bazaar", "Saddar", "Commercial Market"],
  Faisalabad: ["D-Ground", "Kohinoor", "Chenab Market"],
  Multan: ["Hussain Agahi", "Gulgasht", "Cantt"],
};
const BASE_CITIES = Object.keys(CITY_MARKETS);

const shakeVariants = {
  idle: { x: 0 },
  shake: { x: [0, -10, 10, -10, 10, -5, 5, 0], transition: { duration: 0.5 } },
};

// ── FieldMic ──
const FieldMic = memo(({ fieldName, onResult, speech }) => {
  if (!speech?.isSpeechEnabled || !isSpeechSupported) return null;
  const isThisField = speech.isListening && speech.activeField === fieldName;
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={(e) => { e.stopPropagation(); speech.startListening(fieldName, onResult); }}
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full z-10",
        isThisField ? "text-red-400 bg-red-500/20" : "text-gray-500 opacity-50 hover:opacity-100 hover:text-green-400",
      )}
    >
      {isThisField && <span className="absolute inset-0 rounded-full border border-red-500 animate-ping" />}
      <Mic size={10} />
    </motion.button>
  );
});

// ── Salesperson Selector ──
const EmbeddedSPSelector = memo(({ agents, currentSPId, onSelect, required, isDark, disabled }) => {
  const current = agents.find((a) => a.id === currentSPId);

  if (agents.length === 0) {
    return (
      <div className={cn(
        "rounded-xl border p-2 flex items-center gap-2",
        isDark ? "border-red-500/30 bg-red-500/5" : "border-red-200 bg-red-50",
      )}>
        <AlertCircle size={14} className="text-red-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-red-400">No Salespersons</p>
          <p className="text-[9px] text-gray-500 flex items-center gap-1">
            <Lock size={8} /> Contact SuperAdmin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className={cn(
        "block text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5",
        isDark ? "text-gray-400" : "text-gray-600",
      )}>
        <UserCheck size={11} className="text-amber-500" />
        Current Salesperson
        {required && <span className="text-red-400">*</span>}
        {current && (
          <span className={cn(
            "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded normal-case font-bold",
            isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700",
          )}>
            {current.commissionType === "fixed" ? `Rs ${current.commissionRate}` : `${current.commissionRate}%`}
          </span>
        )}
      </label>
      <div className="relative">
        <select
          value={currentSPId || ""}
          onChange={(e) => onSelect?.(e.target.value || null)}
          disabled={disabled}
          className={cn(
            "w-full rounded-xl border pl-3 pr-8 py-2 text-sm outline-none cursor-pointer appearance-none font-semibold",
            current
              ? isDark
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-amber-300 bg-amber-50 text-amber-700"
              : required
                ? isDark ? "border-red-500/40 bg-red-500/5 text-red-400" : "border-red-300 bg-red-50 text-red-600"
                : isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
            "disabled:opacity-50",
          )}
        >
          {!required && <option value="">— None —</option>}
          {required && !currentSPId && <option value="">⚠️ Select</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.commissionType === "fixed" ? `Rs ${a.commissionRate}` : `${a.commissionRate}%`})
            </option>
          ))}
        </select>
        <UserCheck size={13} className={cn(
          "absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none",
          current ? "text-amber-500" : "text-gray-400",
        )} />
      </div>
      {current && (
        <p className={cn("text-[10px] flex items-center gap-1 pt-0.5", isDark ? "text-emerald-400" : "text-emerald-600")}>
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          Next items → <strong>{current.name}</strong>
        </p>
      )}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
const ItemEntryForm = memo(({
  form, setForm,
  screenLocked, currentBillSerial, billStartTime,
  customer, custNameSearch, custPhoneSearch,
  showProductName = false, showDiscountField = false,
  billerFontSize = 16, isDark = true,
  lastEntryPrice = "", lastEntryQty = 1,
  lastEntryDiscount = 0, lastEntryDiscountType = "percent",
  custSuggestions = [], showSug = false, sugLoading = false, activeField = "",
  onAddItem, onNameChange, onPhoneChange, onCityChange, onMarketChange,
  onSelectSuggestion, onOpenCustomerDialog, onFormQtyChange,
  onSetActiveField, onSetShowSug, onDoSearch, fmtTime,
  priceInputRef, qtyInputRef, phoneInputRef, discountInputRef,
  nameInputRef, productNameRef,
  intentionalDupRef, speech,
  salespersonEnabled = false,
  salespersonMultiple = false,
  salespersonRequired = false,
  salespersonAgents = [],
  currentSPId = null,
  onSelectSalesperson,
  hasAgents = false,
}) => {
  const language = speech?.language || "en-US";
  const [shakeState, setShakeState] = useState("idle");
  const [fieldFlash, setFieldFlash] = useState("");

  const flashField = useCallback((name) => {
    setFieldFlash(name);
    setTimeout(() => setFieldFlash(""), 800);
  }, []);

  const inputCls = useCallback((fieldName, extra = "") => cn(
    "w-full rounded-xl border outline-none transition-all",
    "focus:ring-2 focus:ring-yellow-500/30",
    fieldFlash === fieldName
      ? "border-green-500 ring-1 ring-green-500/50"
      : isDark
        ? "border-yellow-500/20 bg-[#0f0d09] text-white"
        : "border-yellow-200 bg-white text-gray-900",
    "disabled:opacity-50",
    extra,
  ), [fieldFlash, isDark]);

  // Preview totals
  const previewPrice = Number(form.price) || 0;
  const previewQty = Number(form.qty) || 1;
  const previewDisc = Number(form.discount) || 0;
  const previewRaw = previewPrice * previewQty;
  const previewDiscAmt = form.discountType === "percent"
    ? Math.round(previewRaw * previewDisc / 100)
    : Math.min(previewDisc, previewRaw);
  const previewTotal = Math.max(0, previewRaw - previewDiscAmt);
  const discExceeded = previewPrice > 0 && previewDiscAmt > previewRaw;

  const currentAgent = salespersonAgents.find((a) => a.id === currentSPId);
  const previewCommission = (() => {
    if (!salespersonEnabled || !currentAgent || previewTotal <= 0) return 0;
    const rate = Number(currentAgent.commissionRate || 0);
    if (currentAgent.commissionType === "fixed") return rate * previewQty;
    return Math.round((previewTotal * rate) / 100);
  })();

  // Speech handlers
  const handlePriceSpeech = useCallback((val) => {
    const num = typeof val === "number" ? val : parseSpokenNumber(String(val), language);
    if (num !== null) { setForm((p) => ({ ...p, price: String(num) })); flashField("price"); setTimeout(() => qtyInputRef?.current?.focus(), 100); }
  }, [setForm, flashField, language, qtyInputRef]);

  const handleQtySpeech = useCallback((val) => {
    const num = typeof val === "number" ? val : parseSpokenNumber(String(val), language);
    if (num !== null) { setForm((p) => ({ ...p, qty: Math.max(1, Math.round(num)) })); flashField("qty"); }
  }, [setForm, flashField, language]);

  const handleDiscountSpeech = useCallback((val) => {
    const parsed = typeof val === "string" ? parseDiscount(val, language) : null;
    if (parsed) {
      setForm((p) => ({ ...p, discount: parsed.value, discountType: parsed.type === "percent" ? "percent" : "fixed" }));
      flashField("discount");
    }
  }, [setForm, flashField, language]);

  const handleCustNameSpeech = useCallback((val) => { onNameChange?.(val); flashField("customerName"); }, [onNameChange, flashField]);
  const handlePhoneSpeech = useCallback((val) => { onPhoneChange?.(String(val).replace(/\D/g, "")); flashField("phone"); }, [onPhoneChange, flashField]);
  const handleNameSpeech = useCallback((val) => { setForm((p) => ({ ...p, productName: val })); flashField("productName"); }, [setForm, flashField]);

  useKeyboardShortcuts({
    f3: () => (productNameRef?.current || nameInputRef?.current)?.focus(),
    f4: () => priceInputRef?.current?.focus(),
    f5: () => { qtyInputRef?.current?.focus(); qtyInputRef?.current?.select(); },
    f6: () => discountInputRef?.current?.focus(),
    f7: () => setTimeout(() => phoneInputRef?.current?.focus(), 100),
    "ctrl+shift+c": () => {
      onNameChange?.("Walking Customer");
      onPhoneChange?.("");
      onCityChange?.("Karachi");
      onMarketChange?.("");
      toast.success("Customer cleared");
    },
  }, !screenLocked);

  const showSPSelector = salespersonEnabled && salespersonMultiple;

  return (
    <motion.div variants={shakeVariants} animate={shakeState} className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={15} className="text-yellow-500" />
          <h2 className="font-bold text-yellow-600 text-sm uppercase tracking-wide">ENTRY</h2>
        </div>
        <span className={cn(
          "text-[11px] font-bold px-2 py-0.5 rounded-full",
          screenLocked ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600",
        )}>
          {screenLocked ? "LOCKED" : "ACTIVE"}
        </span>
      </div>

      {/* Bill serial */}
      <div className={cn(
        "rounded-xl border p-2.5",
        isDark ? "bg-yellow-500/5 border-yellow-500/20" : "bg-yellow-50 border-yellow-200",
      )}>
        <p className="text-[10px] uppercase text-gray-500 font-semibold">Bill Serial</p>
        <p className="text-[17px] font-bold text-yellow-400 font-mono truncate">{currentBillSerial}</p>
        {billStartTime && (
          <p className="text-[10px] text-gray-500 mt-0.5">Started: {fmtTime?.(billStartTime)}</p>
        )}
      </div>

      {/* Salesperson Selector */}
      {showSPSelector && (
        <EmbeddedSPSelector
          agents={salespersonAgents}
          currentSPId={currentSPId}
          onSelect={onSelectSalesperson}
          required={salespersonRequired}
          isDark={isDark}
          disabled={screenLocked}
        />
      )}

      {/* Product Name */}
      {showProductName && (
        <div className="space-y-0.5">
          <label className="block text-[11px] font-bold uppercase text-gray-500">Product Name *</label>
          <div className="relative">
            <input
              ref={productNameRef}
              type="text"
              value={form.productName}
              onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); } }}
              disabled={screenLocked}
              placeholder="Product name..."
              className={cn(inputCls("productName"), "px-3 py-2 text-sm pr-8")}
            />
            <FieldMic fieldName="productName" onResult={handleNameSpeech} speech={speech} />
          </div>
        </div>
      )}

      {/* Price + Qty */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5 min-w-0">
          <label className="block text-[11px] font-bold uppercase text-gray-500">Price *</label>
          <div className="relative">
            <input
              ref={priceInputRef}
              type="text"
              inputMode="numeric"
              value={form.price}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setForm((p) => ({ ...p, price: v }));
                if (v && intentionalDupRef) intentionalDupRef.current = false;
              }}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.target.select()}
              onKeyDown={(e) => {
                const ok = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight"];
                if (!ok.includes(e.key) && !/^\d$/.test(e.key) &&
                  !((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())))
                  e.preventDefault();
                if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); }
              }}
              placeholder={lastEntryPrice ? `↵ ${lastEntryPrice}` : "0"}
              disabled={screenLocked}
              className={cn(
                inputCls("price"),
                "font-bold px-3 py-2.5 pr-8 text-[22px]",
                isDark ? "text-yellow-400 border-yellow-500/30" : "text-yellow-700 border-yellow-300",
              )}
            />
            <FieldMic fieldName="price" onResult={handlePriceSpeech} speech={speech} />
          </div>
        </div>
        <div className="space-y-0.5 min-w-0">
          <label className="block text-[11px] font-bold uppercase text-gray-500">Qty</label>
          <div className="relative">
            <input
              ref={qtyInputRef}
              type="text"
              inputMode="numeric"
              value={form.qty}
              onChange={(e) => { if (!screenLocked) onFormQtyChange?.(e.target.value); }}
              onFocus={(e) => e.target.select()}
              onClick={(e) => { e.target.focus(); e.target.select(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); }
                if (e.key === "ArrowUp") { e.preventDefault(); setForm((p) => ({ ...p, qty: (Number(p.qty) || 1) + 1 })); }
                if (e.key === "ArrowDown") { e.preventDefault(); setForm((p) => ({ ...p, qty: Math.max(1, (Number(p.qty) || 1) - 1) })); }
              }}
              readOnly={screenLocked}
              className={cn(inputCls("qty"), "text-center font-bold px-2 py-2.5 text-[22px]")}
            />
            <FieldMic fieldName="qty" onResult={handleQtySpeech} speech={speech} />
          </div>
        </div>
      </div>

      {/* Discount */}
      {showDiscountField && (
        <div className="space-y-0.5">
          <label className="block text-[11px] font-bold uppercase text-gray-500 flex items-center justify-between">
            <span>Discount / Item</span>
            <span className="text-[9px] normal-case text-gray-500">Num* toggle</span>
          </label>
          <div className="flex gap-1.5">
            <div className="relative flex-1 min-w-0">
              <input
                ref={discountInputRef}
                type="number"
                min="0"
                value={form.discount}
                onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))}
                onFocus={(e) => setTimeout(() => e.target.select(), 10)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); } }}
                disabled={screenLocked}
                className={cn(
                  inputCls("discount"),
                  "font-semibold px-3 py-2 pr-8 text-sm",
                  discExceeded && "border-red-500 ring-1 ring-red-500/30",
                )}
              />
              <FieldMic fieldName="discount" onResult={handleDiscountSpeech} speech={speech} />
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, discountType: f.discountType === "fixed" ? "percent" : "fixed" }))}
              disabled={screenLocked}
              className={cn(
                "px-3 rounded-xl font-bold text-sm shrink-0",
                isDark ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
              )}
            >
              {form.discountType === "percent" ? "%" : "Rs"}
            </button>
          </div>
        </div>
      )}

      {/* Total Preview */}
      <AnimatePresence>
        {previewPrice > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center justify-between px-3 py-2 rounded-xl border text-sm font-semibold",
              discExceeded ? "bg-red-500/5 border-red-500/20 text-red-400" : "bg-green-500/5 border-green-500/20 text-green-400",
            )}
          >
            <span>Item Total:</span>
            <span className="font-mono font-bold text-[16px]">
              Rs.{previewTotal.toLocaleString()}
              {!discExceeded && " ✓"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Commission Preview */}
      <AnimatePresence>
        {salespersonEnabled && currentAgent && previewCommission > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center justify-between px-3 py-2 rounded-xl border text-sm",
              isDark ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700",
            )}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <UserCheck size={12} />
              <span className="truncate font-medium">{currentAgent.name}</span>
            </span>
            <span className="font-mono font-bold text-[14px]">+Rs.{previewCommission.toLocaleString()}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <hr className={isDark ? "border-yellow-500/10" : "border-yellow-100"} />

      {/* Customer Section */}
      <div className={cn(
        "rounded-xl border p-2.5 space-y-2",
        isDark ? "border-yellow-500/20 bg-[#100f0b]" : "border-yellow-200 bg-white",
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={13} className="text-yellow-500" />
            <span className="text-[11px] font-bold uppercase text-gray-500">Customer</span>
          </div>
          <button
            type="button"
            onClick={onOpenCustomerDialog}
            className={cn(
              "rounded-lg border px-2 py-1",
              isDark ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400" : "border-yellow-200 bg-yellow-50 text-yellow-700",
            )}
          >
            <User size={12} />
          </button>
        </div>

        {/* Name */}
        <div className="space-y-0.5">
          <label className="block text-[10px] font-bold uppercase text-gray-500">Customer Name</label>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={nameInputRef}
              type="text"
              value={custNameSearch || customer?.name || ""}
              onChange={(e) => onNameChange?.(e.target.value)}
              onFocus={() => {
                onSetActiveField?.("name");
                const v = custNameSearch || customer?.name || "";
                if (v.length >= 2 && v !== "Walking Customer") onDoSearch?.(v);
              }}
              onBlur={() => setTimeout(() => { if (activeField === "name") { onSetShowSug?.(false); onSetActiveField?.(""); } }, 200)}
              disabled={screenLocked}
              placeholder="Walking Customer"
              className={cn(inputCls("customerName"), "pl-8 pr-8 py-2 text-sm")}
            />
            <FieldMic fieldName="customerName" onResult={handleCustNameSpeech} speech={speech} />
          </div>

          <AnimatePresence>
            {showSug && activeField === "name" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "rounded-xl border shadow-xl max-h-40 overflow-y-auto mt-1 absolute z-50 w-full",
                  isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200",
                )}
              >
                {sugLoading ? (
                  <div className="flex items-center justify-center py-2.5 gap-2">
                    <Loader2 size={13} className="animate-spin text-yellow-500" />
                    <span className="text-xs text-gray-400">Searching...</span>
                  </div>
                ) : custSuggestions.length > 0 ? (
                  custSuggestions.map((c, i) => (
                    <button
                      key={i}
                      onMouseDown={() => onSelectSuggestion?.(c)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm border-b last:border-0",
                        isDark ? "text-white border-yellow-500/10 hover:bg-yellow-500/10" : "text-gray-900 border-gray-100 hover:bg-yellow-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{c.name || "No Name"}</span>
                        {c.phone && <span className="text-xs font-mono text-yellow-400">{c.phone}</span>}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-center text-gray-500">No record</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Phone */}
        <div className="space-y-0.5">
          <label className="block text-[10px] font-bold uppercase text-gray-500">Phone</label>
          <div className="relative">
            <input
              ref={phoneInputRef}
              type="tel"
              inputMode="numeric"
              value={custPhoneSearch || ""}
              onChange={(e) => {
                let v = e.target.value.replace(/[^0-9+]/g, "");
                if (v.startsWith("+92")) v = "0" + v.slice(3);
                else if (v.startsWith("92") && v.length > 10) v = "0" + v.slice(2);
                onPhoneChange?.(v);
              }}
              onFocus={() => {
                onSetActiveField?.("phone");
                if ((custPhoneSearch || "").length >= 3) onDoSearch?.(custPhoneSearch);
              }}
              onBlur={() => setTimeout(() => { if (activeField === "phone") { onSetShowSug?.(false); onSetActiveField?.(""); } }, 200)}
              disabled={screenLocked}
              placeholder="03XX-XXXXXXX"
              maxLength={12}
              className={cn(inputCls("phone"), "px-3 py-2 pr-8 text-sm")}
            />
            <FieldMic fieldName="phone" onResult={handlePhoneSpeech} speech={speech} />
          </div>
        </div>

        {/* City + Market */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">City</label>
            <select
              value={customer?.city || "Karachi"}
              onChange={(e) => onCityChange?.(e.target.value)}
              disabled={screenLocked}
              className={cn(
                "w-full rounded-xl border px-2 py-1.5 text-xs outline-none cursor-pointer",
                isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
                "disabled:opacity-50",
              )}
            >
              {BASE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Market</label>
            <select
              value={customer?.market || ""}
              onChange={(e) => onMarketChange?.(e.target.value)}
              disabled={screenLocked}
              className={cn(
                "w-full rounded-xl border px-2 py-1.5 text-xs outline-none cursor-pointer",
                isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
                "disabled:opacity-50",
              )}
            >
              <option value="">— Select —</option>
              {(CITY_MARKETS[customer?.city || "Karachi"] || []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Clear */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              onNameChange?.("Walking Customer");
              onPhoneChange?.("");
              onCityChange?.("Karachi");
              onMarketChange?.("");
            }}
            className="text-[10px] flex items-center gap-1 text-red-400/60 hover:text-red-400"
          >
            <X size={10} /> Clear <span className="text-[9px] text-gray-500">Ctrl+Shift+C</span>
          </button>
        </div>
      </div>

      {/* Add Item Button */}
      <motion.button
        type="button"
        onClick={onAddItem}
        disabled={screenLocked || (salespersonEnabled && salespersonMultiple && salespersonRequired && !currentSPId && hasAgents)}
        whileTap={{ scale: 0.97 }}
        className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-black text-sm bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 shadow-lg shadow-amber-500/20"
      >
        <Plus size={15} />
        <span>Add Item (Enter)</span>
      </motion.button>

      {lastEntryPrice && (
        <p className="text-center text-[10px] text-gray-500">
          ↵ Rs.{lastEntryPrice}
          {lastEntryDiscount > 0 && ` −${lastEntryDiscount}${lastEntryDiscountType === "percent" ? "%" : ""}`}
          {" "}×{lastEntryQty} · qty+Enter to dup
        </p>
      )}
    </motion.div>
  );
});

ItemEntryForm.displayName = "ItemEntryForm";
export default ItemEntryForm;