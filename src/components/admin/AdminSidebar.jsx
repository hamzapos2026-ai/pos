// File: src/components/admin/AdminSidebar.jsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Store, Settings as SettingsIcon, Settings2,
  Sparkles, ChevronDown, ChevronRight, CreditCard, Percent,
  ShieldCheck, Activity, Hash, RefreshCw, Smartphone,
  DollarSign, UserCheck, ShoppingBag, BarChart3, Building2, Wallet, HardDrive, X,
  TrendingUp, Scale, Receipt, Cloud, Package,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuth } from '../../context/AuthContext';
import ConnectionIndicator from '../shared/ConnectionIndicator';
import useShopBrand from '../../hooks/useShopBrand';

const NAV_GROUPS = [
  {
    labelKey: 'admin.groups.overview',
    items: [
      { path: '/admin', labelKey: 'admin.nav.dashboard', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    labelKey: 'admin.groups.management',
    items: [
      { path: '/admin/users', labelKey: 'admin.nav.users', icon: Users },
      { path: '/admin/branches', labelKey: 'admin.nav.branches', icon: Store },
      { path: '/admin/customers', labelKey: 'admin.nav.customers', icon: UserCheck },
      { path: '/admin/bills', labelKey: 'admin.nav.bills', icon: ShoppingBag },
    ],
  },
  {
    labelKey: 'admin.groups.finance',
    items: [
      { path: '/admin/cashflow', labelKey: 'admin.nav.cashflow', icon: Wallet },
      { path: '/admin/reconciliation', labelKey: 'admin.nav.reconciliation', icon: Scale },
    ],
  },
  {
    labelKey: 'admin.groups.reportsLogs',
    items: [
      { path: '/admin/reports', labelKey: 'admin.nav.reports', icon: BarChart3 },
      { path: '/admin/sp-reports', labelKey: 'admin.nav.spReports', icon: TrendingUp, badgeKey: 'admin.badges.new' },
      { path: '/admin/audit-logs', labelKey: 'admin.nav.auditLogs', icon: Activity },
      { path: '/admin/sync-monitor', labelKey: 'admin.nav.syncMonitor', icon: RefreshCw },
      { path: '/admin/devices', labelKey: 'admin.nav.devices', icon: Smartphone },
    ],
  },
  {
    labelKey: 'admin.groups.configuration',
    items: [
      { path: '/admin/shop-settings', labelKey: 'admin.nav.shopSettings', icon: Building2 },
      { path: '/admin/permissions', labelKey: 'admin.nav.permissions', icon: ShieldCheck, badgeKey: 'admin.badges.modules' },
    ],
  },
  {
    labelKey: 'admin.groups.data',
    items: [
      { path: '/admin/firebase-assistant', labelKey: 'admin.nav.firebaseAssistant', icon: Cloud, superAdminOnly: true, badgeKey: 'admin.badges.new' },
      { path: '/admin/backup', labelKey: 'admin.nav.backup', icon: HardDrive },
    ],
  },
  {
    labelKey: 'admin.groups.roleSettings',
    collapsible: true,
    subgroups: [
      {
        labelKey: 'admin.groups.superAdmin',
        items: [
          { path: '/admin/settings/superAdmin', labelKey: 'admin.nav.superAdminSettings', icon: SettingsIcon },
        ],
      },
      {
        labelKey: 'admin.groups.biller',
        collapsible: true,
        items: [
          { path: '/admin/settings/biller', labelKey: 'admin.nav.billerSettings', icon: SettingsIcon },
          { path: '/admin/settings/product-catalog', labelKey: 'products', icon: Package },
          { path: '/admin/discounts', labelKey: 'admin.nav.discounts', icon: Percent },
          { path: '/admin/biller-summary-discount', labelKey: 'admin.nav.summaryDiscount', icon: Receipt },
          { path: '/admin/commission', labelKey: 'admin.nav.commission', icon: DollarSign },
        ],
      },
      {
        labelKey: 'admin.groups.cashier',
        collapsible: true,
        items: [
          { path: '/admin/settings/cashier', labelKey: 'admin.nav.cashierSettings', icon: SettingsIcon },
          { path: '/admin/cashier-discounts', labelKey: 'admin.nav.cashierDiscounts', icon: Wallet },
          { path: '/admin/payment-methods', labelKey: 'admin.nav.paymentMethods', icon: CreditCard },
        ],
      },
      {
        labelKey: 'admin.groups.manager',
        collapsible: true,
        items: [
          { path: '/admin/settings/manager', labelKey: 'admin.nav.managerSettings', icon: SettingsIcon },
        ],
      },
    ],
  },
];

const NavBadge = ({ label, active }) => (
  <span className={cn(
    'ms-auto text-[8px] font-bold px-1.5 py-0.5 rounded-full tracking-wide shrink-0',
    active ? 'bg-white/25 text-white' : 'bg-amber-500 text-white',
  )}>
    {label}
  </span>
);

const NavItemButton = ({ item, active, isDark, isRTL, t, badgeLabel, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      key={item.path}
      onClick={() => onClick(item.path)}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group',
        active
          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25'
          : isDark
            ? 'text-gray-400 hover:bg-[#1a1208] hover:text-white'
            : 'text-gray-600 hover:bg-amber-50 hover:text-gray-900',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0 transition-transform', !active && 'group-hover:scale-110')} />
      <span className={cn('text-sm font-medium truncate flex-1', isRTL ? 'text-right' : 'text-left')}>
        {t(item.labelKey, item.labelKey)}
      </span>
      {badgeLabel && <NavBadge label={badgeLabel} active={active} />}
    </button>
  );
};

const AdminSidebar = ({ isOpen, onClose, currentPath }) => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const { name: shopName, tagline: shopTagline, logo: shopLogo } = useShopBrand();
  const { isSuperAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState({});

  const handleClick = (path) => {
    navigate(path);
    if (window.innerWidth < 1024) onClose();
  };

  const isActive = (item) =>
    item.exact
      ? currentPath === item.path || currentPath === `${item.path}/`
      : currentPath.startsWith(item.path);

  const toggleCollapsed = (key) => {
    setCollapsed((p) => ({ ...p, [key]: !p[key] }));
  };

  const renderItems = (items, indent = false) => (
    <div className={cn('space-y-0.5', indent && 'ms-2 border-s border-amber-500/15 ps-1')}>
      {items.filter((item) => !item.superAdminOnly || isSuperAdmin).map((item) => {
        const badgeLabel = item.badgeKey ? t(item.badgeKey, item.badgeKey) : item.badge || null;

        return (
          <NavItemButton
            key={item.path}
            item={item}
            active={isActive(item)}
            isDark={isDark}
            isRTL={isRTL}
            t={t}
            badgeLabel={badgeLabel}
            onClick={handleClick}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'fixed top-0 start-0 h-full w-72 z-50 transition-transform duration-300 flex flex-col',
          isDark ? 'bg-[#0f0a05] border-e border-[#2a1f0d]' : 'bg-white border-e border-amber-200',
          isOpen ? 'translate-x-0' : '-translate-x-full max-lg:rtl:translate-x-full',
          'lg:translate-x-0',
        )}
      >
        <div className={cn('flex items-center justify-between p-5 border-b shrink-0', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>
          <div className="flex items-center gap-3 min-w-0">
            {shopLogo ? (
              <div className={cn(
                'w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 overflow-hidden p-1',
                isDark ? 'bg-black/30 border-[#2a1f0d]' : 'bg-white border-amber-100 shadow-sm',
              )}>
                <img src={shopLogo} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className={cn('font-bold text-base leading-tight truncate', isDark ? 'text-white' : 'text-gray-900')}>
                {shopName}
              </h1>
              <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.15em] truncate">
                {shopTagline || t('admin.panel', 'Admin Panel')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn('lg:hidden p-1.5 rounded-lg transition-colors', isDark ? 'hover:bg-[#2a1f0d] text-gray-400' : 'hover:bg-amber-50 text-gray-600')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
            const groupLabel = t(group.labelKey, group.labelKey);
            const isGroupCollapsed = !!collapsed[group.labelKey];

            return (
              <div key={group.labelKey}>
                <button
                  type="button"
                  onClick={() => group.collapsible && toggleCollapsed(group.labelKey)}
                  disabled={!group.collapsible}
                  className={cn('w-full flex items-center justify-between px-3 mb-1.5', group.collapsible && 'hover:opacity-80 transition-opacity')}
                >
                  <span className={cn('text-[10px] font-bold uppercase tracking-[0.15em]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {groupLabel}
                  </span>
                  {group.collapsible && (
                    isGroupCollapsed
                      ? <ChevronRight className="w-3 h-3 text-gray-500" />
                      : <ChevronDown className="w-3 h-3 text-gray-500" />
                  )}
                </button>

                {!isGroupCollapsed && (
                  group.subgroups ? (
                    <div className="space-y-3">
                      {group.subgroups.map((sub) => {
                        const subKey = `${group.labelKey}.${sub.labelKey}`;
                        const isSubCollapsed = sub.collapsible ? !!collapsed[subKey] : false;
                        return (
                          <div key={subKey}>
                            {sub.collapsible ? (
                              <button
                                type="button"
                                onClick={() => toggleCollapsed(subKey)}
                                className="w-full flex items-center justify-between px-3 py-1 mb-1 hover:opacity-80"
                              >
                                <span className={cn('text-[11px] font-bold', isDark ? 'text-amber-500/80' : 'text-amber-700')}>
                                  {t(sub.labelKey, sub.labelKey)}
                                </span>
                                {isSubCollapsed
                                  ? <ChevronRight className="w-3 h-3 text-amber-500/60" />
                                  : <ChevronDown className="w-3 h-3 text-amber-500/60" />}
                              </button>
                            ) : (
                              <p className={cn('px-3 py-1 mb-1 text-[11px] font-bold', isDark ? 'text-amber-500/80' : 'text-amber-700')}>
                                {t(sub.labelKey, sub.labelKey)}
                              </p>
                            )}
                            {!isSubCollapsed && renderItems(sub.items, true)}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    renderItems(group.items)
                  )
                )}
              </div>
            );
          })}
        </nav>

        <div className={cn('p-4 border-t shrink-0', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>
          <ConnectionIndicator />
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition',
              'lg:hidden',
              isDark
                ? 'bg-white/5 text-white hover:bg-white/10'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            )}
          >
            {t('admin.sidebar.hideSidebar', 'Hide sidebar')}
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
