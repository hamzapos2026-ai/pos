// File: src/pages/manager/ManagerDashboard.jsx
// Purpose: Manager module main layout with sidebar + routing
// Features: All manager routes, modern sidebar, mobile responsive
// Last Updated: Manager Module v1.0

import React, { useState } from 'react';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, DollarSign, CreditCard, Users,
  Receipt, RotateCcw, BarChart3, Briefcase, Clock, Activity,
  CheckSquare, UserCheck, LogOut, Menu, X, Sparkles, ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
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

const cn = (...inputs) => twMerge(clsx(inputs));

// ============================================
// NAVIGATION ITEMS
// ============================================
const NAV_ITEMS = [
  { path: '/manager', label: 'Dashboard', icon: LayoutDashboard, badge: null },
  { path: '/manager/bills', label: 'Bills', icon: FileText, badge: null },
  { path: '/manager/cashflow', label: 'Cash Flow', icon: DollarSign, badge: null },
  { path: '/manager/credits', label: 'Credits', icon: CreditCard, badge: null },
  { path: '/manager/customers', label: 'Customers', icon: Users, badge: null },
  { path: '/manager/expenses', label: 'Expenses', icon: Receipt, badge: null },
  { path: '/manager/returns', label: 'Returns', icon: RotateCcw, badge: null },
  { path: '/manager/salespersons', label: 'Salespersons', icon: Briefcase, badge: null },
  { path: '/manager/shifts', label: 'Shifts', icon: Clock, badge: null },
  { path: '/manager/reports', label: 'Reports', icon: BarChart3, badge: null },
  { path: '/manager/approvals', label: 'Approvals', icon: CheckSquare, badge: null },
  { path: '/manager/activity', label: 'Activity Logs', icon: Activity, badge: null },
];

// ============================================
// HEADER COMPONENT
// ============================================
const ManagerHeader = ({ onMenuClick, title, subtitle }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast.success('Signed out successfully');
  };

  const initials = (user?.displayName || user?.email || '??')
    .split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="sticky top-0 z-30 bg-[#1a1208] border-b border-[#2a1f0d] backdrop-blur-md">
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
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <ThemeToggle />
          <ConnectionIndicator />

          <div className="hidden md:flex items-center gap-3 ps-3 border-s border-[#2a1f0d]">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-100 leading-tight">
                {user?.displayName || 'Manager'}
              </p>
              <p className="text-[10px] text-gray-500 truncate max-w-[160px]">
                {user?.email}
              </p>
            </div>
            <div className="h-9 w-9 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs ring-2 ring-amber-500/30">
              {initials}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign Out"
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
const ManagerSidebar = ({ isOpen, onClose, currentPath }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

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
        className={cn(
          'fixed top-0 left-0 h-full w-64 z-50',
          'bg-[#1a1208] border-r border-[#2a1f0d]',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
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
                <h2 className="font-bold text-gray-100 text-sm">A One Jewelry</h2>
                <p className="text-[10px] text-amber-500/70 font-medium">Manager Panel</p>
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
            {NAV_ITEMS.map(item => {
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
                  <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
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

  const getPageInfo = () => {
    const path = location.pathname;
    const item = NAV_ITEMS.find(i =>
      i.path === path || (i.path !== '/manager' && path.startsWith(i.path))
    );
    return {
      title: item?.label || 'Manager',
      subtitle: 'Manage your branch operations efficiently',
    };
  };

  const pageInfo = getPageInfo();

  return (
    <div className="min-h-screen bg-[#0a0805]">
      <ManagerSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentPath={location.pathname}
      />

      <div className="md:ml-64 transition-all duration-300">
        <ManagerHeader
          onMenuClick={() => setSidebarOpen(true)}
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
        />

        <main className="p-3 sm:p-4 md:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/cashflow" element={<CashFlow />} />
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