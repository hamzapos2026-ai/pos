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
  Plus, Loader2, AlertCircle, AlertTriangle,
  Check, Globe, Mic, ChevronDown,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../hooks/useLanguage";
import { cn } from "../../utils/cn";
import {
  doc, setDoc, serverTimestamp,
  collection, query, where, getDocs, limit,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import {
  COUNTRY_REGIONS,
  DEFAULT_COUNTRY,
  getCountryByIso,
  getCountriesByRegion,
  resolveCountryFromPhone,
  formatPhoneForCountry,
  validatePhoneForCountry,
  toE164Phone,
  searchCountries,
  getCountryLocations,
  getMarketsForCity,
} from "../../utils/countries";
import { isAutoCustomerName, isWalkIn, hasRealCustomerName, phoneDigitsKey, finalizeCustomerForCheckout, buildCustomerDocId, buildCustomerFirestorePayload, syncAutoCustomerCounter, WALKING_CUSTOMER_NAME, isEmptyCheckoutCustomerInput, mergeNumberIntoList, unionNumberLists, numberEntryPhone } from "../../utils/customerHelpers";

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
export { resolveCountryFromPhone };

/** Pakistan local normalize — kept for backward compatibility. */
export const normalizePhone = (input = "") => formatPhoneForCountry(input, DEFAULT_COUNTRY);

/** @deprecated */
export const detectCountryFromPhone = (phone = "") => {
  const c = resolveCountryFromPhone(phone);
  return c.iso === "PK" && !String(phone || "").trim().startsWith("+")
    ? null
    : { prefix: c.dial, name: c.name, flag: c.flag };
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
    city: data?.city || getCountryLocations(data?.country || resolveCountryFromPhone(data?.phone || "").iso).defaultCity,
    market: data?.market || "",
    country: data?.country || resolveCountryFromPhone(phone).iso,
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
const RECENT_MAX = 50;
const RECENT_STORAGE_KEY = (sid) => `cd_recent_v1:${sid || "default"}`;

const _parseTs = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v?.toDate) return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const _customerRecentScore = (c) => Math.max(
  c?._recentAt || 0,
  _parseTs(c?.lastVisit),
  _parseTs(c?.lastPurchaseDate),
  _parseTs(c?.updatedAt),
  _parseTs(c?.createdAt),
);

/** Remember biller picks — survives dialog close / page refresh. */
export const recordRecentCustomer = (c, storeId) => {
  if (!c || !isDisplayableCustomer(c)) return;
  const sid = storeId || "default";
  const phoneKey = phoneDigitsKey(c.phone);
  const id = String(c.id || "").trim();
  if (!id && !phoneKey) return;
  const snapshot = {
    id: id && !id.startsWith("rt_") ? id : "",
    phoneKey,
    name: (c.name || "").trim(),
    phone: c.phone || "",
    city: c.city || "",
    market: c.market || "",
    country: c.country || "",
    at: Date.now(),
  };
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY(sid));
    let list = raw ? JSON.parse(raw) : [];
    list = list.filter((x) => (
      (snapshot.id && x.id === snapshot.id)
        || (snapshot.phoneKey && x.phoneKey === snapshot.phoneKey)
        ? false
        : true
    ));
    list.unshift(snapshot);
    localStorage.setItem(RECENT_STORAGE_KEY(sid), JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch { /* ignore */ }
  const cache = _getCache(sid);
  const hit = (snapshot.id && cache.byId.get(snapshot.id))
    || (phoneKey && cache.byPhone.get(phoneKey));
  if (hit) hit._recentAt = snapshot.at;
};

const buildRecentList = (storeId) => {
  const sid = storeId || "default";
  const cache = _getCache(sid);
  let stored = [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY(sid));
    const parsed = JSON.parse(raw || "[]");
    stored = Array.isArray(parsed) ? parsed : [];
  } catch { stored = []; }

  const out = [];
  const seen = new Set();

  for (const s of stored) {
    if (out.length >= RECENT_MAX) break;
    let c = null;
    if (s.id && cache.byId.has(s.id)) c = cache.byId.get(s.id);
    else if (s.phoneKey && cache.byPhone.has(s.phoneKey)) c = cache.byPhone.get(s.phoneKey);
    else if (s.name || s.phone) {
      c = {
        id: s.id || `recent_${s.phoneKey || s.at}`,
        name: s.name,
        phone: s.phone,
        city: s.city || "",
        market: s.market || "",
        country: s.country || "",
        _recentAt: s.at || 0,
      };
    }
    if (!c || !isDisplayableCustomer(c)) continue;
    const key = c.id || phoneDigitsKey(c.phone) || (c.name || "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, _recentAt: s.at || c._recentAt || 0 });
  }

  const rest = [...cache.items]
    .filter(isDisplayableCustomer)
    .sort((a, b) => _customerRecentScore(b) - _customerRecentScore(a));

  for (const c of rest) {
    if (out.length >= RECENT_MAX) break;
    const key = c.id || phoneDigitsKey(c.phone) || (c.name || "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
};

const _getCache = (sid) => {
  if (!_caches[sid])
    _caches[sid] = { items: [], byPhone: new Map(), byId: new Map(), loaded: false, loadedAt: 0, loading: false };
  return _caches[sid];
};

/** Index every number of an entry into byPhone → same entry (search by any number). */
const _indexEntryNumbers = (cache, entry) => {
  const list = mergeNumberIntoList(entry.numbers || [], entry.phone || "");
  list.forEach((n) => {
    const k = phoneDigitsKey(numberEntryPhone(n));
    if (k) cache.byPhone.set(k, entry);
  });
};

const _cacheUpsert = (raw, storeId) => {
  if (!raw || !isValidCustomer(raw)) return null;
  const cache = _getCache(storeId || "default");
  const resolved = resolveCountryFromPhone(raw.phone || "", raw.country || "PK");
  const phone = formatPhoneForCountry(raw.phone || "", resolved) || (raw.phone || "").trim();
  const phoneKey = phoneDigitsKey(phone);
  const name = (raw.name || "").trim();
  const id = raw.id || "";
  const rawNumbers = mergeNumberIntoList(raw.numbers || [], phone);
  if (!phoneKey && !name && rawNumbers.length === 0) return null;

  // Reuse an existing entry matched by the same doc id, primary phone, or any number.
  let ex = (id && cache.byId.get(id)) || (phoneKey && cache.byPhone.get(phoneKey)) || null;
  if (!ex) {
    for (const n of rawNumbers) {
      const k = phoneDigitsKey(numberEntryPhone(n));
      if (k && cache.byPhone.has(k)) { ex = cache.byPhone.get(k); break; }
    }
  }

  if (ex) {
    if (name) ex.name = name;
    if (phone && !ex.phone) ex.phone = phone;
    if (raw.city) ex.city = raw.city;
    if (raw.market) ex.market = raw.market;
    if (raw.country) ex.country = raw.country;
    if (raw.lastVisit) ex.lastVisit = raw.lastVisit;
    if (raw.lastPurchaseDate) ex.lastPurchaseDate = raw.lastPurchaseDate;
    if (raw.updatedAt) ex.updatedAt = raw.updatedAt;
    if (raw.createdAt) ex.createdAt = raw.createdAt;
    if (raw._recentAt) ex._recentAt = raw._recentAt;
    ex.numbers = unionNumberLists(ex.numbers, unionNumberLists(rawNumbers, [ex.phone]));
    if (id) { ex.id = id; cache.byId.set(id, ex); }
    _indexEntryNumbers(cache, ex);
    return ex;
  }

  const entry = {
    id: id || `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name, phone,
    city: raw.city || "",
    market: raw.market || "",
    country: raw.country || resolved.iso,
    numbers: unionNumberLists(rawNumbers, [phone]),
    lastVisit: raw.lastVisit || null,
    lastPurchaseDate: raw.lastPurchaseDate || null,
    updatedAt: raw.updatedAt || null,
    createdAt: raw.createdAt || null,
    _recentAt: raw._recentAt || 0,
  };
  cache.items.unshift(entry);
  if (id) cache.byId.set(id, entry);
  _indexEntryNumbers(cache, entry);
  return entry;
};

export const cacheLoad = async (storeId, force = false) => {
  const sid = storeId || "default";
  const cache = _getCache(sid);
  if (!force && cache.loaded && Date.now() - cache.loadedAt < CACHE_TTL) return true;
  if (cache.loading) return cache.loaded;
  cache.loading = true;
  try {
    const snap = await getDocs(query(collection(db, "customers"), where("storeId", "==", sid), limit(400)));
    cache.items = []; cache.byPhone = new Map(); cache.byId = new Map();
    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      if (isValidCustomer(data)) _cacheUpsert(data, sid);
    });
    cache.items.sort((a, b) => _customerRecentScore(b) - _customerRecentScore(a));
    cache.loaded = true; cache.loadedAt = Date.now();
    return true;
  } catch { return false; }
  finally { cache.loading = false; }
};

/** Warm customer cache in background — call on biller mount for instant dialog open. */
export const cachePreload = (storeId) => {
  const sid = storeId || "default";
  void cacheLoad(sid, false);
  void import("../../db/index").then(({ db }) =>
    db.customers.where("storeId").equals(sid).limit(300).toArray(),
  ).then((rows) => {
    if (!rows?.length) return;
    const cache = _getCache(sid);
    rows.forEach((r) => {
      _cacheUpsert({
        id: r.customerId || r.id,
        ...r,
      }, sid);
    });
    if (!cache.loaded) {
      cache.items.sort((a, b) => _customerRecentScore(b) - _customerRecentScore(a));
      cache.loaded = true;
      cache.loadedAt = Date.now();
    }
  }).catch(() => {});
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
    // Match any of the customer's saved numbers (multiple mobiles per person)
    if (!ok && isPhone && Array.isArray(c.numbers)) {
      ok = c.numbers.some((n) => {
        const nd = numberEntryPhone(n).replace(/\D/g, "");
        return nd && (nd.startsWith(digits) || nd.includes(digits));
      });
    }
    if (!ok && lower.length >= 2 && cN) ok = cN.includes(lower);
    if (ok) {
      const key = cP || cN || c.id;
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    }
  }
  return out;
};

export const findCachedCustomerByPhone = (phone, storeId) => {
  const key = phoneDigitsKey(phone);
  if (!key) return null;
  const hit = _getCache(storeId || "default").byPhone.get(key);
  if (!hit) return null;
  const id = String(hit.id || "");
  // Ignore in-session runtime drafts — only reuse Firestore-loaded customers
  if (id.startsWith("rt_")) return null;
  return hit;
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

const RecentCustomerCard = memo(({ c, onSelect, isDark }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onSelect(c); }}
    className={cn(
      "flex-shrink-0 flex flex-col text-left rounded-lg px-2.5 py-1.5 text-xs border transition-colors duration-150 min-h-[54px] w-[108px] sm:w-[118px]",
      isDark
        ? "border-yellow-500/15 bg-white/[0.03] hover:bg-yellow-500/10 hover:border-yellow-500/30 text-white"
        : "border-yellow-100 bg-white hover:bg-yellow-50 hover:border-yellow-200 text-gray-900 shadow-sm",
    )}
  >
    <div className="font-semibold truncate leading-tight">{c.name || c.phone || "—"}</div>
    {c.phone && (
      <div className={cn("font-mono text-[10px] mt-0.5 truncate", isDark ? "text-yellow-400/85" : "text-yellow-700")}>
        {c.phone}
      </div>
    )}
    {(c.city || c.market) && (
      <div className={cn("text-[9px] mt-auto pt-0.5 truncate", isDark ? "text-gray-500" : "text-gray-400")}>
        {[c.city, c.market].filter(Boolean).join(" · ")}
      </div>
    )}
  </button>
));
RecentCustomerCard.displayName = "RecentCustomerCard";

const RecentCustomersPanel = memo(({ customers, onSelect, isDark, loading, title, labelClass }) => {
  if (!loading && customers.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>{title}</label>
        {!loading && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
            isDark ? "bg-yellow-500/15 text-yellow-400" : "bg-yellow-100 text-yellow-800",
          )}
          >
            {customers.length}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin text-yellow-500" />
          Loading recent…
        </div>
      ) : (
        <div
          className={cn(
            "flex gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth pb-1 -mx-0.5 px-0.5",
            isDark ? "scrollbar-thin scrollbar-thumb-yellow-500/25" : "scrollbar-thin scrollbar-thumb-yellow-200",
          )}
          style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
        >
          {customers.map((c) => (
            <RecentCustomerCard
              key={c.id || phoneDigitsKey(c.phone) || c.name}
              c={c}
              onSelect={onSelect}
              isDark={isDark}
            />
          ))}
        </div>
      )}
    </div>
  );
});
RecentCustomersPanel.displayName = "RecentCustomersPanel";

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

const focusSelectAll = (el) => {
  if (!el) return;
  el.focus();
  requestAnimationFrame(() => {
    try {
      if (typeof el.select === "function") el.select();
    } catch { /* ignore */ }
  });
};

const CustomDropdown = memo(({ value, options, onChange, onAddNew, placeholder, Icon, isDark, disabled = false, searchable = true, triggerRef, onAfterSelect, open: controlledOpen, onOpenChange }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = useCallback((next) => {
    const val = typeof next === "function" ? next(isOpen) : next;
    if (isControlled) onOpenChange?.(val);
    else setInternalOpen(val);
  }, [isControlled, isOpen, onOpenChange]);

  const [newVal, setNewVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef(null);
  const filterInputRef = useRef(null);
  const alertRef = useRef("");

  useEffect(() => {
    if (!isOpen || !searchable) return;
    const t = window.setTimeout(() => focusSelectAll(filterInputRef.current), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, searchable]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setIsOpen(false); setFilter(""); } };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setIsOpen]);

  const filteredOptions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [options, filter]);

  useEffect(() => {
    setHighlight(0);
    const q = filter.trim();
    if (!isOpen || q.length < 2) return;
    if (filteredOptions.length === 0) alertRef.current = q;
    if (filteredOptions.length > 0) alertRef.current = "";
  }, [filter, filteredOptions.length, isOpen]);

  const selectOption = (opt) => {
    onChange(opt);
    setIsOpen(false);
    setFilter("");
    setHighlight(0);
    onAfterSelect?.();
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((p) => Math.min(p + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick =
        filteredOptions[highlight] ??
        filteredOptions[0] ??
        (value && options.includes(value) ? value : null);
      if (pick) selectOption(pick);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setFilter("");
      triggerRef?.current?.focus();
    }
  };

  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      else focusSelectAll(filterInputRef.current);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
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

      {isOpen && (
          <div
            className={cn("absolute top-full left-0 right-0 z-[500] mt-1 rounded-lg border shadow-xl overflow-hidden", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
          >
            {searchable && (
              <div className={cn("p-2 border-b", isDark ? "border-yellow-500/15" : "border-yellow-100")}>
                <input
                  ref={filterInputRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  onFocus={(e) => focusSelectAll(e.target)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Type to search…"
                  className={cn(
                    "w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-yellow-500/30",
                    isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white placeholder:text-gray-600" : "border-yellow-200 bg-white text-gray-900",
                  )}
                />
              </div>
            )}
            <div className="max-h-44 overflow-y-auto">
              {filteredOptions.length > 0 ? filteredOptions.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => selectOption(opt)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm border-b last:border-0 transition-colors",
                    i === highlight
                      ? isDark ? "bg-yellow-500/20 text-yellow-300" : "bg-yellow-100 text-yellow-800"
                      : value === opt ? isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700" : isDark ? "text-gray-300 hover:bg-yellow-500/5 border-yellow-500/10" : "text-gray-700 hover:bg-yellow-50 border-gray-100",
                  )}
                >
                  {opt}
                </button>
              )) : (
                <div className={cn("px-3 py-4 text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                  <AlertCircle size={14} className="inline mr-1.5 text-orange-400" />
                  <span className="text-xs">No match for &ldquo;{filter.trim()}&rdquo;</span>
                </div>
              )}
            </div>
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
          </div>
        )}
    </div>
  );
});
CustomDropdown.displayName = "CustomDropdown";

const CountryPicker = memo(({ value, onChange, isDark, isOpen, onToggle, onClose }) => {
  const ref = useRef(null);
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { onClose?.(); setFilter(""); } };
    if (isOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) { setFilter(""); setHighlight(0); }
  }, [isOpen]);

  const filtered = useMemo(() => searchCountries(filter), [filter]);

  // No corner-toast on "country not found" — the dropdown shows an inline
  // empty-state message instead (avoids the removed react-hot-toast import).
  useEffect(() => {
    setHighlight(0);
  }, [filter, filtered, isOpen]);

  const active = getCountryByIso(value);

  const pickCountry = (iso) => {
    onChange(iso);
    onClose?.();
    setFilter("");
    setHighlight(0);
  };

  const onSearchKeyDown = (e) => {
    const list = filtered || [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((p) => Math.min(p + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered && filtered[highlight]) pickCountry(filtered[highlight].iso);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
      setFilter("");
    }
  };

  const renderCountryBtn = (c, i, isSearch) => (
    <button
      key={c.iso}
      type="button"
      onClick={() => pickCountry(c.iso)}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left text-xs border-b last:border-0 transition-colors",
        isSearch && i === highlight
          ? isDark ? "bg-yellow-500/25 text-yellow-300" : "bg-yellow-100 text-yellow-900"
          : value === c.iso
            ? isDark ? "bg-yellow-500/15 text-yellow-400" : "bg-yellow-50 text-yellow-800"
            : isDark ? "text-gray-200 hover:bg-yellow-500/8 border-yellow-500/10" : "text-gray-800 hover:bg-yellow-50 border-gray-100",
      )}
    >
      <span>{c.flag}</span>
      <span className="flex-1 truncate font-medium">{c.name}</span>
      <span className="font-mono text-[10px] opacity-70">{c.dial}</span>
      {isSearch && c.regionLabel && (
        <span className={cn("text-[9px] opacity-50 shrink-0", isDark ? "text-gray-500" : "text-gray-400")}>{c.regionLabel}</span>
      )}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border font-semibold max-w-[160px] transition-colors",
          isDark ? "bg-yellow-500/10 border-yellow-500/25 text-yellow-400 hover:bg-yellow-500/15" : "bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100",
        )}
        title={`${active.name} ${active.dial}`}
      >
        <Globe size={10} className="shrink-0" />
        <span className="shrink-0">{active.flag}</span>
        <span className="truncate">{active.name}</span>
        <span className="opacity-70 font-mono text-[9px] shrink-0">{active.dial}</span>
        <ChevronDown size={10} className={cn("shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
          <div
            className={cn(
              "absolute right-0 top-full z-[600] mt-1 w-[min(320px,calc(100vw-2rem))] rounded-lg border shadow-xl overflow-hidden",
              isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200",
            )}
          >
            <div className={cn("p-2 border-b", isDark ? "border-yellow-500/15" : "border-yellow-100")}>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search country, region or +code…"
                autoFocus
                className={cn(
                  "w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-yellow-500/30",
                  isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white placeholder:text-gray-600" : "border-yellow-200 bg-white text-gray-900",
                )}
              />
              {filter.trim() && (
                <p className={cn("mt-1.5 text-[9px]", isDark ? "text-gray-500" : "text-gray-400")}>
                  {filtered?.length
                    ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} — ↑↓ navigate, Enter select`
                    : "No match — check spelling or try dial code (+971)"}
                </p>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered ? (
                filtered.length > 0 ? (
                  filtered.map((c, i) => renderCountryBtn(c, i, true))
                ) : (
                  <div className={cn("px-3 py-5 text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                    <AlertCircle size={16} className="inline text-orange-400 mb-1" />
                    <p className="text-xs font-semibold">Country not found</p>
                    <p className="text-[10px] mt-1">&ldquo;{filter.trim()}&rdquo; is not in the list</p>
                  </div>
                )
              ) : COUNTRY_REGIONS.map((region) => (
                <div key={region.id}>
                  <div className={cn("px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider sticky top-0", isDark ? "bg-[#120f0a] text-yellow-500/70" : "bg-yellow-50 text-yellow-700")}>
                    {region.label}
                  </div>
                  {getCountriesByRegion(region.id).map((c, i) => renderCountryBtn(c, i, false))}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
});
CountryPicker.displayName = "CountryPicker";

// ═══════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════
const overlayVariants = { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } };
const cardVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
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
  requireName = false,
  requirePhone = false,
  submitRef = null,
}) => {
  const { isDark } = useTheme();
  const { t, dir } = useLanguage();
  const phoneRef = useRef(null);
  const nameRef = useRef(null);
  const cityTriggerRef = useRef(null);
  const marketTriggerRef = useRef(null);
  const continueBtnRef = useRef(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const userEditedNameRef = useRef(false);
  const skipNameSuggestRef = useRef(false);
  const phoneLookupGenRef = useRef(0);
  const submitLockUntilRef = useRef(0);
  // Explicit profile link: set ONLY when the biller picks/looks-up an existing saved
  // customer. Enables "same person, new number" (add number to that profile) while
  // keeping two different people with the SAME name as separate profiles.
  const linkedProfileRef = useRef(null);
  // One-time acknowledgement for the "name already exists" nudge — lets the biller add a
  // father/full name to avoid duplicates, or press F8 again to proceed as a new customer.
  const duplicateNameAckRef = useRef(false);
  const [linkedPhoneKey, setLinkedPhoneKey] = useState("");
  const searchTimer = useRef(null);
  const persistTimer = useRef(null);
  const prevCityRef = useRef("Karachi");
  const activeFieldRef = useRef("");
  const billIdRef = useRef(billId);
  const storeIdRef = useRef(storeId);

  useEffect(() => { billIdRef.current = billId; }, [billId]);
  useEffect(() => { storeIdRef.current = storeId; }, [storeId]);

  // ── react-hook-form ──────────────────────────────────────
  const { register, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      name: "",
      phone: "",
      city: getCountryLocations("PK").defaultCity,
      market: "",
    },
  });
  const form = watch();

  // ── State ────────────────────────────────────────────────
  const [phoneStatus, setPhoneStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [selectedCountryIso, setSelectedCountryIso] = useState("PK");
  const [countryOpen, setCountryOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [recentCusts, setRecentCusts] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // ── Inline (in-modal) alert — medium, auto-dismisses quickly ──
  const [inlineAlert, setInlineAlert] = useState(null);
  const inlineAlertTimer = useRef(null);
  const dismissInlineAlert = useCallback(() => {
    clearTimeout(inlineAlertTimer.current);
    setInlineAlert(null);
  }, []);
  const showInlineAlert = useCallback((message, variant = "warning", duration = 3200) => {
    setInlineAlert({ message, variant });
    clearTimeout(inlineAlertTimer.current);
    // Never vanish instantly — keep it up for at least 3s so the biller can read it.
    inlineAlertTimer.current = window.setTimeout(() => setInlineAlert(null), Math.max(3000, duration));
  }, []);

  useEffect(() => { activeFieldRef.current = activeField; }, [activeField]);

  const countryLocations = useMemo(
    () => getCountryLocations(selectedCountryIso),
    [selectedCountryIso],
  );
  const allCities = useMemo(() => {
    const base = countryLocations.cities || [];
    const keepCurrent = form.city && !base.includes(form.city) ? [form.city] : [];
    return [...new Set([...base, ...runtimeCities, ...keepCurrent])];
  }, [countryLocations, runtimeCities, form.city]);
  const allMarkets = useMemo(() => {
    const base = getMarketsForCity(selectedCountryIso, form.city);
    const keepCurrent = form.market && !base.includes(form.market) ? [form.market] : [];
    return [...new Set([...base, ...runtimeMarkets, ...keepCurrent])];
  }, [selectedCountryIso, form.city, form.market, runtimeMarkets]);
  const activeCountry = useMemo(() => (
    form.phone.trim()
      ? resolveCountryFromPhone(form.phone, selectedCountryIso)
      : getCountryByIso(selectedCountryIso)
  ), [form.phone, selectedCountryIso]);
  const isPakistan = activeCountry.iso === "PK";

  const refreshRecent = useCallback((sid) => {
    setRecentCusts(buildRecentList(sid || "default"));
    setRecentLoading(false);
  }, []);

  const dialogOpenedRef = useRef(false);

  // ── Restore once per open (never re-run on parent customer live updates) ──
  useEffect(() => {
    if (!isOpen) {
      dialogOpenedRef.current = false;
      setCityOpen(false);
      setMarketOpen(false);
      return;
    }
    if (dialogOpenedRef.current) return;
    dialogOpenedRef.current = true;

    const bid = billIdRef.current;
    const sid = storeIdRef.current || "default";

    userEditedNameRef.current = false;
    skipNameSuggestRef.current = false;
    setLinkedPhoneKey("");
    linkedProfileRef.current = null;
    duplicateNameAckRef.current = false;
    phoneLookupGenRef.current += 1;
    setSuggestions([]); setShowSug(false); setHighlighted(-1);
    setPhoneStatus(null); setCountryOpen(false);

    const persisted = getPersistedCustomer(bid);
    const hasInitial = initialCustomer?.name || initialCustomer?.phone;
    const source = hasInitial ? initialCustomer : (persisted?.name || persisted?.phone ? persisted : {});

    const restoredCountry = source.country || resolveCountryFromPhone(source.phone || "").iso;
    const restoredLoc = getCountryLocations(restoredCountry);
    setSelectedCountryIso(restoredCountry);

    let restored = {
      name: source.name || "",
      phone: source.phone || "",
      city: source.city || restoredLoc.defaultCity,
      market: source.market || "",
    };

    if (/^Walking\s*Customer$/i.test(restored.name)) restored.name = "";
    if (/^Walk-in$/i.test(restored.name)) restored.name = "";
    if (/^Walk-in\s*Customer$/i.test(restored.name)) restored.name = "";

    reset(restored);
    prevCityRef.current = restored.city;
    // Preserve an existing explicit link when coming back (ESC/back) to the same customer.
    if (source.personaDocId && hasRealCustomerName(source.name)) {
      linkedProfileRef.current = {
        id: source.personaDocId,
        name: source.name || "",
        phone: source.phone || "",
        numbers: source.numbers || [],
      };
    }
    setActiveField("");

    const cache = _getCache(sid);
    if (cache.loaded) refreshRecent(sid);
    else {
      setRecentLoading(true);
      refreshRecent(sid);
      void cacheLoad(sid).then(() => refreshRecent(sid)).catch(() => setRecentLoading(false));
    }

    requestAnimationFrame(() => {
      focusSelectAll(phoneRef.current);
      setActiveField("phone");
    });
  }, [isOpen, initialCustomer, reset, refreshRecent]);

  // City change → reset market
  useEffect(() => {
    if (form.city !== prevCityRef.current) {
      prevCityRef.current = form.city;
      setValue("market", "");
    }
  }, [form.city, setValue]);

  const applyCountryLocations = useCallback((iso, { keepCityIfValid = false } = {}) => {
    const loc = getCountryLocations(iso);
    const validCities = new Set([...loc.cities, ...runtimeCities]);
    const nextCity = (keepCityIfValid && form.city && validCities.has(form.city))
      ? form.city
      : loc.defaultCity;
    setValue("city", nextCity);
    setValue("market", "");
    prevCityRef.current = nextCity;
  }, [form.city, runtimeCities, setValue]);

  // Country change → city/market lists update
  useEffect(() => {
    if (!isOpen) return;
    const loc = getCountryLocations(selectedCountryIso);
    const validCities = new Set([...loc.cities, ...runtimeCities, form.city].filter(Boolean));
    if (form.city && !validCities.has(form.city)) {
      setValue("city", loc.defaultCity);
      setValue("market", "");
      prevCityRef.current = loc.defaultCity;
    }
  }, [selectedCountryIso, isOpen, runtimeCities, form.city, setValue]);

  const doPersist = useCallback((data) => {
    persistCustomer(data, billIdRef.current);
  }, []);

  // Session persist — debounced (not every keystroke)
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => doPersist(form), 120);
    return () => clearTimeout(persistTimer.current);
  }, [form, isOpen, doPersist]);
  useEffect(() => () => {
    clearTimeout(searchTimer.current);
    clearTimeout(persistTimer.current);
    clearTimeout(inlineAlertTimer.current);
  }, []);

  // Clear inline alert whenever the dialog closes
  useEffect(() => {
    if (!isOpen) {
      setInlineAlert(null);
      clearTimeout(inlineAlertTimer.current);
    }
  }, [isOpen]);

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
  const applyPhoneCacheLookup = useCallback((normalized, gen) => {
    if (gen !== phoneLookupGenRef.current) return;

    const sid = storeIdRef.current || "default";
    const cached = _getCache(sid).byPhone.get(phoneDigitsKey(normalized));
    const isSavedCustomer = Boolean(
      cached?.id && !String(cached.id).startsWith("rt_") && !String(cached.id).startsWith("order-only"),
    );

    if (!isSavedCustomer || !cached) {
      setPhoneStatus("not_found");
      setShowSug(false);
      setLinkedPhoneKey("");
      // A brand-new number typed by hand is NOT a link. Keep any existing link only
      // when it belongs to the same profile (picked earlier); otherwise drop it.
      return;
    }

    const currentName = (nameRef.current?.value || "").trim();
    if (!userEditedNameRef.current && !currentName) {
      if (cached.name) setValue("name", cached.name);
      if (cached.city) setValue("city", cached.city);
      if (cached.market) setValue("market", cached.market);
      if (cached.country) setSelectedCountryIso(cached.country);
      skipNameSuggestRef.current = true;
    }
    // Existing saved number → this is an explicit link to that profile.
    if (hasRealCustomerName(cached.name)) {
      linkedProfileRef.current = {
        id: cached.id,
        name: cached.name || "",
        phone: cached.phone || "",
        numbers: cached.numbers || [],
      };
    }
    setLinkedPhoneKey(phoneDigitsKey(normalized));
    setPhoneStatus("found");
    setShowSug(false);
  }, [setValue]);

  const handlePhoneChange = useCallback((value) => {
    const detected = resolveCountryFromPhone(value, selectedCountryIso);
    if (value.trim() && detected.iso !== selectedCountryIso) {
      setSelectedCountryIso(detected.iso);
      applyCountryLocations(detected.iso, { keepCityIfValid: true });
    } else if (value.trim()) {
      setSelectedCountryIso(detected.iso);
    }

    const intl = detected.iso !== "PK";
    const clean = intl
      ? value.replace(/[^0-9+]/g, "").replace(/(?!^\+)\+/g, "")
      : value.replace(/\D/g, "");
    setValue("phone", clean);
    setPhoneStatus(null);
    setActiveField("phone");
    setHighlighted(-1);
    clearTimeout(searchTimer.current);

    const searchKey = intl ? phoneDigitsKey(clean) : phoneDigitsKey(formatPhoneForCountry(clean, detected));
    if (!searchKey) { setSuggestions([]); setShowSug(false); return; }

    const minSearchLen = intl ? 8 : 11;
    if (searchKey.length >= minSearchLen) {
      const v = validatePhoneForCountry(clean, detected);
      if (!v?.valid) { setPhoneStatus("invalid"); setShowSug(false); return; }
      const gen = ++phoneLookupGenRef.current;
      applyPhoneCacheLookup(v.normalized, gen);
    } else if (searchKey.length >= 2) {
      searchTimer.current = setTimeout(() => doSearch(searchKey), 50);
    } else { setSuggestions([]); setShowSug(false); }
  }, [doSearch, setValue, selectedCountryIso, applyCountryLocations, applyPhoneCacheLookup]);

  const handleCountrySelect = useCallback((iso) => {
    setSelectedCountryIso(iso);
    setCountryOpen(false);
    setPhoneStatus(null);
    applyCountryLocations(iso);
  }, [applyCountryLocations]);

  // ── Name change ──────────────────────────────────────────
  const handleNameChange = useCallback((value) => {
    userEditedNameRef.current = true;
    skipNameSuggestRef.current = false;
    // If the biller changes the name away from the linked profile, it's a DIFFERENT
    // customer — drop the link so numbers aren't merged into the wrong profile.
    const link = linkedProfileRef.current;
    if (link && (link.name || "").trim().toLowerCase() !== (value || "").trim().toLowerCase()) {
      linkedProfileRef.current = null;
    }
    // Name edited → re-evaluate duplicate nudge (adding a father name clears the warning).
    duplicateNameAckRef.current = false;
    setValue("name", value);
    setActiveField("name");
    setHighlighted(-1);
    clearTimeout(searchTimer.current);
    if (value.trim().length >= 3) searchTimer.current = setTimeout(() => doSearch(value), 50);
    else { setSuggestions([]); setShowSug(false); }
  }, [doSearch, setValue]);

  // ── Pick suggestion ──────────────────────────────────────
  const pickCustomer = useCallback((c) => {
    const country = resolveCountryFromPhone(c.phone || "", c.country || "PK");
    const phone = formatPhoneForCountry(c.phone || "", country) || c.phone || "";
    const custLoc = getCountryLocations(c.country || country.iso);
    reset({
      name: c.name || "",
      phone,
      city: c.city || custLoc.defaultCity,
      market: c.market || "",
    });
    setSelectedCountryIso(c.country || country.iso);
    prevCityRef.current = c.city || custLoc.defaultCity;
    setPhoneStatus(phone ? "found" : null);
    userEditedNameRef.current = Boolean((c.name || "").trim());
    skipNameSuggestRef.current = true;
    setLinkedPhoneKey(phone ? phoneDigitsKey(phone) : "");
    // Picking an existing saved customer is the explicit link. Now if the biller
    // changes the number, the new number attaches to THIS profile.
    if (c.id && !String(c.id).startsWith("rt_") && !String(c.id).startsWith("order-only") && hasRealCustomerName(c.name)) {
      linkedProfileRef.current = {
        id: c.id,
        name: c.name || "",
        phone: c.phone || "",
        numbers: c.numbers || [],
      };
    } else {
      linkedProfileRef.current = null;
    }
    setShowSug(false); setSuggestions([]);
    setActiveField("phone"); setHighlighted(-1);
    recordRecentCustomer(c, storeIdRef.current);
    refreshRecent(storeIdRef.current);
    requestAnimationFrame(() => focusSelectAll(phoneRef.current));
  }, [reset, refreshRecent]);

  // ── Firestore write (background, never blocks F8) ─────────
  const flushCustomerToDb = useCallback((finalData, country) => {
    const sid = storeIdRef.current || "default";
    const name = (finalData.name || "").trim();
    const phoneNorm = (finalData.phone || "").trim();
    if (!name && !phoneNorm) return;
    if (isWalkIn({ name }) && !phoneNorm) return;

    void import("../../services/customerPersonaService").then(({ syncCustomerIdentity }) =>
      syncCustomerIdentity({
        customer: {
          ...finalData,
          country: country?.iso || finalData.country,
          countryName: country?.name || finalData.countryName,
        },
        storeId: sid,
        branchId: sid,
        billerId,
        userId: billerId,
      }),
    );
  }, [billerId]);

  // ── Form submit (F8) — no duplicate-phone block; form values win at checkout ──
  const onFormSubmit = useCallback((data) => {
    const now = Date.now();
    if (now < submitLockUntilRef.current) return;
    submitLockUntilRef.current = now + 0;

    const country = activeCountry;
    const nameTrim = (nameRef.current?.value ?? data.name ?? "").trim();
    const phoneTrim = (phoneRef.current?.value ?? data.phone ?? "").trim();
    const hasName = hasRealCustomerName(nameTrim);
    const hasPhone = !!phoneTrim;
    const blankCheckout = isEmptyCheckoutCustomerInput(nameTrim, phoneTrim);

    if (requireName && !hasName) {
      showInlineAlert(t("customerNameRequired", "Customer name is required."), "warning");
      nameRef.current?.focus();
      submitLockUntilRef.current = 0;
      return;
    }
    if (requirePhone && !hasPhone) {
      showInlineAlert(t("customerPhoneRequired", "Customer phone is required."), "warning");
      phoneRef.current?.focus();
      submitLockUntilRef.current = 0;
      return;
    }

    // Blank / walk-in placeholder + not required → Walking Customer, straight to summary
    if (blankCheckout) {
      const walkIn = {
        name: WALKING_CUSTOMER_NAME,
        phone: "",
        city: data.city || getCountryLocations(country.iso).defaultCity,
        market: data.market || "",
        country: country.iso,
        countryName: country.name,
        isWalkIn: true,
        type: "walkin",
      };
      onSubmit?.(walkIn);
      persistCustomer(walkIn, billIdRef.current);
      broadcastEvent("CUSTOMER_SAVED", { customer: walkIn, billId: billIdRef.current });
      return;
    }

    const v = phoneTrim ? validatePhoneForCountry(phoneTrim, country) : null;
    if (v && !v.valid) {
      setPhoneStatus("invalid");
      showInlineAlert(t("customerPhoneInvalid", "Invalid phone — use +923162502498 format (no 0 after +92)."), "error");
      submitLockUntilRef.current = 0;
      return;
    }

    const phoneNorm = v?.normalized || toE164Phone(phoneTrim, country) || phoneTrim;
    const sid = storeIdRef.current || "default";
    const findByPhone = (p) => findCachedCustomerByPhone(p, sid);

    // Duplicate common-name guard. "Fahad" is common — many different people share it,
    // differing by father name (Fahad Ilyas / Fahad Khan). If this exact name already
    // exists on a DIFFERENT number and the biller did NOT pick/link that profile, nudge
    // them once to add a full name (or pick the existing one). Pressing F8 again proceeds
    // as a new, separate customer.
    if (hasName && phoneNorm && !linkedProfileRef.current && !duplicateNameAckRef.current) {
      const nameKey = nameTrim.toLowerCase();
      const myKey = phoneDigitsKey(phoneNorm);
      const dupExists = _getCache(sid).items.some(
        (c) => hasRealCustomerName(c.name)
          && (c.name || "").trim().toLowerCase() === nameKey
          && !String(c.id || "").startsWith("rt_")
          && !String(c.id || "").startsWith("order-only")
          && phoneDigitsKey(c.phone) !== myKey,
      );
      if (dupExists) {
        duplicateNameAckRef.current = true;
        showInlineAlert(
          t(
            "customerNameDuplicateHint",
            `"${nameTrim}" pehle se hai — last ya father ka naam likhein.`,
          ),
          "warning",
          5000,
        );
        nameRef.current?.focus();
        submitLockUntilRef.current = 0;
        return;
      }
    }

    const mergedInput = {
      name: nameTrim,
      phone: phoneNorm,
      city: data.city || getCountryLocations(country.iso).defaultCity,
      market: data.market || "",
      country: country.iso,
      countryName: country.name,
    };

    const isNameTaken = (candidate) => {
      const target = (candidate || '').trim().toLowerCase();
      if (!/^customer\s*\d+$/i.test(target)) return false;
      const myKey = phoneDigitsKey(phoneNorm);
      for (const entry of _getCache(sid).items) {
        if ((entry.name || '').trim().toLowerCase() !== target) continue;
        if (phoneDigitsKey(entry.phone) !== myKey) return true;
      }
      return false;
    };

    const finalData = finalizeCustomerForCheckout(mergedInput, {
      storeId: sid,
      findByPhone,
      isNameTaken,
    });

    // Multiple numbers per customer — EXPLICIT link only. The number attaches to an
    // existing profile ONLY when the biller picked/looked-up that customer (linkedProfileRef)
    // and the name still matches. Two different people with the SAME name typed fresh stay
    // separate. The bill keeps finalData.phone (current number) so the invoice shows exactly
    // what was entered at bill time.
    if (hasRealCustomerName(finalData.name) && finalData.phone) {
      const link = linkedProfileRef.current;
      const nameMatches = link
        && (link.name || '').trim().toLowerCase() === finalData.name.trim().toLowerCase();
      const validLinkId = link?.id
        && !String(link.id).startsWith('rt_')
        && !String(link.id).startsWith('order-only');
      if (link && nameMatches && validLinkId) {
        finalData.personaDocId = link.id;
        finalData.numbers = unionNumberLists(
          link.numbers?.length ? link.numbers : [link.phone],
          [finalData.phone],
        );
      } else {
        finalData.numbers = [finalData.phone];
      }
    }

    const docId = finalData.personaDocId || buildCustomerDocId(sid, finalData);
    if (finalData.phone && finalData.name && docId) {
      const saved = { ...finalData, id: docId, country: country.iso };
      _cacheUpsert(saved, sid);
      recordRecentCustomer(saved, sid);
      if (isAutoCustomerName(finalData.name)) {
        syncAutoCustomerCounter(_getCache(sid).items, sid);
      }
    }

    // Advance checkout immediately — DB save runs after
    onSubmit?.(finalData);

    persistCustomer(finalData, billIdRef.current);
    broadcastEvent('CUSTOMER_SAVED', { customer: finalData, billId: billIdRef.current });
    void flushCustomerToDb(finalData, country);
  }, [onSubmit, activeCountry, requireName, requirePhone, t, flushCustomerToDb, showInlineAlert]);

  // ── Keyboard navigation — Enter moves fields; F8 = next step ──
  const handleInputKeyDown = useCallback((e) => {
    if (showSug && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((p) => Math.min(p + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter" && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault();
        pickCustomer(suggestions[highlighted]);
        return;
      }
      if (e.key === "Escape") { e.stopPropagation(); setShowSug(false); setHighlighted(-1); return; }
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    const target = e.currentTarget;
    if (target === phoneRef.current) {
      skipNameSuggestRef.current = true;
      setShowSug(false);
      setSuggestions([]);
      setHighlighted(-1);
      setActiveField("name");
      focusSelectAll(nameRef.current);
      return;
    }
    if (target === nameRef.current) {
      setShowSug(false);
      setHighlighted(-1);
      setCityOpen(true);
      return;
    }
  }, [showSug, highlighted, suggestions, pickCustomer]);

  const openMarketDropdown = useCallback(() => {
    setCityOpen(false);
    setMarketOpen(true);
  }, []);

  const focusContinueButton = useCallback(() => {
    setMarketOpen(false);
    window.setTimeout(() => continueBtnRef.current?.focus(), 0);
  }, []);

  // ── F8: parent calls submitRef directly (instant); BroadcastChannel as fallback ──
  useEffect(() => {
    if (!submitRef) return;
    if (!isOpen) {
      submitRef.current = null;
      return;
    }
    submitRef.current = () => onFormSubmit(getValues());
    return () => { submitRef.current = null; };
  }, [isOpen, onFormSubmit, getValues, submitRef]);

  useEffect(() => {
    if (!isOpen) return;
    const ch = new BroadcastChannel(BILLING_CHANNEL);
    const onMsg = (e) => {
      if (e.data?.type === 'CHECKOUT_ADVANCE_F8') {
        onFormSubmit(getValues());
      }
    };
    ch.addEventListener('message', onMsg);
    return () => {
      ch.removeEventListener('message', onMsg);
      ch.close();
    };
  }, [isOpen, onFormSubmit, getValues]);

  // ── ESC only (local) ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (showSug) { setShowSug(false); setHighlighted(-1); return; }
      e.preventDefault(); e.stopPropagation();
      broadcastEvent('CUSTOMER_DIALOG_CLOSED', { billId: billIdRef.current });
      onClose?.();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, onClose, showSug]);

  const handleClose = useCallback(() => {
    persistCustomer(form, billIdRef.current);
    // ✅ BROADCAST: Dialog closed
    broadcastEvent('CUSTOMER_DIALOG_CLOSED', { customer: form, billId: billIdRef.current });
    onClose?.();
  }, [form, onClose]);

  const handleFieldBlur = useCallback((field) => {
    if (field === "phone" && form.phone?.trim()) {
      const v = validatePhoneForCountry(form.phone, activeCountry);
      if (v?.valid && v.normalized) setValue("phone", v.normalized);
    }
    setTimeout(() => { if (activeFieldRef.current === field) { setShowSug(false); setActiveField(""); setHighlighted(-1); } }, 80);
  }, [form.phone, activeCountry, setValue]);

  if (!isOpen) return null;

  // ── Style helpers ────────────────────────────────────────
  const inp = cn("w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-yellow-500/40", isDark ? "border-yellow-500/25 bg-[#0f0d09] text-white placeholder:text-gray-600" : "border-yellow-200 bg-white text-gray-900 placeholder:text-gray-400");
  const lbl = cn("mb-1 block text-[10px] font-bold uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-600");
  const hideRecentForSearch = showSug && activeField === "phone" && (sugLoading || suggestions.length > 0);
  const showRecentPanel = (recentCusts.length > 0 || recentLoading) && !hideRecentForSearch;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-3 sm:p-4"
      data-biller-modal="true"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn("relative w-full max-w-md rounded-xl shadow-2xl overflow-hidden", isDark ? "bg-[#15120d] border border-yellow-500/25" : "bg-white border border-yellow-200")}
      >
        {inlineAlert && (
          <div className={cn(
            "absolute right-3 top-14 z-[60] flex items-center gap-2 w-[220px] max-w-[calc(100%-1.5rem)] rounded-lg border px-2.5 py-2 shadow-lg text-xs font-semibold",
            inlineAlert.variant === "error"
              ? isDark ? "border-rose-400/30 bg-rose-950/95 text-rose-100" : "border-rose-300 bg-rose-50 text-rose-900"
              : isDark ? "border-amber-400/30 bg-amber-950/95 text-amber-100" : "border-amber-300 bg-amber-50 text-amber-900",
          )}>
            <AlertTriangle size={13} className="shrink-0" />
            <span className="flex-1 leading-snug">{inlineAlert.message}</span>
            <button type="button" onClick={dismissInlineAlert}><X size={12} /></button>
          </div>
        )}

        <div className={cn("flex items-center justify-between px-4 py-2.5 border-b", isDark ? "border-yellow-500/20 bg-black/20" : "border-yellow-100 bg-amber-50/40")}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500">
              <User size={12} className="text-black" />
            </div>
            <h2 className={cn("font-bold text-sm truncate", isDark ? "text-white" : "text-gray-900")}>
              {t("customerDetails") || "Customer Details"}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CountryPicker
              value={selectedCountryIso}
              onChange={handleCountrySelect}
              isDark={isDark}
              isOpen={countryOpen}
              onToggle={() => setCountryOpen((v) => !v)}
              onClose={() => setCountryOpen(false)}
            />
            <span className={cn("text-[9px] px-1 py-0.5 rounded font-mono font-bold", isDark ? "text-yellow-400" : "text-yellow-800")}>F8</span>
            <span className={cn("text-[9px] px-1 py-0.5 rounded font-mono font-bold", isDark ? "text-yellow-400" : "text-yellow-800")}>ESC</span>
            <button type="button" onClick={handleClose} className="rounded p-1 hover:bg-black/10"><X size={14} className={isDark ? "text-gray-400" : "text-gray-600"} /></button>
          </div>
        </div>

        <form onSubmit={(e) => e.preventDefault()} autoComplete="off" className="p-3.5 space-y-2.5 max-h-[70vh] overflow-y-auto" dir={dir}>
              {showRecentPanel && (
                <RecentCustomersPanel
                  customers={recentCusts}
                  onSelect={pickCustomer}
                  isDark={isDark}
                  loading={recentLoading && recentCusts.length === 0}
                  title={t("recentCustomers") || "Recent Customers"}
                  labelClass={lbl}
                />
              )}

              {/* Phone field */}
              <div>
                <label className={lbl}>
                  <Phone size={9} className="inline mr-1" />
                  {t("phone") || "Phone"}
                  {requirePhone && <span className="text-red-400 ml-0.5">*</span>}
                  <span className="text-gray-500 normal-case font-normal ml-1">
                    — {activeCountry.flag} {activeCountry.name} · {activeCountry.localHint}
                  </span>
                </label>
                <div className="relative flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCountryOpen((v) => !v)}
                    className={cn(
                      "shrink-0 flex items-center gap-1 px-2.5 rounded-xl border text-xs font-bold transition-colors",
                      isDark ? "border-yellow-500/25 bg-black/30 text-yellow-400 hover:bg-yellow-500/10" : "border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
                    )}
                    title={`Change country — ${activeCountry.name}`}
                  >
                    <span>{activeCountry.flag}</span>
                    <span className="font-mono">{activeCountry.dial}</span>
                  </button>
                  <div className="relative flex-1 min-w-0">
                    <input
                      {...register("phone")}
                      ref={(e) => { register("phone").ref(e); phoneRef.current = e; }}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-form-type="other"
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => {
                        setActiveField("phone");
                        focusSelectAll(phoneRef.current);
                        const key = phoneDigitsKey(form.phone);
                        if (key.length >= 3 && key.length < 15) doSearch(key);
                      }}
                      onBlur={() => handleFieldBlur("phone")}
                      onKeyDown={handleInputKeyDown}
                      placeholder={isPakistan ? "03XXXXXXXXX" : activeCountry.localHint}
                      className={cn(inp, "pr-8")}
                    />
                    <FieldMic fieldName="phone" speech={speech} isDark={isDark} onResult={(text) => handlePhoneChange(text.replace(/\D/g, ""))} />
                    {sugLoading && activeField === "phone" && (
                      <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-yellow-500" />
                    )}
                    {showSug && activeField === "phone" && (
                      <div
                        data-dropdown-open="true"
                        className={cn("absolute top-full left-0 right-0 z-[999] mt-1 rounded-lg border shadow-xl max-h-48 overflow-y-auto", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
                      >
                        {sugLoading ? (
                          <div className="flex items-center justify-center py-3 gap-2">
                            <Loader2 size={14} className="animate-spin text-yellow-500" />
                            <span className="text-xs text-gray-400">Searching…</span>
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((c, i) => (
                            <SugItem key={c.id || i} c={c} onSelect={pickCustomer} isDark={isDark} isHighlighted={i === highlighted} />
                          ))
                        ) : (
                          <div className={cn("px-3 py-3 text-xs text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                            <AlertCircle size={14} className="inline mr-1 text-orange-400" />
                            No customer found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {phoneStatus === "not_found" && (
                  <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} />New number — auto name
                  </p>
                )}
                {phoneStatus === "invalid" && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} />
                    {isPakistan ? "Use 03XXXXXXXXX or +923XXXXXXXXX" : `Valid ${activeCountry.localHint}`}
                  </p>
                )}
              </div>

              {/* Name field */}
              <div>
                <label className={lbl}>
                  <User size={9} className="inline mr-1" />
                  {t("name") || "Name"}
                  {requireName && <span className="text-red-400 ml-0.5">*</span>}
                  {!requireName && (
                    <span className="text-gray-500 normal-case font-normal ml-1">— leave empty for auto</span>
                  )}
                </label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    {...register("name")}
                    ref={(e) => { register("name").ref(e); nameRef.current = e; }}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => {
                      setActiveField("name");
                      focusSelectAll(nameRef.current);
                      if (!skipNameSuggestRef.current && userEditedNameRef.current && form.name.trim().length >= 3) {
                        doSearch(form.name);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (skipNameSuggestRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        skipNameSuggestRef.current = false;
                      }
                      handleInputKeyDown(e);
                    }}
                    onBlur={() => handleFieldBlur("name")}
                    placeholder="Search or type name…"
                    className={cn(inp, "pl-9 pr-8")}
                  />
                  <FieldMic fieldName="name" speech={speech} isDark={isDark} onResult={(text) => handleNameChange(text.trim())} />
                  {sugLoading && activeField === "name" && (
                    <Loader2 size={12} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-yellow-500" />
                  )}

                  {showSug && activeField === "name" && (
                      <div
                        data-dropdown-open="true"
                        className={cn("absolute top-full left-0 right-0 z-[999] mt-1 rounded-lg border shadow-xl max-h-48 overflow-y-auto", isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200")}
                      >
                        {sugLoading ? (
                          <div className="flex items-center justify-center py-3 gap-2">
                            <Loader2 size={14} className="animate-spin text-yellow-500" />
                            <span className="text-xs text-gray-400">Searching…</span>
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((c, i) => (
                            <SugItem key={c.id || i} c={c} onSelect={pickCustomer} isDark={isDark} isHighlighted={i === highlighted} />
                          ))
                        ) : (
                          <div className={cn("px-3 py-3 text-xs text-center", isDark ? "text-gray-500" : "text-gray-400")}>
                            <AlertCircle size={14} className="inline mr-1 text-orange-400" />
                            No customer found
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {speech?.isListening && speech?.activeField === "name" && speech?.transcript && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-yellow-500 italic mt-0.5">
                    🎤 &ldquo;{speech.transcript}&rdquo;
                  </motion.p>
                )}
              </div>

              {/* City + Market — follow selected country */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>
                    <MapPin size={9} className="inline mr-1" />
                    {t("city") || "City"}
                    <span className="text-gray-500 normal-case font-normal ml-1">
                      — {activeCountry.flag} {activeCountry.name}
                    </span>
                  </label>
                  <CustomDropdown
                    value={form.city}
                    options={allCities}
                    onChange={(v) => { setValue("city", v); prevCityRef.current = v; }}
                    onAddNew={onAddCity}
                    placeholder="Select city"
                    Icon={MapPin}
                    isDark={isDark}
                    triggerRef={cityTriggerRef}
                    open={cityOpen}
                    onOpenChange={setCityOpen}
                    onAfterSelect={openMarketDropdown}
                  />
                </div>
                <div>
                  <label className={lbl}>
                    <Store size={9} className="inline mr-1" />
                    {t("market") || "Market"}
                    <span className="text-gray-500 normal-case font-normal ml-1">
                      — {form.city || "city"}
                    </span>
                  </label>
                  <CustomDropdown
                    value={form.market}
                    options={allMarkets}
                    onChange={(v) => setValue("market", v)}
                    onAddNew={onAddMarket}
                    placeholder="Select market"
                    Icon={Store}
                    isDark={isDark}
                    triggerRef={marketTriggerRef}
                    open={marketOpen}
                    onOpenChange={setMarketOpen}
                    onAfterSelect={focusContinueButton}
                  />
                </div>
              </div>

              {/* Hotkey reference */}
              <div className={cn("rounded-xl p-2", isDark ? "bg-black/20" : "bg-gray-50")}>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[["Enter", "Next field"], ["F8", "Next step"], ["ESC", "Back (saved)"], ["↑↓", "Suggestions"]].map(([key, action]) => (
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

            <div className={cn("flex items-center justify-between gap-2 px-4 py-2.5 border-t", isDark ? "border-yellow-500/20" : "border-yellow-200")}>
              <p className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-400")}>ESC = back</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleClose} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium border", isDark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-gray-200 text-gray-600 hover:bg-gray-50")}>
                  ← Back
                </button>
                <button
                  ref={continueBtnRef}
                  type="button"
                  onClick={() => onFormSubmit(getValues())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onFormSubmit(getValues());
                    }
                  }}
                  className="rounded-lg px-4 py-1.5 text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 outline-none focus:ring-2 focus:ring-amber-400/50"
                >
                  Continue (F8) →
                </button>
              </div>
            </div>
      </div>
    </div>
  );
};

export default memo(CustomerDialog);