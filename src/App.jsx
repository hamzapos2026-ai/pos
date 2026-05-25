// src/App.jsx
// ✅ NO AuthProvider here (it's in main.jsx)
// ✅ NO BrowserRouter here (it's in main.jsx)
// ✅ NO SettingsProvider here (it's in main.jsx)
// ✅ Clean routes only

import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate }    from 'react-router-dom';
import { Toaster }                    from 'react-hot-toast';

// ── Context providers (that are NOT in main.jsx) ─────────────
import { ThemeProvider }    from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { NetworkProvider }  from './context/NetworkContext';

// ── Auth hook ─────────────────────────────────────────────────
import { useAuth }          from './context/AuthContext';

// ── Services ─────────────────────────────────────────────────
import { setupAutoSync }      from './services/localSyncService';
import { setupDeleteListener } from './utils/deleteCascade';

// ── Route guards ─────────────────────────────────────────────
import SetupRoute        from './routes/SetupRoute';
import ProtectedRoute    from './routes/ProtectedRoute';
import RoleBasedRoute    from './routes/RoleBasedRoute';
import RoleBasedRedirect from './routes/RoleBasedRedirect';

// ── Pages ─────────────────────────────────────────────────────
import SetupPage        from './pages/setup/SetupPage';
import LoginPage        from './pages/auth/LoginPage';
import AdminDashboard   from './pages/admin/AdminDashboard';
import BillerDashboard  from './pages/biller/BillerDashboard';
import CashierDashboard from './pages/cashier/CashierDashboard';
import ManagerDashboard from './pages/manager/ManagerDashboard';

// ── Inline full-screen spinner ────────────────────────────────
const FullScreenSpinner = () => (
  <div style={{
    minHeight:      '100vh',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     '#0a0805',
  }}>
    <div style={{
      width:        '36px',
      height:       '36px',
      border:       '3px solid #2a1f0d',
      borderTop:    '3px solid #f59e0b',
      borderRadius: '50%',
      animation:    'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// ── Error pages ───────────────────────────────────────────────
const UnauthorizedPage = () => (
  <div style={{
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '16px',
    background:     '#0a0805',
    padding:        '24px',
    textAlign:      'center',
  }}>
    <span style={{ fontSize: '64px' }}>🔒</span>
    <h1 style={{ fontSize: '40px', fontWeight: 700, color: '#ef4444', margin: 0 }}>
      403
    </h1>
    <p style={{ color: '#a8a29e', margin: 0 }}>
      You do not have permission to access this page.
    </p>
    <a
      href="/"
      style={{
        marginTop:    '8px',
        background:   '#f59e0b',
        color:        '#0a0805',
        padding:      '10px 24px',
        borderRadius: '12px',
        fontWeight:   600,
        fontSize:     '14px',
        textDecoration: 'none',
      }}
    >
      Go Home
    </a>
  </div>
);

const NotFoundPage = () => (
  <div style={{
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '16px',
    background:     '#0a0805',
    padding:        '24px',
    textAlign:      'center',
  }}>
    <span style={{ fontSize: '64px' }}>🔍</span>
    <h1 style={{ fontSize: '40px', fontWeight: 700, color: '#f59e0b', margin: 0 }}>
      404
    </h1>
    <p style={{ color: '#a8a29e', margin: 0 }}>Page not found.</p>
    <a
      href="/"
      style={{
        marginTop:    '8px',
        background:   '#f59e0b',
        color:        '#0a0805',
        padding:      '10px 24px',
        borderRadius: '12px',
        fontWeight:   600,
        fontSize:     '14px',
        textDecoration: 'none',
      }}
    >
      Go Home
    </a>
  </div>
);

// ── Root "/" — checks setup then redirects ────────────────────
const SetupRedirect = () => {
  const { isSetupComplete } = useAuth();

  const [checked,  setChecked]  = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;

    isSetupComplete()
      .then(result => {
        if (!active) return;
        setComplete(result);
        setChecked(true);
      })
      .catch(() => {
        if (active) setChecked(true);
      });

    return () => { active = false; };
  }, []);

  if (!checked) return <FullScreenSpinner />;
  return <Navigate to={complete ? '/login' : '/setup'} replace />;
};

// ── All routes ────────────────────────────────────────────────
const AppRoutes = () => (
  <Routes>

    {/* Setup — shows ONLY once, never again */}
    <Route
      path="/setup"
      element={
        <SetupRoute>
          <SetupPage />
        </SetupRoute>
      }
    />

    {/* Auth */}
    <Route path="/login" element={<LoginPage />} />

    {/* Root redirect */}
    <Route path="/" element={<SetupRedirect />} />

    {/* Post-login → role-based dashboard */}
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <RoleBasedRedirect />
        </ProtectedRoute>
      }
    />

    {/* Admin */}
    <Route
      path="/admin/*"
      element={
        <ProtectedRoute>
          <RoleBasedRoute
            allowedRoles={['superAdmin', 'admin']}
            allowedPermissions={['manageUsers', 'changeSettings', 'manageStores']}
          >
            <AdminDashboard />
          </RoleBasedRoute>
        </ProtectedRoute>
      }
    />

    {/* Biller */}
    <Route
      path="/biller/*"
      element={
        <ProtectedRoute>
          <RoleBasedRoute
            allowedRoles={['superAdmin', 'admin', 'manager', 'biller']}
            allowedPermissions={['createBills']}
          >
            <BillerDashboard />
          </RoleBasedRoute>
        </ProtectedRoute>
      }
    />

    {/* Cashier */}
    <Route
      path="/cashier/*"
      element={
        <ProtectedRoute>
          <RoleBasedRoute
            allowedRoles={['superAdmin', 'admin', 'manager', 'cashier']}
            allowedPermissions={['receivePayments']}
          >
            <CashierDashboard />
          </RoleBasedRoute>
        </ProtectedRoute>
      }
    />

    {/* Manager */}
    <Route
      path="/manager/*"
      element={
        <ProtectedRoute>
          <RoleBasedRoute
            allowedRoles={['superAdmin', 'admin', 'manager']}
            allowedPermissions={['viewAllReports']}
          >
            <ManagerDashboard />
          </RoleBasedRoute>
        </ProtectedRoute>
      }
    />

    {/* Reports */}
    <Route
      path="/reports/*"
      element={
        <ProtectedRoute>
          <RoleBasedRoute
            allowedRoles={['superAdmin', 'admin', 'manager']}
            allowedPermissions={['viewAllReports']}
          >
            <div style={{
              minHeight:      '100vh',
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            '12px',
              background:     '#0a0805',
            }}>
              <h1 style={{ color: '#f5f5f4', fontSize: '24px', fontWeight: 700 }}>
                Reports
              </h1>
              <p style={{ color: '#a8a29e' }}>Sales, cash flow, and audit reports</p>
            </div>
          </RoleBasedRoute>
        </ProtectedRoute>
      }
    />

    {/* Errors */}
    <Route path="/unauthorized" element={<UnauthorizedPage />} />
    <Route path="/not-found"    element={<NotFoundPage />} />
    <Route path="*"             element={<Navigate to="/not-found" replace />} />

  </Routes>
);

// ── App root ──────────────────────────────────────────────────
function App() {

  // Local sync service
  useEffect(() => {
    try {
      const cleanup = setupAutoSync();
      return cleanup;
    } catch {}
  }, []);

  // Delete cascade listener (all tabs stay in sync)
  useEffect(() => {
    try {
      const cleanup = setupDeleteListener((deletedOrderId) => {
        console.log('[App] Bill deleted cascade:', deletedOrderId);
      });
      return cleanup;
    } catch {}
  }, []);

  // F8 broadcast channel
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel;
    try {
      channel = new BroadcastChannel('aone_pos_billing');
      channel.addEventListener('message', (e) => {
        if (e.data?.type === 'F8_PRESSED') {
          console.log('[App] F8 pressed broadcast received');
        }
      });
    } catch {}
    return () => {
      try { channel?.close(); } catch {}
    };
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <NetworkProvider>

          <AppRoutes />

          {/* ✅ Single global Toaster */}
          <Toaster
            position="top-right"
            reverseOrder={false}
            gutter={8}
            containerStyle={{ zIndex: 99999 }}
            toastOptions={{
              duration: 3000,
              style: {
                background:   '#1a1208',
                color:        '#f5f5f4',
                border:       '1px solid #2a1f0d',
                borderRadius: '12px',
                fontSize:     '13px',
                fontWeight:   '500',
                boxShadow:    '0 10px 40px rgba(0,0,0,0.5)',
                maxWidth:     '380px',
              },
              success: {
                duration:  2500,
                iconTheme: { primary: '#22c55e', secondary: '#0a0805' },
                style:     { border: '1px solid #22c55e30' },
              },
              error: {
                duration:  4000,
                iconTheme: { primary: '#ef4444', secondary: '#0a0805' },
                style:     { border: '1px solid #ef444430' },
              },
              loading: {
                iconTheme: { primary: '#f59e0b', secondary: '#0a0805' },
                style:     { border: '1px solid #f59e0b30' },
              },
            }}
          />

        </NetworkProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;