// src/components/biller/CustomerDialog.jsx
// ✅ MASTER ARCHITECTURE v8 — All features preserved + enhanced
// ✅ FIXED: BroadcastChannel F8 notification to parent
// ✅ FIXED: ESC persistence notification
// ═══════════════════════════════════════════════════════════════

import {
  useState, useEffect, useRef,
  useCallback, useMemo, memo,
} from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, Phone, MapPin, Store,
  Plus, UserPlus, Loader2, AlertCircle,
  Check, Globe, Mic, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../hooks/useLanguage";
import { cn } from "../../utils/cn";
import {
  doc, setDoc, serverTimestamp,
  collection, query, where, getDocs, limit,
} from "firebase/firestore";
import { db } from "../../services/firebase";

// ═══════════════════════════════════════════════════════════════
// BROADCAST CHANNEL — F8/ESC notification to parent
// ═══════════════════════════════════════════════════════════════
const BILLING_CHANNEL = 'aone_pos_billing';

const broadcastEvent = (type, data) => {
  try {
    const ch = new BroadcastChannel(BILLING_CHANNEL);
    ch.postMessage({ type, ...data, timestamp: Date.now() });
    ch.close();
  } catch { /* ignore */ }
};

// ═══════════════════════════════════════════════════════════════
// PHONE UTILITIES
// ═══════════════════════════════════════════════════════════════
export const normalizePhone = (input = "") => {
  if (!input) return "";
  let d = String(input).replace(/\D/g, "");
  if (d.startsWith("0092")) d = "0" + d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = "0" + d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = "0" + d;
  return d;
};

const PK_PHONE = /^03[0-9]{9}$/;
const INTL_PHONE = /^\+?[1-9][0-9]{6,14}$/;

const validatePhone = (raw, allowIntl = false) => {
  if (!raw) return null;
  const norm = normalizePhone(raw);
  const rawTrim = String(raw).trim().replace(/[\s\-()]/g, "");
  if (PK_PHONE.test(norm)) return { valid: true, normalized: norm, type: "pk" };
  if (allowIntl && INTL_PHONE.test(rawTrim)) return { valid: true, normalized: rawTrim, type: "intl" };
  if (norm.length > 0 && norm.length < 11) return { valid: false, reason: "short" };
  return { valid: false, reason: "format" };
};

// ═══════════════════════════════════════════════════════════════
// CUSTOMER VALIDATORS
// ═══════════════════════════════════════════════════════════════
export const isValidCustomer = (c) => {
  if (!c) return false;
  const name = (c.name || "").trim();
  const phone = (c.phone || "").trim();
  if (!name && !phone) return false;
  if (/^Walking\s*Customer$/i.test(name) && !phone) return false;
  if (/^Walk-in$/i.test(name) && !phone) return false;
  return true;
};

export const isDisplayableCustomer = (c) => {
  if (!isValidCustomer(c)) return false;
  const name = (c.name || "").trim();
  if (/^Customer_\d+$/i.test(name) && !(c.phone || "").trim()) return false;
  return true;
};

// ═══════════════════════════════════════════════════════════════
// CITIES / MARKETS DATA
// ═══════════════════════════════════════════════════════════════
const CITY_MARKETS = {
  Karachi: ["Saddar", "Tariq Road", "Hyderi", "Clifton", "Garden", "Bahadurabad", "Gulshan"],
  Lahore: ["Anarkali", "Liberty", "Mall Road", "Gulberg", "Johar", "Shalimar", "DHA"],
  Islamabad: ["F-10 Markaz", "G-9 Markaz", "Blue Area", "I-8 Markaz"],
  Rawalpindi: ["Raja Bazaar", "Saddar", "Commercial Market"],
  Faisalabad: ["D-Ground", "Kohinoor", "Chenab Market"],
  Multan: ["Hussain Agahi", "Gulgasht", "Cantt"],
};

const BASE_CITIES = [
  ...Object.keys(CITY_MARKETS),
  "Peshawar", "Quetta", "Sialkot", "Gujranwala",
  "Hyderabad", "Bahawalpur", "Sargodha",
].sort();

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE LAYER
// ═══════════════════════════════════════════════════════════════
const _mem = new Map();
const _sKey = (billId) => `cd_v7:${billId || "default"}`;

export const persistCustomer = (data, billId) => {
  if (!billId) return;
  const name = (data?.name || "").trim();
  const phone = (data?.phone || "").trim();
  if (!name && !phone) return;
  const payload = {
    name, phone,
    city: data?.city || "Karachi",
    market: data?.market || "",
    _savedAt: Date.now(),
  };
  _mem.set(billId, payload);
  try { sessionStorage.setItem(_sKey(billId), JSON.stringify(payload)); } catch {}
  try { localStorage.setItem(_sKey(billId), JSON.stringify(payload)); } catch {}
};

export const getPersistedCustomer = (billId) => {
  if (!billId) return null;
  if (_mem.has(billId)) return _mem.get(billId);
  try {
    const raw = sessionStorage.getItem(_sKey(billId));
    if (raw) { const p = JSON.parse(raw); _mem.set(billId, p); return p; }
  } catch {}
  try {
    const raw = localStorage.getItem(_sKey(billId));
    if (raw) { const p = JSON.parse(raw); _mem.set(billId, p); return p; }
  } catch {}
  return null;
};

export const resetPersistedCustomer = (billId) => {
  if (!billId) return;
  _mem.delete(billId);
  try { sessionStorage.removeItem(_sKey(billId)); } catch {}
  try { localStorage.removeItem(_sKey(billId)); } catch {}
};

// ═══════════════════════════════════════════════════════════════
// CUSTOMER CACHE
// ═══════════════════════════════════════════════════════════════
const _caches = {};
const CACHE_TTL = 90_000;

const _getCache = (sid) => {
  if (!_caches[sid])
    _caches[sid] = { items: [], byPhone: new Map(), byId: new Map(), loaded: false, loadedAt: 0, loading: false };
  return _caches[sid];
};

const _cacheUpsert = (raw, storeId) => {
  if (!raw || !isValidCustomer(raw)) return null;
  const cache = _getCache(storeId || "default");
  const phone = normalizePhone(raw.phone || "");
  const name = (raw.name || "").trim();
  const id = raw.id || "";
  if (!phone && !name) return null;

  if (phone && cache.byPhone.has(phone)) {
    const ex = cache.byPhone.get(phone);
    if (name) ex.name = name;
    if (raw.city) ex.city = raw.city;
    if (raw.market) ex.market = raw.market;
    if (id) { ex.id = id; cache.byId.set(id, ex); }
    return ex;
  }

  const entry = {
    id: id || `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name, phone,
    city: raw.city || "",
    market: raw.market || "",
  };
  cache.items.unshift(entry);
  if (phone) cache.byPhone.set(phone, entry);
  if (id) cache.byId.set(id, entry);
  return entry;
};

export const cacheLoad = async (storeId, force = false) => {
  const sid = storeId || "default";
  const cache = _getCache(sid);
  if (!force && cache.loaded && Date.now() - cache.loadedAt < CACHE_TTL) return true;
  if (cache.loading) {
    let n = 0;
    while (cache.loading && n++ < 30) await new Promise((r) => setTimeout(r, 100));
    return cache.loaded;
  }
  cache.loading = true;
  try {
    const snap = await getDocs(query(collection(db, "customers"), where("storeId", "==", sid), limit(2000)));
    cache.items = []; cache.byPhone = new Map(); cache.byId = new Map();
    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      if (isValidCustomer(data)) _cacheUpsert(data, sid);
    });
    cache.loaded = true; cache.loadedAt = Date.now();
    return true;
  } catch { return false; }
  finally { cache.loading = false; }
};

export const cacheSearch = (term, storeId) => {
  if (!term || term.trim().length < 2) return [];
  const cache = _getCache(storeId || "default");
  const lower = term.toLowerCase().trim();
  const digits = term.replace(/\D/g, "");
  const isPhone = digits.length >= 3;
  const out = [], seen = new Set();
  for (const c of cache.items) {
    if (out.length >= 15) break;
    if (!isValidCustomer(c)) continue;
    const cP = (c.phone || "").replace(/\D/g, "");
    const cN = (c.name || "").toLowerCase();
    let ok = false;
    if (isPhone && cP) ok = cP.startsWith(digits) || cP.includes(digits);
    if (!ok && lower.length >= 2 && cN) ok = cN.includes(lower);
    if (ok) {
      const key = cP || cN || c.id;
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    }
  }
  return out;
};

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

const SugItem = memo(({ c, onSelect, isDark, isHighlighted }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
    className={cn(
      "w-full text-left px-3 py-2.5 text-sm border-b last:border-0 transition-colors",
      isHighlighted
        ? isDark ? "bg-yellow-500/20 text-white" : "bg-yellow-100 text-gray-900"
        : isDark ? "hover:bg-yellow-500/10 text-white border-yellow-500/10" : "hover:bg-yellow-50 text-gray-900 border-gray-100",
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <User size={11} className={cn("shrink-0", isDark ? "text-yellow-500/50" : "text-yellow-400")} />
        <span className="font-semibold truncate">{c.name || "No Name"}</span>
      </div>
      {c.phone && (
        <span className={cn("font-mono text-xs shrink-0 font-bold px-1.5 py-0.5 rounded", isDark ? "text-yellow-400 bg-yellow-500/10" : "text-yellow-700 bg-yellow-50")}>
          {c.phone}
        </span>
      )}
    </div>
    {(c.city || c.market) && (
      <p className={cn("text-[10px] mt-0.5 flex items-center gap-1 ml-5", isDark ? "text-gray-500" : "text-gray-400")}>
        <MapPin size={8} />{[c.city, c.market].filter(Boolean).join(" • ")}
      </p>
    )}
  </button>
));
SugItem.displayName = "SugItem";

const FieldMic = memo(({ fieldName, speech, isDark, onResult }) => {
  if (!speech?.isSpeechEnabled) return null;
  const isActive = speech.isListening && speech.activeField === fieldName;
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => speech.startListening(fieldName, onResult)}
      className={cn(
        "absolute right-2.5 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full transition-all",
        isActive ? "bg-red-500/20 text-red-400" : isDark ? "bg-yellow-500/10 text-yellow-500/50 hover:text-yellow-500" : "bg-yellow-100 text-yellow-400 hover:text-yellow-600",
      )}
    >
      {isActive && <span className="absolute inset-0 rounded-full border border-red-500 animate-ping opacity-75" />}
      <Mic size={11} />
    </motion.button>
  );
});
FieldMic.displayName = "FieldMic";

const CustomDropdown = memo(({ value, options, onChange, onAddNew, placeholder, Icon, isDark, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between rounded-xl border px-3 py-2 text-sm text-left transition-all disabled:opacity-50",
          isOpen && "ring-2 ring-yellow-500/30",
          isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
        )}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={12} className={isDark ? "text-yellow-500" : "text-yellow-600"} />}
          <span className={!value ? (isDark ? "text-gray-600" : "text-gray-400") : ""}>{value || placeholder}</span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: "spring", damping: 20 }}>
          <ChevronDown size={12} className={isDark ? "text-gray-500" : "text-gray-400"} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={cn("absolute top-full left-0 right-0 z-[500] mt-1 rounded-xl border shadow-2xl max-h-48 overflow-y-auto", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors",
                  value === opt ? isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700" : isDark ? "text-gray-300 hover:bg-yellow-500/5 border-yellow-500/10" : "text-gray-700 hover:bg-yellow-50 border-gray-100",
                )}
              >
                {opt}
              </button>
            ))}
            {onAddNew && (
              <div className={cn("border-t px-2 py-2", isDark ? "border-yellow-500/10" : "border-gray-100")}>
                {showAdd ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newVal}
                      autoFocus
                      onChange={(e) => setNewVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newVal.trim()) { onAddNew(newVal.trim()); onChange(newVal.trim()); setNewVal(""); setShowAdd(false); setIsOpen(false); }
                        if (e.key === "Escape") setShowAdd(false);
                      }}
                      placeholder="Type new..."
                      className={cn("flex-1 rounded-lg border px-2 py-1 text-xs outline-none", isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900")}
                    />
                    <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => { if (newVal.trim()) { onAddNew(newVal.trim()); onChange(newVal.trim()); setNewVal(""); setShowAdd(false); setIsOpen(false); } }} className="rounded-lg bg-yellow-500 text-black px-2 py-1">
                      <Check size={10} />
                    </motion.button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAdd(true)} className={cn("w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-colors", isDark ? "text-yellow-500 hover:bg-yellow-500/10" : "text-yellow-600 hover:bg-yellow-50")}>
                    <Plus size={10} /> Add New
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
CustomDropdown.displayName = "CustomDropdown";

// ═══════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════
const overlayVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const cardVariants = {
  initial: { scale: 0.93, opacity: 0, y: 20 },
  animate: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", damping: 25, stiffness: 300 } },
  exit: { scale: 0.93, opacity: 0, y: 10, transition: { duration: 0.15 } },
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const CustomerDialog = ({
  isOpen,
  initialCustomer,
  onSubmit,
  onClose,
  runtimeCities = [],
  runtimeMarkets = [],
  onAddCity,
  onAddMarket,
  isSuperAdmin,
  storeId,
  billerId,
  billId,
  speech = null,
}) => {
  const { isDark } = useTheme();
  const { t, dir } = useLanguage();
  const phoneRef = useRef(null);
  const nameRef = useRef(null);
  const submittedRef = useRef(false);
  const searchTimer = useRef(null);
  const persistTimer = useRef(null);
  const prevCityRef = useRef("Karachi");
  const activeFieldRef = useRef("");
  const billIdRef = useRef(billId);
  const storeIdRef = useRef(storeId);

  useEffect(() => { billIdRef.current = billId; }, [billId]);
  useEffect(() => { storeIdRef.current = storeId; }, [storeId]);

  // ── react-hook-form ──────────────────────────────────────
  const { register, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: { name: "", phone: "", city: "Karachi", market: "" },
  });
  const form = watch();

  // ── State ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [cacheReady, setCacheReady] = useState(false);
  const [allowIntl, setAllowIntl] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [recentCusts, setRecentCusts] = useState([]);

  useEffect(() => { activeFieldRef.current = activeField; }, [activeField]);

  const allCities = useMemo(() => [...new Set([...BASE_CITIES, ...runtimeCities])].sort(), [runtimeCities]);
  const allMarkets = useMemo(() => [...new Set([...(CITY_MARKETS[form.city] || []), ...runtimeMarkets])], [form.city, runtimeMarkets]);

  const refreshRecent = useCallback((sid) => {
    setRecentCusts(_getCache(sid || "default").items.filter(isDisplayableCustomer).slice(0, 8));
  }, []);

  // ── Restore on open ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const bid = billIdRef.current;
    const sid = storeIdRef.current || "default";

    submittedRef.current = false;
    setSaveOk(false); setSuggestions([]); setShowSug(false); setHighlighted(-1);
    setCacheReady(false); setPhoneStatus(null);

    const persisted = getPersistedCustomer(bid);
    const source = persisted?.name || persisted?.phone ? persisted : (initialCustomer || {});

    let restored = {
      name: source.name || "",
      phone: source.phone || "",
      city: source.city || "Karachi",
      market: source.market || "",
    };

    // Auto-clear walking customer placeholder
    if (/^Walking\s*Customer$/i.test(restored.name)) restored.name = "";
    if (/^Walk-in$/i.test(restored.name)) restored.name = "";

    reset(restored);
    prevCityRef.current = restored.city;
    setActiveField("");

    setTimeout(() => {
      if (!restored.phone) phoneRef.current?.focus();
      else nameRef.current?.focus();
    }, 200);

    cacheLoad(sid).then(() => { setCacheReady(true); refreshRecent(sid); }).catch(() => setCacheReady(true));
  }, [isOpen, initialCustomer, reset, refreshRecent]);

  // City change → reset market
  useEffect(() => {
    if (form.city !== prevCityRef.current) {
      prevCityRef.current = form.city;
      setValue("market", "");
    }
  }, [form.city, setValue]);

  // Runtime persist on every change
  const doPersist = useCallback((data) => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { persistCustomer(data, billIdRef.current); }, 100);
  }, []);

  useEffect(() => { if (isOpen) doPersist(form); }, [form, isOpen, doPersist]);
  useEffect(() => () => { clearTimeout(searchTimer.current); clearTimeout(persistTimer.current); }, []);

  // ── Search ───────────────────────────────────────────────
  const doSearch = useCallback(async (term) => {
    if ((term || "").trim().length < 2) { setSuggestions([]); setShowSug(false); setSugLoading(false); return; }
    const sid = storeIdRef.current || "default";
    const hits = cacheSearch(term, sid);
    if (hits.length > 0) { setSuggestions(hits); setShowSug(true); setSugLoading(false); return; }
    setSugLoading(true); setShowSug(true);
    await cacheLoad(sid, false);
    const hits2 = cacheSearch(term, sid);
    setSuggestions(hits2);
    setShowSug(hits2.length > 0);
    setSugLoading(false);
    setHighlighted(-1);
  }, []);

  // ── Phone change ─────────────────────────────────────────
  const handlePhoneChange = useCallback((value) => {
    const clean = allowIntl ? value.replace(/[^0-9+]/g, "").replace(/(?!^\+)\+/g, "") : value.replace(/\D/g, "");
    setValue("phone", clean);
    setPhoneStatus(null);
    setActiveField("phone");
    setHighlighted(-1);
    clearTimeout(searchTimer.current);
    const norm = normalizePhone(clean);
    if (!norm) { setSuggestions([]); setShowSug(false); return; }
    if (norm.length >= 11) {
      const v = validatePhone(clean, allowIntl);
      if (!v?.valid) { setPhoneStatus("invalid"); setShowSug(false); return; }
      searchTimer.current = setTimeout(() => {
        const sid = storeIdRef.current || "default";
        const cached = _getCache(sid).byPhone.get(v.normalized);
        if (cached) {
          if (cached.name) setValue("name", cached.name);
          if (cached.city) setValue("city", cached.city);
          if (cached.market) setValue("market", cached.market);
          setPhoneStatus("found"); setShowSug(false);
        } else {
          setPhoneStatus("not_found"); setShowSug(false);
        }
      }, 100);
    } else if (norm.length >= 3) {
      searchTimer.current = setTimeout(() => doSearch(norm), 150);
    } else { setSuggestions([]); setShowSug(false); }
  }, [doSearch, allowIntl, setValue]);

  // ── Name change ──────────────────────────────────────────
  const handleNameChange = useCallback((value) => {
    setValue("name", value);
    setActiveField("name");
    setHighlighted(-1);
    clearTimeout(searchTimer.current);
    if (value.length >= 2) searchTimer.current = setTimeout(() => doSearch(value), 150);
    else { setSuggestions([]); setShowSug(false); }
  }, [doSearch, setValue]);

  // ── Pick suggestion ──────────────────────────────────────
  const pickCustomer = useCallback((c) => {
    const phone = normalizePhone(c.phone || "") || c.phone || "";
    reset({ name: c.name || "", phone, city: c.city || "Karachi", market: c.market || "" });
    prevCityRef.current = c.city || "Karachi";
    setPhoneStatus(phone ? "found" : null);
    setShowSug(false); setSuggestions([]);
    setActiveField(""); setHighlighted(-1);
  }, [reset]);

  // ── Form submit ──────────────────────────────────────────
  const onFormSubmit = useCallback((data) => {
    if (submittedRef.current) return;
    const v = data.phone ? validatePhone(data.phone, allowIntl) : null;
    if (v && !v.valid) { setPhoneStatus("invalid"); return; }
    submittedRef.current = true;

    const finalData = {
      name: (data.name || "").trim(),
      phone: normalizePhone(data.phone),
      city: data.city || "Karachi",
      market: data.market || "",
    };

    persistCustomer(finalData, billIdRef.current);

    // ✅ BROADCAST: F8 submitted — customer saved
    broadcastEvent('CUSTOMER_SAVED', { customer: finalData, billId: billIdRef.current });

    onSubmit?.(finalData);
    setTimeout(() => { submittedRef.current = false; }, 1000);
  }, [onSubmit, allowIntl]);

  // ── Keyboard navigation ──────────────────────────────────
  const handleInputKeyDown = useCallback((e) => {
    if (showSug && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter" && highlighted >= 0 && suggestions[highlighted]) { e.preventDefault(); pickCustomer(suggestions[highlighted]); return; }
      if (e.key === "Escape") { e.stopPropagation(); setShowSug(false); setHighlighted(-1); return; }
    }
    if (e.key === "Enter" && !showSug) { e.preventDefault(); handleSubmit(onFormSubmit)(); }
  }, [showSug, highlighted, suggestions, pickCustomer, handleSubmit, onFormSubmit]);

  // ── Global F8 / ESC ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "F8") {
        e.preventDefault(); e.stopPropagation();
        handleSubmit(onFormSubmit)();
        return;
      }
      if (e.key === "Escape") {
        if (showSug) { setShowSug(false); setHighlighted(-1); return; }
        e.preventDefault(); e.stopPropagation();
        persistCustomer(form, billIdRef.current);
        // ✅ BROADCAST: ESC pressed — customer dialog closed but data saved
        broadcastEvent('CUSTOMER_DIALOG_CLOSED', { customer: form, billId: billIdRef.current });
        onClose?.();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, handleSubmit, onFormSubmit, onClose, form, showSug]);

  // ── Save to DB ───────────────────────────────────────────
  const handleSaveOnly = useCallback(async () => {
    const name = (form.name || "").trim();
    const phone = normalizePhone(form.phone);
    if (!name && !phone) return;
    const v = form.phone ? validatePhone(form.phone, allowIntl) : null;
    if (v && !v.valid) { setPhoneStatus("invalid"); return; }
    setSaving(true);
    try {
      const sid = storeIdRef.current || "default";
      const docId = phone
        ? `${sid}_phone_${phone}`
        : `${sid}_name_${name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40).toLowerCase()}`;
      await setDoc(doc(db, "customers", docId), {
        name, nameLower: name.toLowerCase(), phone, phoneNormalized: phone,
        city: form.city, market: form.market, storeId: sid,
        billerId: billerId || null, isWalking: false,
        updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      }, { merge: true });
      _cacheUpsert({ name, phone, city: form.city, market: form.market }, sid);
      setSaveOk(true);
      refreshRecent(sid);
      setTimeout(() => setSaveOk(false), 2500);
    } catch {}
    setSaving(false);
  }, [form, billerId, allowIntl, refreshRecent]);

  const handleClose = useCallback(() => {
    persistCustomer(form, billIdRef.current);
    // ✅ BROADCAST: Dialog closed
    broadcastEvent('CUSTOMER_DIALOG_CLOSED', { customer: form, billId: billIdRef.current });
    onClose?.();
  }, [form, onClose]);

  const handleFieldBlur = useCallback((field) => {
    setTimeout(() => { if (activeFieldRef.current === field) { setShowSug(false); setActiveField(""); setHighlighted(-1); } }, 220);
  }, []);

  if (!isOpen) return null;

  // ── Style helpers ────────────────────────────────────────
  const inp = cn("w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-yellow-500/30", isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white placeholder:text-gray-600" : "border-yellow-200 bg-white text-gray-900 placeholder:text-gray-400");
  const lbl = cn("mb-1 block text-[10px] font-semibold uppercase tracking-wide", isDark ? "text-gray-400" : "text-gray-600");
  const cache = _getCache(storeIdRef.current || "default");

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="customer-dialog-overlay"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={cn("w-full max-w-md rounded-2xl shadow-2xl overflow-hidden", isDark ? "bg-[#15120d] border border-yellow-500/20" : "bg-white border border-yellow-200")}
          >
            {/* ── HEADER ── */}
            <div className={cn("flex items-center justify-between px-5 py-3 border-b", isDark ? "border-yellow-500/20" : "border-yellow-200")}>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600">
                  <User size={13} className="text-white" />
                </div>
                <div>
                  <h2 className={cn("font-bold text-sm", isDark ? "text-white" : "text-gray-900")}>
                    {t("customerDetails") || "Customer Details"}
                  </h2>
                  {cacheReady && cache.items.length > 0 && (
                    <p className={cn("text-[9px]", isDark ? "text-green-400/60" : "text-green-600/60")}>
                      ✓ {cache.items.length} customers loaded
                    </p>
                  )}
                  {!cacheReady && (
                    <p className="text-[9px] text-gray-500 flex items-center gap-1">
                      <Loader2 size={8} className="animate-spin" />Loading...
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(form.name || form.phone) && (
                  <span className={cn("text-[8px] px-1.5 py-0.5 rounded flex items-center gap-0.5", isDark ? "text-green-400/60" : "text-green-600/60")}>
                    <Check size={7} />saved
                  </span>
                )}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setAllowIntl((p) => !p); setPhoneStatus(null); }}
                  className={cn(
                    "flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition",
                    allowIntl
                      ? isDark ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600"
                      : isDark ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" : "bg-yellow-50 border-yellow-200 text-yellow-600",
                  )}
                >
                  <Globe size={10} />
                  {allowIntl ? "🌐 INTL" : "🇵🇰 PK"}
                </motion.button>
                {["F8", "ESC"].map((k) => (
                  <span key={k} className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono font-bold", isDark ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border border-yellow-200")}>
                    {k}
                  </span>
                ))}
                <button type="button" onClick={handleClose} className="rounded-lg p-1 hover:bg-black/10 transition">
                  <X size={13} className={isDark ? "text-gray-400" : "text-gray-600"} />
                </button>
              </div>
            </div>

            {/* ── BODY ── */}
            <form onSubmit={handleSubmit(onFormSubmit)} className="p-4 space-y-3 max-h-[72vh] overflow-y-auto" dir={dir}>
              {/* Recent customers */}
              {recentCusts.length > 0 && !form.phone && (
                <div>
                  <label className={lbl}>Recent Customers</label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {recentCusts.map((c) => (
                      <motion.button
                        key={c.id}
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => pickCustomer(c)}
                        className={cn("flex-shrink-0 rounded-xl px-3 py-2 text-left text-xs border transition min-w-[80px]", isDark ? "border-yellow-500/20 bg-white/5 hover:bg-yellow-500/10 text-white" : "border-yellow-200 bg-yellow-50 hover:bg-yellow-100 text-gray-900")}
                      >
                        <div className="font-semibold truncate max-w-[80px]">{c.name}</div>
                        {c.phone && <div className="text-[9px] text-gray-500 font-mono mt-0.5">{c.phone}</div>}
                        {c.city && <div className="text-[8px] text-gray-500 mt-0.5">{c.city}</div>}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Phone field */}
              <div>
                <label className={lbl}>
                  <Phone size={9} className="inline mr-1" />
                  {t("phone") || "Phone"}
                  <span className="text-gray-500 normal-case font-normal ml-1">
                    {allowIntl ? "— international" : "— Pakistan 03XX-XXXXXXX"}
                  </span>
                </label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    {...register("phone")}
                    ref={(e) => { register("phone").ref(e); phoneRef.current = e; }}
                    type="tel"
                    inputMode="numeric"
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => { setActiveField("phone"); const norm = normalizePhone(form.phone); if (norm.length >= 3 && norm.length < 11) doSearch(norm); }}
                    onBlur={() => handleFieldBlur("phone")}
                    onKeyDown={handleInputKeyDown}
                    placeholder={allowIntl ? "+1234567890" : "03XXXXXXXXX"}
                    className={cn(inp, "pl-9 pr-8")}
                  />
                  <FieldMic fieldName="phone" speech={speech} isDark={isDark} onResult={(text) => handlePhoneChange(text.replace(/\D/g, ""))} />
                  {sugLoading && activeField === "phone" && (
                    <Loader2 size={12} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-yellow-500" />
                  )}

                  <AnimatePresence>
                    {showSug && activeField === "phone" && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        data-dropdown-open="true"
                        className={cn("absolute top-full left-0 right-0 z-[999] mt-1 rounded-xl border shadow-2xl max-h-52 overflow-y-auto", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
                      >
                        {sugLoading ? (
                          <div className="flex items-center justify-center py-4 gap-2">
                            <Loader2 size={14} className="animate-spin text-yellow-500" />
                            <span className="text-xs text-gray-400">Searching…</span>
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((c, i) => (
                            <SugItem key={c.id || i} c={c} onSelect={pickCustomer} isDark={isDark} isHighlighted={i === highlighted} />
                          ))
                        ) : (
                          <div className={cn("px-3 py-4 text-xs text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                            <AlertCircle size={14} className="inline mr-1.5 text-orange-400" />
                            No customer found
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {phoneStatus === "found" && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-green-500 mt-1 flex items-center gap-1">
                      <Check size={10} />Found — data auto-filled
                    </motion.p>
                  )}
                  {phoneStatus === "not_found" && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />New customer — will be saved
                    </motion.p>
                  )}
                  {phoneStatus === "invalid" && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {allowIntl ? "Invalid format" : "Must be 03XXXXXXXXX (11 digits)"}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Name field */}
              <div>
                <label className={lbl}>
                  <User size={9} className="inline mr-1" />
                  {t("name") || "Name"}
                  <span className="text-gray-500 normal-case font-normal ml-1">— leave empty for auto</span>
                </label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    {...register("name")}
                    ref={(e) => { register("name").ref(e); nameRef.current = e; }}
                    type="text"
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => { setActiveField("name"); if (form.name.length >= 2) doSearch(form.name); }}
                    onBlur={() => handleFieldBlur("name")}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Search or type name…"
                    className={cn(inp, "pl-9 pr-8")}
                  />
                  <FieldMic fieldName="name" speech={speech} isDark={isDark} onResult={(text) => handleNameChange(text.trim())} />
                  {sugLoading && activeField === "name" && (
                    <Loader2 size={12} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-yellow-500" />
                  )}

                  <AnimatePresence>
                    {showSug && activeField === "name" && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        data-dropdown-open="true"
                        className={cn("absolute top-full left-0 right-0 z-[999] mt-1 rounded-xl border shadow-2xl max-h-52 overflow-y-auto", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
                      >
                        {sugLoading ? (
                          <div className="flex items-center justify-center py-4 gap-2">
                            <Loader2 size={14} className="animate-spin text-yellow-500" />
                            <span className="text-xs text-gray-400">Searching…</span>
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((c, i) => (
                            <SugItem key={c.id || i} c={c} onSelect={pickCustomer} isDark={isDark} isHighlighted={i === highlighted} />
                          ))
                        ) : (
                          <div className={cn("px-3 py-4 text-xs text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                            <AlertCircle size={14} className="inline mr-1.5 text-orange-400" />
                            No customer found
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {speech?.isListening && speech?.activeField === "name" && speech?.transcript && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-yellow-500 italic mt-0.5">
                    🎤 &ldquo;{speech.transcript}&rdquo;
                  </motion.p>
                )}
              </div>

              {/* City + Market */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}><MapPin size={9} className="inline mr-1" />{t("city") || "City"}</label>
                  <CustomDropdown value={form.city} options={allCities} onChange={(v) => setValue("city", v)} onAddNew={onAddCity} placeholder="Select city" Icon={MapPin} isDark={isDark} />
                </div>
                <div>
                  <label className={lbl}><Store size={9} className="inline mr-1" />{t("market") || "Market"}</label>
                  <CustomDropdown value={form.market} options={allMarkets} onChange={(v) => setValue("market", v)} onAddNew={onAddMarket} placeholder="Select market" Icon={Store} isDark={isDark} />
                </div>
              </div>

              {/* Save to DB button */}
              {(form.name?.trim() || normalizePhone(form.phone)) && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveOnly}
                  disabled={saving}
                  className={cn(
                    "w-full rounded-xl px-3 py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5",
                    saveOk
                      ? isDark ? "border border-green-500/30 bg-green-500/15 text-green-400" : "border border-green-200 bg-green-50 text-green-700"
                      : isDark ? "border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" : "border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
                  )}
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : saveOk ? <><Check size={11} />Saved to Database!</> : <><UserPlus size={11} />Save to Database</>}
                </motion.button>
              )}

              {/* Hotkey reference */}
              <div className={cn("rounded-xl p-2", isDark ? "bg-black/20" : "bg-gray-50")}>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[["F8", "Submit"], ["ESC", "Back (saved)"], ["↑↓", "Navigate suggestions"], ["Enter", "Select / Submit"]].map(([key, action]) => (
                    <div key={key} className="flex items-center gap-1">
                      <kbd className={cn("rounded px-1.5 py-0.5 text-[9px] font-mono font-bold", isDark ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border border-yellow-200")}>
                        {key}
                      </kbd>
                      <span className={cn("text-[9px]", isDark ? "text-gray-500" : "text-gray-400")}>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </form>

            {/* ── FOOTER ── */}
            <div className={cn("flex items-center justify-between gap-2 px-5 py-3 border-t", isDark ? "border-yellow-500/20" : "border-yellow-200")}>
              <p className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-400")}>
                {cache.items.length > 0 && <span className="mr-2">📋 {cache.items.length}</span>}
                ESC = back <span className="text-green-400">(data saved ✓)</span>
              </p>
              <div className="flex items-center gap-2">
                <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleClose} className={cn("rounded-xl px-4 py-2 text-sm font-medium border transition", isDark ? "border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                  ← Back
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit(onFormSubmit)}
                  className={cn("rounded-xl px-5 py-2 text-sm font-bold text-black bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 shadow-lg shadow-yellow-500/20")}
                >
                  Continue (F8) →
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default memo(CustomerDialog);