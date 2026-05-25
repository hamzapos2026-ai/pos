// File: src/pages/admin/SalespersonReports.jsx

import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, db } from '../../services/firebase';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';
import { Users, TrendingUp, DollarSign, ShoppingBag, Clock } from 'lucide-react';
import { aggregateByAgent, calcItemCommission } from '../../hooks/useSalesperson';
import StatCard from '../../components/admin/StatCard';
import PageHeader from '../../components/admin/PageHeader';

const fmt = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

const SalespersonReports = () => {
  const { isDark }    = useTheme();
  const { settings }  = useSettings();
  const sp            = settings.salesperson || {};
  const agents        = sp.agents || [];

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selAgent, setSelAgent] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Filter orders by date range ──────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.isDeleted || o.deleted) return false;
      if (dateFrom || dateTo) {
        const orderDate = new Date(
          o.createdAt?.toDate?.() || o.createdAt || o.savedAt || 0
        );
        if (dateFrom && orderDate < new Date(dateFrom)) return false;
        if (dateTo   && orderDate > new Date(dateTo + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [orders, dateFrom, dateTo]);

  // ── Build per-agent report ───────────────────────────────
  const report = useMemo(() => {
    const agentMap = {};
    agents.forEach((a) => {
      agentMap[a.id] = {
        ...a,
        totalSales:         0,
        paidSales:          0,
        pendingSales:       0,
        commissionEarned:   0,
        commissionPending:  0,
        itemsSold:          0,
        billsInvolved:      new Set(),
      };
    });

    filteredOrders.forEach((order) => {
      const grandTotal  = Number(order.grandTotal || order.totalAmount || order.total || 0);
      const paidAmount  = Number(order.paidAmount ?? order.amountReceived ?? grandTotal);
      const paidRatio   = grandTotal > 0 ? Math.min(1, paidAmount / grandTotal) : 1;

      // Item-level
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const spId = item.salespersonId;
          if (!spId || !agentMap[spId]) return;

          const { net, rawComm } = calcItemCommission(item);
          const qty = Number(item.qty || item.quantity || 1);

          agentMap[spId].totalSales        += net;
          agentMap[spId].paidSales         += net * paidRatio;
          agentMap[spId].pendingSales      += net * (1 - paidRatio);
          agentMap[spId].commissionEarned  += rawComm * paidRatio;
          agentMap[spId].commissionPending += rawComm * (1 - paidRatio);
          agentMap[spId].itemsSold         += qty;
          agentMap[spId].billsInvolved.add(order.id);
        });
      }

      // Bill-level fallback
      const spId = order.salespersonId;
      if (spId && agentMap[spId] && !(order.items || []).some((i) => i.salespersonId)) {
        agentMap[spId].totalSales        += grandTotal;
        agentMap[spId].paidSales         += paidAmount;
        agentMap[spId].pendingSales      += Math.max(0, grandTotal - paidAmount);
        agentMap[spId].commissionEarned  += Number(order.salespersonCommission || 0) * paidRatio;
        agentMap[spId].billsInvolved.add(order.id);
      }
    });

    return Object.values(agentMap).map((a) => ({
      ...a,
      billsInvolved: a.billsInvolved.size,
    }));
  }, [agents, filteredOrders]);

  const displayReport = selAgent === 'all'
    ? report
    : report.filter((r) => r.id === selAgent);

  const totals = useMemo(() => displayReport.reduce((acc, r) => ({
    sales:      acc.sales      + r.totalSales,
    paid:       acc.paid       + r.paidSales,
    pending:    acc.pending    + r.pendingSales,
    earned:     acc.earned     + r.commissionEarned,
    pendingC:   acc.pendingC   + r.commissionPending,
  }), { sales: 0, paid: 0, pending: 0, earned: 0, pendingC: 0 }), [displayReport]);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      <PageHeader icon={Users} title="Salesperson Reports" description="Item-level commission tracking with partial payment support" />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Sales"     value={fmt(totals.sales)}    icon={TrendingUp}  color="amber"   />
        <StatCard label="Paid Sales"      value={fmt(totals.paid)}     icon={DollarSign}  color="green"   />
        <StatCard label="Pending Sales"   value={fmt(totals.pending)}  icon={Clock}       color="red"     />
        <StatCard label="Commission Earned"  value={fmt(totals.earned)}   icon={DollarSign}  color="emerald" />
        <StatCard label="Commission Pending" value={fmt(totals.pendingC)} icon={Clock}       color="orange"  />
      </div>

      {/* Filters */}
      <div className={cn('p-4 rounded-2xl border flex flex-wrap gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100')}>
        <select value={selAgent} onChange={(e) => setSelAgent(e.target.value)}
          className={cn('px-3 py-2 text-xs rounded-xl border outline-none',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')}>
          <option value="all">All Agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className={cn('px-3 py-2 text-xs rounded-xl border outline-none',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className={cn('px-3 py-2 text-xs rounded-xl border outline-none',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')} />
        <button onClick={() => { setSelAgent('all'); setDateFrom(''); setDateTo(''); }}
          className="px-3 py-2 text-xs rounded-xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
          Reset
        </button>
      </div>

      {/* Report table */}
      <div className={cn('rounded-2xl border overflow-hidden',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100')}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className={cn('text-[10px] uppercase tracking-wider font-semibold',
              isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600')}>
              <tr>
                {['Agent', 'Bills', 'Items', 'Total Sales', 'Paid Sales',
                  'Pending', 'Comm. Earned', 'Comm. Pending', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={cn('divide-y', isDark ? 'divide-[#2a1f0d]/40 text-gray-300' : 'divide-amber-50 text-gray-700')}>
              {displayReport.map((r) => (
                <tr key={r.id} className={cn('transition-colors', isDark ? 'hover:bg-[#1a1208]' : 'hover:bg-amber-50/30')}>
                  <td className="px-4 py-3 font-semibold text-amber-500">{r.name}</td>
                  <td className="px-4 py-3">{r.billsInvolved}</td>
                  <td className="px-4 py-3">{r.itemsSold}</td>
                  <td className="px-4 py-3">{fmt(r.totalSales)}</td>
                  <td className="px-4 py-3 text-green-500">{fmt(r.paidSales)}</td>
                  <td className="px-4 py-3 text-red-400">{fmt(r.pendingSales)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-500">{fmt(r.commissionEarned)}</td>
                  <td className="px-4 py-3 text-amber-400">{fmt(r.commissionPending)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      r.isActive !== false
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400')}>
                      {r.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalespersonReports;