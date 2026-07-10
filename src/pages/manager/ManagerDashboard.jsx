// File: src/pages/manager/ManagerDashboard.jsx
// Purpose: Manager module main layout with sidebar + routing
// Features: All manager routes, modern sidebar, mobile responsive
// Last Updated: Manager Module v1.0

import React, { useState, useMemo } from 'react';
import useStoresMap, { resolveStoreName } from '../../hooks/useStoresMap';
import { resolveUserBranchIds } from '../../utils/branchAccess';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, DollarSign, CreditCard, Users,
  Receipt, RotateCcw, BarChart3, Briefcase, Clock, Activity,
  CheckSquare, UserCheck, LogOut, Menu, X, Sparkles, ChevronRight, Scale, Building2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import {
  mergeRoleFeatureMatrix,
  resolveActivityLogsPerms,
} from '../../utils/roleFeaturePermissions';
import ThemeToggle from '../../components/shared/ThemeToggle';
import LanguageSwitcher from '../../components/shared/LanguageSwitcher';
import ConnectionIndicator from '../../components/shared/ConnectionIndicator';

// Manager Pages
import Dashboard from './Dashboard';
import Bills from './Bills';
import CashFlow from './CashFlow';
import Credits from './Credits';
import Customers from './Customers';
import Expenses from './Expenses';
import Returns from './Returns';
import Reports from './Reports';
import Salespersons from './Salespersons';
import Shifts from './Shifts';
import ActivityLogs from './ActivityLogs';
import Approvals from './Approvals';
import Reconciliation from './Reconciliation';

const cn = (...inputs) => twMerge(clsx(inputs));

// ============================================
// NAVIGATION ITEMS
// ============================================
const NAV_ITEMS = [
  { path: '/manager', labelKey: 'manager.nav.dashboard', icon: LayoutDashboard, badge: null },
  { path: '/manager/bills', labelKey: 'manager.nav.bills', icon: FileText, badge: null },
  { path: '/manager/cashflow', labelKey: 'manager.nav.cashflow', icon: DollarSign, badge: null },
  { path: '/manager/reconciliation', labelKey: 'manager.nav.reconciliation', icon: Scale, badge: null },
  { path: '/manager/credits', labelKey: 'manager.nav.credits', icon: CreditCard, badge: null },
  { path: '/manager/customers', labelKey: 'manager.nav.customers', icon: Users, badge: null },
  { path: '/manager/expenses', labelKey: 'manager.nav.expenses', icon: Receipt, badge: null },
  { path: '/manager/returns', labelKey: 'manager.nav.returns', icon: RotateCcw, badge: null },
  { path: '/manager/salespersons', labelKey: 'manager.nav.salespersons', icon: Briefcase, badge: null },
  { path: '/manager/shifts', labelKey: 'manager.nav.shifts', icon: Clock, badge: null },
  { path: '/manager/reports', labelKey: 'manager.nav.reports', icon: BarChart3, badge: null },
  { path: '/manager/approvals', labelKey: 'manager.nav.approvals', icon: CheckSquare, badge: null },
  { path: '/manager/activity', labelKey: 'manager.nav.activity', icon: Activity, badge: null },
];

// ============================================
// HEADER COMPONENT
// ============================================
const ManagerHeader = ({ onMenuClick, title, subtitle, branchLabel }) => {
  const { t, isRTL } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast.success(t('auth.signedOut', 'Signed out successfully'));
  };

  const initials = (user?.displayName || user?.email || '??')
    .split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header dir={isRTL ? 'rtl' : 'ltr'} className="sticky top-0 z-30 bg-[#1a1208] border-b border-[#2a1f0d] backdrop-blur-md">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg md:hidden hover:bg-[#2a1f0d] text-gray-400 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-100 truncate">{title}</h1>
            {subtitle && (
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">{t(subtitle, subtitle)}</p>
            )}
            {branchLabel && (
              <p className="md:hidden text-[10px] text-amber-400/90 font-medium truncate flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3 shrink-0" />
                {branchLabel}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <ThemeToggle />
          <ConnectionIndicator />

          <div className="hidden md:flex items-center gap-3 ps-3 border-s border-[#2a1f0d]">
            <div className="text-right min-w-0">
              <p className="text-sm font-medium text-gray-100 leading-tight truncate max-w-[180px]">
                {user?.displayName || t('roles.manager', 'Manager')}
              </p>
              {branchLabel && (
                <p className="text-[10px] text-amber-400/90 font-medium truncate max-w-[180px] flex items-center justify-end gap-1">
                  <Building2 className="w-3 h-3 shrink-0" />
                  {branchLabel}
                </p>
              )}
              <p className="text-[10px] text-gray-500 truncate max-w-[180px]">
                {user?.email}
              </p>
            </div>
            <div className="h-9 w-9 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs ring-2 ring-amber-500/30">
              {initials}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title={t('auth.signOut', 'Sign Out')}
            className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

// ============================================
// SIDEBAR COMPONENT
// ============================================
const ManagerSidebar = ({ isOpen, onClose, currentPath, navItems, branchLabel }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();

  const handleNav = (path) => {
    navigate(path);
    if (window.innerWidth < 768) onClose();
  };

  const isActive = (path) =>
    path === '/manager' ? currentPath === '/manager' || currentPath === '/manager/'
      : currentPath.startsWith(path);

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'fixed top-0 start-0 h-full w-64 z-50',
          'bg-[#1a1208] border-e border-[#2a1f0d]',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full max-md:rtl:translate-x-full',
          'md:translate-x-0',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Brand */}
          <div className="p-5 border-b border-[#2a1f0d] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Sparkles className="w-5 h-5 text-[#1a1208]" />
              </div>
              <div>
                <h2 className="font-bold text-gray-100 text-sm">{t('brand.name', 'A One Jewelry')}</h2>
                <p className="text-[10px] text-amber-500/70 font-medium">{t('manager.panel', 'Manager Panel')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg hover:bg-[#2a1f0d] text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scroll">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
                    'transition-all duration-150 group relative',
                    active
                      ? 'bg-gradient-to-r from-amber-500/15 to-amber-500/5 text-amber-400 shadow-sm'
                      : 'text-gray-400 hover:bg-[#2a1f0d] hover:text-gray-200'
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-amber-500 rounded-r-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={cn('w-4 h-4 shrink-0', active && 'text-amber-400')} />
                  <span className="text-sm font-medium flex-1 text-start">{t(item.labelKey, item.labelKey)}</span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold">
                      {item.badge}
                    </span>
                  )}
                  {active && <ChevronRight className="w-3 h-3 text-amber-400" />}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-[#2a1f0d] space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0a0805] border border-[#2a1f0d]">
              <div className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                {(user?.displayName || '??').split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-200 truncate">
                  {user?.displayName || 'Manager'}
                </p>
                {branchLabel && (
                  <p className="text-[10px] text-amber-400/80 truncate flex items-center gap-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    {branchLabel}
                  </p>
                )}
                <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <ConnectionIndicator />
          </div>
        </div>
      </aside>
    </>
  );
};

// ============================================
// MAIN MANAGER DASHBOARD
// ============================================
const ManagerDashboard = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { t, isRTL } = useLanguage();
  const { userData } = useAuth();
  const { settings } = useSettings();
  const storesMap = useStoresMap();

  const branchLabel = useMemo(() => {
    const ids = resolveUserBranchIds(userData || {});
    if (!ids.length) return '';
    const names = ids.map((id) => resolveStoreName(id, storesMap)).filter(Boolean);
    return names.length ? names.join(' · ') : ids[0];
  }, [userData, storesMap]);

  const roleMatrix = useMemo(
    () => mergeRoleFeatureMatrix(settings?.permissions),
    [settings?.permissions],
  );
  const activityPerms = useMemo(
    () => resolveActivityLogsPerms(userData, roleMatrix),
    [userData, roleMatrix],
  );
  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => {
      if (item.path === '/manager/activity') return activityPerms.view;
      return true;
    }),
    [activityPerms.view],
  );

  const getPageInfo = () => {
    const path = location.pathname;
    const item = navItems.find(i =>
      i.path === path || (i.path !== '/manager' && path.startsWith(i.path))
    );

    const routeSubtitleKeys = {
      '/manager': 'managerPages.dashboard.subtitle',
      '/manager/bills': 'managerPages.bills.subtitle',
      '/manager/cashflow': 'managerPages.cashflow.subtitle',
      '/manager/reconciliation': 'managerPages.reconciliation.subtitle',
      '/manager/credits': 'managerPages.credits.subtitle',
      '/manager/customers': 'managerPages.customers.subtitle',
      '/manager/expenses': 'managerPages.expenses.subtitle',
      '/manager/returns': 'managerPages.returns.subtitle',
      '/manager/salespersons': 'managerPages.salespersons.subtitle',
      '/manager/staff': 'managerPages.salespersons.subtitle',
      '/manager/shifts': 'managerPages.shifts.subtitle',
      '/manager/reports': 'managerPages.reports.subtitle',
      '/manager/approvals': 'managerPages.approvals.subtitle',
      '/manager/activity': 'managerPages.activity.subtitle',
    };

    const matchedRoute = Object.keys(routeSubtitleKeys)
      .filter((p) => path === p || (p !== '/manager' && path.startsWith(p)))
      .sort((a, b) => b.length - a.length)[0];

    return {
      title: item ? t(item.labelKey, item.labelKey) : t('roles.manager', 'Manager'),
      subtitle: matchedRoute
        ? routeSubtitleKeys[matchedRoute]
        : 'manager.subtitle',
    };
  };

  const pageInfo = getPageInfo();
  const managerFontSize = settings?.fonts?.managerFontSize || 16;
  const managerTableFontSize = settings?.fonts?.managerTableFontSize || 15;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0805]" style={{ fontSize: `${managerFontSize}px` }}>
      <ManagerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentPath={location.pathname}
        navItems={navItems}
        branchLabel={branchLabel}
      />

      <div className="md:ms-64 transition-all duration-300">
        <ManagerHeader
          onMenuClick={() => setSidebarOpen(true)}
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          branchLabel={branchLabel}
        />

        <main className="p-4 sm:p-6 md:p-8" style={{ fontSize: `${managerTableFontSize}px` }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/cashflow" element={<CashFlow />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/credits" element={<Credits />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/salespersons" element={<Salespersons />} />
            <Route path="/shifts" element={<Shifts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/activity" element={<ActivityLogs />} />
            {/* Legacy aliases */}
            <Route path="/staff" element={<Salespersons />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default ManagerDashboard;