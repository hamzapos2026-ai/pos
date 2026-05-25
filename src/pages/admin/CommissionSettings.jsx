// File: src/pages/admin/CommissionSettings.jsx
// Purpose: SuperAdmin-only page to manage salesperson agents & commissions
// ✅ FIXED: Add button now visible in header + empty state

import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, Plus, Trash2, Edit, Search,
  Wifi, Database, Check, Award,
  Percent, Users, ToggleLeft, ToggleRight,
  Info, ShieldAlert, Lock,
} from 'lucide-react';
import { collection, onSnapshot, db, isFirebaseReady } from '../../services/firebase';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useTheme } from '../../context/ThemeContext';
import { logActivity } from '../../services/activityLogger';
import { canManageSalespersons } from '../../hooks/useSalesperson';
import { cn } from '../../utils/cn';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const fmt = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════
// COMPUTE ITEM-LEVEL COMMISSION from a single order
// ═══════════════════════════════════════════════════════════════
const computeOrderCommissions = (order, agentIds) => {
  const result = {};
  agentIds.forEach((id) => {
    result[id] = {
      totalSales:       0,
      commissionEarned: 0,
      billsInvolved:    new Set(),
      itemCount:        0,
    };
  });

  const billTotal  = Number(order.grandTotal || order.totalAmount || order.total || 0);
  const paidAmount = Number(order.paidAmount ?? order.amountReceived ?? billTotal);
  const paidRatio  = billTotal > 0 ? Math.min(1, paidAmount / billTotal) : 1;

  // Item-level (multiple SP per bill)
  if (Array.isArray(order.items)) {
    order.items.forEach((item) => {
      const spId = item.salespersonId;
      if (!spId || !result[spId]) return;

      const qty      = Number(item.qty || item.quantity || 1);
      const price    = Number(item.price || item.salePrice || 0);
      const discount = Number(item.discount || 0);
      const discType = item.discountType || 'amount';

      let itemNet = price * qty;
      if (discType === 'percent') itemNet -= (itemNet * discount) / 100;
      else                        itemNet -= discount * qty;
      itemNet = Math.max(0, itemNet);

      const commPct  = Number(item.commissionPercent ?? item.commissionRate ?? 0);
      const commType = item.commissionType || 'percent';
      const rawComm  = commType === 'fixed'
        ? Number(item.commissionFixed || 0) * qty
        : (itemNet * commPct) / 100;

      result[spId].totalSales       += itemNet;
      result[spId].commissionEarned += rawComm * paidRatio;
      result[spId].itemCount        += qty;
      result[spId].billsInvolved.add(order.id);
    });
  }

  // Bill-level fallback (single SP per bill)
  const spId = order.salespersonId;
  if (spId && result[spId] && !(order.items || []).some((i) => i.salespersonId)) {
    result[spId].totalSales       += billTotal;
    result[spId].commissionEarned += Number(order.salespersonCommission || 0) * paidRatio;
    result[spId].billsInvolved.add(order.id);
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════
// 🔒 ACCESS DENIED SCREEN
// ═══════════════════════════════════════════════════════════════
const AccessDeniedScreen = ({ userData, isDark }) => (
  <div className="p-4 sm:p-6 max-w-2xl mx-auto">
    <div className={cn(
      'rounded-2xl border p-8 text-center',
      isDark ? 'bg-[#0f0a05] border-red-500/30' : 'bg-white border-red-200'
    )}>
      <div className={cn(
        'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
        isDark ? 'bg-red-500/10' : 'bg-red-50'
      )}>
        <ShieldAlert className="w-8 h-8 text-red-500" />
      </div>
      <h2 className={cn(
        'text-xl font-bold mb-2',
        isDark ? 'text-white' : 'text-gray-900'
      )}>
        Access Restricted
      </h2>
      <p className={cn(
        'text-sm mb-6 leading-relaxed',
        isDark ? 'text-gray-400' : 'text-gray-600'
      )}>
        Only the <strong>SuperAdmin</strong> can manage salesperson agents and
        commission settings. If you need to add or modify salesperson records,
        please contact your administrator.
      </p>
      <div className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs',
        isDark ? 'bg-[#1a1208] text-gray-500' : 'bg-gray-50 text-gray-600'
      )}>
        <Lock className="w-3.5 h-3.5" />
        Your role: <strong className="text-amber-500">
          {userData?.role || 'Unknown'}
        </strong>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// AGENT FORM COMPONENT (reused for Add & Edit)
// ═══════════════════════════════════════════════════════════════
const AgentForm = ({ isDark, values, onChange, onSubmit, onCancel, isSubmitting, mode }) => {
  const { name, rate, type, isActive } = values;
  return (
    <div className="space-y-4 pt-2">
      <Input
        label="Salesperson Full Name"
        placeholder="e.g. Fahad Khan"
        value={name}
        onChange={(e) => onChange('name', e.target.value)}
        leftIcon={<Users className="w-4 h-4 text-amber-500" />}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={`Commission Rate ${type === 'percent' ? '(%)' : '(Rs.)'}`}
          type="number"
          min={0}
          value={rate}
          onChange={(e) => onChange('rate', e.target.value)}
          leftIcon={<Percent className="w-4 h-4 text-amber-500" />}
        />
        <div>
          <label className={cn(
            'block text-xs font-semibold uppercase tracking-wider mb-1.5',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Formula Type
          </label>
          <select
            value={type}
            onChange={(e) => onChange('type', e.target.value)}
            className={cn(
              'w-full px-3 py-2 text-xs rounded-xl border font-medium cursor-pointer outline-none',
              isDark
                ? 'border-[#2a1f0d] text-white bg-[#0a0805] focus:border-amber-500/50'
                : 'border-amber-200 text-gray-900 bg-white focus:border-amber-500'
            )}
          >
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed (Rs.)</option>
          </select>
        </div>
      </div>

      {mode === 'edit' && (
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => onChange('isActive', e.target.checked)}
            className="w-4 h-4 rounded text-amber-500"
          />
          <span className={cn(
            'text-xs font-medium',
            isDark ? 'text-gray-300' : 'text-gray-700'
          )}>
            Active / Authorized Agent
          </span>
        </label>
      )}

      <div className="flex gap-2 pt-4 border-t border-[#2a1f0d]/30">
        <Button variant="secondary" onClick={onCancel} className="flex-1" disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSubmit} className="flex-1 font-semibold" disabled={isSubmitting}>
          {isSubmitting
            ? mode === 'edit' ? 'Updating…' : 'Registering…'
            : mode === 'edit' ? 'Save Changes' : 'Register Agent'}
        </Button>
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
  const { settings, setSetting } = useSettings();

  // ─── 🔒 SUPER ADMIN GUARD ───────────────────────────────────
  const isAuthorized = useMemo(() => canManageSalespersons(userData), [userData]);

  if (!isAuthorized) {
    return <AccessDeniedScreen userData={userData} isDark={isDark} />;
  }
  // ────────────────────────────────────────────────────────────

  const sp     = settings.salesperson || {};
  const agents = sp.agents || [];

  // ── Data ────────────────────────────────────────────────────
  const [orders,        setOrders]        = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // ── Filters ─────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [showSug,      setShowSug]      = useState(false);

  // ── Modals ──────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [selAgent,   setSelAgent]   = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Form state ───────────────────────────────────────────────
  const emptyForm = { name: '', rate: 5, type: 'percent', isActive: true };
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ── Live orders subscription ─────────────────────────────────
  useEffect(() => {
    if (!isFirebaseReady() || !db) {
      setLoadingOrders(false);
      return;
    }
    setLoadingOrders(true);
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingOrders(false);
      },
      (err) => { console.error(err); setLoadingOrders(false); }
    );
    return unsub;
  }, []);

  // ── Performance metrics ──────────────────────────────────────
  const perf = useMemo(() => {
    const agentIds = agents.map((a) => a.id);
    const agg = {};
    agentIds.forEach((id) => {
      agg[id] = { totalSales: 0, commissionEarned: 0, bills: new Set(), items: 0 };
    });

    orders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;
      const res = computeOrderCommissions(order, agentIds);
      agentIds.forEach((id) => {
        agg[id].totalSales       += res[id].totalSales;
        agg[id].commissionEarned += res[id].commissionEarned;
        agg[id].items            += res[id].itemCount;
        res[id].billsInvolved.forEach((bid) => agg[id].bills.add(bid));
      });
    });

    const final = {};
    agentIds.forEach((id) => {
      final[id] = {
        totalSales:       agg[id].totalSales,
        commissionEarned: agg[id].commissionEarned,
        billsInvolved:    agg[id].bills.size,
        itemCount:        agg[id].items,
      };
    });
    return final;
  }, [agents, orders]);

  // ── Summary stats ────────────────────────────────────────────
  const stats = useMemo(() => {
    const active   = agents.filter((a) => a.isActive !== false).length;
    let totalComm  = 0;
    let topId      = null;
    let topComm    = -1;

    Object.entries(perf).forEach(([id, m]) => {
      totalComm += m.commissionEarned;
      if (m.commissionEarned > topComm) {
        topComm = m.commissionEarned;
        topId   = id;
      }
    });

    const topAgent = topId && topComm > 0
      ? `${agents.find((a) => a.id === topId)?.name || '—'} (${fmt(topComm)})`
      : 'None yet';

    return { total: agents.length, active, totalComm, topAgent };
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
      const active   = a.isActive !== false;
      const matchQ   = a.name.toLowerCase().includes(search.toLowerCase()) ||
                       a.id.toLowerCase().includes(search.toLowerCase());
      const matchSt  = statusFilter === 'all' ||
                       (statusFilter === 'active'   &&  active) ||
                       (statusFilter === 'inactive' && !active);
      const matchTy  = typeFilter === 'all' || a.commissionType === typeFilter;
      return matchQ && matchSt && matchTy;
    });
  }, [agents, search, statusFilter, typeFilter]);

  // ── Setting toggle helper ────────────────────────────────────
  const toggleSetting = async (key, val) => {
    await setSetting('salesperson', { ...sp, [key]: val });
  };

  // ── CRUD handlers ────────────────────────────────────────────
  const openAddModal = () => {
    setForm(emptyForm);
    setShowCreate(true);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    if (form.rate < 0)     return toast.error('Rate cannot be negative');
    setSubmitting(true);
    try {
      const newAgent = {
        id:             `agent_${Date.now()}`,
        name:           form.name.trim(),
        commissionType: form.type,
        commissionRate: Number(form.rate),
        isActive:       true,
        createdAt:      new Date().toISOString(),
        createdBy:      userData?.uid || 'superadmin',
      };
      await setSetting('salesperson', { ...sp, agents: [...agents, newAgent] });
      await logActivity(
        'salesperson:add',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { ...newAgent }
      );
      toast.success('Agent registered!');
      setForm(emptyForm);
      setShowCreate(false);
    } catch (e) { toast.error(e.message); }
    finally    { setSubmitting(false); }
  };

  const openEdit = (agent) => {
    setSelAgent(agent);
    setForm({
      name:     agent.name,
      rate:     agent.commissionRate,
      type:     agent.commissionType || 'percent',
      isActive: agent.isActive !== false,
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    setSubmitting(true);
    try {
      const updated = agents.map((a) =>
        a.id === selAgent.id
          ? {
              ...a,
              name:           form.name.trim(),
              commissionType: form.type,
              commissionRate: Number(form.rate),
              isActive:       form.isActive,
              updatedAt:      new Date().toISOString(),
              updatedBy:      userData?.uid || 'superadmin',
            }
          : a
      );
      await setSetting('salesperson', { ...sp, agents: updated });
      await logActivity(
        'salesperson:update',
        userData?.uid || 'unknown',
        userData?.primaryStore || 'default',
        { agentId: selAgent.id, ...form }
      );
      toast.success('Agent updated!');
      setShowEdit(false);
      setSelAgent(null);
      setForm(emptyForm);
    } catch (e) { toast.error(e.message); }
    finally    { setSubmitting(false); }
  };

  const handleToggle = async (agent) => {
    const next = agent.isActive === false;
    const updated = agents.map((a) =>
      a.id === agent.id ? { ...a, isActive: next } : a
    );
    await setSetting('salesperson', { ...sp, agents: updated });
    await logActivity(
      'salesperson:toggle',
      userData?.uid || 'unknown',
      userData?.primaryStore || 'default',
      { agentId: agent.id, newStatus: next ? 'active' : 'inactive' }
    );
    toast.success(`${agent.name} is now ${next ? 'Active' : 'Inactive'}`);
  };

  const handleDelete = async (agent) => {
    if (!confirm(`Delete ${agent.name}? This cannot be undone.`)) return;
    const updated = agents.filter((a) => a.id !== agent.id);
    await setSetting('salesperson', { ...sp, agents: updated });
    await logActivity(
      'salesperson:delete',
      userData?.uid || 'unknown',
      userData?.primaryStore || 'default',
      { agentId: agent.id, agentName: agent.name }
    );
    toast.success('Agent deleted');
  };

  const hasFilters = search || statusFilter !== 'all' || typeFilter !== 'all';

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ✅ HEADER WITH ADD BUTTON                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <PageHeader
            icon={DollarSign}
            title="Commission Settings"
            description="SuperAdmin-only: manage salesperson agents, item-level commissions, and payout tracking"
          />
        </div>

        {/* ✅ ADD BUTTON — ALWAYS VISIBLE TOP RIGHT */}
        <Button
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={openAddModal}
          className="shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all shrink-0 w-full sm:w-auto"
        >
          Add Sales Agent
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SUPER ADMIN BANNER                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs',
        isDark
          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          : 'bg-amber-50 border border-amber-200 text-amber-700'
      )}>
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          <strong>SuperAdmin Mode:</strong> Only you can create, edit, or delete
          salesperson agents. Billers and cashiers can only select from existing agents.
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FEATURE TOGGLES                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        'p-4 rounded-2xl border',
        isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-white border-amber-100'
      )}>
        <h3 className={cn('font-bold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
          Salesperson Feature Settings
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          These settings control how salespersons and commissions work throughout the billing system.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              key:   'enableCommission',
              title: 'Enable Commission System',
              desc:  'Activate commission calculations and payout tracking for all sales agents.',
            },
            {
              key:   'allowMultiplePerBill',
              title: 'Multiple Salespersons Per Bill',
              desc:  'Allow assigning different salespersons to individual items within a single bill. Commission is calculated at item level.',
              badge: 'NEW',
            },
            {
              key:   'showOnTable',
              title: 'Show Salesperson Column',
              desc:  'Display salesperson column in bill item tables for visual clarity.',
            },
            {
              key:   'requireSelection',
              title: 'Make Selection Compulsory',
              desc:  'Require billers to select a salesperson before finalizing a bill.',
            },
          ].map((s) => (
            <label
              key={s.key}
              className={cn(
                'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                sp[s.key]
                  ? isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-300 bg-amber-50'
                  : isDark ? 'border-[#2a1f0d]' : 'border-gray-200'
              )}
            >
              <input
                type="checkbox"
                checked={!!sp[s.key]}
                onChange={async (e) => {
                  await toggleSetting(s.key, e.target.checked);
                  toast.success(`${s.title} ${e.target.checked ? 'enabled' : 'disabled'}`);
                }}
                className="w-4 h-4 mt-0.5 shrink-0"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-sm font-semibold',
                    isDark ? 'text-gray-200' : 'text-gray-800'
                  )}>
                    {s.title}
                  </span>
                  {s.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {sp.allowMultiplePerBill && (
          <div className={cn(
            'mt-4 flex items-start gap-2 p-3 rounded-xl text-xs',
            isDark
              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          )}>
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Multiple Salesperson Mode is ON.</strong> During billing,
              a "Current Salesperson" selector will appear. All items entered
              while a salesperson is selected will be auto-assigned to them.
              Switch the selector to assign subsequent items to a different
              salesperson. Commission is calculated per-item based on each
              salesperson's individual rate.
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* STAT CARDS                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Agents"     value={stats.total}            icon={Users}      color="amber"   />
        <StatCard label="Active Agents"    value={stats.active}           icon={Check}      color="green"   />
        <StatCard label="Total Commission" value={fmt(stats.totalComm)}   icon={DollarSign} color="emerald" />
        <StatCard label="Top Performer"    value={stats.topAgent}         icon={Award}      color="blue"    />
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FILTERS                                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        'p-4 rounded-2xl border',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100'
      )}>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end">
          <div className="relative flex-1">
            <Input
              label="Search Agents"
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              leftIcon={<Search className="w-4 h-4 text-amber-500" />}
            />
            {showSug && suggestions.length > 0 && (
              <div className={cn(
                'absolute left-0 right-0 mt-1 z-50 rounded-xl border shadow-xl',
                isDark ? 'bg-[#150f08] border-[#3a2c18]' : 'bg-white border-amber-200'
              )}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={() => { setSearch(s); setShowSug(false); }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-xs hover:bg-amber-500/10',
                      isDark ? 'text-gray-300 hover:text-amber-400' : 'text-gray-700'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={cn(
                'block text-xs font-semibold uppercase mb-1.5',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-xs rounded-xl border outline-none bg-transparent',
                  isDark ? 'border-[#2a1f0d] text-white' : 'border-amber-200 text-gray-900'
                )}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className={cn(
                'block text-xs font-semibold uppercase mb-1.5',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>Formula</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 text-xs rounded-xl border outline-none bg-transparent',
                  isDark ? 'border-[#2a1f0d] text-white' : 'border-amber-200 text-gray-900'
                )}
              >
                <option value="all">All</option>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
                className="w-full text-xs"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* AGENT TABLE                                              */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={cn(
        'rounded-2xl border overflow-hidden shadow-lg',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100'
      )}>
        <div className="px-6 py-4 border-b border-[#2a1f0d]/50 flex items-center justify-between flex-wrap gap-2">
          <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
            Sales Agent Registry
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="info">{filtered.length} / {agents.length}</Badge>
            {/* ✅ SECONDARY ADD BUTTON IN TABLE HEADER */}
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={openAddModal}
            >
              Add Agent
            </Button>
          </div>
        </div>

        {/* ✅ CUSTOM EMPTY STATE WITH ADD BUTTON */}
        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className={cn(
              'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
              isDark ? 'bg-amber-500/10' : 'bg-amber-50'
            )}>
              <Users className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className={cn(
              'text-base font-bold mb-1',
              isDark ? 'text-white' : 'text-gray-900'
            )}>
              {hasFilters ? 'No Matching Agents' : 'No Sales Agents Yet'}
            </h3>
            <p className={cn(
              'text-sm mb-6 max-w-md mx-auto',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              {hasFilters
                ? 'Try adjusting your search or filters to find what you\'re looking for.'
                : 'Register your first sales agent to start tracking commissions and earnings.'}
            </p>

            {hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button
                variant="primary"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={openAddModal}
                className="shadow-lg shadow-amber-500/20"
              >
                Add Your First Sales Agent
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={cn(
                'border-b border-[#2a1f0d]/50 text-xs font-semibold uppercase tracking-wider',
                isDark ? 'bg-[#0a0805] text-gray-400' : 'bg-amber-50/50 text-gray-600'
              )}>
                <tr>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">Formula</th>
                  <th className="px-5 py-3 text-right">Rate</th>
                  <th className="px-5 py-3 text-right">Bills</th>
                  <th className="px-5 py-3 text-right">Items</th>
                  <th className="px-5 py-3 text-right">Sales Volume</th>
                  <th className="px-5 py-3 text-right">Commission Earned</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Sync</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={cn(
                'divide-y divide-[#2a1f0d]/30',
                isDark ? 'text-gray-300' : 'text-gray-700'
              )}>
                {filtered.map((agent) => {
                  const active = agent.isActive !== false;
                  const m      = perf[agent.id] || {};
                  return (
                    <tr key={agent.id} className={cn(
                      'transition-colors',
                      isDark ? 'hover:bg-[#1a1208]' : 'hover:bg-amber-50/50'
                    )}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-amber-500">{agent.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          {agent.id.replace('agent_', 'AGT-').substring(0, 12).toUpperCase()}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={agent.commissionType === 'fixed' ? 'info' : 'primary'}>
                          {agent.commissionType === 'fixed' ? 'Fixed' : 'Percent'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold">
                        {agent.commissionType === 'fixed'
                          ? `Rs. ${agent.commissionRate}`
                          : `${agent.commissionRate}%`}
                      </td>
                      <td className="px-5 py-3.5 text-right">{m.billsInvolved || 0}</td>
                      <td className="px-5 py-3.5 text-right">{m.itemCount || 0}</td>
                      <td className="px-5 py-3.5 text-right text-gray-400">{fmt(m.totalSales || 0)}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-emerald-500">{fmt(m.commissionEarned || 0)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <button onClick={() => handleToggle(agent)}>
                          <Badge variant={active ? 'success' : 'danger'}>
                            {active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isOnline
                          ? <Wifi className="w-4 h-4 text-emerald-500 mx-auto" />
                          : <Database className="w-4 h-4 text-amber-500 mx-auto animate-pulse" />}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggle(agent)}
                            className="p-1.5 rounded-lg hover:bg-amber-500/10 text-gray-400 hover:text-amber-500"
                            title={active ? 'Deactivate' : 'Activate'}
                          >
                            {active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => openEdit(agent)}
                            className="p-1.5 rounded-lg hover:bg-blue-500/10 text-gray-400 hover:text-blue-500"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(agent)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-500"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* FLOATING ACTION BUTTON (mobile only)                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      <button
        onClick={openAddModal}
        className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-2xl shadow-amber-500/40 flex items-center justify-center text-white z-40 hover:scale-110 active:scale-95 transition-transform"
        title="Add Sales Agent"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADD MODAL                                                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showCreate && (
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add New Sales Agent">
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/* EDIT MODAL                                               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showEdit && (
        <Modal isOpen={showEdit} onClose={() => { setShowEdit(false); setSelAgent(null); }} title="Edit Sales Agent">
          <AgentForm
            isDark={isDark}
            values={form}
            onChange={setF}
            onSubmit={handleUpdate}
            onCancel={() => { setShowEdit(false); setSelAgent(null); }}
            isSubmitting={submitting}
            mode="edit"
          />
        </Modal>
      )}
    </div>
  );
};

export default CommissionSettings;