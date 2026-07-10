// File: src/pages/admin/AdminDashboard.jsx

import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import AdminSidebar from '../../components/admin/AdminSidebar';
import AdminHeader  from '../../components/admin/AdminHeader';
import AdminPageGuide from '../../components/admin/AdminPageGuide';

const DashboardHome      = lazy(() => import('./DashboardHome'));
const UserManagement     = lazy(() => import('./UserManagement'));
const BranchManagement   = lazy(() => import('./BranchManagement'));
const ShopSettings       = lazy(() => import('./ShopSettings'));
const PaymentMethods     = lazy(() => import('./PaymentMethods'));
const DiscountSettings   = lazy(() => import('./DiscountSettings'));
const RolePermissions    = lazy(() => import('./RolePermissions'));
const BillsControl       = lazy(() => import('./BillsControl'));
const CustomersControl   = lazy(() => import('./CustomersControl'));
const CashFlowMonitor    = lazy(() => import('./CashFlowMonitor'));
const CommissionSettings = lazy(() => import('./CommissionSettings'));
const ReportsAnalytics   = lazy(() => import('./ReportsAnalytics'));
const SalespersonReports = lazy(() => import('./SalespersonReports'));
const AuditLogs          = lazy(() => import('./AuditLogs'));
const FirebaseAssistant   = lazy(() => import('./FirebaseAssistant'));
const BackupExport       = lazy(() => import('./BackupExport'));
const SyncMonitor        = lazy(() => import('./SyncMonitor'));
const Reconciliation     = lazy(() => import('./Reconciliation'));
const DeviceManagement   = lazy(() => import('./DeviceManagement'));
const RoleSettings       = lazy(() => import('./RoleSettings'));
const BillerSummaryDiscountSettings = lazy(() => import('./BillerSummaryDiscountSettings'));
const CashierDiscountSettings = lazy(() => import('./CashierDiscountSettings'));
const ProductCatalogSettings = lazy(() => import('./ProductCatalogSettings'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-96">
    <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

const PAGE_KEYS = {
  '/admin':                  'dashboard',
  '/admin/users':            'users',
  '/admin/branches':         'branches',
  '/admin/customers':        'customers',
  '/admin/bills':            'bills',
  '/admin/cashflow':         'cashflow',
  '/admin/commission':       'commission',
  '/admin/reports':          'reports',
  '/admin/sp-reports':       'spReports',
  '/admin/audit-logs':       'auditLogs',
  '/admin/sync-monitor':     'syncMonitor',
  '/admin/devices':          'devices',
  '/admin/shop-settings':    'shopSettings',
  '/admin/payment-methods':  'paymentMethods',
  '/admin/discounts':        'discounts',
  '/admin/biller-summary-discount': 'summaryDiscount',
  '/admin/settings/product-catalog': 'productCatalog',
  '/admin/permissions':      'permissions',
  '/admin/cashier-discounts': 'cashierDiscounts',
  '/admin/reconciliation': 'reconciliation',
  '/admin/backup':           'backup',
  '/admin/firebase-assistant': 'firebaseAssistant',
};

const AdminDashboard = () => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const getMeta = () => {
    const path = location.pathname.replace(/\/$/, '') || '/admin';
    if (path.startsWith('/admin/settings/')) {
      const role = path.split('/').pop() || '';
      const roleKey = role === 'superAdmin' ? 'superAdmin' : role;
      const roleLabel = role
        ? t(`admin.roleNames.${roleKey}`, t(`roles.${roleKey}`, role))
        : t('admin.roleSettingsPage.role', 'Role');
      return {
        title: t('admin.pages.roleSettings.title', `${roleLabel} Settings`, { role: roleLabel }),
        subtitle: t('admin.pages.roleSettings.subtitle', 'Role configuration'),
      };
    }
    const key = PAGE_KEYS[path];
    if (key) {
      return {
        title: t(`admin.pages.${key}.title`, key),
        subtitle: t(`admin.pages.${key}.subtitle`, ''),
      };
    }
    return {
      title: t('admin.pages.default.title', 'Admin'),
      subtitle: t('admin.pages.default.subtitle', ''),
    };
  };

  const meta = getMeta();

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={cn('min-h-screen', isDark ? 'bg-[#0a0805]' : 'bg-amber-50/30')}>
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentPath={location.pathname}
      />

      <div className="lg:ms-72">
        <AdminHeader
          onMenuClick={() => setSidebarOpen(true)}
          title={meta.title}
          subtitle={meta.subtitle}
        />
        <AdminPageGuide pathname={location.pathname} />

        <main>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index                       element={<DashboardHome />} />
              <Route path="users"                element={<UserManagement />} />
              <Route path="branches"             element={<BranchManagement />} />
              <Route path="customers"            element={<CustomersControl />} />
              <Route path="bills"                element={<BillsControl />} />
              <Route path="cashflow"             element={<CashFlowMonitor />} />
              <Route path="commission"           element={<CommissionSettings />} />
              <Route path="reports"              element={<ReportsAnalytics />} />
              <Route path="sp-reports"           element={<SalespersonReports />} />
              <Route path="audit-logs"           element={<AuditLogs />} />
              <Route path="sync-monitor"         element={<SyncMonitor />} />
              <Route path="reconciliation"      element={<Reconciliation />} />
              <Route path="devices"              element={<DeviceManagement />} />
              <Route path="shop-settings"        element={<ShopSettings />} />
              <Route path="payment-methods"      element={<PaymentMethods />} />
              <Route path="discounts"            element={<DiscountSettings />} />
              <Route path="cashier-discounts"   element={<CashierDiscountSettings />} />
              <Route path="biller-summary-discount" element={<BillerSummaryDiscountSettings />} />
              <Route path="settings/product-catalog" element={<ProductCatalogSettings />} />
              <Route path="features"             element={<Navigate to="/admin/permissions" replace />} />
              <Route path="permissions"          element={<RolePermissions />} />
              <Route path="backup"               element={<BackupExport />} />
              <Route path="firebase-assistant" element={<FirebaseAssistant />} />
              <Route path="super-approvals" element={<Navigate to="/admin" replace />} />
              <Route path="settings/:role"       element={<RoleSettings />} />
              <Route path="*"                    element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
