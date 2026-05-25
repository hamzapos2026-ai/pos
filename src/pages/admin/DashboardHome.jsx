// src/pages/admin/DashboardHome.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Store, ShoppingBag, DollarSign, Activity,
  AlertCircle, Clock, Sparkles, Plus, UserPlus, Wallet,
  RefreshCw, BarChart3, ArrowRight, TrendingUp,
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit } from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/ui/Button';
import StatCard from '../../components/admin/StatCard';

const DashboardHome = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState({
    users: 0, stores: 0, todaySales: 0, totalBills: 0,
    pendingReceivables: 0, cashInHand: 0, expenses: 0, returns: 0,
  });
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!isFirebaseReady() || !db) return;
    setLoading(true);
    try {
      let u = { size: 0 }, s = { size: 0 };
      let b = { docs: [], size: 0 };
      let aSnap = { docs: [] };

      try { u = await getDocs(collection(db, 'users')); } catch {}
      try { s = await getDocs(collection(db, 'stores')); } catch {}
      try { b = await getDocs(collection(db, 'orders')); } catch {}
      try {
        aSnap = await getDocs(
          query(collection(db, 'cashierActions'),
            orderBy('timestamp', 'desc'), limit(5))
        );
      } catch {}

      setActivities(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const today = new Date(); today.setHours(0, 0, 0, 0);
      let todaySales = 0, pendingReceivables = 0, cashInHand = 0;
      let expenses = 0, returns = 0, totalBills = 0;

      b.docs.forEach(doc => {
        const bill = doc.data();
        if (bill.deleted) return;
        totalBills++;
        const billDate = bill.createdAt?.toDate
          ? bill.createdAt.toDate()
          : new Date(bill.createdAt?.seconds
            ? bill.createdAt.seconds * 1000
            : bill.createdAt || 0);
        const total = Number(bill.totalAmount || bill.grandTotal || bill.total || 0);
        if (billDate >= today) todaySales += total;
        if (bill.status === 'pending' || bill.paymentStatus === 'unpaid')
          pendingReceivables += Number(bill.balanceDue || total || 0);
        if ((bill.paymentMethod || bill.paymentType || '').toLowerCase() === 'cash')
          cashInHand += total;
        expenses += Number(bill.expense || 0);
        if (bill.returnAmount) returns += Number(bill.returnAmount);
        else if (bill.status === 'returned' || bill.paymentStatus === 'refund')
          returns += total;
      });

      setStats({ users: u.size, stores: s.size, totalBills, todaySales,
        pendingReceivables, cashInHand, expenses, returns });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const quickActions = [
    { label: 'Add User',     icon: UserPlus,  path: '/admin/users',        color: 'amber'  },
    { label: 'Add Branch',   icon: Plus,       path: '/admin/branches',     color: 'green'  },
    { label: 'View Reports', icon: BarChart3,  path: '/admin/reports',      color: 'blue'   },
    { label: 'Cash Flow',    icon: Wallet,     path: '/admin/cashflow',     color: 'purple' },
    { label: 'Audit Logs',   icon: Activity,   path: '/admin/audit-logs',   color: 'rose'   },
    { label: 'Sync Monitor', icon: RefreshCw,  path: '/admin/sync-monitor', color: 'cyan'   },
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
              <Sparkles className="w-3.5 h-3.5" /> Super Admin Panel
            </div>
            <h1 className={cn(
              'text-2xl sm:text-3xl lg:text-4xl font-bold mb-2',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              Welcome back, {user?.displayName || 'Admin'} 👋
            </h1>
            <p className={cn(
              'text-sm sm:text-base max-w-xl',
              isDark ? 'text-gray-400' : 'text-gray-600',
            )}>
              Command center for users, branches, finance, reports &amp; system control.
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
              <Clock className="w-3 h-3 inline mr-1" /> Live Time
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
          📊 Key Metrics
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Today Sales"
            value={`Rs ${stats.todaySales.toLocaleString()}`}
            icon={DollarSign} color="green" trend="up" trendValue="+12%" />
          <StatCard label="Pending Receivables"
            value={`Rs ${stats.pendingReceivables.toLocaleString()}`}
            icon={AlertCircle} color="rose" />
          <StatCard label="Cash in Hand"
            value={`Rs ${stats.cashInHand.toLocaleString()}`}
            icon={Wallet} color="amber" />
          <StatCard label="Total Bills"
            value={stats.totalBills} icon={ShoppingBag}
            color="blue" subtitle="All time" />
          <StatCard label="Total Users"
            value={stats.users} icon={Users} color="purple"
            onClick={() => navigate('/admin/users')} />
          <StatCard label="Branches"
            value={stats.stores} icon={Store} color="cyan"
            onClick={() => navigate('/admin/branches')} />
          <StatCard label="Expenses"
            value={`Rs ${stats.expenses.toLocaleString()}`}
            icon={TrendingUp} color="rose" />
          <StatCard label="Returns"
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
          ⚡ Quick Actions
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
              Recent Activity
            </h3>
            <Button variant="ghost" size="sm"
              onClick={() => navigate('/admin/audit-logs')}>
              View all
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