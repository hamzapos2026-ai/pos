// File: src/pages/admin/AdminDashboard.jsx

import { useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import AdminSidebar from '../../components/admin/AdminSidebar';
import AdminHeader  from '../../components/admin/AdminHeader';

// ═══════════════════════════════════════════════════════════════
// LAZY IMPORTS
// ═══════════════════════════════════════════════════════════════
const DashboardHome      = lazy(() => import('./DashboardHome'));
const UserManagement     = lazy(() => import('./UserManagement'));
const BranchManagement   = lazy(() => import('./BranchManagement'));
const ShopSettings       = lazy(() => import('./ShopSettings'));
const PaymentMethods     = lazy(() => import('./PaymentMethods'));
const DiscountSettings   = lazy(() => import('./DiscountSettings'));
const FeatureToggles     = lazy(() => import('./FeatureToggles'));
const RolePermissions    = lazy(() => import('./RolePermissions'));
const BillsControl       = lazy(() => import('./BillsControl'));
const CustomersControl   = lazy(() => import('./CustomersControl'));
const CashFlowMonitor    = lazy(() => import('./CashFlowMonitor'));
const CommissionSettings = lazy(() => import('./CommissionSettings'));
const ReportsAnalytics   = lazy(() => import('./ReportsAnalytics'));
const SalespersonReports = lazy(() => import('./SalespersonReports'));   // ⬅ NEW
const AuditLogs          = lazy(() => import('./AuditLogs'));
const SuperApprovals     = lazy(() => import('./SuperApprovals'));
const BackupExport       = lazy(() => import('./BackupExport'));
const SyncMonitor        = lazy(() => import('./SyncMonitor'));
const DeviceManagement   = lazy(() => import('./DeviceManagement'));
const RoleSettings       = lazy(() => import('./RoleSettings'));

// ═══════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════
const PageLoader = () => (
  <div className="flex items-center justify-center h-96">
    <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
  </div>
);

// ═══════════════════════════════════════════════════════════════
// PAGE TITLE MAP
// ═══════════════════════════════════════════════════════════════
const titleMap = {
  '/admin':                  { title: 'Dashboard',           subtitle: 'Overview & key metrics' },
  '/admin/users':            { title: 'User Management',     subtitle: 'Create and manage system users' },
  '/admin/branches':         { title: 'Branch Management',   subtitle: 'Manage store branches' },
  '/admin/customers':        { title: 'Customer Database',   subtitle: 'Manage customer records' },
  '/admin/bills':            { title: 'Bills Control',       subtitle: 'View, edit and restore bills' },
  '/admin/cashflow':         { title: 'Cash Flow Monitor',   subtitle: 'Cashier registers & transfers' },
  '/admin/commission':       { title: 'Commission Settings', subtitle: 'Salesperson agents & payout rules' },
  '/admin/reports':          { title: 'Reports & Analytics', subtitle: 'System-wide reports' },
  '/admin/sp-reports':       { title: 'Salesperson Reports', subtitle: 'Item-level commission tracking & payouts' }, // ⬅ NEW
  '/admin/audit-logs':       { title: 'Audit Logs',          subtitle: 'Immutable activity history' },
  '/admin/sync-monitor':     { title: 'Sync Monitor',        subtitle: 'Sync queue & failures' },
  '/admin/devices':          { title: 'Device Management',   subtitle: 'Connected PWA devices' },
  '/admin/shop-settings':    { title: 'Shop Settings',       subtitle: 'Brand, currency & receipts' },
  '/admin/payment-methods':  { title: 'Payment Methods',     subtitle: 'Manage payment options' },
  '/admin/discounts':        { title: 'Discount Settings',   subtitle: 'Limits & approvals' },
  '/admin/features':         { title: 'Feature Toggles',     subtitle: 'Enable/disable modules' },
  '/admin/permissions':      { title: 'Roles & Permissions', subtitle: 'Custom permission groups' },
  '/admin/super-approvals':  { title: 'Super Approvals',     subtitle: 'Pending approval requests' },
  '/admin/backup':           { title: 'Backup & Export',     subtitle: 'Data export & maintenance' },
};

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
const AdminDashboard = () => {
  const { isDark }                  = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location                    = useLocation();

  const getMeta = () => {
    const path = location.pathname.replace(/\/$/, '') || '/admin';
    if (path.startsWith('/admin/settings/')) {
      const r = path.split('/').pop();
      return {
        title:    `${r[0].toUpperCase()}${r.slice(1)} Settings`,
        subtitle: 'Role configuration',
      };
    }
    return titleMap[path] || { title: 'Admin', subtitle: '' };
  };

  const meta = getMeta();

  return (
    <div className={cn('min-h-screen', isDark ? 'bg-[#0a0805]' : 'bg-amber-50/30')}>
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

        <main>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Overview */}
              <Route index                       element={<DashboardHome />} />

              {/* Management */}
              <Route path="users"                element={<UserManagement />} />
              <Route path="branches"             element={<BranchManagement />} />
              <Route path="super-approvals"      element={<SuperApprovals />} />
              <Route path="customers"            element={<CustomersControl />} />
              <Route path="bills"                element={<BillsControl />} />

              {/* Finance */}
              <Route path="cashflow"             element={<CashFlowMonitor />} />
              <Route path="commission"           element={<CommissionSettings />} />

              {/* Reports & Logs */}
              <Route path="reports"              element={<ReportsAnalytics />} />
              <Route path="sp-reports"           element={<SalespersonReports />} />   {/* ⬅ NEW */}
              <Route path="audit-logs"           element={<AuditLogs />} />
              <Route path="sync-monitor"         element={<SyncMonitor />} />
              <Route path="devices"              element={<DeviceManagement />} />

              {/* Configuration */}
              <Route path="shop-settings"        element={<ShopSettings />} />
              <Route path="payment-methods"      element={<PaymentMethods />} />
              <Route path="discounts"            element={<DiscountSettings />} />
              <Route path="features"             element={<FeatureToggles />} />
              <Route path="permissions"          element={<RolePermissions />} />

              {/* Data */}
              <Route path="backup"               element={<BackupExport />} />

              {/* Role Settings (dynamic) */}
              <Route path="settings/:role"       element={<RoleSettings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;