// ✨ NEW: src/components/cashier/RecentBillsPanel.jsx
// Purpose: Always-visible sidebar showing latest 20 bills
// Click actions: pending→PaymentModal, paid→ViewBillModal, cancelled→toast
// Data: onSnapshot from Firebase (real-time)

import { memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

function cn(...i) { return twMerge(clsx(i)); }

const timeAgo = (ts) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
};

const STATUS_CONFIG = {
  pending:   { bg: 'bg-amber-500/10',  text: 'text-amber-400',  Icon: Clock        },
  paid:      { bg: 'bg-green-500/10',  text: 'text-green-400',  Icon: CheckCircle  },
  cancelled: { bg: 'bg-red-500/10',    text: 'text-red-400',    Icon: XCircle      },
};

// ══════════════════════════════════════════════════════════════
// BILL ROW
// ══════════════════════════════════════════════════════════════

const BillRow = ({ bill, onPayment, onView, index }) => {
  const { isDark } = useTheme();
  const effectiveStatus = (b) => {
    try {
      if (!b) return 'pending';
      if (b.status === 'cancelled') return 'cancelled';
      if (b.status === 'approved') return 'approved';
      if (b.status === 'paid') return 'paid';
      if (b.paymentStatus === 'paid') return 'paid';
      if (b.offlineSyncPending === true) return 'paid';
      if (b.synced === true && (b.paymentStatus === 'paid' || b.syncStatus === 'synced')) return 'paid';
      return b.status || 'pending';
    } catch { return b.status || 'pending'; }
  };

  const status = effectiveStatus(bill) || 'pending';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const { Icon } = cfg;

  const serial = bill.serialNo || bill.billSerial || bill.billId || `#${(bill.id || '').slice(-4)}`;
  const customer = bill.customerName || bill.customer?.name || 'Walk-in';
  const amount = bill.total ?? bill.grandTotal ?? bill.totalAmount ?? 0;

  const handleClick = () => {
    if (status === 'pending') onPayment?.(bill);
    else if (status === 'paid') onView?.(bill);
    else toast.error('Bill is cancelled — cannot process payment', { duration: 2000 });
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      onClick={handleClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg border transition-all group',
        isDark
          ? 'border-[#2a1f0d] hover:bg-[#2a1f0d] hover:border-amber-500/20'
          : 'border-amber-100 hover:bg-amber-50 hover:border-amber-200',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'text-xs font-mono font-bold truncate',
              isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]',
            )}>
              {serial}
            </span>
            <span className={cn(
              'inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-bold',
              cfg.bg, cfg.text,
            )}>
              <Icon className="w-2.5 h-2.5" />
              {status}
            </span>
          </div>
          <p className={cn('text-xs truncate', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
            {customer}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-bold text-amber-500">
            Rs.{Number(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </p>
          <p className={cn('text-[10px]', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
            {timeAgo(bill.createdAt || bill.savedAt)}
          </p>
        </div>
      </div>
    </motion.button>
  );
};

// ══════════════════════════════════════════════════════════════
// PANEL
// ══════════════════════════════════════════════════════════════

const RecentBillsPanel = ({
  bills = [],
  onPayment,
  onView,
}) => {
  const { isDark } = useTheme();

  // Show latest 20
  const recent = useMemo(() => bills.slice(0, 20), [bills]);

  // Quick stats
  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return bills
      .filter(b => {
        const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.savedAt);
        return b.status === 'paid' && d.toDateString() === today;
      })
      .reduce((sum, b) => sum + (b.total ?? b.grandTotal ?? b.totalAmount ?? 0), 0);
  }, [bills]);

  return (
    <div className={cn(
      'flex flex-col h-full border-r',
      isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-200',
    )}>
      {/* Header */}
      <div className={cn(
        'px-4 py-3 border-b',
        isDark ? 'border-[#2a1f0d]' : 'border-amber-200',
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <h3 className={cn('text-sm font-semibold', isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]')}>
              Recent Bills
            </h3>
          </div>
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full',
            isDark ? 'bg-[#2a1f0d] text-[#a8a29e]' : 'bg-amber-100 text-amber-700',
          )}>
            {recent.length}
          </span>
        </div>

        {/* Today's total */}
        {todayTotal > 0 && (
          <div className="mt-2 p-2 rounded-lg bg-amber-500/10">
            <p className={cn('text-[10px] uppercase font-bold tracking-wider mb-0.5', 'text-amber-400')}>
              Today's Paid
            </p>
            <p className="text-sm font-bold text-amber-400">
              Rs. {todayTotal.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}
      </div>

      {/* Bills list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <AnimatePresence mode="popLayout">
          {recent.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Clock className={cn('w-8 h-8 mx-auto mb-2 opacity-30', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')} />
              <p className={cn('text-xs', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
                No bills yet
              </p>
            </motion.div>
          ) : (
            recent.map((bill, idx) => (
              <BillRow
                key={bill.id || bill.localId || idx}
                bill={bill}
                onPayment={onPayment}
                onView={onView}
                index={idx}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default memo(RecentBillsPanel);
