// File: src/pages/manager/Dashboard.jsx
// Purpose: Manager dashboard with live stats, charts, and quick actions
// Features: Real-time data, animated cards, charts, date filters with "All Time"
// FIXED: Now defaults to "Last 30 Days" + has "All Time" option

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign, ShoppingCart, AlertCircle, Wallet, Receipt, RotateCcw,
  TrendingUp, Users, Briefcase, Activity, Plus, Eye, RefreshCw,
  CreditCard, CheckCircle2, Calendar, WifiOff,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import {
  mergeRoleFeatureMatrix,
  resolveActivityLogsPerms,
} from '../../utils/roleFeaturePermissions';

import managerService from '../../services/managerService';
import { formatPKR, formatShort, getDatePresets } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import { useLanguage } from '../../hooks/useLanguage';
import StatCard from '../../components/manager/StatCard';
import ChartCard, { CHART_COLORS, CHART_COLORS_SOLID } from '../../components/manager/ChartCard';

// ============================================
// EXTENDED DATE PRESETS — includes "All Time"
// ============================================
const getExtendedPresets = () => {
  const presets = getDatePresets();
  return {
    today: presets.today,
    yesterday: presets.yesterday,
    last7days: presets.last7days,
    last30days: presets.last30days,
    thisMonth: presets.thisMonth,
    all: {
      from: '2020-01-01',
      to: '2099-12-31',
      label: 'All Time',
    },
  };
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { settings } = useSettings();
  const { t } = useLanguage();

  const activityPerms = useMemo(() => {
    const roleMatrix = mergeRoleFeatureMatrix(settings?.permissions);
    return resolveActivityLogsPerms(userData, roleMatrix);
  }, [userData, settings?.permissions]);

  const quickActions = useMemo(() => {
    const actions = [
      { label: t('manager.newExpense', 'New Expense'), icon: Plus, color: 'amber', path: '/manager/expenses' },
      { label: t('manager.collectPayment', 'Collect Payment'), icon: DollarSign, color: 'green', path: '/manager/credits' },
      { label: t('manager.openShift', 'Open Shift'), icon: Activity, color: 'blue', path: '/manager/shifts' },
      { label: t('manager.addCustomer', 'Add Customer'), icon: Users, color: 'purple', path: '/manager/customers' },
      { label: t('manager.viewReports', 'View Reports'), icon: TrendingUp, color: 'orange', path: '/manager/reports' },
    ];
    if (activityPerms.view) {
      actions.push({ label: t('manager.activityLogs', 'Activity Logs'), icon: Eye, color: 'cyan', path: '/manager/activity' });
    }
    return actions;
  }, [activityPerms.view, t]);

  // ✅ FIX: Default to "All Time" so future-dated bills also show
  const [dateRange, setDateRange] = useState(getExtendedPresets().all);

  const loader = useCallback(
    () => managerService.getDashboardSummary({ from: dateRange.from, to: dateRange.to }),
    [dateRange]
  );

  const { data, loading, refreshing, refresh } = useManagerData(loader, [dateRange], {
    autoRefresh: true,
    refreshInterval: 60000,
  });

  const summary = data?.summary || {};
  const charts = data?.charts || {};

  // ============ CHART: Daily Sales Trend ============
  const salesTrendData = useMemo(() => {
    const trend = charts.dailyTrend || [];
    if (trend.length === 0) return null;
    return {
      labels: trend.map(t => t.date.slice(5)),
      datasets: [
        {
          label: 'Sales',
          data: trend.map(t => t.sales),
          borderColor: CHART_COLORS_SOLID.amber,
          backgroundColor: CHART_COLORS.amber,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [charts.dailyTrend]);

  // ============ CHART: Payment Methods ============
  const paymentMethodData = useMemo(() => {
    const methods = charts.paymentMethods || [];
    if (methods.length === 0) return null;
    const colors = Object.values(CHART_COLORS);
    return {
      labels: methods.map(m => (m.method || 'unknown').toUpperCase()),
      datasets: [
        {
          data: methods.map(m => m.amount),
          backgroundColor: methods.map((_, i) => colors[i % colors.length]),
          borderColor: '#1a1208',
          borderWidth: 2,
        },
      ],
    };
  }, [charts.paymentMethods]);

  // ============ CHART: Top Billers ============
  const topBillersData = useMemo(() => {
    const billers = charts.topBillers || [];
    if (billers.length === 0) return null;
    return {
      labels: billers.map(b => (b.billerName || 'Unknown').slice(0, 12)),
      datasets: [
        {
          label: 'Sales',
          data: billers.map(b => b.totalSales),
          backgroundColor: CHART_COLORS.amber,
          borderRadius: 6,
        },
      ],
    };
  }, [charts.topBillers]);

  const extendedPresets = getExtendedPresets();

  // ============ FORMAT DATE RANGE DISPLAY ============
  const dateRangeDisplay = useMemo(() => {
    if (dateRange.label === 'All Time') return 'All Time — Showing all bills';
    if (dateRange.from === dateRange.to) {
      return new Date(dateRange.from).toLocaleDateString();
    }
    return `${new Date(dateRange.from).toLocaleDateString()} → ${new Date(dateRange.to).toLocaleDateString()}`;
  }, [dateRange]);

  const [isOffline, setIsOffline] = React.useState(() => !navigator.onLine);
  const [unsyncedPayments, setUnsyncedPayments] = React.useState({ pending: 0, manualReview: 0 });

  React.useEffect(() => {
    const loadPaymentSync = async () => {
      try {
        const { getSyncStats } = await import('../../services/offlinePaymentService');
        const stats = await getSyncStats();
        setUnsyncedPayments({
          pending: Number(stats?.pending || 0),
          manualReview: Number(stats?.manualReview || 0),
        });
      } catch { /* ignore */ }
    };
    loadPaymentSync();
    const onDone = () => loadPaymentSync();
    window.addEventListener('cashier-sync-complete', onDone);
    const id = setInterval(loadPaymentSync, 30000);
    return () => {
      window.removeEventListener('cashier-sync-complete', onDone);
      clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    const goOnline = () => { setIsOffline(false); refresh(); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [refresh]);

  return (
    <div className="space-y-4">
      {/* ── Offline banner ── */}
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/10 border border-amber-500/25 text-amber-400">
          <WifiOff className="w-4 h-4 shrink-0" />
          {t('common.offlineCache', 'Offline — showing cached local data. Will auto-refresh when online.')}
        </div>
      )}
      {(unsyncedPayments.pending > 0 || unsyncedPayments.manualReview > 0) && (
        <button
          type="button"
          onClick={() => navigate('/manager/reconciliation')}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/15 transition-colors"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {unsyncedPayments.pending + unsyncedPayments.manualReview}{' '}
          {t('manager.unsyncedPayments', 'payments cloud par nahi gayi — Reconciliation dekhein')}
        </button>
      )}
      {/* ============ HEADER ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-100">{t('manager.overview', 'Overview')}</h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {dateRangeDisplay}
            {summary.billCount > 0 && (
              <span className="ms-2 text-amber-400 font-semibold">
                • {summary.billCount} {t('manager.bills', 'bills')}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Preset Buttons */}
          {[
            { key: 'today',      label: t('dates.today', 'Today') },
            { key: 'yesterday',  label: t('dates.yesterday', 'Yesterday') },
            { key: 'last7days',  label: t('dates.last7days', 'Last 7 Days') },
            { key: 'last30days', label: t('dates.last30days', 'Last 30 Days') },
            { key: 'all',        label: t('dates.allTime', 'All Time') },
          ].map(item => {
            const preset = extendedPresets[item.key];
            const active = preset.from === dateRange.from && preset.to === dateRange.to;
            return (
              <button
                key={item.key}
                onClick={() => setDateRange(preset)}
                className={
                  'rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors border ' +
                  (active
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-[#1a1208] text-gray-400 border-[#2a1f0d] hover:text-gray-200')
                }
              >
                {item.label}
              </button>
            );
          })}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a1f0d] bg-[#1a1208] px-3 py-1.5 text-xs text-gray-400 hover:text-amber-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={'h-3.5 w-3.5 ' + (refreshing ? 'animate-spin' : '')} />
            <span className="hidden sm:inline">{t('common.refresh', 'Refresh')}</span>
          </button>
        </div>
      </div>

      {/* ============ STAT CARDS ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label={t('stats.totalSales', 'Total Sales')}
          value={summary.totalSales || 0}
          prefix="Rs "
          icon={DollarSign}
          color="amber"
          loading={loading}
          subtitle={`${summary.billCount || 0} ${t('manager.bills', 'bills')}`}
          onClick={() => navigate('/manager/bills')}
        />
        <StatCard
          label={t('stats.paidAmount', 'Paid Amount')}
          value={summary.totalPaid || 0}
          prefix="Rs "
          icon={CheckCircle2}
          color="green"
          loading={loading}
          subtitle={`${summary.paidBillCount || 0} ${t('stats.paid', 'paid')}`}
        />
        <StatCard
          label={t('stats.outstanding', 'Outstanding')}
          value={summary.totalOutstanding || 0}
          prefix="Rs "
          icon={AlertCircle}
          color="red"
          loading={loading}
          subtitle={`${summary.creditBillCount || 0} ${t('stats.pending', 'pending')}`}
          onClick={() => navigate('/manager/credits')}
        />
        <StatCard
          label={t('stats.cashInHand', 'Cash in Hand')}
          value={summary.cashInHand || 0}
          prefix="Rs "
          icon={Wallet}
          color="blue"
          loading={loading}
          onClick={() => navigate('/manager/cashflow')}
        />
        <StatCard
          label={t('stats.expenses', 'Expenses')}
          value={summary.totalExpenses || 0}
          prefix="Rs "
          icon={Receipt}
          color="orange"
          loading={loading}
          subtitle={`${summary.expenseCount || 0} ${t('stats.entries', 'entries')}`}
          onClick={() => navigate('/manager/expenses')}
        />
        <StatCard
          label={t('stats.returns', 'Returns')}
          value={summary.totalReturnAmount || 0}
          prefix="Rs "
          icon={RotateCcw}
          color="purple"
          loading={loading}
          subtitle={`${summary.returnCount || 0} ${t('stats.returns', 'returns')}`}
          onClick={() => navigate('/manager/returns')}
        />
        <StatCard
          label={t('stats.digitalCollected', 'Digital Collected')}
          value={summary.digitalCollected || 0}
          prefix="Rs "
          icon={CreditCard}
          color="cyan"
          loading={loading}
        />
        <StatCard
          label={t('stats.totalDiscount', 'Total Discount')}
          value={summary.totalDiscount || 0}
          prefix="Rs "
          icon={TrendingUp}
          color="pink"
          loading={loading}
        />
      </div>

      {/* ============ CHARTS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard
          title={t('charts.salesTrend', 'Sales Trend')}
          subtitle={t('charts.salesTrendSub', 'Daily sales over selected period')}
          type="line"
          data={salesTrendData}
          loading={loading}
          empty={!salesTrendData}
          className="lg:col-span-2"
          height={300}
        />
        <ChartCard
          title={t('charts.paymentMethods', 'Payment Methods')}
          subtitle={t('charts.paymentMethodsSub', 'Collection breakdown')}
          type="doughnut"
          data={paymentMethodData}
          loading={loading}
          empty={!paymentMethodData}
          height={300}
        />
      </div>

      {/* ============ TOP PERFORMERS ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard
          title={t('charts.topBillers', 'Top Billers')}
          subtitle={t('charts.topBillersSub', 'By total sales')}
          type="bar"
          data={topBillersData}
          loading={loading}
          empty={!topBillersData}
          height={250}
        />

        {/* Top Salespersons Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">{t('charts.topSalespersons', 'Top Salespersons')}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{t('charts.performanceLeaderboard', 'Performance leaderboard')}</p>
            </div>
            <button
              onClick={() => navigate('/manager/salespersons')}
              className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1"
            >
              <Eye className="w-3 h-3" /> {t('common.viewAll', 'View all')}
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-12 rounded-lg bg-[#1f1a0e] animate-pulse" />
              ))}
            </div>
          ) : (charts.topSalespersons || []).length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-600">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {t('common.noData', 'No data available')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(charts.topSalespersons || []).map((sp, idx) => (
                <motion.div
                  key={sp.salespersonId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#0f0a04] transition-colors"
                >
                  <div className={
                    'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ' +
                    (idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                     idx === 1 ? 'bg-gray-500/20 text-gray-300' :
                     idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                     'bg-[#2a1f0d] text-gray-500')
                  }>
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{sp.name}</p>
                    <p className="text-[10px] text-gray-500">{sp.count} {t('manager.bills', 'bills')} • {t('stats.commission', 'Commission')}: {formatPKR(sp.commission)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-100">{formatShort(sp.totalSales)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* ============ TOP BILLERS LIST (Alternative) ============ */}
      {(charts.topBillers || []).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200">{t('charts.billerPerformance', 'Biller Performance')}</h3>
            <span className="text-xs text-gray-500">{charts.topBillers.length} {t('roles.billers', 'billers')}</span>
          </div>
          <div className="space-y-1.5">
            {(charts.topBillers || []).map((b, idx) => (
              <motion.div
                key={b.billerId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#0f0a04]"
              >
                <div className={
                  'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ' +
                  (idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                   idx === 1 ? 'bg-gray-500/20 text-gray-300' :
                   idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                   'bg-[#2a1f0d] text-gray-500')
                }>
                  #{idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{b.billerName}</p>
                  <p className="text-[10px] text-gray-500">{b.count} {t('stats.billsProcessed', 'bills processed')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-100">{formatPKR(b.totalSales)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ============ QUICK ACTIONS ============ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-4"
      >
        <h3 className="text-sm font-semibold text-gray-200 mb-3">{t('manager.quickActions', 'Quick Actions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {quickActions.map(action => {
            const Icon = action.icon;
            const colorClasses = {
              amber: 'text-amber-400',
              green: 'text-green-400',
              blue: 'text-blue-400',
              purple: 'text-purple-400',
              orange: 'text-orange-400',
              cyan: 'text-cyan-400',
            };
            return (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[#2a1f0d] hover:border-amber-500/30 bg-[#0f0a04] hover:bg-[#0a0805] transition-all group"
              >
                <Icon className={'h-5 w-5 group-hover:scale-110 transition-transform ' + (colorClasses[action.color] || 'text-amber-400')} />
                <span className="text-[10px] font-medium text-gray-400 group-hover:text-gray-200 text-center">{action.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;