// File: src/pages/admin/CommissionSettings.jsx
// ✅ FIXED: Formula panel stays open, commission updates correctly, Firebase saves

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DollarSign, Plus, Trash2, Edit, Search,
  Wifi, Database, Check, Award,
  Percent, Users, ToggleLeft, ToggleRight,
  Info, ShieldAlert, Lock, Sparkles, UserPlus,
  Layers, Zap, Radio, Receipt, Settings2, ChevronDown, X,
} from 'lucide-react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  db,
  isFirebaseReady,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from '../../services/firebase';
import {
  getLocalOrdersForCommission,
  aggregateOrderCommissions,
  subscribeCommissionSettings,
  dedupeOrdersForCommission,
  buildAgentMap,
} from '../../services/commissionService';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { patchSetting, getCachedSettings } from '../../services/settingsStore';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useTheme } from '../../context/ThemeContext';
import { logActivity } from '../../services/activityLogger';
import { canManageSalespersons } from '../../hooks/useSalesperson';
import { cn } from '../../utils/cn';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import { useLanguage } from '../../hooks/useLanguage';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const fmt = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtComm = (n) =>
  `Rs. ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const COMMISSION_EXAMPLES = [
  { sale: 100,  pct: 1, comm: 1    },
  { sale: 500,  pct: 1, comm: 5    },
  { sale: 1250, pct: 1, comm: 12.5 },
  { sale: 5000, pct: 1, comm: 50   },
];

// ─────────────────────────────────────────────────────────────
// Firebase: save commission snapshot for an agent
// Collection: commissions/{agentId}/snapshots/{snapshotId}
// ─────────────────────────────────────────────────────────────
const saveCommissionToFirebase = async ({
  agentId,
  agentName,
  commissionRate,
  totalSales,
  commissionEarned,
  billsCount,
  itemCount,
  storeId = 'default',
}) => {
  if (!isFirebaseReady() || !db || !navigator.onLine) return;

  try {
    // 1. Upsert agent summary doc
    const agentRef = doc(db, 'commissions', agentId);
    await setDoc(
      agentRef,
      {
        agentId,
        agentName,
        commissionRate,
        totalSales,
        commissionEarned,
        billsCount,
        itemCount,
        storeId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add snapshot log entry
    const snapshotsRef = collection(db, 'commissions', agentId, 'snapshots');
    await addDoc(snapshotsRef, {
      agentId,
      agentName,
      commissionRate,
      totalSales,
      commissionEarned,
      billsCount,
      itemCount,
      storeId,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[CommissionSettings] Firebase save failed', e);
  }
};

// ─────────────────────────────────────────────────────────────
// Formula Panel — FIXED: uses ref so open state never resets
// ─────────────────────────────────────────────────────────────
const CommissionFormulaPanel = ({ isDark, open, onToggle }) => (
  <div
    className={cn(
      'rounded-2xl border overflow-hidden',
      isDark
        ? 'bg-[#0f0c08] border-[#2a1f0d]'
        : 'bg-amber-50/50 border-amber-200',
    )}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left transition-colors',
        isDark ? 'hover:bg-amber-500/5' : 'hover:bg-amber-50',
      )}
    >
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
        <Percent className="w-5 h-5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={cn(
            'text-sm sm:text-base font-bold',
            isDark ? 'text-white' : 'text-gray-900',
          )}
        >
          Commission — Percentage Only
        </h4>
        <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
          {open
            ? 'Tap to hide formula & examples'
            : 'Tap to show how % commission is calculated'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={cn(
            'hidden sm:inline text-[10px] font-semibold px-2 py-1 rounded-full',
            'bg-amber-500/15 text-amber-500',
          )}
        >
          % only
        </span>
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center border',
            open
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
              : isDark
              ? 'bg-[#1a1208] border-[#3a2c18] text-gray-400'
              : 'bg-white border-amber-200 text-gray-500',
          )}
        >
          {open ? (
            <X className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>
    </button>

    {/* ✅ FIXED: use max-height animation instead of grid rows */}
    <div
      className={cn(
        'transition-all duration-300 ease-out overflow-hidden',
        open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
      )}
    >
      <div
        className={cn(
          'px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200/80',
        )}
      >
        <div
          className={cn(
            'rounded-xl p-3 sm:p-4 text-xs sm:text-sm mt-4',
            isDark ? 'bg-[#0a0805]' : 'bg-white',
          )}
        >
          <p
            className={cn(
              'font-mono text-[11px] sm:text-xs mb-3',
              isDark ? 'text-gray-300' : 'text-gray-700',
            )}
          >
            Commission = Sale Amount × Rate ÷ 100
          </p>
          <p className="text-gray-500 mb-2">Examples (rate = 1 means 1%):</p>
          <ul className="space-y-1.5 sm:grid sm:grid-cols-2 sm:gap-x-4">
            {COMMISSION_EXAMPLES.map((ex) => (
              <li
                key={ex.sale}
                className={cn(
                  'flex justify-between gap-2',
                  isDark ? 'text-gray-400' : 'text-gray-600',
                )}
              >
                <span className="truncate">
                  Rs. {ex.sale.toLocaleString()} @ 1%
                </span>
                <span className="font-semibold text-emerald-500 shrink-0">
                  = Rs.{' '}
                  {ex.comm.toLocaleString(undefined, {
                    minimumFractionDigits: ex.comm % 1 ? 2 : 0,
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
            Fixed PKR per item removed — all agents use percentage only.
          </p>
        </div>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 🔒 ACCESS DENIED SCREEN
// ═══════════════════════════════════════════════════════════════
const AccessDeniedScreen = ({ userData, isDark }) => (
  <div className="p-4 sm:p-6 max-w-2xl mx-auto">
    <div
      className={cn(
        'rounded-2xl border p-8 text-center',
        isDark
          ? 'bg-[#0f0a05] border-red-500/30'
          : 'bg-white border-red-200',
      )}
    >
      <div
        className={cn(
          'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
          isDark ? 'bg-red-500/10' : 'bg-red-50',
        )}
      >
        <ShieldAlert className="w-8 h-8 text-red-500" />
      </div>
      <h2
        className={cn(
          'text-xl font-bold mb-2',
          isDark ? 'text-white' : 'text-gray-900',
        )}
      >
        Access Restricted
      </h2>
      <p
        className={cn(
          'text-sm mb-6 leading-relaxed',
          isDark ? 'text-gray-400' : 'text-gray-600',
        )}
      >
        Only the <strong>SuperAdmin</strong> can manage salesperson agents and
        commission settings.
      </p>
      <div
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs',
          isDark
            ? 'bg-[#1a1208] text-gray-500'
            : 'bg-gray-50 text-gray-600',
        )}
      >
        <Lock className="w-3.5 h-3.5" />
        Your role:{' '}
        <strong className="text-amber-500">
          {userData?.role || 'Unknown'}
        </strong>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════
const ModernBtn = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth,
  leftIcon,
  rightIcon,
  className,
  isDark,
  ...props
}) => {
  const sizeCls = {
    sm: 'min-h-[38px] px-3.5 py-2 text-xs rounded-xl gap-1.5',
    md: 'min-h-[44px] px-5 py-2.5 text-sm rounded-xl gap-2',
    lg: 'min-h-[52px] px-5 sm:px-6 py-3 text-sm sm:text-base rounded-2xl gap-2.5',
  };
  const variantCls = {
    primary: cn(
      'bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 text-white',
      'shadow-md shadow-amber-500/30 border border-amber-400/40',
      'hover:from-amber-400 hover:to-amber-500 hover:shadow-lg hover:shadow-amber-500/35',
    ),
    secondary: isDark
      ? 'bg-[#1a1208] text-gray-100 border border-[#3a2c18] hover:border-amber-500/50 hover:bg-[#221a0c]'
      : 'bg-white text-gray-800 border border-amber-200/80 hover:bg-amber-50 shadow-sm',
    ghost: isDark
      ? 'bg-transparent text-gray-300 hover:bg-[#1a1208] border border-transparent hover:border-[#3a2c18]'
      : 'bg-transparent text-gray-700 hover:bg-amber-50 border border-transparent',
    danger:
      'bg-gradient-to-r from-rose-500 to-rose-600 text-white border border-rose-400/40 shadow-md shadow-rose-500/20 hover:from-rose-400 hover:to-rose-500',
    outline: isDark
      ? 'bg-transparent text-amber-400 border-2 border-amber-500/40 hover:bg-amber-500/10'
      : 'bg-transparent text-amber-700 border-2 border-amber-300 hover:bg-amber-50',
  };
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200',
        'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2',
        sizeCls[size] || sizeCls.md,
        variantCls[variant] || variantCls.primary,
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {leftIcon}
      <span className="truncate">{children}</span>
      {rightIcon}
    </button>
  );
};

const IconActionBtn = ({ icon: Icon, label, tone = 'amber', onClick }) => {
  const tones = {
    amber: 'hover:bg-amber-500/15 hover:text-amber-500 hover:border-amber-500/30',
    blue:  'hover:bg-blue-500/15  hover:text-blue-500  hover:border-blue-500/30',
    rose:  'hover:bg-rose-500/15  hover:text-rose-500  hover:border-rose-500/30',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center w-9 h-9 rounded-xl border border-transparent',
        'text-gray-400 transition-all duration-200 active:scale-95',
        tones[tone] || tones.amber,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
};

const ToggleSwitch = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
      checked ? 'bg-amber-500' : 'bg-gray-600/40',
      disabled && 'opacity-50 cursor-not-allowed',
    )}
  >
    <span
      className={cn(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 mt-1',
        checked ? 'translate-x-6 ms-1' : 'translate-x-1',
      )}
    />
  </button>
);

const FeatureToggleCard = ({
  isDark,
  icon: Icon,
  title,
  desc,
  checked,
  onChange,
  badge,
  accent = 'amber',
}) => {
  const stripColor =
    accent === 'blue'
      ? checked
        ? 'border-l-blue-500'
        : 'border-l-blue-500/20'
      : checked
      ? 'border-l-amber-500'
      : 'border-l-amber-500/15';

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-[168px] rounded-2xl border border-l-[3px] p-4 sm:p-5 transition-all duration-200',
        stripColor,
        checked
          ? isDark
            ? 'bg-gradient-to-br from-[#141008] to-[#0c0a06] border-[#2a2418] shadow-md shadow-amber-500/5'
            : 'bg-gradient-to-br from-amber-50/90 to-white border-amber-200/80 shadow-sm'
          : isDark
          ? 'bg-[#0a0805] border-[#1f1a12]'
          : 'bg-white border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className={cn(
            'w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors',
            checked
              ? accent === 'blue'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-amber-500 text-[#0a0805] shadow-lg shadow-amber-500/25'
              : isDark
              ? 'bg-[#1a1208] text-gray-500'
              : 'bg-gray-100 text-gray-400',
          )}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h4
            className={cn(
              'text-sm sm:text-base font-bold leading-snug',
              isDark ? 'text-white' : 'text-gray-900',
            )}
          >
            {title}
          </h4>
          {badge && (
            <span className="text-[9px] px-2 py-0.5 rounded-md bg-amber-500 text-white font-bold uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
          {desc}
        </p>
      </div>

      <div
        className={cn(
          'mt-4 pt-3 border-t flex items-center justify-between gap-2',
          isDark ? 'border-[#2a1f0d]/80' : 'border-gray-100',
        )}
      >
        <span className="text-[11px] text-gray-500 truncate">
          {checked ? 'Enabled on biller' : 'Disabled for biller'}
        </span>
        <span
          className={cn(
            'shrink-0 text-[10px] sm:text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg',
            checked
              ? 'bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25'
              : isDark
              ? 'bg-gray-800/80 text-gray-500 ring-1 ring-gray-700/50'
              : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
          )}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// AGENT FORM COMPONENT
// ═══════════════════════════════════════════════════════════════
const AgentForm = ({
  isDark,
  values,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  mode,
}) => {
  const { name, rate, isActive } = values;
  return (
    <div className="space-y-4 pt-2">
      <Input
        label="Salesperson Full Name"
        placeholder="e.g. Fahad Khan"
        value={name}
        onChange={(e) => onChange('name', e.target.value)}
        leftIcon={<Users className="w-4 h-4 text-amber-500" />}
      />

      <Input
        label="Commission Rate (%)"
        placeholder="e.g. 1 for 1%, 5 for 5%"
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={rate}
        onChange={(e) => onChange('rate', e.target.value)}
        leftIcon={<Percent className="w-4 h-4 text-amber-500" />}
      />
      <p className="text-[11px] text-gray-500 -mt-2">
        Percentage only — e.g. rate <strong>1</strong> = 1% (Rs. 100 sale →
        Rs. 1 commission)
      </p>

      {/* ✅ Live preview */}
      {Number(rate) > 0 && (
        <div
          className={cn(
            'rounded-xl p-3 text-xs border',
            isDark
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-800',
          )}
        >
          <p className="font-semibold mb-1">
            Live Preview — {Number(rate)}% commission:
          </p>
          <div className="grid grid-cols-2 gap-1">
            {[500, 1000, 5000, 10000].map((sale) => (
              <span key={sale} className="flex justify-between gap-2">
                <span>Rs. {sale.toLocaleString()}</span>
                <span className="font-bold text-emerald-500">
                  → Rs.{' '}
                  {((sale * Number(rate)) / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => onChange('isActive', e.target.checked)}
            className="w-4 h-4 rounded text-amber-500"
          />
          <span
            className={cn(
              'text-xs font-medium',
              isDark ? 'text-gray-300' : 'text-gray-700',
            )}
          >
            Active / Authorized Agent
          </span>
        </label>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-[#2a1f0d]/30">
        <ModernBtn
          isDark={isDark}
          variant="secondary"
          onClick={onCancel}
          fullWidth
          className="sm:flex-1"
          disabled={isSubmitting}
        >
          Cancel
        </ModernBtn>
        <ModernBtn
          isDark={isDark}
          variant="primary"
          onClick={onSubmit}
          fullWidth
          className="sm:flex-1"
          disabled={isSubmitting}
          leftIcon={<Check className="w-4 h-4 shrink-0" />}
        >
          {isSubmitting
            ? mode === 'edit'
              ? 'Updating…'
              : 'Registering…'
            : mode === 'edit'
            ? 'Save Changes'
            : 'Register Agent'}
        </ModernBtn>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const CommissionSettings = () => {
  const { isDark }               = useTheme();
  const { userData }             = useAuth();
  const { isOnline }             = useNetwork();
  const { settings } = useSettings();
  const { t, isRTL }             = useLanguage();

  // ─── 🔒 SUPER ADMIN GUARD ───────────────────────────────────
  const isAuthorized = useMemo(
    () => canManageSalespersons(userData),
    [userData],
  );

  if (!isAuthorized) {
    return <AccessDeniedScreen userData={userData} isDark={isDark} />;
  }

  const sp     = settings?.salesperson || {};
  const agents = useMemo(
    () => (sp.agents || []).map((a) => ({ ...a, commissionType: 'percent' })),
    [sp.agents],
  );

  // ── Data ────────────────────────────────────────────────────
  const [orders,        setOrders]        = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // ── Filters ─────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showSug,      setShowSug]      = useState(false);

  // ✅ FIXED: showFormula persists using useRef + useState
  const formulaOpenRef              = useRef(false);
  const [showFormula, setShowFormula] = useState(false);
  const toggleFormula = useCallback(() => {
    formulaOpenRef.current = !formulaOpenRef.current;
    setShowFormula(formulaOpenRef.current);
  }, []);

  // ── Modals ──────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [selAgent,   setSelAgent]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Form state ───────────────────────────────────────────────
  const emptyForm = useMemo(() => ({ name: '', rate: 1, isActive: true }), []);
  const [form, setForm] = useState(emptyForm);
  const setF = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);

  // ── Orders: local Dexie primary, Firebase one-shot merge when online ──
  useEffect(() => {
    let broadcastCh   = null;
    let settingUnsub  = null;
    const scopeStore = userData?.primaryStore || userData?.branchId || null;

    const loadLocal = async () => {
      setLoadingOrders(true);
      try {
        const local = await getLocalOrdersForCommission();
        setOrders(local);
      } catch (e) {
        console.warn('[CommissionSettings] loadLocal error', e);
      } finally {
        setLoadingOrders(false);
      }
    };

    const loadRemoteOrders = async () => {
      if (!isFirebaseReady() || !db || !navigator.onLine) return;
      try {
        const base = collection(db, 'orders');
        const q = scopeStore
          ? query(base, where('storeId', '==', scopeStore), orderBy('createdAt', 'desc'), limit(500))
          : query(base, orderBy('createdAt', 'desc'), limit(500));
        const snap = await getDocs(q);
        const remote = snap.docs.map((d) => ({
          id: d.id,
          firebaseId: d.id,
          ...d.data(),
        }));
        setOrders((prev) => dedupeOrdersForCommission([...prev, ...remote]));
      } catch (err) {
        console.warn('[CommissionSettings] orders fetch error', err);
      }
    };

    const refreshOrders = async () => {
      await loadLocal();
      await loadRemoteOrders();
    };

    void refreshOrders();

    settingUnsub = subscribeCommissionSettings(() => { void refreshOrders(); });

    try {
      broadcastCh           = new BroadcastChannel('aone_pos_orders');
      broadcastCh.onmessage = () => { void refreshOrders(); };
    } catch { /* ignore — unsupported browser */ }

    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshOrders();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      try { broadcastCh  && broadcastCh.close(); } catch { /* ignore */ }
      try { settingUnsub && settingUnsub(); } catch { /* ignore */ }
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [userData?.primaryStore, userData?.branchId]);

  // ── Performance metrics ──────────────────────────────────────
  // ✅ FIXED: correct aggregation — uses aggregateOrderCommissions properly
  const perf = useMemo(() => {
    const agentMap = buildAgentMap(agents);

    // Initialize all agents
    const result = {};
    agents.forEach((a) => {
      result[a.id] = {
        totalSales:       0,
        commissionGross:  0,
        commissionEarned: 0,
        billsInvolved:    new Set(),
        itemCount:        0,
      };
    });

    // Aggregate from orders
    orders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;

      const agg = aggregateOrderCommissions(order, agents, {
        preferAgentRegistry: true,
      });

      agents.forEach((a) => {
        const id  = a.id;
        const row = agg[id];
        if (!row) return;

        result[id].totalSales       += row.totalSales       || 0;
        result[id].commissionGross  += row.commissionGross  || 0;
        result[id].commissionEarned += row.commissionEarned || 0;
        result[id].itemCount        += row.itemCount        || 0;
        row.billsInvolved?.forEach?.((bid) =>
          result[id].billsInvolved.add(bid),
        );
      });
    });

    // Convert Sets to counts & re-compute commission from rate (source of truth)
    const final = {};
    agents.forEach((a) => {
      const id         = a.id;
      const sales      = result[id].totalSales;
      const rate       = Number(a.commissionRate || 0);
      // ✅ Commission = sales × rate ÷ 100
      const commission = Math.round((sales * rate) / 100 * 100) / 100;

      final[id] = {
        totalSales:       sales,
        commissionGross:  commission,
        commissionEarned: commission,
        billsInvolved:    result[id].billsInvolved.size,
        itemCount:        result[id].itemCount,
      };
    });

    return final;
  }, [agents, orders]);

  // ── Firebase sync: push commission data when perf updates ────
  // ✅ NEW: Auto-sync agent commission summaries to Firebase
  const lastSyncRef = useRef({});
  useEffect(() => {
    if (!isFirebaseReady() || !db || !navigator.onLine) return;
    if (agents.length === 0) return;

    agents.forEach((agent) => {
      const m = perf[agent.id];
      if (!m) return;

      // Only sync if data changed (avoid infinite loops)
      const key  = agent.id;
      const prev = lastSyncRef.current[key];
      const sig  = `${m.totalSales}|${m.commissionEarned}|${m.billsInvolved}`;
      if (prev === sig) return;
      lastSyncRef.current[key] = sig;

      // Don't sync zero-data agents on every render
      if (m.totalSales === 0 && m.commissionEarned === 0) return;

      saveCommissionToFirebase({
        agentId:          agent.id,
        agentName:        agent.name,
        commissionRate:   agent.commissionRate,
        totalSales:       m.totalSales,
        commissionEarned: m.commissionEarned,
        billsCount:       m.billsInvolved,
        itemCount:        m.itemCount,
        storeId:          userData?.primaryStore || 'default',
      });
    });
  }, [perf, agents, userData]);

  // ── Summary stats ────────────────────────────────────────────
  const stats = useMemo(() => {
    const active  = agents.filter((a) => a.isActive !== false).length;
    let totalComm = 0;
    let topId     = null;
    let topComm   = -1;

    Object.entries(perf).forEach(([id, m]) => {
      totalComm += m.commissionEarned;
      if (m.commissionEarned > topComm) {
        topComm = m.commissionEarned;
        topId   = id;
      }
    });

    const topAgentRow  = topId ? agents.find((a) => a.id === topId) : null;
    const topAgentName = topId && topComm > 0 ? topAgentRow?.name || '—' : '—';
    const topAgentComm = topId && topComm > 0 ? fmtComm(topComm) : null;

    return { total: agents.length, active, totalComm, topAgentName, topAgentComm };
  }, [agents, perf]);

  // ── Autocomplete suggestions ─────────────────────────────────
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return agents
      .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
      .map((a) => a.name)
      .slice(0, 5);
  }, [search, agents]);

  // ── Filtered agents ──────────────────────────────────────────
  const filtered = useMemo(() => {
    return agents.filter((a) => {
      const active  = a.isActive !== false;
      const matchQ  =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.id.toLowerCase().includes(search.toLowerCase());
      const matchSt =
        statusFilter === 'all' ||
        (statusFilter === 'active'   &&  active) ||
        (statusFilter === 'inactive' && !active);
      return matchQ && matchSt;
    });
  }, [agents, search, statusFilter]);

  // ── Setting toggle helper ────────────────────────────────────
  const toggleSetting = useCallback(
    async (key, val) => {
      await patchSetting('salesperson', (current) => {
        const next = { ...(current || {}), [key]: val };
        // Keep legacy `enabled` in sync — permissions page no longer toggles it
        if (key === 'enableCommission') next.enabled = val;
        return next;
      });
    },
    [],
  );

  // ── CRUD handlers ────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setForm(emptyForm);
    setShowCreate(true);
  }, [emptyForm]);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) return toast.error('Agent name is required');
    if (form.rate < 0)      return toast.error('Rate cannot be negative');

    setSubmitting(true);
    try {
      const newAgent = {
        id:             `agent_${Date.now()}`,
        name:           form.name.trim(),
        commissionType: 'percent',
        commissionRate: Number(form.rate),
        isActive:       true,
        createdAt:      new Date().toISOString(),
        createdBy:      userData?.uid || 'superadmin',
      };

      const currentSp = getCachedSettings().salesperson || {};
      const updatedAgents = [...(currentSp.agents || []), newAgent];
      await patchSetting('salesperson', { ...currentSp, agents: updatedAgents });

      // ✅ Save new agent to Firebase commissions collection
      await saveCommissionToFirebase({
        agentId:          newAgent.id,
        agentName:        newAgent.name,
        commissionRate:   newAgent.commissionRate,
        totalSales:       0,
        commissionEarned: 0,
        billsCount:       0,
        itemCount:        0,
        storeId:          userData?.primaryStore || 'default',
      });

      await logActivity(
        'salesperson:add',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { ...newAgent },
      );

      toast.success(`${newAgent.name} registered with ${newAgent.commissionRate}% commission`);
      setForm(emptyForm);
      setShowCreate(false);
    } catch (e) {
      toast.error(e.message || 'Failed to add agent');
    } finally {
      setSubmitting(false);
    }
  }, [form, userData, emptyForm]);

  const openEdit = useCallback((agent) => {
    setSelAgent(agent);
    setForm({
      name:     agent.name,
      rate:     agent.commissionRate,
      isActive: agent.isActive !== false,
    });
    setShowEdit(true);
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!form.name.trim()) return toast.error('Name required');

    setSubmitting(true);
    try {
      const currentSp = getCachedSettings().salesperson || {};
      const currentAgents = currentSp.agents || [];
      const updatedAgents = currentAgents.map((a) =>
        a.id === selAgent.id
          ? {
              ...a,
              name:           form.name.trim(),
              commissionType: 'percent',
              commissionRate: Number(form.rate),
              isActive:       form.isActive,
              updatedAt:      new Date().toISOString(),
              updatedBy:      userData?.uid || 'superadmin',
            }
          : a,
      );

      await patchSetting('salesperson', { ...currentSp, agents: updatedAgents });

      // ✅ Update Firebase commission doc for this agent
      const m = perf[selAgent.id] || {};
      await saveCommissionToFirebase({
        agentId:          selAgent.id,
        agentName:        form.name.trim(),
        commissionRate:   Number(form.rate),
        totalSales:       m.totalSales       || 0,
        commissionEarned: m.commissionEarned || 0,
        billsCount:       m.billsInvolved    || 0,
        itemCount:        m.itemCount        || 0,
        storeId:          userData?.primaryStore || 'default',
      });

      await logActivity(
        'salesperson:update',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { agentId: selAgent.id, ...form },
      );

      toast.success('Agent updated!');
      setShowEdit(false);
      setSelAgent(null);
      setForm(emptyForm);
    } catch (e) {
      toast.error(e.message || 'Failed to update agent');
    } finally {
      setSubmitting(false);
    }
  }, [form, selAgent, userData, perf, emptyForm]);

  const handleToggle = useCallback(
    async (agent) => {
      const next = agent.isActive === false; // toggle
      const currentSp = getCachedSettings().salesperson || {};
      const updatedAgents = (currentSp.agents || []).map((a) =>
        a.id === agent.id ? { ...a, isActive: next } : a,
      );
      await patchSetting('salesperson', { ...currentSp, agents: updatedAgents });

      // ✅ Update Firebase status
      if (isFirebaseReady() && db && navigator.onLine) {
        try {
          await setDoc(
            doc(db, 'commissions', agent.id),
            { isActive: next, updatedAt: serverTimestamp() },
            { merge: true },
          );
        } catch (e) {
          console.warn('[CommissionSettings] Firebase toggle sync failed', e);
        }
      }

      await logActivity(
        'salesperson:toggle',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { agentId: agent.id, newStatus: next ? 'active' : 'inactive' },
      );
      toast.success(
        `${agent.name} is now ${next ? 'Active' : 'Inactive'}`,
      );
    },
    [userData],
  );

  const handleDelete = useCallback(
    async (agent) => {
      if (!confirm(`Delete ${agent.name}? This cannot be undone.`)) return;

      const currentSp = getCachedSettings().salesperson || {};
      const updatedAgents = (currentSp.agents || []).filter((a) => a.id !== agent.id);
      await patchSetting('salesperson', { ...currentSp, agents: updatedAgents });

      // ✅ Mark as deleted in Firebase (soft-delete)
      if (isFirebaseReady() && db && navigator.onLine) {
        try {
          await setDoc(
            doc(db, 'commissions', agent.id),
            {
              isDeleted: true,
              deletedAt: serverTimestamp(),
              deletedBy: userData?.uid || 'superadmin',
            },
            { merge: true },
          );
        } catch (e) {
          console.warn('[CommissionSettings] Firebase delete sync failed', e);
        }
      }

      await logActivity(
        'salesperson:delete',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { agentId: agent.id, agentName: agent.name },
      );
      toast.success('Agent deleted');
    },
    [userData],
  );

  const hasFilters = search || statusFilter !== 'all';

  const featureDefs = useMemo(
    () => [
      {
        key:   'enableCommission',
        icon:  Zap,
        title: 'Commission System',
        desc:  'Turn on commission math and payout totals on bills.',
      },
      {
        key:   'allowMultiplePerBill',
        icon:  Layers,
        title: 'Multiple per Bill',
        desc:  'Different salesperson on each line item — commission per item.',
        badge: 'NEW',
        accent:'blue',
      },
      {
        key:   'showOnTable',
        icon:  Receipt,
        title: 'Table Column',
        desc:  'Show salesperson name on each row in the biller table.',
      },
      {
        key:   'requireSelection',
        icon:  Radio,
        title: 'Required on Save',
        desc:  'Biller must pick a salesperson before saving the bill.',
      },
    ],
    [],
  );

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      {/* ── Page Header ─────────────────────────────────────── */}
      <PageHeader
        icon={DollarSign}
        title={t('admin.commissionPage.title', 'Commission Settings')}
        description={t('admin.commissionPage.subtitle', 'Salesperson agents & payout rules')}
        badge={(
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full',
              isOnline
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-amber-500/15 text-amber-500',
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500',
              )}
            />
            {isOnline ? 'Live sync' : 'Offline · local'}
            {!loadingOrders && (
              <span className="opacity-70">· {orders.length} bills</span>
            )}
          </span>
        )}
        actions={(
          <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3">
            <ModernBtn
              isDark={isDark}
              variant="secondary"
              size="md"
              fullWidth
              className="sm:min-w-[120px] sm:w-auto"
              leftIcon={<Settings2 className="w-4 h-4 shrink-0" />}
              onClick={() =>
                document
                  .getElementById('commission-features')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Features
            </ModernBtn>
            <ModernBtn
              isDark={isDark}
              variant="primary"
              size="md"
              fullWidth
              className="sm:min-w-[200px] sm:w-auto"
              leftIcon={<UserPlus className="w-4 h-4 shrink-0" />}
              onClick={openAddModal}
            >
              Add Agent &amp; Commission
            </ModernBtn>
          </div>
        )}
      />

      {/* ── Admin notice ─────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs',
          isDark
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            : 'bg-amber-50 border border-amber-200 text-amber-700',
        )}
      >
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          <strong>SuperAdmin only.</strong> You manage agents and rules here.
          Billers only select from your list.
        </span>
      </div>

      {/* ── Stat cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5 max-w-3xl lg:max-w-none">
        <StatCard label="Total Agents"     value={stats.total}      icon={Users}      color="amber"   />
        <StatCard label="Active"           value={stats.active}     icon={Check}      color="green"   />
        <StatCard label="Commission Paid"  value={fmtComm(stats.totalComm)} icon={DollarSign} color="emerald" />
        <StatCard
          label="Top Performer"
          value={stats.topAgentComm ? stats.topAgentName : 'None yet'}
          subtitle={stats.topAgentComm || undefined}
          icon={Award}
          color="blue"
        />
      </div>

      {/* ── Formula panel ────────────────────────────────────── */}
      <CommissionFormulaPanel
        isDark={isDark}
        open={showFormula}
        onToggle={toggleFormula}
      />

      {/* ── Link to role permissions (no duplicate toggles here) ── */}
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs',
          isDark ? 'bg-blue-500/5 border-blue-500/20 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800',
        )}
      >
        <span>
          <strong>Manager access</strong> (view / pay / edit commission) — set under{' '}
          <strong>Roles &amp; Permissions → Manager → Commission Reports</strong>, not here.
        </span>
        <Link
          to="/admin/permissions"
          className={cn(
            'inline-flex items-center justify-center px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors',
            isDark ? 'bg-blue-500/15 hover:bg-blue-500/25' : 'bg-white hover:bg-blue-100 border border-blue-200',
          )}
        >
          Open Permissions
        </Link>
      </div>

      {/* ── Feature toggles ──────────────────────────────────── */}
      <section
        id="commission-features"
        className={cn(
          'rounded-2xl border overflow-hidden',
          isDark
            ? 'bg-[#0a0805] border-[#2a1f0d]'
            : 'bg-white border-amber-100 shadow-sm',
        )}
      >
        <div
          className={cn(
            'px-4 sm:px-6 py-4 sm:py-5 border-b flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
            isDark
              ? 'border-[#2a1f0d] bg-[#0f0c08]/50'
              : 'border-amber-100 bg-amber-50/40',
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <h3
                className={cn(
                  'text-lg sm:text-xl font-bold',
                  isDark ? 'text-white' : 'text-gray-900',
                )}
              >
                Salesperson Feature Settings
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed sm:max-w-2xl">
              Control what billers can do. Flip a switch — changes apply
              instantly.
            </p>
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shrink-0 self-start sm:self-center',
              sp.enableCommission
                ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30'
                : isDark
                ? 'bg-gray-800/50 text-gray-400 ring-1 ring-gray-700/50'
                : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                sp.enableCommission
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-gray-500',
              )}
            />
            {sp.enableCommission ? 'System ON' : 'System OFF'}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
            {featureDefs.map((s) => (
              <FeatureToggleCard
                key={s.key}
                isDark={isDark}
                icon={s.icon}
                title={s.title}
                desc={s.desc}
                badge={s.badge}
                accent={s.accent}
                checked={!!sp[s.key]}
                onChange={async (val) => {
                  await toggleSetting(s.key, val);
                  toast.success(`${s.title} ${val ? 'on' : 'off'}`, {
                    id: `sp-${s.key}`,
                  });
                }}
              />
            ))}
          </div>

          {sp.allowMultiplePerBill && (
            <div
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl text-xs sm:text-sm',
                isDark
                  ? 'bg-blue-500/10 text-blue-200 border border-blue-500/20'
                  : 'bg-blue-50 text-blue-800 border border-blue-200',
              )}
            >
              <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-400" />
              <p className="leading-relaxed">
                <strong>Multi-agent billing is on.</strong> Biller selects a
                current salesperson; each new line item follows that agent until
                they switch. Commission uses each agent&apos;s own rate.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Filters ──────────────────────────────────────────── */}
      <div
        className={cn(
          'p-4 rounded-2xl border',
          isDark
            ? 'bg-[#0f0a05] border-[#2a1f0d]'
            : 'bg-white border-amber-100',
        )}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-end">
          <div className="relative flex-1 min-w-0">
            <Input
              label="Search Agents"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              leftIcon={<Search className="w-4 h-4 text-amber-500" />}
            />
            {showSug && suggestions.length > 0 && (
              <div
                className={cn(
                  'absolute left-0 right-0 mt-1 z-50 rounded-xl border shadow-xl',
                  isDark
                    ? 'bg-[#150f08] border-[#3a2c18]'
                    : 'bg-white border-amber-200',
                )}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={() => {
                      setSearch(s);
                      setShowSug(false);
                    }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-xs hover:bg-amber-500/10',
                      isDark
                        ? 'text-gray-300 hover:text-amber-400'
                        : 'text-gray-700',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:max-w-md">
            <div>
              <label
                className={cn(
                  'block text-xs font-semibold uppercase mb-1.5',
                  isDark ? 'text-gray-400' : 'text-gray-600',
                )}
              >
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={cn(
                  'w-full min-h-[44px] px-3 py-2.5 text-sm rounded-xl border outline-none font-medium',
                  isDark
                    ? 'border-[#2a1f0d] text-white bg-[#0a0805] focus:border-amber-500/50'
                    : 'border-amber-200 text-gray-900 bg-white focus:border-amber-500',
                )}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-end">
              <ModernBtn
                isDark={isDark}
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                Reset filters
              </ModernBtn>
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent cards (top 6) ───────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.slice(0, 6).map((agent) => {
            const active = agent.isActive !== false;
            const m      = perf[agent.id] || {};
            return (
              <div
                key={agent.id}
                className={cn(
                  'rounded-2xl border p-4 transition-all hover:shadow-lg',
                  isDark
                    ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/30'
                    : 'bg-white border-amber-100 hover:border-amber-300',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-bold text-amber-500 truncate">
                      {agent.name}
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                      {agent.commissionRate}% commission
                    </p>
                  </div>
                  <Badge variant={active ? 'success' : 'danger'}>
                    {active ? 'Active' : 'Off'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div
                    className={cn(
                      'rounded-lg px-2 py-1.5',
                      isDark ? 'bg-[#1a1208]' : 'bg-gray-50',
                    )}
                  >
                    <span className="text-gray-500 block">Earned</span>
                    <span className="font-bold text-emerald-500">
                      {fmtComm(m.commissionEarned || 0)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'rounded-lg px-2 py-1.5',
                      isDark ? 'bg-[#1a1208]' : 'bg-gray-50',
                    )}
                  >
                    <span className="text-gray-500 block">Bills</span>
                    <span className="font-semibold">
                      {m.billsInvolved || 0}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-[#2a1f0d]/30">
                  <ModernBtn
                    isDark={isDark}
                    variant="secondary"
                    size="sm"
                    fullWidth
                    className="flex-1"
                    onClick={() => openEdit(agent)}
                  >
                    Edit
                  </ModernBtn>
                  <ModernBtn
                    isDark={isDark}
                    variant={active ? 'outline' : 'primary'}
                    size="sm"
                    fullWidth
                    className="flex-1"
                    onClick={() => handleToggle(agent)}
                  >
                    {active ? 'Pause' : 'Activate'}
                  </ModernBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Full Agent Table ─────────────────────────────────── */}
      <div
        className={cn(
          'rounded-2xl border overflow-hidden shadow-lg',
          isDark
            ? 'bg-[#0f0a05] border-[#2a1f0d]'
            : 'bg-white border-amber-100',
        )}
      >
        {/* Table header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#2a1f0d]/50 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3
              className={cn(
                'font-bold flex items-center gap-2',
                isDark ? 'text-white' : 'text-gray-900',
              )}
            >
              <Users className="w-4 h-4 text-amber-500" />
              Sales Agent Registry
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Full list with sales &amp; commission breakdown
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Badge variant="info" className="justify-center sm:justify-start">
              {filtered.length} shown · {agents.length} total
            </Badge>
            <ModernBtn
              isDark={isDark}
              variant="primary"
              size="sm"
              fullWidth
              className="sm:w-auto sm:min-w-[130px]"
              leftIcon={<Plus className="w-4 h-4 shrink-0" />}
              onClick={openAddModal}
            >
              Add Agent
            </ModernBtn>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div
              className={cn(
                'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
                isDark ? 'bg-amber-500/10' : 'bg-amber-50',
              )}
            >
              <Users className="w-8 h-8 text-amber-500" />
            </div>
            <h3
              className={cn(
                'text-base font-bold mb-1',
                isDark ? 'text-white' : 'text-gray-900',
              )}
            >
              {hasFilters ? 'No Matching Agents' : 'No Sales Agents Yet'}
            </h3>
            <p
              className={cn(
                'text-sm mb-6 max-w-md mx-auto',
                isDark ? 'text-gray-400' : 'text-gray-600',
              )}
            >
              {hasFilters
                ? "Try adjusting your search or filters to find what you're looking for."
                : 'Register your first sales agent to start tracking commissions and earnings.'}
            </p>
            {hasFilters ? (
              <ModernBtn
                isDark={isDark}
                variant="secondary"
                size="lg"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                Clear Filters
              </ModernBtn>
            ) : (
              <ModernBtn
                isDark={isDark}
                variant="primary"
                size="lg"
                leftIcon={<UserPlus className="w-5 h-5 shrink-0" />}
                onClick={openAddModal}
              >
                Add Your First Sales Agent
              </ModernBtn>
            )}
          </div>
        ) : (
          /* Data table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead
                className={cn(
                  'border-b border-[#2a1f0d]/50 text-xs font-semibold uppercase tracking-wider',
                  isDark
                    ? 'bg-[#0a0805] text-gray-400'
                    : 'bg-amber-50/50 text-gray-600',
                )}
              >
                <tr>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3 text-right">Rate (%)</th>
                  <th className="px-5 py-3 text-right">Bills</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3 text-right">Sales Volume</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Sync</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody
                className={cn(
                  'divide-y divide-[#2a1f0d]/30',
                  isDark ? 'text-gray-300' : 'text-gray-700',
                )}
              >
                {filtered.map((agent) => {
                  const active = agent.isActive !== false;
                  const m      = perf[agent.id] || {};
                  return (
                    <tr
                      key={agent.id}
                      className={cn(
                        'transition-colors',
                        isDark
                          ? 'hover:bg-[#1a1208]'
                          : 'hover:bg-amber-50/50',
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-amber-500">
                          {agent.name}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          {agent.id
                            .replace('agent_', 'AGT-')
                            .substring(0, 16)
                            .toUpperCase()}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-amber-500">
                        {agent.commissionRate}%
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {m.billsInvolved || 0}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {m.itemCount || 0}
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-400">
                        {fmt(m.totalSales || 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="font-bold text-emerald-500">
                          {fmtComm(m.commissionEarned || 0)}
                        </div>
                        {/* ✅ Show formula breakdown */}
                        {(m.totalSales || 0) > 0 && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {agent.commissionRate}% × {fmt(m.totalSales)} ={' '}
                            {fmtComm(m.commissionEarned)}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button onClick={() => handleToggle(agent)}>
                          <Badge variant={active ? 'success' : 'danger'}>
                            {active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isOnline ? (
                          <Wifi className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <Database className="w-4 h-4 text-amber-500 mx-auto animate-pulse" />
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <IconActionBtn
                            icon={active ? ToggleRight : ToggleLeft}
                            label={active ? 'Deactivate' : 'Activate'}
                            tone="amber"
                            onClick={() => handleToggle(agent)}
                          />
                          <IconActionBtn
                            icon={Edit}
                            label="Edit agent"
                            tone="blue"
                            onClick={() => openEdit(agent)}
                          />
                          <IconActionBtn
                            icon={Trash2}
                            label="Delete agent"
                            tone="rose"
                            onClick={() => handleDelete(agent)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Floating Action Button (mobile) ──────────────────── */}
      <button
        type="button"
        onClick={openAddModal}
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-2xl shadow-amber-500/45 flex items-center justify-center text-white z-40 hover:scale-105 active:scale-95 transition-all border border-amber-300/40"
        title="Add agent & commission"
        aria-label="Add agent and commission"
      >
        <UserPlus className="w-6 h-6" />
      </button>

      {/* ── Add Modal ────────────────────────────────────────── */}
      {showCreate && (
        <Modal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          title="Add Agent & Commission"
          size="large"
        >
          <p className="text-xs text-gray-500 -mt-2 mb-4 px-0.5">
            Register salesperson name and commission rate. Billers will select
            from this list.
          </p>
          <AgentForm
            isDark={isDark}
            values={form}
            onChange={setF}
            onSubmit={handleAdd}
            onCancel={() => setShowCreate(false)}
            isSubmitting={submitting}
            mode="add"
          />
        </Modal>
      )}

      {/* ── Edit Modal ───────────────────────────────────────── */}
      {showEdit && (
        <Modal
          isOpen={showEdit}
          onClose={() => {
            setShowEdit(false);
            setSelAgent(null);
          }}
          title="Edit Agent & Commission"
          size="large"
        >
          <AgentForm
            isDark={isDark}
            values={form}
            onChange={setF}
            onSubmit={handleUpdate}
            onCancel={() => {
              setShowEdit(false);
              setSelAgent(null);
            }}
            isSubmitting={submitting}
            mode="edit"
          />
        </Modal>
      )}
    </div>
  );
};

export default CommissionSettings;