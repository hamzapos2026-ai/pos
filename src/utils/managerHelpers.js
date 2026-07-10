// File: src/utils/managerHelpers.js
// Purpose: Helper functions specific to Manager module

import { PAYMENT_STATUS, BILL_STATUS } from './constants';
import {
  isCashierCollected,
  isCashierPaidPendingManager,
  isManagerSettled,
  getEffectivePaidAmount,
} from './cashierOrderUtils';
import {
  isInvoiceDualModeBill,
  isDualModePaidAtBiller,
  isDualModePendingManager,
} from './billChannelUtils';

const isSuperAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin' || r === 'admin';
};

export const getBillSettledByLabel = (bill) => {
  if (!bill) return '';
  const role = bill.settledByRole || bill.paidByRole || bill.confirmedByRole || '';
  const name = bill.settledByName || bill.managerConfirmedByName || bill.paidByName || bill.confirmedByName || '';
  if (isSuperAdminRole(role)) return name ? `Super Admin · ${name}` : 'Super Admin';
  if (role === 'manager') return name ? `Manager · ${name}` : 'Manager';
  if (role === 'cashier' || bill.paidBy) return name ? `Cashier · ${name}` : 'Cashier';
  return name || '';
};

// Format currency
export const formatPKR = (amount) => {
    const num = Number(amount || 0);
    return `Rs ${num.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
};

// Format number short (1k, 1.5M)
export const formatShort = (num) => {
    const n = Number(num || 0);
    if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
};

// Relative time
export const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never';
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
        try { date = timestamp.toDate(); } catch { date = new Date(timestamp); }
    } else if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }
    if (!date || isNaN(date.getTime())) return 'Invalid';
    // Treat epoch or very-old dates as unknown to avoid showing 1970 for missing timestamps
    if (date.getFullYear() < 2000) return 'Unknown';
    const diff = Date.now() - date.getTime();
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;
    return date.toLocaleDateString();
};

// Get payment status of bill
export const getBillPaymentStatus = (bill) => {
    if (!bill) return { status: 'empty', label: 'Empty', color: 'gray' };
    const status = String(bill.status || '').toLowerCase();
    const paymentStatus = String(bill.paymentStatus || '').toLowerCase();
    const isCancelled = status === 'cancelled' || bill.deleted || bill.isDeleted;
    if (isCancelled) return { status: 'cancelled', label: 'Cancelled', color: 'red' };

    const total = Number(bill.totalAmount || bill.total || bill.grandTotal || 0);
    if (total === 0) return { status: 'empty', label: 'Empty', color: 'gray' };

    // Cashier collected — manager not confirmed yet
    if (isCashierPaidPendingManager(bill)) {
        return {
            status: 'cashier_paid',
            label: 'Cashier Paid · Mgr Pending',
            color: 'blue',
        };
    }

    if (isManagerSettled(bill)) {
        const role = bill.settledByRole || bill.paidByRole || bill.confirmedByRole || '';
        const label = isSuperAdminRole(role)
            ? 'Super Admin Paid'
            : (role === 'cashier' && bill.managerConfirmed ? 'Manager Confirmed' : 'Manager Confirmed');
        return {
            status: PAYMENT_STATUS.paid,
            label,
            color: 'green',
        };
    }

    if (isInvoiceDualModeBill(bill)) {
        if (isDualModePaidAtBiller(bill)) {
            if (!isManagerSettled(bill)) {
                return {
                    status: 'dual_paid_biller',
                    label: 'Dual · Paid · Mgr Pending',
                    color: 'purple',
                };
            }
            return {
                status: 'dual_paid_biller',
                label: 'Dual · Paid at Biller',
                color: 'purple',
            };
        }
        if (isDualModePendingManager(bill)) {
            return {
                status: 'dual_mgr',
                label: 'Dual · Mgr Approval',
                color: 'purple',
            };
        }
    }

    if (paymentStatus === 'pending_approval') {
        return { status: PAYMENT_STATUS.unpaid, label: 'Pending Manager', color: 'orange' };
    }
    if (paymentStatus === 'pending_payment') {
        return { status: PAYMENT_STATUS.unpaid, label: 'Pending Cashier', color: 'orange' };
    }

    const paid = getEffectivePaidAmount(bill);
    if (paid > 0 && paid < total) {
        return { status: PAYMENT_STATUS.partial, label: 'Partial', color: 'orange' };
    }
    return { status: PAYMENT_STATUS.unpaid, label: 'Unpaid', color: 'red' };
};

// Get bill status badge info
export const getBillStatusInfo = (status) => {
    const map = {
        [BILL_STATUS.draft]: { label: 'Draft', color: 'gray', bg: 'bg-gray-500/15', text: 'text-gray-400' },
        [BILL_STATUS.completed]: { label: 'Completed', color: 'green', bg: 'bg-green-500/15', text: 'text-green-400' },
        'approved': { label: 'Pending Cashier', color: 'blue', bg: 'bg-blue-500/15', text: 'text-blue-400' },
        cashier_paid: { label: 'Cashier Paid', color: 'sky', bg: 'bg-sky-500/15', text: 'text-sky-400' },
        'paid': { label: 'Paid', color: 'green', bg: 'bg-green-500/15', text: 'text-green-400' },
        'manager_approved': { label: 'Manager Approved', color: 'green', bg: 'bg-green-500/15', text: 'text-green-400' },
        [BILL_STATUS.synced]: { label: 'Synced', color: 'blue', bg: 'bg-blue-500/15', text: 'text-blue-400' },
        [BILL_STATUS.pending]: { label: 'Pending Manager', color: 'orange', bg: 'bg-orange-500/15', text: 'text-orange-400' },
        [BILL_STATUS.pending_superadmin]: { label: 'Pending Super Admin', color: 'yellow', bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
        [BILL_STATUS.cancelled]: { label: 'Cancelled', color: 'red', bg: 'bg-red-500/15', text: 'text-red-400' },
        [BILL_STATUS.returned]: { label: 'Returned', color: 'blue', bg: 'bg-blue-500/15', text: 'text-blue-400' },
        [BILL_STATUS.deleted]: { label: 'Deleted', color: 'red', bg: 'bg-red-500/15', text: 'text-red-400' },
        'manager_cancelled': { label: 'Mgr Cancelled', color: 'red', bg: 'bg-red-500/15', text: 'text-red-400' },
    };
    return map[status] || { label: status || 'Unknown', color: 'gray', bg: 'bg-gray-500/15', text: 'text-gray-400' };
};

/** Secondary workflow badge — skip when payment column already covers dual mode. */
export const getBillWorkflowStatusBadge = (bill) => {
    if (!bill) return null;
    if (isInvoiceDualModeBill(bill)) return null;
    const status = String(bill.status || '').toLowerCase();
    const paymentStatus = String(bill.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'pending_approval') return getBillStatusInfo('pending');
    if (paymentStatus === 'pending_payment' && status === 'approved') {
        return getBillStatusInfo('approved');
    }
    if (isCashierPaidPendingManager(bill)) {
        return { label: 'Awaiting Mgr Confirm', color: 'blue', bg: 'bg-blue-500/15', text: 'text-blue-400' };
    }
    if (['paid', 'manager_approved', 'cashier_paid', 'cancelled', 'manager_cancelled'].includes(status)) {
        return getBillStatusInfo(status);
    }
    return null;
};

// Calculate commission for a bill
export const calculateCommission = (bill, percentage) => {
    const total = Number(bill.totalAmount || bill.total || 0);
    return (total * Number(percentage || 0)) / 100;
};

// Group data by date
export const groupByDate = (items, dateKey = 'createdAt') => {
    const grouped = {};
    items.forEach(item => {
        const d = (item[dateKey] || '').slice(0, 10);
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(item);
    });
    return grouped;
};

// Get date range presets
export const getDatePresets = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const fmt = (d) => d.toISOString().slice(0, 10);

    return {
        today: { from: fmt(today), to: fmt(today), label: 'Today' },
        yesterday: { from: fmt(yesterday), to: fmt(yesterday), label: 'Yesterday' },
        last7days: { from: fmt(weekAgo), to: fmt(today), label: 'Last 7 Days' },
        last30days: { from: fmt(monthAgo), to: fmt(today), label: 'Last 30 Days' },
        thisMonth: { from: fmt(monthStart), to: fmt(today), label: 'This Month' },
    };
};

// Truncate text
export const truncate = (str, len = 30) => {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
};

// Get user initials
export const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2);
};

export default {
    formatPKR,
    formatShort,
    getRelativeTime,
    getBillPaymentStatus,
    getBillStatusInfo,
    getBillWorkflowStatusBadge,
    calculateCommission,
    groupByDate,
    getDatePresets,
    truncate,
    getInitials,
};