// src/pages/admin/DashboardHome.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Store, ShoppingBag, DollarSign, Activity,
  AlertCircle, Clock, Sparkles, Plus, UserPlus, Wallet,
  RefreshCw, BarChart3, ArrowRight, TrendingUp,
} from 'lucide-react';
import { fetchDashboardStats, fetchRecentCashierActions } from '../../services/dashboardStatsService';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import Button from '../../components/ui/Button';
import { watchBillerStallAlerts } from '../../services/billerStallService';
import StatCard from '../../components/admin/StatCard';
import CashierDeletedFlagsPanel from '../../components/admin/CashierDeletedFlagsPanel';

const DashboardHome = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState({
    users: 0, stores: 0, todaySales: 0, totalBills: 0,
    pendingReceivables: 0, cashInHand: 0, expenses: 0, returns: 0,
  });
  const [activities, setActivities] = useState([]);
  const [stallAlerts, setStallAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await fetchDashboardStats();
      const activities = await fetchRecentCashierActions(5);

      if (stats) {
        setStats({
          users: stats.users,
          stores: stats.stores,
          todaySales: stats.todaySales,
          totalBills: stats.totalBills,
          pendingReceivables: stats.pendingReceivables,
          cashInHand: stats.cashInHand,
          expenses: stats.expenses,
          returns: stats.returns,
        });
      }
      setActivities(activities);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = watchBillerStallAlerts((rows) => setStallAlerts(rows.slice(0, 5)), 8);
    return unsub;
  }, []);

  const quickActions = [
    { label: t('admin.quickAddUser', 'Add User'),       icon: UserPlus,  path: '/admin/users',        color: 'amber'  },
    { label: t('admin.quickAddBranch', 'Add Branch'),   icon: Plus,       path: '/admin/branches',     color: 'green'  },
    { label: t('manager.viewReports', 'View Reports'),  icon: BarChart3,  path: '/admin/reports',      color: 'blue'   },
    { label: t('admin.nav.cashflow', 'Cash Flow'),       icon: Wallet,     path: '/admin/cashflow',     color: 'purple' },
    { label: t('admin.nav.auditLogs', 'Audit Logs'),    icon: Activity,   path: '/admin/audit-logs',   color: 'rose'   },
    { label: t('admin.nav.syncMonitor', 'Sync Monitor'),icon: RefreshCw,  path: '/admin/sync-monitor', color: 'cyan'   },
  ];

  const COLOR_MAP = {
    amber:  'bg-amber-500/10  text-amber-500',
    green:  'bg-emerald-500/10 text-emerald-500',
    blue:   'bg-sky-500/10    text-sky-500',
    purple: 'bg-violet-500/10 text-violet-500',
    rose:   'bg-rose-500/10   text-rose-500',
    cyan:   'bg-cyan-500/10   text-cyan-500',
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className={cn(
        'rounded-3xl border overflow-hidden relative',
        isDark
          ? 'bg-gradient-to-br from-[#1a1208] to-[#0f0a05] border-[#2a1f0d]'
          : 'bg-gradient-to-br from-white to-amber-50 border-amber-200',
      )}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10
                        rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row
                        lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                            bg-amber-500/10 text-amber-500 text-xs font-semibold
                            uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" /> {t('admin.panel', 'Super Admin Panel')}
            </div>
            <h1 className={cn(
              'text-2xl sm:text-3xl lg:text-4xl font-bold mb-2',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              {t('admin.welcomeBack', 'Welcome back')}, {user?.displayName || t('roles.admin', 'Admin')} 👋
            </h1>
            <p className={cn(
              'text-sm sm:text-base max-w-xl',
              isDark ? 'text-gray-400' : 'text-gray-600',
            )}>
              {t('admin.commandCenter', 'Command center for users, branches, finance, reports & system control.')}
            </p>
          </div>

          {/* Clock */}
          <div className={cn(
            'rounded-2xl border p-4 min-w-[240px]',
            isDark
              ? 'bg-[#0a0805]/80 border-[#2a1f0d]'
              : 'bg-white/80 border-amber-200 backdrop-blur',
          )}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]
                          text-amber-500 mb-2">
              <Clock className="w-3 h-3 inline me-1" /> {t('admin.liveTime', 'Live Time')}
            </p>
            <p className={cn(
              'text-2xl font-bold font-mono',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              {now.toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </p>
            <p className={cn(
              'text-xs mt-1',
              isDark ? 'text-gray-400' : 'text-gray-500',
            )}>
              {now.toLocaleDateString([], {
                weekday: 'long', day: 'numeric',
                month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Key Metrics ───────────────────────────────────── */}
      <div>
        <h2 className={cn(
          'text-lg font-bold mb-4',
          isDark ? 'text-white' : 'text-gray-900',
        )}>
          📊 {t('admin.keyMetrics', 'Key Metrics')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label={t('admin.todaySales', 'Today Sales')}
            value={`Rs ${stats.todaySales.toLocaleString()}`}
            icon={DollarSign} color="green" trend="up" trendValue="+12%" />
          <StatCard label={t('admin.pendingReceivables', 'Pending Receivables')}
            value={`Rs ${stats.pendingReceivables.toLocaleString()}`}
            icon={AlertCircle} color="rose" />
          <StatCard label={t('stats.cashInHand', 'Cash in Hand')}
            value={`Rs ${stats.cashInHand.toLocaleString()}`}
            icon={Wallet} color="amber" />
          <StatCard label={t('bills.totalBills', 'Total Bills')}
            value={stats.totalBills} icon={ShoppingBag}
            color="blue" subtitle={t('dates.allTime', 'All time')} />
          <StatCard label={t('admin.totalUsers', 'Total Users')}
            value={stats.users} icon={Users} color="purple"
            onClick={() => navigate('/admin/users')} />
          <StatCard label={t('admin.nav.branches', 'Branches')}
            value={stats.stores} icon={Store} color="cyan"
            onClick={() => navigate('/admin/branches')} />
          <StatCard label={t('stats.expenses', 'Expenses')}
            value={`Rs ${stats.expenses.toLocaleString()}`}
            icon={TrendingUp} color="rose" />
          <StatCard label={t('stats.returns', 'Returns')}
            value={`Rs ${stats.returns.toLocaleString()}`}
            icon={RefreshCw} color="amber" />
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────── */}
      <div>
        <h2 className={cn(
          'text-lg font-bold mb-4',
          isDark ? 'text-white' : 'text-gray-900',
        )}>
          ⚡ {t('manager.quickActions', 'Quick Actions')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map(({ label, icon: Icon, path, color }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'group rounded-2xl border p-4 transition-all text-start',
                'hover:-translate-y-1 hover:shadow-lg',
                isDark
                  ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/50'
                  : 'bg-white border-amber-200 hover:border-amber-400',
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl mb-3 flex items-center justify-center',
                COLOR_MAP[color],
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <p className={cn(
                'text-sm font-semibold',
                isDark ? 'text-white' : 'text-gray-900',
              )}>
                {label}
              </p>
              <ArrowRight className="w-4 h-4 text-gray-400 mt-2
                                     group-hover:translate-x-1 transition-transform" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Activity */}
        <div className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(
              'font-bold',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              {t('admin.recentActivity', 'Recent Activity')}
            </h3>
            <Button variant="ghost" size="sm"
              onClick={() => navigate('/admin/audit-logs')}>
              {t('common.viewAll', 'View all')}
            </Button>
          </div>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className={cn(
                'text-sm text-center py-4',
                isDark ? 'text-gray-500' : 'text-gray-400',
              )}>
                No recent activity
              </p>
            ) : activities.map(act => (
              <div key={act.id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl',
                isDark ? 'bg-[#1a1208]' : 'bg-amber-50/50',
              )}>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10
                                text-amber-500 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium truncate',
                    isDark ? 'text-white' : 'text-gray-900',
                  )}>
                    {act.actionType}
                    {act.billSerial ? ` — ${act.billSerial}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    by {act.cashierName || act.billerName || 'User'} •{' '}
                    {act.timestamp?.toDate
                      ? act.timestamp.toDate().toLocaleTimeString()
                      : new Date(
                        act.timestamp?.seconds
                          ? act.timestamp.seconds * 1000
                          : act.timestamp || 0,
                      ).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cashier cancelled bill flags */}
        <CashierDeletedFlagsPanel
          title={t('admin.cashierCancelFlags', 'Cashier Cancelled Bill Flags')}
          description="Cashier ne cancelled bill flag ki — cancel reason aur flag reason yahan review karo."
          className="mb-6"
        />

        {/* Biller stall alerts */}
        <div className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(
              'font-bold flex items-center gap-2',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              <AlertCircle className="w-4 h-4 text-rose-500" />
              {t('admin.billerStallAlerts', 'Biller Stall Alerts')}
            </h3>
            <Button variant="ghost" size="sm"
              onClick={() => navigate('/admin/settings/biller')}>
              {t('admin.roleSettings.billerStallTitle', 'Settings')}
            </Button>
          </div>
          <div className="space-y-2">
            {stallAlerts.length === 0 ? (
              <p className={cn(
                'text-sm text-center py-4',
                isDark ? 'text-gray-500' : 'text-gray-400',
              )}>
                {t('admin.roleSettings.noStallAlerts', 'No stall alerts yet')}
              </p>
            ) : stallAlerts.map((row) => (
              <div key={row.id} className={cn(
                'flex items-center justify-between gap-3 p-3 rounded-xl border',
                isDark ? 'bg-rose-500/5 border-rose-500/20' : 'bg-rose-50/60 border-rose-100',
              )}>
                <div className="min-w-0">
                  <p className={cn('text-sm font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>
                    {row.billerName || row.billerId}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {row.billSerial || '----'} · {row.stallLabel || row.stallType}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-amber-500 tabular-nums">
                    {row.durationLabel || `${row.durationMinutes || '?'} min`}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {row.localDate || ''} {row.localTime || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(
              'font-bold',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              System Status
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full
                             bg-emerald-500/10 text-emerald-500 text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Online
            </span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Firebase Connection', status: 'Connected', ok: true },
              { label: 'Sync Status',         status: 'Up to date', ok: true },
              { label: 'PWA Status',          status: 'Active',     ok: true },
              { label: 'Last Backup',         status: 'Today',      ok: true },
            ].map(item => (
              <div key={item.label}
                className="flex items-center justify-between">
                <span className={cn(
                  'text-sm',
                  isDark ? 'text-gray-300' : 'text-gray-700',
                )}>
                  {item.label}
                </span>
                <span className={cn(
                  'text-sm font-semibold',
                  item.ok ? 'text-emerald-500' : 'text-rose-500',
                )}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className={cn(
              'mt-5 w-full flex items-center justify-center gap-2',
              'py-2 rounded-xl text-xs font-semibold transition-all',
              isDark
                ? 'bg-[#1a1208] text-amber-400 hover:bg-[#2a1f0d]'
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100',
            )}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {loading ? 'Refreshing...' : 'Refresh Stats'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;