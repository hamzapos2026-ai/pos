import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Percent, Zap, Users, Store, Banknote } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import PageHeader from '../../components/admin/PageHeader';
import { SettingsCard, ToggleRow } from '../../components/admin/SettingsUi';
import { patchSetting } from '../../services/settingsStore';
import { db } from '../../services/firebase';
import useStoresMap, { getStoreDisplayName } from '../../hooks/useStoresMap';
import {
  DEFAULT_CASHIER_DISCOUNT_POLICY,
  normalizeCashierDiscountPolicyDoc,
  normalizeCashierDiscountRule,
} from '../../utils/cashierDiscountPolicy';
import {
  normalizeCashierPayAllPolicyDoc,
  normalizeCashierPayAllRule,
} from '../../utils/cashierPayAllPolicy';
import CashierDeletedFlagsPanel from '../../components/admin/CashierDeletedFlagsPanel';

const PRESETS_PCT = [1, 2, 3, 5, 10];
const PRESETS_PKR = [50, 100, 200, 500, 1000];

const emptyRule = () => ({ ...DEFAULT_CASHIER_DISCOUNT_POLICY });

const CashierDiscountSettings = () => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { settings } = useSettings();
  const storesMap = useStoresMap();
  const [cashiers, setCashiers] = useState([]);
  const [scope, setScope] = useState('default');
  const [branchId, setBranchId] = useState('');
  const [cashierId, setCashierId] = useState('');

  const policyDoc = useMemo(
    () => normalizeCashierDiscountPolicyDoc(settings.cashierDiscountPolicy || {}),
    [settings.cashierDiscountPolicy],
  );

  const payAllDoc = useMemo(
    () => normalizeCashierPayAllPolicyDoc(settings.cashierPayAllPolicy || {}),
    [settings.cashierPayAllPolicy],
  );

  const activeKey = useMemo(() => {
    if (scope === 'cashier' && cashierId) return `cashier:${cashierId}`;
    if (scope === 'branch' && branchId) return `branch:${branchId}`;
    return 'default';
  }, [scope, branchId, cashierId]);

  const currentRule = useMemo(() => {
    if (scope === 'cashier' && cashierId) {
      return { ...policyDoc.default, ...(policyDoc.cashiers[cashierId] || {}) };
    }
    if (scope === 'branch' && branchId) {
      return { ...policyDoc.default, ...(policyDoc.branches[branchId] || {}) };
    }
    return policyDoc.default;
  }, [policyDoc, scope, branchId, cashierId]);

  const currentPayAllRule = useMemo(() => {
    if (scope === 'cashier' && cashierId) {
      return { ...payAllDoc.default, ...(payAllDoc.cashiers[cashierId] || {}) };
    }
    if (scope === 'branch' && branchId) {
      return { ...payAllDoc.default, ...(payAllDoc.branches[branchId] || {}) };
    }
    return payAllDoc.default;
  }, [payAllDoc, scope, branchId, cashierId]);

  const [draftPkr, setDraftPkr] = useState('0');
  const [draftPct, setDraftPct] = useState('0');
  const debounceRef = useRef(null);

  useEffect(() => {
    const pkr = currentRule.maxPKR === Infinity ? 0 : currentRule.maxPKR;
    const pct = currentRule.maxPercent === Infinity ? 0 : currentRule.maxPercent;
    setDraftPkr(String(pkr));
    setDraftPct(String(pct));
  }, [activeKey, currentRule.maxPKR, currentRule.maxPercent]);

  useEffect(() => {
    if (!db) return undefined;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => {
          const roles = Array.isArray(u.roles) ? u.roles : [u.role, u.primaryRole].filter(Boolean);
          return roles.some((r) => String(r).toLowerCase() === 'cashier');
        });
      setCashiers(list);
    });
    return unsub;
  }, []);

  const branches = useMemo(
    () => Object.values(storesMap || {}).filter(Boolean).sort((a, b) =>
      getStoreDisplayName(a).localeCompare(getStoreDisplayName(b)),
    ),
    [storesMap],
  );

  const branchCashiers = useMemo(() => {
    if (!branchId) return cashiers;
    return cashiers.filter((c) =>
      c.storeId === branchId
      || c.primaryStore === branchId
      || (Array.isArray(c.storeIds) && c.storeIds.includes(branchId)),
    );
  }, [cashiers, branchId]);

  const pushPolicy = useCallback(async (rulePatch) => {
    const base = normalizeCashierDiscountPolicyDoc(settings.cashierDiscountPolicy || {});
    const next = { ...base, branches: { ...base.branches }, cashiers: { ...base.cashiers } };
    const merged = normalizeCashierDiscountRule({ ...currentRule, ...rulePatch });

    if (scope === 'cashier' && cashierId) {
      next.cashiers[cashierId] = merged;
    } else if (scope === 'branch' && branchId) {
      next.branches[branchId] = merged;
    } else {
      next.default = merged;
    }

    try {
      await patchSetting('cashierDiscountPolicy', next);
      toast.success('Cashier discount live — sab cashier screens par', { id: 'cash-disc', duration: 1600 });
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    }
  }, [settings.cashierDiscountPolicy, currentRule, scope, branchId, cashierId]);

  const pushPayAllPolicy = useCallback(async (rulePatch) => {
    const base = normalizeCashierPayAllPolicyDoc(settings.cashierPayAllPolicy || {});
    const next = { ...base, branches: { ...base.branches }, cashiers: { ...base.cashiers } };
    const merged = normalizeCashierPayAllRule({ ...currentPayAllRule, ...rulePatch });

    if (scope === 'cashier' && cashierId) {
      next.cashiers[cashierId] = merged;
    } else if (scope === 'branch' && branchId) {
      next.branches[branchId] = merged;
    } else {
      next.default = merged;
    }

    try {
      await patchSetting('cashierPayAllPolicy', next);
      toast.success('Pay All setting live — cashier screen par', { id: 'pay-all', duration: 1600 });
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    }
  }, [settings.cashierPayAllPolicy, currentPayAllRule, scope, branchId, cashierId]);

  const commitPkr = useCallback((raw) => {
    const v = Math.max(0, parseFloat(String(raw).replace(',', '.')) || 0);
    setDraftPkr(String(v));
    pushPolicy({ maxPKR: v, maxCashierExtraDiscountPKR: v });
  }, [pushPolicy]);

  const commitPct = useCallback((raw) => {
    const v = Math.min(100, Math.max(0, parseFloat(String(raw).replace(',', '.')) || 0));
    setDraftPct(String(v));
    pushPolicy({ maxPercent: v, maxCashierExtraDiscountPercent: v });
  }, [pushPolicy]);

  const scopeLabel = useMemo(() => {
    if (scope === 'cashier' && cashierId) {
      const c = cashiers.find((x) => x.id === cashierId);
      return c?.displayName || c?.name || cashierId;
    }
    if (scope === 'branch' && branchId) {
      return getStoreDisplayName(storesMap[branchId]) || branchId;
    }
    return 'Sab branches (default)';
  }, [scope, cashierId, branchId, cashiers, storesMap]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <PageHeader
        icon={Banknote}
        title={t('admin.cashierDiscount.title', 'Cashier Extra Discount')}
        description={t('admin.cashierDiscount.subtitle', 'Branch aur cashier wise Rs / % limit — cashier row par apply')}
      />

      <div className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold',
        isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
      )}>
        <Zap className="w-3.5 h-3.5 shrink-0" />
        Change turant live — cashier pending bill row par extra discount limit lag jati hai.
      </div>

      <CashierDeletedFlagsPanel
        description="Cashier ne koi cancelled bill flag ki — flag reason dikhega. Review karke Mark Reviewed karo."
      />

      <SettingsCard title="Scope — kis ke liye rule?" subtitle={`Ab edit: ${scopeLabel}`} icon={Store} isDark={isDark} accent="blue">
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { k: 'default', label: 'Default (sab)' },
            { k: 'branch', label: 'Branch wise' },
            { k: 'cashier', label: 'Cashier wise' },
          ].map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                scope === k
                  ? 'bg-blue-500 text-white border-blue-500'
                  : isDark ? 'border-[#2a1f0d] text-gray-400' : 'border-gray-200 text-gray-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {scope === 'branch' && (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm font-semibold mb-2',
              isDark ? 'bg-[#070503] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
            )}
          >
            <option value="">Branch select karo...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{getStoreDisplayName(b) || b.id}</option>
            ))}
          </select>
        )}

        {scope === 'cashier' && (
          <div className="space-y-2">
            <select
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setCashierId(''); }}
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-sm font-semibold',
                isDark ? 'bg-[#070503] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
              )}
            >
              <option value="">Branch (optional filter)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{getStoreDisplayName(b) || b.id}</option>
              ))}
            </select>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-sm font-semibold',
                isDark ? 'bg-[#070503] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
              )}
            >
              <option value="">Cashier select karo...</option>
              {(branchId ? branchCashiers : cashiers).map((c) => (
                <option key={c.id} value={c.id}>{c.displayName || c.name || c.email || c.id}</option>
              ))}
            </select>
          </div>
        )}
      </SettingsCard>

      <ToggleRow
        badge
        icon={Banknote}
        label="Cashier Extra Discount ON"
        hint="OFF = cashier extra discount band — sirf biller discount"
        checked={currentRule.enabled}
        onChange={(v) => pushPolicy({ enabled: v })}
        isDark={isDark}
      />

      <CashierDeletedFlagsPanel
        description="Cashier ne koi cancelled bill flag ki — flag reason dikhega. Review karke Mark Reviewed karo."
      />

      <SettingsCard title="Max Limit — Rs" subtitle="0 = koi Rs cap nahi" icon={Banknote} isDark={isDark} accent="emerald">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            min="0"
            step="1"
            value={draftPkr}
            onChange={(e) => {
              setDraftPkr(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => commitPkr(e.target.value), 450);
            }}
            onBlur={() => commitPkr(draftPkr)}
            className={cn(
              'flex-1 rounded-xl border px-4 py-3 text-2xl font-black tabular-nums outline-none',
              isDark ? 'bg-[#070503] border-emerald-500/30 text-emerald-400' : 'bg-white border-emerald-200 text-emerald-700',
            )}
          />
          <span className="font-bold text-gray-500">Rs</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS_PKR.map((p) => (
            <button key={p} type="button" onClick={() => commitPkr(p)}
              className={cn('px-3 py-1 rounded-lg text-xs font-bold border', Number(draftPkr) === p ? 'bg-emerald-500 text-white' : isDark ? 'border-[#2a1f0d] text-gray-400' : 'border-gray-200')}>
              {p}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Max Limit — %" subtitle="Bill subtotal par % cap" icon={Percent} isDark={isDark} accent="amber">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={draftPct}
            onChange={(e) => {
              setDraftPct(e.target.value);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => commitPct(e.target.value), 450);
            }}
            onBlur={() => commitPct(draftPct)}
            className={cn(
              'flex-1 rounded-xl border px-4 py-3 text-2xl font-black tabular-nums outline-none',
              isDark ? 'bg-[#070503] border-amber-500/30 text-amber-400' : 'bg-white border-amber-200 text-amber-700',
            )}
          />
          <span className="font-bold text-gray-500">%</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS_PCT.map((p) => (
            <button key={p} type="button" onClick={() => commitPct(p)}
              className={cn('px-3 py-1 rounded-lg text-xs font-bold border', Number(draftPct) === p ? 'bg-amber-500 text-white' : isDark ? 'border-[#2a1f0d] text-gray-400' : 'border-gray-200')}>
              {p}%
            </button>
          ))}
        </div>
        <p className={cn('text-[11px] mt-3', isDark ? 'text-gray-500' : 'text-gray-600')}>
          Dono limits lagti hain — jo chhoti ho woh apply. Example: Rs 200 aur 5% → Rs 1000 bill par max Rs 50 (5%) ya Rs 200 mein se kam.
        </p>
      </SettingsCard>

      <ToggleRow
        icon={Percent}
        label="Cashier % mode allow"
        hint="ON = cashier percent type bhi use kar sakta hai"
        checked={currentRule.allowPercent}
        onChange={(v) => pushPolicy({ allowPercent: v })}
        isDark={isDark}
      />

      <ToggleRow
        icon={Users}
        label="Discount reason zaroori"
        hint="Extra discount par reason likhna lazmi"
        checked={currentRule.requireReason}
        onChange={(v) => pushPolicy({ requireReason: v })}
        isDark={isDark}
      />

      <SettingsCard
        title="Pay All — Bulk Payment"
        subtitle="Cashier screen par sab pending bills ek sath pay karna"
        icon={Zap}
        isDark={isDark}
        accent="purple"
      >
        <ToggleRow
          badge
          icon={Zap}
          label="Pay All button ON"
          hint="OFF = cashier ko sirf ek ek bill pay karni hogi — bulk Pay All hide"
          checked={currentPayAllRule.enabled}
          onChange={(v) => pushPayAllPolicy({ enabled: v })}
          isDark={isDark}
        />
        <p className={cn('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-600')}>
          Upar wala scope (Default / Branch / Cashier) yahan bhi lagta hai — har cashier alag ON/OFF ho sakta hai.
        </p>
      </SettingsCard>
    </div>
  );
};

export default CashierDiscountSettings;
