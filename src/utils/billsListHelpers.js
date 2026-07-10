/** Shared bill list display helpers — Admin + Manager bills pages */

import { isCashierCollected, isManagerSettled } from './cashierOrderUtils';
import { isDualModePaidAtBiller, getDualModePaidByBillerName } from './billChannelUtils';

export const parseBillTimestamp = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    try { return v.toDate(); } catch { /* fallthrough */ }
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') {
    return new Date(v.seconds * 1000);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const getBillDisplayTimestamp = (row) =>
  row?.cashierPaidAt || row?.paidAt || row?.savedAt || row?.createdAt
  || row?.billerSubmittedAt || row?.billEndTime;

export const formatBillDateTime = (v) => {
  const d = parseBillTimestamp(v);
  if (!d || d.getFullYear() < 2000) {
    return { date: '—', time: '—' };
  }
  return {
    date: d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-PK', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }),
  };
};

/** Who collected / settled payment for display */
export const getBillPaidByDisplay = (row) => {
  if (!row) return '—';
  if (isDualModePaidAtBiller(row)) {
    return getDualModePaidByBillerName(row) || row.billerName || 'Biller';
  }
  if (isManagerSettled(row)) {
    const role = row.settledByRole || row.paidByRole || row.confirmedByRole || '';
    const name = row.settledByName || row.managerConfirmedByName || row.paidByName || row.confirmedByName || '';
    if (isSuperAdminRole(role)) return name || 'Super Admin';
    if (role === 'manager') return name || 'Manager';
    if (row.confirmedByName) return row.confirmedByName;
    return name || '—';
  }
  if (isCashierCollected(row)) {
    return row.paidByName || row.cashierName || '—';
  }
  return '—';
};

const isSuperAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin' || r === 'admin';
};

export const getBillPaidAtTimestamp = (row) => {
  if (!row) return null;
  if (isManagerSettled(row)) {
    return row.managerConfirmedAt || row.paidAt || row.settledAt;
  }
  if (isCashierCollected(row)) {
    return row.cashierPaidAt || row.paidAt;
  }
  return null;
};

export const getBillCashierName = (row) => getBillPaidByDisplay(row);

export const getBillSerialDisplay = (row) => {
  if (!row) return '—';
  const primary = row.serialNo || row.billSerial || row.serial || row.billId;
  if (primary) return String(primary).trim();
  const fallback = row.localId || row.id || row.firebaseId;
  return fallback ? String(fallback).trim() : '—';
};
