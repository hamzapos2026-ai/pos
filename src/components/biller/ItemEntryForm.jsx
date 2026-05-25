// src/components/biller/ItemEntryForm.jsx
// ✅ FIXED FINAL v5
// 🔧 FIX-B-06: City + Market fields added + properly wired
// 🔧 FIX-B-07: productNameRef split from nameInputRef
// 🔧 FIX-B-12: previewDiscAmt capped for fixed type
// 🔧 FIX-B-13: +92 phone normalization
// 🔧 FIX-B-15: Duplicate last-entry hint removed
// 🔧 FIX-SYNTAX-1: FieldTranscript component restored
// 🔧 FIX-SYNTAX-2: Duplicate props block removed
// 🔧 FIX-SYNTAX-3: Extra }} bracket removed
// 🔧 FIX-SYNTAX-4: onCityChange/onMarketChange in correct props
// 🔧 FIX-KEY-1: numpad* → numpadMultiply
// 🔧 FIX-CLEAR-1: Clear customer resets city+market

import {
  useState, useCallback, useEffect, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Mic,
  User, Phone, X,
  Search, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";
import {
  isSpeechSupported,
  parseSpokenNumber,
  parseDiscount,
} from "../../hooks/useSpeech";
import { useSound } from "../../hooks/useSound";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

// 🔧 FIX-B-06: City → Markets map
const CITY_MARKETS = {
  Karachi:    ["Saddar","Tariq Road","Hyderi","Clifton","Garden","Bahadurabad"],
  Lahore:     ["Anarkali","Liberty","Mall Road","Gulberg","Johar Town","DHA"],
  Islamabad:  ["F-10 Markaz","G-9 Markaz","Blue Area","I-8 Markaz"],
  Rawalpindi: ["Raja Bazaar","Saddar","Commercial Market"],
  Faisalabad: ["D-Ground","Kohinoor","Chenab Market"],
  Multan:     ["Hussain Agahi","Gulgasht","Cantt"],
};
const BASE_CITIES = Object.keys(CITY_MARKETS);

// ── Animation variants ─────────────────────────────────────
const shakeVariants = {
  idle: { x: 0 },
  shake: {
    x: [0, -10, 10, -10, 10, -5, 5, 0],
    transition: { duration: 0.5 },
  },
};

// ══════════════════════════════════════════════════════════════
// 🔧 FIX-SYNTAX-1: FieldMic — restored complete
// ══════════════════════════════════════════════════════════════
const FieldMic = memo(({ fieldName, onResult, speech }) => {
  const isSpeechEnabled = speech?.isSpeechEnabled;
  const isListening     = speech?.isListening;
  const activeField     = speech?.activeField;
  const startListening  = speech?.startListening;

  if (!isSpeechEnabled || !isSpeechSupported) return null;

  const isThisField  = isListening && activeField === fieldName;
  const isOtherField = isListening && activeField !== fieldName;

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.stopPropagation();
        startListening(fieldName, onResult);
      }}
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2",
        "w-5 h-5 flex items-center justify-center",
        "rounded-full transition-all z-10",
        isThisField
          ? "text-red-400 bg-red-500/20"
          : isOtherField
            ? "text-gray-500 opacity-30"
            : "text-gray-500 opacity-50 hover:opacity-100 hover:text-green-400",
      )}
    >
      {isThisField && (
        <span className="absolute inset-0 rounded-full border border-red-500 animate-ping opacity-75" />
      )}
      <Mic size={10} />
    </motion.button>
  );
});
FieldMic.displayName = "FieldMic";

// ══════════════════════════════════════════════════════════════
// 🔧 FIX-SYNTAX-1: FieldTranscript — restored complete
// ══════════════════════════════════════════════════════════════
const FieldTranscript = memo(({ fieldName, speech }) => {
  const isListening = speech?.isListening;
  const activeField = speech?.activeField;
  const transcript  = speech?.transcript;
  const show = isListening && activeField === fieldName && transcript;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <p className="text-amber-400 text-xs italic mt-0.5 px-1">
            🎤 &ldquo;{transcript}&rdquo;
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
FieldTranscript.displayName = "FieldTranscript";

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT — 🔧 FIX-SYNTAX-2: Single clean props block
// ══════════════════════════════════════════════════════════════
const ItemEntryForm = memo(({
  // Form state
  form,
  setForm,
  // Tab state
  screenLocked,
  currentBillSerial,
  billStartTime,
  customer,
  custNameSearch,
  custPhoneSearch,
  // Settings
  showProductName = false,
  showDiscountField = false,
  billerFontSize = 16,
  isDark = true,
  // Last entry hint
  lastEntryPrice = "",
  lastEntryQty = 1,
  lastEntryDiscount = 0,
  lastEntryDiscountType = "fixed",
  // Suggestions
  custSuggestions = [],
  showSug = false,
  sugLoading = false,
  activeField = "",
  // Callbacks
  onAddItem,
  onNameChange,
  onPhoneChange,
  onCityChange,       // 🔧 FIX-B-06: city callback
  onMarketChange,     // 🔧 FIX-B-06: market callback
  onSelectSuggestion,
  onOpenCustomerDialog,
  onFormQtyChange,
  onSetActiveField,
  onSetShowSug,
  onDoSearch,
  // Format helper
  fmtTime,
  // Refs
  priceInputRef,
  qtyInputRef,
  phoneInputRef,
  discountInputRef,
  nameInputRef,       // → customer name field
  productNameRef,     // 🔧 FIX-B-07: separate ref for product name
  // Misc
  intentionalDupRef,
  speech,
}) => {
  const language = speech?.language || "en-US";
  const { playError } = useSound();
  const [shakeState, setShakeState] = useState("idle");
  const [fieldFlash, setFieldFlash] = useState("");

  const triggerShake = useCallback(() => {
    setShakeState("shake");
    playError();
    setTimeout(() => setShakeState("idle"), 600);
  }, [playError]);

  const flashField = useCallback((name) => {
    setFieldFlash(name);
    setTimeout(() => setFieldFlash(""), 800);
  }, []);

  // ── Input class helper ────────────────────────────────────
  const inputCls = useCallback((fieldName, extra = "") => cn(
    "w-full rounded-xl border px-3 py-2 text-sm outline-none",
    "focus:ring-2 focus:ring-yellow-500/30 transition-all pr-8",
    fieldFlash === fieldName
      ? "border-green-500 ring-1 ring-green-500/50"
      : isDark
        ? "border-yellow-500/20 bg-[#0f0d09] text-white"
        : "border-yellow-200 bg-white text-gray-900",
    "disabled:opacity-50",
    extra,
  ), [fieldFlash, isDark]);

  // ── Preview totals ────────────────────────────────────────
  const previewPrice = Number(form.price) || 0;
  const previewQty   = Number(form.qty)   || 1;
  const previewDisc  = Number(form.discount) || 0;
  const previewRaw   = previewPrice * previewQty;

  // 🔧 FIX-B-12: cap fixed discount
  const previewDiscAmt = form.discountType === "percent"
    ? Math.round(previewRaw * previewDisc / 100)
    : Math.min(previewDisc, previewRaw);

  const previewTotal = Math.max(0, previewRaw - previewDiscAmt);
  const discExceeded = previewPrice > 0 && previewDiscAmt > previewRaw;

  // ── Speech handlers ───────────────────────────────────────
  const handleNameSpeech = useCallback((val) => {
    setForm((p) => ({ ...p, productName: val }));
    flashField("productName");
    setTimeout(() => priceInputRef?.current?.focus(), 100);
  }, [setForm, flashField, priceInputRef]);

  const handlePriceSpeech = useCallback((val) => {
    const num = typeof val === "number"
      ? val : parseSpokenNumber(String(val), language);
    if (num !== null) {
      setForm((p) => ({ ...p, price: String(num) }));
      flashField("price");
      setTimeout(() => qtyInputRef?.current?.focus(), 100);
    }
  }, [setForm, flashField, language, qtyInputRef]);

  const handleQtySpeech = useCallback((val) => {
    const num = typeof val === "number"
      ? val : parseSpokenNumber(String(val), language);
    if (num !== null) {
      setForm((p) => ({ ...p, qty: Math.max(1, Math.round(num)) }));
      flashField("qty");
      setTimeout(() => discountInputRef?.current?.focus(), 100);
    }
  }, [setForm, flashField, language, discountInputRef]);

  const handleDiscountSpeech = useCallback((val) => {
    const parsed = typeof val === "string"
      ? parseDiscount(val, language) : null;
    if (parsed) {
      setForm((p) => ({
        ...p,
        discount: parsed.value,
        discountType: parsed.type === "percent" ? "percent" : "fixed",
      }));
      flashField("discount");
    } else {
      const num = typeof val === "number"
        ? val : parseSpokenNumber(String(val), language);
      if (num !== null) {
        setForm((p) => ({ ...p, discount: num }));
        flashField("discount");
      }
    }
  }, [setForm, flashField, language]);

  const handleCustNameSpeech = useCallback((val) => {
    onNameChange?.(val);
    flashField("customerName");
  }, [onNameChange, flashField]);

  const handlePhoneSpeech = useCallback((val) => {
    const digits = String(val).replace(/\D/g, "");
    onPhoneChange?.(digits);
    flashField("phone");
  }, [onPhoneChange, flashField]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useKeyboardShortcuts({
    // 🔧 FIX-B-07: F3 focuses productNameRef correctly
    f3: () => (productNameRef?.current || nameInputRef?.current)?.focus(),
    f4: () => priceInputRef?.current?.focus(),
    f5: () => { qtyInputRef?.current?.focus(); qtyInputRef?.current?.select(); },
    f6: () => discountInputRef?.current?.focus(),
    numpadDivide: () => {
      if (!showDiscountField) return;
      setTimeout(() => {
        discountInputRef?.current?.focus();
        discountInputRef?.current?.select();
      }, 10);
    },
    f7: () => setTimeout(() => phoneInputRef?.current?.focus(), 100),
    home: () => setTimeout(() => phoneInputRef?.current?.focus(), 100),

    // 🔧 FIX-KEY-1: numpadMultiply (not "numpad*")
    numpadMultiply: () => setForm((f) => ({
      ...f,
      discountType: f.discountType === "fixed" ? "percent" : "fixed",
    })),

    // 🔧 FIX-CLEAR-1: also reset city + market
    "ctrl+shift+c": () => {
      onNameChange?.("Walking Customer");
      onPhoneChange?.("");
      onCityChange?.("Karachi");
      onMarketChange?.("");
      toast.success("Customer info cleared");
    },
  }, !screenLocked);

  // ── Render ────────────────────────────────────────────────
  return (
    <motion.div
      variants={shakeVariants}
      animate={shakeState}
      className="flex flex-col gap-1.5"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={14} className="text-yellow-500" />
          <h2 className="font-bold text-yellow-600 text-sm uppercase tracking-wide">
            ENTRY
          </h2>
        </div>
        <motion.span
          animate={{ scale: screenLocked ? 1 : [1, 1.05, 1] }}
          transition={{ repeat: screenLocked ? 0 : Infinity, duration: 2 }}
          className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            screenLocked ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600",
          )}
        >
          {screenLocked ? "LOCKED" : "ACTIVE"}
        </motion.span>
      </div>

      {/* Bill serial */}
      <div className={cn(
        "rounded-2xl border p-3",
        isDark ? "bg-yellow-500/5 border-yellow-500/20" : "bg-yellow-50 border-yellow-200",
      )}>
        <p className="text-[10px] uppercase tracking-wide text-gray-500">Bill Serial</p>
        <p className="text-xl font-bold text-yellow-400 font-mono tracking-wide">
          {currentBillSerial}
        </p>
        {billStartTime && (
          <p className="text-[10px] text-gray-500 mt-1">
            Started: {fmtTime?.(billStartTime) || "--:--:--"}
          </p>
        )}
      </div>

      {/* Product Name (optional) */}
      {showProductName && (
        <div className="space-y-0.5">
          <label className={cn(
            "block text-[10px] font-semibold uppercase",
            isDark ? "text-gray-400" : "text-gray-500",
          )}>
            Product Name *
          </label>
          <div className="relative">
            <input
              ref={productNameRef}
              type="text"
              value={form.productName}
              onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); }
              }}
              disabled={screenLocked}
              placeholder="Product name..."
              className={inputCls("productName")}
            />
            <FieldMic fieldName="productName" onResult={handleNameSpeech} speech={speech} />
          </div>
          <FieldTranscript fieldName="productName" speech={speech} />
        </div>
      )}

      {/* Price + Qty */}
      <div className="grid grid-cols-2 gap-1">
        {/* Price */}
        <div className="space-y-0.5">
          <label className={cn(
            "block text-[10px] font-semibold uppercase",
            isDark ? "text-gray-400" : "text-gray-500",
          )}>
            Price *
          </label>
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
                if (e.key === "+" || e.key === "Add") {
                  e.preventDefault();
                  qtyInputRef?.current?.focus();
                  qtyInputRef?.current?.select();
                  return;
                }
                const allowed = [
                  "Backspace","Delete","Tab","Escape","Enter",
                  "ArrowLeft","ArrowRight",
                ];
                if (
                  !allowed.includes(e.key) &&
                  !/^\d$/.test(e.key) &&
                  !((e.ctrlKey || e.metaKey) &&
                    ["a","c","v","x"].includes(e.key.toLowerCase()))
                ) e.preventDefault();
                if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); }
              }}
              placeholder={lastEntryPrice ? `↵ ${lastEntryPrice}` : "0"}
              disabled={screenLocked}
              style={{ fontSize: `${Math.max(billerFontSize + 8, 28)}px` }}
              className={cn(
                inputCls("price"),
                "font-bold px-4 py-3 pr-10",
                isDark
                  ? "border-yellow-500/30 text-yellow-400"
                  : "border-yellow-300 text-yellow-700",
              )}
            />
            <FieldMic fieldName="price" onResult={handlePriceSpeech} speech={speech} />
          </div>
          <FieldTranscript fieldName="price" speech={speech} />
        </div>

        {/* Qty */}
        <div className="space-y-0.5">
          <label className={cn(
            "block text-[10px] font-semibold uppercase",
            isDark ? "text-gray-400" : "text-gray-500",
          )}>
            Qty
          </label>
          <div className="relative">
            <input
              ref={qtyInputRef}
              type="text"
              inputMode="numeric"
              value={form.qty}
              onChange={(e) => {
                if (!screenLocked) onFormQtyChange?.(e.target.value);
              }}
              onFocus={(e) => e.target.select()}
              onClick={(e) => { e.target.focus(); e.target.select(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!screenLocked) onAddItem?.();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (!screenLocked)
                    setForm((p) => ({ ...p, qty: (Number(p.qty) || 1) + 1 }));
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (!screenLocked)
                    setForm((p) => ({ ...p, qty: Math.max(1, (Number(p.qty) || 1) - 1) }));
                }
              }}
              readOnly={screenLocked}
              style={{ fontSize: `${Math.max(billerFontSize + 4, 22)}px` }}
              className={cn(
                inputCls("qty"),
                "w-full text-center font-bold px-4 py-3",
                screenLocked ? "opacity-50 cursor-not-allowed" : "",
              )}
            />
            <FieldMic fieldName="qty" onResult={handleQtySpeech} speech={speech} />
          </div>
          <FieldTranscript fieldName="qty" speech={speech} />
        </div>
      </div>

      {/* Discount */}
      {showDiscountField && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-0.5"
        >
          <label className={cn(
            "block text-[10px] font-semibold uppercase",
            isDark ? "text-gray-400" : "text-gray-500",
          )}>
            Discount / Item
            <span className={cn(
              "ml-1 text-[9px] normal-case",
              isDark ? "text-gray-600" : "text-gray-400",
            )}>
              (Numpad* toggle)
            </span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={discountInputRef}
                type="number"
                min="0"
                value={form.discount}
                onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))}
                onFocus={(e) => setTimeout(() => e.target.select(), 10)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onAddItem?.(); }
                }}
                disabled={screenLocked}
                className={cn(
                  inputCls("discount"),
                  "font-semibold pr-8",
                  discExceeded && "border-red-500 ring-1 ring-red-500/30",
                )}
              />
              <FieldMic fieldName="discount" onResult={handleDiscountSpeech} speech={speech} />
            </div>
            <motion.button
              type="button"
              layout
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setForm((f) => ({
                ...f,
                discountType: f.discountType === "fixed" ? "percent" : "fixed",
              }))}
              disabled={screenLocked}
              className={cn(
                "px-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50",
                isDark
                  ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                  : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
              )}
            >
              {form.discountType === "percent" ? "%" : "Rs"}
            </motion.button>
          </div>
          <FieldTranscript fieldName="discount" speech={speech} />
          {discExceeded && (
            <p className="text-red-400 text-[10px] px-1">Discount exceeds item price</p>
          )}
        </motion.div>
      )}

      {/* Item Total Preview */}
      <AnimatePresence>
        {previewPrice > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={cn(
              "flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-medium",
              discExceeded
                ? "bg-red-500/5 border-red-500/20 text-red-400"
                : "bg-green-500/5 border-green-500/20 text-green-400",
            )}
          >
            <span>Item Total:</span>
            <motion.span
              key={previewTotal}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15 }}
              className="font-mono font-bold"
            >
              Rs.{previewTotal.toLocaleString()}
              {!discExceeded && " ✓"}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      <hr className={isDark ? "border-yellow-500/10" : "border-yellow-100"} />

      {/* Customer Section */}
      <div className={cn(
        "rounded-xl border px-3 py-3",
        isDark ? "border-yellow-500/20 bg-[#100f0b]" : "border-yellow-200 bg-white",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <User size={12} className={isDark ? "text-yellow-500" : "text-yellow-600"} />
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              isDark ? "text-gray-400" : "text-gray-500",
            )}>
              Customer
            </span>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onOpenCustomerDialog}
            className={cn(
              "rounded-xl border px-2.5 py-1 text-xs transition-colors",
              isDark
                ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                : "border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
            )}
          >
            <User size={12} />
          </motion.button>
        </div>

        <div className="space-y-2.5">
          {/* Customer Name */}
          <div className="space-y-0.5">
            <label className={cn(
              "block text-[10px] font-semibold uppercase",
              isDark ? "text-gray-400" : "text-gray-500",
            )}>
              Customer Name
            </label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
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
                onBlur={() =>
                  setTimeout(() => {
                    if (activeField === "name") {
                      onSetShowSug?.(false);
                      onSetActiveField?.("");
                    }
                  }, 200)
                }
                disabled={screenLocked}
                placeholder="Walking Customer"
                className={cn(inputCls("customerName"), "pl-8")}
              />
              <FieldMic fieldName="customerName" onResult={handleCustNameSpeech} speech={speech} />
            </div>
            <FieldTranscript fieldName="customerName" speech={speech} />

            {/* Name suggestions */}
            <AnimatePresence>
              {showSug && activeField === "name" && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  data-dropdown-open="true"
                  className={cn(
                    "rounded-xl border shadow-xl max-h-44 overflow-y-auto mt-1",
                    isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200",
                  )}
                >
                  {sugLoading ? (
                    <div className="flex items-center justify-center py-3 gap-2">
                      <Loader2 size={13} className="animate-spin text-yellow-500" />
                      <span className="text-xs text-gray-400">Searching...</span>
                    </div>
                  ) : custSuggestions.length > 0 ? (
                    custSuggestions.map((c, i) => (
                      <motion.button
                        key={c.id || i}
                        whileHover={{
                          backgroundColor: isDark
                            ? "rgba(234,179,8,0.1)"
                            : "rgba(254,249,195,0.5)",
                        }}
                        onMouseDown={() => onSelectSuggestion?.(c)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm",
                          "border-b last:border-0 transition-colors",
                          isDark
                            ? "text-white border-yellow-500/10"
                            : "text-gray-900 border-gray-100",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.name || "No Name"}</span>
                          {c.phone && (
                            <span className={cn(
                              "text-xs font-mono",
                              isDark ? "text-yellow-400" : "text-yellow-600",
                            )}>
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </motion.button>
                    ))
                  ) : (
                    <div className={cn(
                      "px-3 py-3 text-xs text-center",
                      isDark ? "text-gray-500" : "text-gray-400",
                    )}>
                      No record found
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Phone */}
          <div className="space-y-0.5">
            <label className={cn(
              "block text-[10px] font-semibold uppercase",
              isDark ? "text-gray-400" : "text-gray-500",
            )}>
              Phone (Home)
            </label>
            <div className="relative">
              <input
                ref={phoneInputRef}
                type="tel"
                inputMode="numeric"
                value={custPhoneSearch || ""}
                onChange={(e) => {
                  // 🔧 FIX-B-13: normalize +92 prefix
                  let v = e.target.value.replace(/[^0-9+]/g, "");
                  if (v.startsWith("+92")) v = "0" + v.slice(3);
                  else if (v.startsWith("92") && v.length > 10) v = "0" + v.slice(2);
                  onPhoneChange?.(v);
                }}
                onFocus={() => {
                  onSetActiveField?.("phone");
                  if ((custPhoneSearch || "").length >= 3) onDoSearch?.(custPhoneSearch);
                }}
                onBlur={() =>
                  setTimeout(() => {
                    if (activeField === "phone") {
                      onSetShowSug?.(false);
                      onSetActiveField?.("");
                    }
                  }, 200)
                }
                disabled={screenLocked}
                placeholder="03XX-XXXXXXX"
                maxLength={12}
                className={inputCls("phone")}
              />
              <FieldMic fieldName="phone" onResult={handlePhoneSpeech} speech={speech} />
            </div>
            <FieldTranscript fieldName="phone" speech={speech} />

            {/* Phone suggestions */}
            <AnimatePresence>
              {showSug && activeField === "phone" && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  data-dropdown-open="true"
                  className={cn(
                    "rounded-xl border shadow-xl max-h-44 overflow-y-auto mt-1",
                    isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200",
                  )}
                >
                  {sugLoading ? (
                    <div className="flex items-center justify-center py-3 gap-2">
                      <Loader2 size={13} className="animate-spin text-yellow-500" />
                      <span className="text-xs text-gray-400">Searching...</span>
                    </div>
                  ) : custSuggestions.length > 0 ? (
                    custSuggestions.map((c, i) => (
                      <motion.button
                        key={c.id || i}
                        whileHover={{
                          backgroundColor: isDark
                            ? "rgba(234,179,8,0.1)"
                            : "rgba(254,249,195,0.5)",
                        }}
                        onMouseDown={() => onSelectSuggestion?.(c)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm border-b last:border-0",
                          isDark
                            ? "text-white border-yellow-500/10"
                            : "text-gray-900 border-gray-100",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-xs font-mono font-bold",
                            isDark ? "text-yellow-400" : "text-yellow-600",
                          )}>
                            {c.phone}
                          </span>
                          <span className="font-medium">{c.name || "No Name"}</span>
                        </div>
                      </motion.button>
                    ))
                  ) : (
                    <div className={cn(
                      "px-3 py-3 text-xs text-center",
                      isDark ? "text-gray-500" : "text-gray-400",
                    )}>
                      No record found
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 🔧 FIX-B-06: City + Market fields */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <label className={cn(
                "block text-[10px] font-semibold uppercase",
                isDark ? "text-gray-400" : "text-gray-500",
              )}>
                City
              </label>
              <select
                value={customer?.city || "Karachi"}
                onChange={(e) => onCityChange?.(e.target.value)}
                disabled={screenLocked}
                className={cn(
                  "w-full rounded-xl border px-2 py-1.5 text-xs outline-none",
                  "focus:ring-2 focus:ring-yellow-500/30 transition-all cursor-pointer",
                  isDark
                    ? "border-yellow-500/20 bg-[#0f0d09] text-white"
                    : "border-yellow-200 bg-white text-gray-900",
                  "disabled:opacity-50",
                )}
              >
                {BASE_CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className={cn(
                "block text-[10px] font-semibold uppercase",
                isDark ? "text-gray-400" : "text-gray-500",
              )}>
                Market
              </label>
              <select
                value={customer?.market || ""}
                onChange={(e) => onMarketChange?.(e.target.value)}
                disabled={screenLocked}
                className={cn(
                  "w-full rounded-xl border px-2 py-1.5 text-xs outline-none",
                  "focus:ring-2 focus:ring-yellow-500/30 transition-all cursor-pointer",
                  isDark
                    ? "border-yellow-500/20 bg-[#0f0d09] text-white"
                    : "border-yellow-200 bg-white text-gray-900",
                  "disabled:opacity-50",
                )}
              >
                <option value="">— Select Market —</option>
                {(CITY_MARKETS[customer?.city || "Karachi"] || []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 🔧 FIX-CLEAR-1: Clear customer resets city+market too */}
          <div className="flex justify-end">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onNameChange?.("Walking Customer");
                onPhoneChange?.("");
                onCityChange?.("Karachi");
                onMarketChange?.("");
              }}
              className={cn(
                "text-xs flex items-center gap-1 transition-colors",
                isDark
                  ? "text-red-400/60 hover:text-red-400"
                  : "text-red-400/60 hover:text-red-500",
              )}
            >
              <X size={10} />
              Clear Customer
              <span className={cn(
                "text-[9px]",
                isDark ? "text-gray-600" : "text-gray-400",
              )}>
                Ctrl+Shift+C
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Add Item Button */}
      <motion.button
        type="button"
        onClick={onAddItem}
        disabled={screenLocked}
        whileHover={{ scale: screenLocked ? 1 : 1.02 }}
        whileTap={{ scale: screenLocked ? 1 : 0.97 }}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "rounded-xl px-4 py-2.5 font-bold text-black text-sm",
          "bg-gradient-to-r from-yellow-500 to-amber-500",
          "hover:from-yellow-400 hover:to-amber-400",
          "disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20",
        )}
      >
        <Plus size={14} />
        <span>+ Add Item (Enter)</span>
      </motion.button>

      {/* 🔧 FIX-B-15: Last entry hint — ONLY here, NOT inside button */}
      <AnimatePresence>
        {lastEntryPrice && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-[10px] text-gray-400"
          >
            ↵ Rs.{lastEntryPrice}
            {lastEntryDiscount > 0 &&
              ` −${lastEntryDiscount}${lastEntryDiscountType === "percent" ? "%" : ""}`
            }
            {" "}×{lastEntryQty}
            {" · type qty + Enter to duplicate"}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ItemEntryForm.displayName = "ItemEntryForm";
export default ItemEntryForm;