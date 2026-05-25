// src/pages/admin/PaymentMethods.jsx
// ✅ FIXED — CashFlow data fix: paymentType || paymentMethod both checked
import { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Wallet, Smartphone, Building, DollarSign,
  Search, Edit, Wifi, Database, TrendingUp, Activity,
  Receipt, ShieldAlert,
} from 'lucide-react';
import { collection, onSnapshot, isFirebaseReady, db } from '../../services/firebase';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useTheme } from '../../context/ThemeContext';
import { logActivity } from '../../services/activityLogger';
import { cn } from '../../utils/cn';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';

const DEFAULT_METHODS = [
  { key: 'cash',         label: 'Cash',              desc: 'Standard cash payments',         icon: DollarSign, color: 'green',  type: 'cash',   defaultFee: 0,   defaultSurcharge: 0  },
  { key: 'easypaisa',    label: 'Easypaisa',         desc: 'Mobile wallet payments',          icon: Smartphone, color: 'rose',   type: 'wallet', defaultFee: 1.5, defaultSurcharge: 0  },
  { key: 'jazzcash',     label: 'JazzCash',          desc: 'Mobile wallet payments',          icon: Smartphone, color: 'red',    type: 'wallet', defaultFee: 1.5, defaultSurcharge: 0  },
  { key: 'bankTransfer', label: 'Bank Transfer',     desc: 'Direct bank transfers',           icon: Building,   color: 'blue',   type: 'bank',   defaultFee: 0,   defaultSurcharge: 0  },
  { key: 'creditCard',   label: 'Credit/Debit Card', desc: 'POS card swipes',                 icon: CreditCard, color: 'purple', type: 'card',   defaultFee: 2.0, defaultSurcharge: 50 },
];

const ICON_COLORS = {
  green:  'bg-emerald-500/10 text-emerald-500',
  rose:   'bg-rose-500/10    text-rose-500',
  red:    'bg-red-500/10     text-red-500',
  blue:   'bg-sky-500/10     text-sky-500',
  purple: 'bg-violet-500/10  text-violet-500',
};

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;

const PaymentMethods = () => {
  const { isDark }              = useTheme();
  const { userData }            = useAuth();
  const { isOnline }            = useNetwork();
  const { settings, setSetting} = useSettings();

  const pm = settings.paymentMethods || {};

  const [orders,       setOrders]       = useState([]);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [showSug,      setShowSug]      = useState(false);

  const [showEditModal,   setShowEditModal]   = useState(false);
  const [selectedMethod,  setSelectedMethod]  = useState(null);
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [customLabel,     setCustomLabel]     = useState('');
  const [customDesc,      setCustomDesc]      = useState('');
  const [feePercent,      setFeePercent]      = useState(0);
  const [flatSurcharge,   setFlatSurcharge]   = useState(0);

  // ── Stream orders ──────────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseReady() || !db) return;
    const unsub = onSnapshot(collection(db, 'orders'), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.error);
    return () => unsub();
  }, []);

  // ── Configured methods ─────────────────────────────────────
  const configuredMethods = useMemo(() => DEFAULT_METHODS.map(m => {
    const cfg = pm[m.key] || {};
    const isEnabled = typeof cfg === 'boolean' ? cfg : (cfg.enabled ?? false);
    return {
      ...m,
      label:        typeof cfg === 'object' ? (cfg.label        || m.label)          : m.label,
      desc:         typeof cfg === 'object' ? (cfg.desc         || m.desc)           : m.desc,
      feePercent:   Number(typeof cfg === 'object' ? (cfg.feePercent   ?? m.defaultFee)      : m.defaultFee),
      flatSurcharge:Number(typeof cfg === 'object' ? (cfg.flatSurcharge?? m.defaultSurcharge): m.defaultSurcharge),
      enabled:      isEnabled,
    };
  }), [pm]);

  // ── ✅ FIX: Payment stats — check BOTH paymentType & paymentMethod ──
  const paymentStats = useMemo(() => {
    const stats = {};
    DEFAULT_METHODS.forEach(m => { stats[m.key] = { txCount: 0, volume: 0 }; });

    let totalVolume = 0, digitalVolume = 0, totalTx = 0;

    orders.forEach(order => {
      if (order.isDeleted || order.deleted) return;

      // ✅ KEY FIX: Check both paymentType AND paymentMethod
      const method = (
        order.paymentType    ||
        order.paymentMethod  ||
        'cash'
      ).toLowerCase().trim();

      const total = Number(
        order.grandTotal  ||
        order.totalAmount ||
        order.total       || 0
      );

      // Match to our known methods
      const matchedKey = DEFAULT_METHODS.find(m =>
        method === m.key.toLowerCase() ||
        method.includes(m.key.toLowerCase())
      )?.key || 'cash';

      if (stats[matchedKey]) {
        stats[matchedKey].txCount++;
        stats[matchedKey].volume += total;
        totalTx++;
        totalVolume += total;
        if (matchedKey !== 'cash') digitalVolume += total;
      }
    });

    return {
      methodsStats:   stats,
      totalVolume,
      digitalShare:   totalVolume > 0 ? (digitalVolume / totalVolume) * 100 : 0,
      totalTxCount:   totalTx,
      activeCount:    configuredMethods.filter(m => m.enabled).length,
    };
  }, [orders, configuredMethods]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return configuredMethods
      .filter(m => m.label.toLowerCase().includes(search.toLowerCase()))
      .map(m => m.label).slice(0, 5);
  }, [search, configuredMethods]);

  const filtered = useMemo(() => configuredMethods.filter(m => {
    const matchSearch = !search ||
      m.label.toLowerCase().includes(search.toLowerCase()) ||
      m.key.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active'   &&  m.enabled) ||
      (statusFilter === 'inactive' && !m.enabled);
    const matchType = typeFilter === 'all' || m.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }), [configuredMethods, search, statusFilter, typeFilter]);

  // ── Toggle ─────────────────────────────────────────────────
  const handleToggle = async (m) => {
    try {
      const cfg = pm[m.key] || {};
      const next = !m.enabled;
      await setSetting('paymentMethods', {
        ...pm,
        [m.key]: typeof cfg === 'object'
          ? { ...cfg, enabled: next }
          : { enabled: next, label: m.label, desc: m.desc,
              feePercent: m.feePercent, flatSurcharge: m.flatSurcharge },
      });
      await logActivity('setting:payment:toggle', userData?.uid,
        userData?.primaryStore, { methodCode: m.key, status: next ? 'enabled' : 'disabled' }
      ).catch(() => {});
      toast.success(`${m.label} ${next ? 'enabled' : 'disabled'}`);
    } catch (e) { toast.error(e.message); }
  };

  // ── Edit ───────────────────────────────────────────────────
  const openEdit = (m) => {
    setSelectedMethod(m);
    setCustomLabel(m.label);
    setCustomDesc(m.desc);
    setFeePercent(m.feePercent);
    setFlatSurcharge(m.flatSurcharge);
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!customLabel.trim()) return toast.error('Label required');
    if (feePercent < 0 || flatSurcharge < 0) return toast.error('Fees cannot be negative');
    setIsSubmitting(true);
    try {
      await setSetting('paymentMethods', {
        ...pm,
        [selectedMethod.key]: {
          enabled: selectedMethod.enabled,
          label: customLabel.trim(), desc: customDesc.trim(),
          feePercent: Number(feePercent),
          flatSurcharge: Number(flatSurcharge),
          updatedAt: new Date().toISOString(),
        },
      });
      await logActivity('setting:payment:update', userData?.uid,
        userData?.primaryStore, { methodCode: selectedMethod.key }).catch(() => {});
      setShowEditModal(false); setSelectedMethod(null);
      toast.success('Payment config updated!');
    } catch (e) { toast.error(e.message); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      <PageHeader icon={Wallet}
        title="Payment Methods Console"
        description="Enable/disable gateways, configure fees, track transaction volumes" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Portals"  value={paymentStats.activeCount}               icon={Wallet}    color="amber"   />
        <StatCard label="Total Bills"     value={paymentStats.totalTxCount}              icon={Receipt}   color="blue"    />
        <StatCard label="Total Volume"    value={fmt(paymentStats.totalVolume)}           icon={TrendingUp}color="emerald" />
        <StatCard label="Digital Share"   value={`${paymentStats.digitalShare.toFixed(1)}%`} icon={Activity} color="rose" />
      </div>

      {/* Filters */}
      <div className={cn(
        'rounded-2xl border p-4',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Input
              placeholder="Search payment label or code..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              leftIcon={<Search className="w-4 h-4 text-amber-500" />}
              className="w-full"
            />
            {showSug && suggestions.length > 0 && (
              <div className={cn(
                'absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border shadow-xl',
                isDark ? 'bg-[#150f08] border-[#3a2c18]' : 'bg-white border-amber-200',
              )}>
                {suggestions.map((s, i) => (
                  <button key={i}
                    onClick={() => { setSearch(s); setShowSug(false); }}
                    className={cn('w-full text-left px-4 py-2 text-xs hover:bg-amber-500/10',
                      isDark ? 'text-gray-300' : 'text-gray-700')}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {[
              { val: statusFilter, set: setStatusFilter,
                opts: [['all','All'],['active','Active'],['inactive','Inactive']] },
              { val: typeFilter, set: setTypeFilter,
                opts: [['all','All Types'],['cash','Cash'],['wallet','Wallet'],
                       ['card','Card'],['bank','Bank']] },
            ].map((f, i) => (
              <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
                className={cn('rounded-xl border px-3 py-2 text-xs outline-none',
                  isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white'
                         : 'bg-white border-amber-200 text-gray-900')}>
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <Button variant="ghost" size="sm"
              onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
              className="text-xs text-amber-500">
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn(
        'rounded-2xl border overflow-hidden shadow-lg',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className={cn('px-5 py-4 border-b flex items-center justify-between',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
          <h3 className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>
            Payment Gateways
          </h3>
          <Badge variant="primary">{configuredMethods.length} defined</Badge>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No methods found" description="Adjust filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className={cn(
                'border-b text-xs font-semibold uppercase tracking-wider',
                isDark ? 'bg-[#0a0805] text-gray-400 border-[#2a1f0d]'
                       : 'bg-amber-50/30 text-gray-600 border-amber-100',
              )}>
                <tr>
                  {['Code','Method','Type','Fee %','Surcharge','Bills',
                    'Volume','Status','Sync','Edit'].map(h => (
                    <th key={h} className="px-4 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn(isDark ? 'text-gray-300' : 'text-gray-700')}>
                {filtered.map(m => {
                  const Icon = m.icon;
                  const s    = paymentStats.methodsStats[m.key] || { txCount: 0, volume: 0 };
                  return (
                    <tr key={m.key} className={cn(
                      'border-t transition-colors',
                      isDark
                        ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60'
                        : 'border-amber-100 hover:bg-amber-50/50',
                      m.enabled && 'ring-inset ring-1 ring-amber-500/10',
                    )}>
                      <td className="px-4 py-3.5 font-mono font-bold text-gray-500">
                        {m.key.toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            ICON_COLORS[m.color],
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-amber-500">{m.label}</p>
                            <p className="text-[10px] text-gray-500 truncate max-w-[180px]">
                              {m.desc}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={
                          m.type === 'cash'   ? 'success'
                        : m.type === 'wallet' ? 'warning'
                        : m.type === 'card'   ? 'primary' : 'info'}>
                          {m.type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 font-semibold">{m.feePercent}%</td>
                      <td className="px-4 py-3.5 font-semibold">Rs {m.flatSurcharge}</td>
                      <td className="px-4 py-3.5 font-semibold text-gray-400">
                        {s.txCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-emerald-500">
                        {fmt(s.volume)}
                      </td>
                      <td className="px-4 py-3.5">
                        {/* Toggle */}
                        <button onClick={() => handleToggle(m)}
                          className={cn(
                            'relative w-9 h-5 rounded-full transition-colors focus:outline-none',
                            m.enabled
                              ? 'bg-amber-500'
                              : isDark ? 'bg-[#2a1f0d]' : 'bg-gray-300',
                          )}>
                          <span className={cn(
                            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                            m.enabled ? 'translate-x-4' : 'translate-x-0.5',
                          )} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isOnline
                          ? <Wifi     className="w-4 h-4 text-emerald-500 inline" />
                          : <Database className="w-4 h-4 text-amber-500 inline animate-pulse" />}
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => openEdit(m)}
                          className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-500/10 transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedMethod && (
        <Modal isOpen onClose={() => { setShowEditModal(false); setSelectedMethod(null); }}
          title={`Configure ${selectedMethod.label}`}>
          <div className="space-y-4 pt-2">
            <Input label="Label" value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="Display label" className="w-full" />
            <div>
              <label className={cn('block text-xs font-semibold mb-1.5',
                isDark ? 'text-gray-400' : 'text-gray-600')}>
                Description
              </label>
              <textarea rows={2} value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                placeholder="Description shown at checkout"
                className={cn(
                  'w-full px-3 py-2 rounded-xl text-xs resize-none outline-none border',
                  isDark
                    ? 'bg-[#0a0805] border-[#2a1f0d] text-white'
                    : 'bg-white border-amber-200 text-gray-900',
                )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Fee (%)" type="number" value={feePercent}
                onChange={e => setFeePercent(e.target.value)} className="w-full" />
              <Input label="Surcharge (Rs)" type="number" value={flatSurcharge}
                onChange={e => setFlatSurcharge(e.target.value)} className="w-full" />
            </div>
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#2a1f0d]/30">
            <Button variant="secondary" className="flex-1 rounded-xl"
              disabled={isSubmitting}
              onClick={() => { setShowEditModal(false); setSelectedMethod(null); }}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1 rounded-xl"
              disabled={isSubmitting} onClick={handleSave}>
              {isSubmitting ? 'Saving...' : 'Apply Config'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PaymentMethods;