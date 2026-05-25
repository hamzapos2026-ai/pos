// File: src/components/admin/AdminSidebar.jsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Store, Settings as SettingsIcon,
  Sparkles, ChevronDown, ChevronRight, CreditCard, Percent,
  Zap, ShieldCheck, Activity, HardDrive, RefreshCw, Smartphone,
  DollarSign, UserCheck, ShoppingBag, BarChart3, Building2, Wallet, X,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import ConnectionIndicator from '../shared/ConnectionIndicator';

// ═══════════════════════════════════════════════════════════════
// NAV STRUCTURE
// ═══════════════════════════════════════════════════════════════
const navGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/admin',      label: 'Dashboard', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: 'Management',
    items: [
      { path: '/admin/users',           label: 'Users',           icon: Users       },
      { path: '/admin/branches',        label: 'Branches',        icon: Store       },
      { path: '/admin/super-approvals', label: 'Super Approvals', icon: ShieldCheck },
      { path: '/admin/customers',       label: 'Customers',       icon: UserCheck   },
      { path: '/admin/bills',           label: 'Bills Control',   icon: ShoppingBag },
    ],
  },
  {
    label: 'Finance',
    items: [
      { path: '/admin/cashflow',   label: 'Cash Flow',  icon: Wallet     },
      { path: '/admin/commission', label: 'Commission', icon: DollarSign },
    ],
  },
  {
    label: 'Reports & Logs',
    items: [
      { path: '/admin/reports',      label: 'Reports',        icon: BarChart3  },
      {
        path:  '/admin/sp-reports',
        label: 'Salesperson Reports',
        icon:  TrendingUp,
        badge: 'NEW',
      },
      { path: '/admin/audit-logs',   label: 'Audit Logs',     icon: Activity   },
      { path: '/admin/sync-monitor', label: 'Sync Monitor',   icon: RefreshCw  },
      { path: '/admin/devices',      label: 'Devices',        icon: Smartphone },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { path: '/admin/shop-settings',    label: 'Shop Settings',     icon: Building2  },
      { path: '/admin/payment-methods',  label: 'Payment Methods',   icon: CreditCard },
      { path: '/admin/discounts',        label: 'Discounts',         icon: Percent    },
      { path: '/admin/features',         label: 'Feature Toggles',   icon: Zap        },
      { path: '/admin/permissions',      label: 'Roles & Permissions', icon: ShieldCheck },
    ],
  },
  {
    label: 'Data',
    items: [
      { path: '/admin/backup', label: 'Backup & Export', icon: HardDrive },
    ],
  },
  {
    label: 'Role Settings',
    collapsible: true,
    items: [
      { path: '/admin/settings/biller',  label: 'Biller Settings',  icon: SettingsIcon },
      { path: '/admin/settings/cashier', label: 'Cashier Settings', icon: SettingsIcon },
      { path: '/admin/settings/manager', label: 'Manager Settings', icon: SettingsIcon },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// BADGE PILL
// ═══════════════════════════════════════════════════════════════
const NavBadge = ({ label, active }) => (
  <span className={cn(
    'ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full tracking-wide shrink-0',
    active
      ? 'bg-white/25 text-white'
      : 'bg-amber-500 text-white',
  )}>
    {label}
  </span>
);

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════
const AdminSidebar = ({ isOpen, onClose, currentPath }) => {
  const { isDark } = useTheme();
  const navigate   = useNavigate();
  const [collapsed, setCollapsed] = useState({});

  const handleClick = (path) => {
    navigate(path);
    if (window.innerWidth < 1024) onClose();
  };

  const isActive = (item) =>
    item.exact
      ? currentPath === item.path || currentPath === `${item.path}/`
      : currentPath.startsWith(item.path);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 start-0 h-full w-72 z-50 transition-transform duration-300 flex flex-col',
          isDark
            ? 'bg-[#0f0a05] border-e border-[#2a1f0d]'
            : 'bg-white border-e border-amber-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
        {/* ── LOGO ─────────────────────────────────────────── */}
        <div className={cn(
          'flex items-center justify-between p-5 border-b shrink-0',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200',
        )}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className={cn('font-bold text-base leading-tight', isDark ? 'text-white' : 'text-gray-900')}>
                A One Jewelry
              </h1>
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em]">
                Admin Panel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              'lg:hidden p-1.5 rounded-lg transition-colors',
              isDark ? 'hover:bg-[#2a1f0d] text-gray-400' : 'hover:bg-amber-50 text-gray-600',
            )}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── NAV ──────────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5 scrollbar-thin">
          {navGroups.map((group) => {
            const isCollapsed = !!collapsed[group.label];

            return (
              <div key={group.label}>
                {/* Group label / collapse toggle */}
                <button
                  type="button"
                  onClick={() =>
                    group.collapsible &&
                    setCollapsed((p) => ({ ...p, [group.label]: !p[group.label] }))
                  }
                  disabled={!group.collapsible}
                  className={cn(
                    'w-full flex items-center justify-between px-3 mb-1.5',
                    group.collapsible && 'hover:opacity-80 transition-opacity',
                  )}
                >
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-[0.15em]',
                    isDark ? 'text-gray-500' : 'text-gray-400',
                  )}>
                    {group.label}
                  </span>
                  {group.collapsible && (
                    isCollapsed
                      ? <ChevronRight className="w-3 h-3 text-gray-500" />
                      : <ChevronDown  className="w-3 h-3 text-gray-500" />
                  )}
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon   = item.icon;
                      const active = isActive(item);

                      return (
                        <button
                          key={item.path}
                          onClick={() => handleClick(item.path)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group',
                            active
                              ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25'
                              : isDark
                              ? 'text-gray-400 hover:bg-[#1a1208] hover:text-white'
                              : 'text-gray-600 hover:bg-amber-50 hover:text-gray-900',
                          )}
                        >
                          <Icon className={cn(
                            'w-4 h-4 shrink-0 transition-transform',
                            !active && 'group-hover:scale-110',
                          )} />

                          <span className="text-sm font-medium truncate flex-1 text-left">
                            {item.label}
                          </span>

                          {/* Optional badge */}
                          {item.badge && (
                            <NavBadge label={item.badge} active={active} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── FOOTER ───────────────────────────────────────── */}
        <div className={cn(
          'p-4 border-t shrink-0',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200',
        )}>
          <ConnectionIndicator />
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;