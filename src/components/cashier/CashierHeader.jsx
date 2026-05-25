// ✨ NEW: src/components/cashier/CashierHeader.jsx
// Purpose: Sticky header for cashier dashboard
// Features: Search bar, QR button, live clock, connection status, cashier avatar

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search, QrCode, LogOut, Wifi, WifiOff,
  RefreshCw, Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function cn(...i) { return twMerge(clsx(i)); }

// ══════════════════════════════════════════════════════════════
// LIVE CLOCK
// ══════════════════════════════════════════════════════════════

const LiveClock = ({ isDark }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="text-right hidden md:block">
      <p className={cn('text-sm font-mono font-bold tabular-nums', isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]')}>
        {timeStr}
      </p>
      <p className={cn('text-xs', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
        {dateStr}
      </p>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// CONNECTION STATUS
// ══════════════════════════════════════════════════════════════

const ConnectionStatus = ({ isDark }) => {
  const { isOnline } = useNetwork();

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
      isOnline
        ? isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'
        : isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700',
    )}>
      {isOnline ? (
        <>
          {/* Animated pulse dot */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <Wifi className="w-3 h-3" />
          <span>Live</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN HEADER
// ══════════════════════════════════════════════════════════════

const CashierHeader = ({
  onOpenQR,
  onSearchChange,
  searchValue,
  searchRef,
  onRefresh,
}) => {
  const { isDark } = useTheme();
  const { user, userData, activeRole, setActiveRole, hasMultipleRoles, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast.success('Signed out');
  };

  const displayName = userData?.name || userData?.displayName || user?.displayName || 'Cashier';
  const initials = displayName.slice(0, 2).toUpperCase();

  const userRoles = Array.isArray(userData?.roles) && userData.roles.length > 0
    ? userData.roles
    : typeof userData?.role === 'string' && userData.role
      ? [userData.role]
      : ['cashier'];

  const currentRole = activeRole || userData?.primaryRole || userData?.role || 'cashier';
  const roleLabel = currentRole === 'superAdmin'
    ? 'Super Admin'
    : currentRole === 'admin'
      ? 'Admin'
      : currentRole === 'manager'
        ? 'Manager'
        : currentRole === 'biller'
          ? 'Biller'
          : currentRole === 'cashier'
            ? 'Cashier'
            : currentRole.charAt(0).toUpperCase() + currentRole.slice(1);

  const otherRole = userRoles.find((role) => role !== currentRole && ['biller', 'cashier'].includes(role))
    || userRoles.find((role) => role !== currentRole);

  const canSwitchRole = hasMultipleRoles && !!otherRole && typeof setActiveRole === 'function';

  const handleRoleSwitch = () => {
    if (!canSwitchRole || !otherRole) return;
    const switched = setActiveRole(otherRole);
    if (!switched) return;
    if (otherRole === 'biller') {
      navigate('/biller');
    } else if (otherRole === 'cashier') {
      navigate('/cashier');
    } else {
      navigate(`/${otherRole}`);
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'sticky top-0 z-30 border-b backdrop-blur-xl',
        isDark
          ? 'bg-[#1a1208]/95 border-[#2a1f0d]'
          : 'bg-white/95 border-amber-200',
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">

        {/* ── Logo ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <p className={cn('text-xs font-bold leading-none', isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]')}>
              A One Jewelry
            </p>
            <p className={cn('text-[10px]', isDark ? 'text-amber-400' : 'text-amber-600')}>
              CASHIER
            </p>
          </div>
        </div>

        {/* ── Search bar ───────────────────────────────────── */}
        <div className="flex-1 max-w-sm relative">
          <Search className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none',
            isDark ? 'text-[#a8a29e]' : 'text-[#78716c]',
          )} />
          <input
            id="cashier-search-input"
            ref={searchRef}
            type="text"
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search Bill#, customer, phone... (INSERT)"
            className={cn(
              'w-full pl-9 pr-4 py-2 rounded-xl text-sm border outline-none transition-all',
              isDark
                ? 'bg-[#120d06] border-[#2a1f0d] text-[#f5f5f4] placeholder-[#a8a29e] focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20'
                : 'bg-amber-50 border-amber-200 text-[#1c1917] placeholder-[#78716c] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20',
            )}
          />
        </div>

        {/* ── QR Button ────────────────────────────────────── */}
        <motion.button
          id="cashier-qr-btn"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenQR}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors',
            isDark
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100',
          )}
          title="QR Scanner (F2)"
        >
          <QrCode className="w-4 h-4" />
          <span className="hidden sm:inline">QR</span>
          <kbd className={cn(
            'hidden md:inline text-[10px] px-1 py-0.5 rounded font-mono',
            isDark ? 'bg-[#2a1f0d] text-[#a8a29e]' : 'bg-amber-100 text-[#78716c]',
          )}>F2</kbd>
        </motion.button>

        {/* ── Refresh ──────────────────────────────────────── */}
        <motion.button
          id="cashier-refresh-btn"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRefresh}
          className={cn(
            'p-2 rounded-xl border transition-colors',
            isDark
              ? 'border-[#2a1f0d] text-[#a8a29e] hover:bg-[#2a1f0d] hover:text-[#f5f5f4]'
              : 'border-amber-200 text-[#78716c] hover:bg-amber-50 hover:text-[#1c1917]',
          )}
          title="Refresh (F9)"
        >
          <RefreshCw className="w-4 h-4" />
        </motion.button>

        {/* ── Spacer ───────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Live Clock ───────────────────────────────────── */}
        <LiveClock isDark={isDark} />

        {/* ── Connection ───────────────────────────────────── */}
        <ConnectionStatus isDark={isDark} />

        {/* ── User + Signout ───────────────────────────────── */}
        <div className={cn(
          'flex items-center gap-2 pl-3 border-l',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200',
        )}>
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md shadow-amber-500/30">
            {initials}
          </div>
          <div className="hidden md:block text-right">
            <p className={cn('text-xs font-semibold', isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]')}>
              {displayName}
            </p>
            <p className={cn('text-[10px]', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
              {roleLabel}
            </p>
            {canSwitchRole && (
              <button
                type="button"
                onClick={handleRoleSwitch}
                className={cn(
                  'mt-1 rounded-full px-2 py-1 text-[10px] font-semibold transition',
                  isDark
                    ? 'bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                )}
              >
                Switch to {otherRole === 'biller' ? 'Biller' : otherRole === 'cashier' ? 'Cashier' : otherRole}
              </button>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSignOut}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isDark
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-red-600 hover:bg-red-50',
            )}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
};

export default CashierHeader;
