// src/components/commission/CommissionDashboard.jsx
// ✅ FIXED: Consistent data source, proper Firebase sync, no disappearing data

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, TrendingUp, DollarSign, ShoppingBag, Clock,
  ShieldAlert, Briefcase, RefreshCw, Pencil, Trash2,
  Download, AlertCircle, Wifi, Database,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../utils/cn';
import useCommissionReport from '../../hooks/useCommissionReport';
import StatCard from '../admin/StatCard';
import PageHeader from '../admin/PageHeader';
import PayCommissionModal from './PayCommissionModal';
import { db as localDB } from '../../db/index';

import { useAuth } from '../../context/AuthContext';
import { fetchCommissionsReport } from '../../utils/ordersQueryUtils';

// Firebase imports
import {
  doc,
  setDoc,
  serverTimestamp,
  isFirebaseReady,
  db,
} from '../../services/firebase';

const fmt    = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtDec = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const DATE_PRESET_KEYS = [
  { id: 'all',     key: 'commission.allTime' },
  { id: 'daily',   key: 'commission.today' },
  { id: 'weekly',  key: 'commission.thisWeek' },
  { id: 'monthly', key: 'commission.thisMonth' },
  { id: 'custom',  key: 'commission.custom' },
];

const SkeletonRow = ({ cols, isDark }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className={cn(
          'h-3 rounded animate-pulse',
          isDark ? 'bg-[#2a1f0d]' : 'bg-amber-100',
          i === 0 ? 'w-28' : 'w-16',
        )} />
      </td>
    ))}
  </tr>
);

const CommissionDashboard = ({
  agents = [],
  allowed = true,
  moduleOn = true,
  managerPerms = null,
  onRefresh,
}) => {
  const { isDark }    = useTheme();
  const { t, isRTL } = useLanguage();
  const { userData }  = useAuth();
  const isManager     = Boolean(managerPerms);
  const perms         = managerPerms || {};

  const [payFor, setPayFor] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // ── Firebase commission data — on-demand date-range fetch ───
  const [firebaseCommissions, setFirebaseCommissions] = useState([]);
  const [firebaseLoading, setFirebaseLoading] = useState(false);

  // ── Online/offline status ───────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const {
    loading,
    loadOrders,
    orders,
    selAgent,    setSelAgent,
    dateFrom,    setDateFrom,
    dateTo,      setDateTo,
    datePreset,  setDatePreset,
    displayReport,
    totals,
    resetFilters,
  } = useCommissionReport(agents, { enabled: allowed && moduleOn });

  const loadCommissions = useCallback(async () => {
    if (!isFirebaseReady() || !db || !navigator.onLine) return;
    setFirebaseLoading(true);
    try {
      const scopeStore = userData?.primaryStore || userData?.branchId || null;
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
      const data = await fetchCommissionsReport({
        storeId: scopeStore,
        branchId: userData?.branchId || scopeStore,
        dateFrom: from,
        dateTo: to,
        limitCount: 100,
      });
      setFirebaseCommissions(data);
    } catch (err) {
      console.warn('Firebase commissions fetch error:', err);
    } finally {
      setFirebaseLoading(false);
    }
  }, [userData, dateFrom, dateTo]);

  // ── Determine best data source ─────────────────────────────
  // Priority: Firebase > Hook's displayReport > Fallback
  const useDataSource = useMemo(() => {
    // If Firebase has data and we're online, use Firebase
    if (isOnline && firebaseCommissions.length > 0) {
      return 'firebase';
    }
    // If hook has data from local orders, use that
    if (displayReport.length > 0) {
      return 'local';
    }
    // Fallback: try Firebase even if offline (cached data)
    if (firebaseCommissions.length > 0) {
      return 'firebase';
    }
    return 'none';
  }, [isOnline, firebaseCommissions, displayReport]);

  // ── Transform Firebase data to display format ─────────────
  const firebaseDisplayReport = useMemo(() => {
    if (!firebaseCommissions.length) return [];
    
    return firebaseCommissions.map((comm) => {
      // Try to find matching agent
      const matchingAgent = agents.find(a => 
        a.id === comm.agentId ||
        a.uid === comm.agentId ||
        a.id?.toString() === comm.agentId?.toString() ||
        a.uid?.toString() === comm.agentId?.toString()
      );

      const totalSales = Number(comm.totalSales || 0);
      const rate = Number(comm.commissionRate || matchingAgent?.commissionRate || 0);
      const commissionEarned = Number(comm.commissionEarned || 0);

      return {
        id: comm.agentId,
        uid: comm.agentId,
        name: comm.agentName || matchingAgent?.name || comm.agentId,
        billsInvolved: Number(comm.billsCount || 0),
        itemsSold: Number(comm.itemCount || 0),
        totalSales,
        paidSales: totalSales, // Firebase has aggregated totals
        pendingSales: 0,
        commissionEarned,
        commissionPending: comm.commissionPending || 0,
        commissionRate: rate,
        isActive: comm.isActive !== false && matchingAgent?.isActive !== false,
        lastUpdated: comm.updatedAt,
      };
    });
  }, [firebaseCommissions, agents]);

  // ── Final display report ────────────────────────────────────
  const finalDisplayReport = useMemo(() => {
    let report;

    if (useDataSource === 'firebase') {
      report = firebaseDisplayReport;
    } else if (useDataSource === 'local') {
      report = displayReport;
    } else {
      return [];
    }

    // Apply agent filter
    if (selAgent && selAgent !== 'all') {
      return report.filter(r => 
        r.id === selAgent || r.uid === selAgent
      );
    }

    return report;
  }, [useDataSource, firebaseDisplayReport, displayReport, selAgent]);

  // ── Calculate totals from final report ─────────────────────
  const displayTotals = useMemo(() => {
    if (finalDisplayReport.length === 0) {
      return { sales: 0, bills: 0, paid: 0, pending: 0, earned: 0, pendingC: 0 };
    }

    return finalDisplayReport.reduce(
      (acc, r) => ({
        sales:    acc.sales    + (r.totalSales        || 0),
        bills:    acc.bills    + (r.billsInvolved     || 0),
        paid:     acc.paid     + (r.paidSales         || 0),
        pending:  acc.pending  + (r.pendingSales      || 0),
        earned:   acc.earned   + (r.commissionEarned  || 0),
        pendingC: acc.pendingC + (r.commissionPending || 0),
      }),
      { sales: 0, bills: 0, paid: 0, pending: 0, earned: 0, pendingC: 0 }
    );
  }, [finalDisplayReport]);

  // ── Check if we have any data at all ───────────────────────
  const hasAnyData = useMemo(() => {
    return finalDisplayReport.length > 0 || 
           displayReport.length > 0 || 
           firebaseCommissions.length > 0;
  }, [finalDisplayReport, displayReport, firebaseCommissions]);

  const handleRefresh = async () => {
    await Promise.all([loadOrders(), loadCommissions()]);
    onRefresh?.();
    toast.success('Data refreshed', { id: 'comm-refresh' });
  };

  const handleResetPending = async (row) => {
    if (!perms.delete) { toast.error('No permission'); return; }
    if (!window.confirm('Reset pending commission for this agent?')) return;
    
    try {
      // Update Firebase
      if (isFirebaseReady() && db && navigator.onLine) {
        await setDoc(
          doc(db, 'commissions', row.uid || row.id),
          { commissionPending: 0, pendingSales: 0, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      // Update local if exists
      try {
        const snapshot = await localDB.commissionSnapshots?.where('agentId').equals(row.uid || row.id).first();
        if (snapshot) {
          await localDB.commissionSnapshots.put({ 
            ...snapshot, 
            commissionPending: 0,
            pendingSales: 0,
            synced: 0 
          });
        }
      } catch (e) {
        console.log('Local update skipped:', e);
      }

      toast.success('Pending cleared');
      handleRefresh();
    } catch (e) { 
      toast.error(e.message); 
    }
  };

  const exportCsv = () => {
    if (!perms.export) return;
    const headers = [
      'Salesperson', 'Bills', 'Items',
      'Total Sales', 'Paid Sales', 'Pending',
      'Comm. Earned', 'Comm. Pending', 'Status',
    ];
    const rows = finalDisplayReport.map((r) => [
      r.name, r.billsInvolved, r.itemsSold,
      r.totalSales, r.paidSales, r.pendingSales,
      r.commissionEarned, r.commissionPending,
      r.isActive !== false ? 'Active' : 'Inactive',
    ]);
    const csv  = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `commission_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableHeaders = useMemo(() => [
    t('commission.colSalesperson', 'Salesperson'),
    t('commission.colBills', 'Bills'),
    t('commission.colItems', 'Items'),
    t('commission.colTotalSales', 'Total Sales'),
    t('commission.colPaidSales', 'Paid Sales'),
    t('commission.colPending', 'Pending'),
    t('commission.colCommEarned', 'Comm. Earned'),
    t('commission.colCommPending', 'Comm. Pending'),
    t('commission.colStatus', 'Status'),
    ...(isManager && (perms.approve || perms.edit || perms.delete)
      ? [t('commission.colActions', 'Actions')] : []),
  ], [isManager, perms, t]);

  // ── Access denied ───────────────────────────────────────────
  if (!allowed) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className={cn(
          'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
          isDark ? 'bg-red-500/10' : 'bg-red-50',
        )}>
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className={cn('text-lg font-bold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
          {t('commission.accessDenied', 'Access Denied')}
        </h2>
        <p className={cn('text-sm leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
          {t('commission.accessDeniedHint', 'Super Admin: Roles & Permissions → Manager → Commission Reports → View ON')}
        </p>
      </div>
    );
  }

  // ── Module off ──────────────────────────────────────────────
  if (!moduleOn) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className={cn(
          'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
          isDark ? 'bg-amber-500/10' : 'bg-amber-50',
        )}>
          <Briefcase className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className={cn('text-lg font-bold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
          {t('commission.moduleOff', 'Commission Module is OFF')}
        </h2>
        <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
          {t('commission.moduleOffHint', 'Super Admin must enable Commission in Finance → Commission Settings')}
        </p>
      </div>
    );
  }

  // ── No agents configured ────────────────────────────────────
  if (!loading && !firebaseLoading && agents.length === 0 && !hasAnyData) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className={cn(
          'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
          isDark ? 'bg-amber-500/10' : 'bg-amber-50',
        )}>
          <Users className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className={cn('text-lg font-bold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
          No Agents Configured
        </h2>
        <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
          Super Admin must add salesperson agents in Commission Settings first.
        </p>
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium',
          isOnline
            ? 'bg-emerald-500/15 text-emerald-500'
            : 'bg-amber-500/15 text-amber-500',
        )}
      >
        {isOnline ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <Database className="w-3 h-3 animate-pulse" />
        )}
        {isOnline ? t('activityLog.live', 'Live') : t('activityLog.offline', 'Offline')}
      </div>
      
      <button
        type="button"
        onClick={handleRefresh}
        className={cn(
          'p-2 rounded-xl border transition-colors',
          isDark
            ? 'border-[#2a1f0d] text-gray-400 hover:text-amber-400 hover:border-amber-500/30'
            : 'border-amber-200 text-gray-500 hover:text-amber-600',
        )}
        title={t('manager.common.refresh', 'Refresh')}
      >
        <RefreshCw className={cn('w-4 h-4', (loading || firebaseLoading) && 'animate-spin')} />
      </button>
      
      {isManager && perms.export && (
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 text-xs font-semibold"
        >
          <Download className="w-3.5 h-3.5" />
          {t('commission.export', 'Export')}
        </button>
      )}
    </div>
  );

  const isDataLoading = loading || firebaseLoading;
  const showEmptyState = !isDataLoading && finalDisplayReport.length === 0;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={Users}
        title={t('commission.dashboardTitle', 'Commission Dashboard')}
        description={`${isOnline ? t('commission.syncActive', 'Firebase sync active') : t('commission.offlineModeDesc', 'Offline mode')} · ${t('commission.agentsShown', '{{count}} agents shown', { count: finalDisplayReport.length })}`}
        actions={headerActions}
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard compact={isManager} label={t('commission.totalSales', 'Total Sales')}        value={fmt(displayTotals.sales)}      icon={TrendingUp}  color="amber"   />
        <StatCard compact={isManager} label={t('commission.totalBills', 'Total Bills')}        value={String(displayTotals.bills)}   icon={ShoppingBag} color="blue"    />
        <StatCard compact={isManager} label={t('commission.paidSales', 'Paid Sales')}         value={fmt(displayTotals.paid)}       icon={DollarSign}  color="green"   />
        <StatCard compact={isManager} label={t('commission.pendingSales', 'Pending Sales')}      value={fmt(displayTotals.pending)}    icon={Clock}       color="red"     />
        <StatCard compact={isManager} label={t('commission.commissionEarned', 'Commission Earned')}  value={fmtDec(displayTotals.earned)}  icon={DollarSign}  color="emerald" />
        <StatCard compact={isManager} label={t('commission.commissionPending', 'Commission Pending')} value={fmtDec(displayTotals.pendingC)} icon={Clock}     color="orange"  />
      </div>

      {/* Filters */}
      <div className={cn(
        'p-4 rounded-2xl border flex flex-wrap gap-3 items-center',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex gap-1 flex-wrap">
          {DATE_PRESET_KEYS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDatePreset(p.id)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors',
                datePreset === p.id
                  ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                  : isDark
                    ? 'border-[#2a1f0d] text-gray-400 hover:bg-[#1a1208]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {t(p.key, p.key)}
            </button>
          ))}
        </div>

        <select
          value={selAgent}
          onChange={(e) => setSelAgent(e.target.value)}
          className={cn(
            'px-3 py-2 text-xs rounded-xl border outline-none font-medium',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
          )}
        >
          <option value="all">{t('commission.allSalespersons', 'All Salespersons')}</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setDatePreset('custom'); }}
          className={cn(
            'px-3 py-2 text-xs rounded-xl border outline-none',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
          )}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setDatePreset('custom'); }}
          className={cn(
            'px-3 py-2 text-xs rounded-xl border outline-none',
            isDark ? 'bg-[#1a1208] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
          )}
        />

        <button
          type="button"
          onClick={resetFilters}
          className="px-3 py-2 text-xs rounded-xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium"
        >
          {t('commission.reset', 'Reset')}
        </button>

        <button
          type="button"
          onClick={loadCommissions}
          disabled={firebaseLoading || !isOnline}
          className="px-3 py-2 text-xs rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-semibold disabled:opacity-50"
        >
          {firebaseLoading
            ? t('commission.loading', 'Loading…')
            : t('commission.loadReport', 'Load Commission Report')}
        </button>

        {isDataLoading && (
          <span className={cn('text-xs ms-auto animate-pulse', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {t('commission.loading', 'Loading…')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className={cn(
        'rounded-2xl border overflow-hidden shadow-lg',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={cn(
              'text-[10px] uppercase tracking-wider font-semibold border-b',
              isDark ? 'bg-[#0a0805] text-gray-400 border-[#2a1f0d]/50' : 'bg-amber-50/50 text-gray-600 border-amber-100',
            )}>
              <tr>
                {tableHeaders.map((h) => (
                  <th key={h} className={cn('px-5 py-4 whitespace-nowrap', isRTL ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody className={cn('divide-y', isDark ? 'divide-[#2a1f0d]/40 text-gray-300' : 'divide-amber-50 text-gray-700')}>
              {/* Loading skeleton */}
              {isDataLoading && finalDisplayReport.length === 0 && (
                Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonRow key={i} cols={tableHeaders.length} isDark={isDark} />
                ))
              )}

              {/* Data rows */}
              {!showEmptyState && finalDisplayReport.map((r, idx) => (
                <tr key={r.id || r.uid || idx} className={cn(
                  'transition-colors',
                  isDark ? 'hover:bg-[#1a1208]' : 'hover:bg-amber-50/30',
                )}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-amber-500">{r.name || t('admin.usersPage.unknown', 'Unknown')}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{t('commission.rate', '{{rate}}% rate', { rate: r.commissionRate || 0 })}</div>
                  </td>
                  <td className="px-5 py-4 font-medium">{r.billsInvolved || 0}</td>
                  <td className="px-5 py-4">{r.itemsSold || 0}</td>
                  <td className="px-5 py-4">{fmt(r.totalSales || 0)}</td>
                  <td className="px-5 py-4 text-green-500">{fmt(r.paidSales || 0)}</td>
                  <td className="px-5 py-4 text-red-400">{fmt(r.pendingSales || 0)}</td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-emerald-500">{fmtDec(r.commissionEarned || 0)}</div>
                    {(r.totalSales || 0) > 0 && (
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {r.commissionRate || 0}% × {fmt(r.totalSales || 0)}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-amber-400 font-medium">{fmtDec(r.commissionPending || 0)}</td>
                  <td className="px-5 py-4">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                      r.isActive !== false ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                    )}>
                      {r.isActive !== false ? t('commission.active', 'Active') : t('commission.inactive', 'Inactive')}
                    </span>
                  </td>
                  {isManager && (perms.approve || perms.edit || perms.delete) && (
                    <td className="px-4 py-3">
                      <div className={cn('flex items-center gap-1', isRTL ? 'justify-start' : 'justify-end')}>
                        {perms.approve && Number(r.commissionPending || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayFor({ ...r, uid: r.uid || r.id })}
                            className="px-2 py-1 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25"
                          >Pay</button>
                        )}
                        {perms.edit && (
                          <button
                            type="button"
                            onClick={() => setPayFor({ ...r, uid: r.uid || r.id })}
                            title="Edit payout"
                            className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                          ><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        {perms.delete && Number(r.commissionPending || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => handleResetPending({ ...r, uid: r.uid || r.id })}
                            title="Reset pending"
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {/* Empty state */}
              {showEmptyState && (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center',
                        isDark ? 'bg-amber-500/10' : 'bg-amber-50',
                      )}>
                        <AlertCircle className="w-6 h-6 text-amber-500" />
                      </div>
                      <div>
                        <p className={cn(
                          'font-semibold text-sm mb-1',
                          isDark ? 'text-white' : 'text-gray-900',
                        )}>
                          {useDataSource === 'none' ? 'No commission data yet' : 'No data matches filters'}
                        </p>
                        <p className="text-xs text-gray-500 max-w-xs mx-auto">
                          {useDataSource === 'none'
                            ? 'Create bills with salespeople assigned, then commission data will appear here.'
                            : 'Try adjusting your filters or select "All Time".'}
                        </p>
                      </div>
                      {useDataSource !== 'none' && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                        >
                          Show all data
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay modal */}
      {payFor && (
        <PayCommissionModal
          user={payFor}
          onClose={() => setPayFor(null)}
          onSaved={handleRefresh}
          canEdit={perms.edit}
          t={t}
        />
      )}
    </div>
  );
};

export default CommissionDashboard;