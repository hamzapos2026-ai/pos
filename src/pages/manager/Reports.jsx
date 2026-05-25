// File: src/pages/manager/Reports.jsx
// Purpose: Multi-type reports with filters and exports

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, FileText, DollarSign, Receipt, CreditCard,
  Briefcase, RotateCcw, TrendingDown,
  Check,
} from 'lucide-react';
import managerService from '../../services/managerService';
import { REPORT_TYPES, REPORT_TYPE_LABELS } from '../../utils/constants';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';

const REPORT_ICONS = {
  sales: { icon: DollarSign, color: 'amber' },
  cash: { icon: DollarSign, color: 'green' },
  expense: { icon: Receipt, color: 'orange' },
  credit: { icon: CreditCard, color: 'red' },
  commission: { icon: Briefcase, color: 'purple' },
  discount: { icon: TrendingDown, color: 'pink' },
  return: { icon: RotateCcw, color: 'blue' },
  managerApproved: { icon: Check, color: 'green' },
};

const Reports = () => {
  const [reportType, setReportType] = useState(REPORT_TYPES.sales);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', branchId: '' });

  const loader = useCallback(
    () => managerService.generateReport(reportType, filters),
    [reportType, filters]
  );
  const { data, loading } = useManagerData(loader, [reportType, filters]);

  const results = useMemo(() => {
    let list = data || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item =>
        Object.values(item).some(v =>
          String(v || '').toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [data, filters.search]);

  // Stats based on report type
  const stats = useMemo(() => {
    if (!results.length) return null;
    const sum = (key) => results.reduce((s, r) => s + Number(r[key] || 0), 0);
    switch (reportType) {
      case 'sales': return {
        total: sum('totalAmount') || sum('total'),
        count: results.length,
        avg: (sum('totalAmount') || sum('total')) / results.length,
      };
      case 'expense': return { total: sum('amount'), count: results.length };
      case 'credit': return {
        total: results.reduce((s, r) => s + (Number(r.totalAmount || 0) - Number(r.paidAmount || 0)), 0),
        count: results.length,
      };
      case 'cash': return { total: sum('amount'), count: results.length };
      case 'discount': return { total: sum('discountAmount'), count: results.length };
      case 'commission': return {
        earned: sum('commissionEarned'),
        pending: sum('commissionPending'),
        count: results.length,
      };
      case 'return': return { total: sum('refundAmount'), count: results.length };
      default: return { count: results.length };
    }
  }, [results, reportType]);

  // Columns per report type
  const columns = useMemo(() => {
    switch (reportType) {
      case 'sales': return [
        { label: 'Serial', field: 'serialNo', render: r => <span className="text-xs font-medium">{r.serialNo || r.billSerial || (r.localId || '').slice(-8)}</span> },
        { label: 'Customer', field: 'customerName', render: r => <span className="text-xs">{r.customer?.name || r.customerName || 'Walk-in'}</span> },
        { label: 'Biller', field: 'billerName', render: r => <span className="text-xs text-gray-400">{r.billerName || r.billerId || '—'}</span> },
        { label: 'Total', field: 'totalAmount', align: 'right', render: r => <span className="text-sm font-semibold">{formatPKR(r.totalAmount || r.total)}</span> },
        { label: 'Paid', field: 'paidAmount', align: 'right', render: r => <span className="text-sm text-green-400">{formatPKR(r.paidAmount || 0)}</span> },
        { label: 'Date', field: 'savedAt', render: r => <span className="text-[10px] text-gray-500">{getRelativeTime(r.savedAt)}</span> },
      ];
      case 'expense': return [
        { label: 'Category', field: 'category', render: r => <span className="text-xs capitalize">{r.category}</span> },
        { label: 'Description', field: 'description', render: r => <span className="text-xs text-gray-400">{r.description}</span> },
        { label: 'Amount', field: 'amount', align: 'right', render: r => <span className="text-sm font-semibold text-orange-400">{formatPKR(r.amount)}</span> },
        { label: 'Status', field: 'status', render: r => <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{r.status}</span> },
        { label: 'Date', field: 'date', render: r => <span className="text-[10px] text-gray-500">{getRelativeTime(r.date || r.createdAt)}</span> },
      ];
      case 'credit': return [
        { label: 'Bill', field: 'serialNo', render: r => <span className="text-xs">{r.serialNo || (r.localId || '').slice(-8)}</span> },
        { label: 'Customer', field: 'customerName', render: r => <span className="text-xs">{r.customer?.name || r.customerName || 'Walk-in'}</span> },
        { label: 'Total', field: 'totalAmount', align: 'right', render: r => <span className="text-sm">{formatPKR(r.totalAmount)}</span> },
        { label: 'Paid', field: 'paidAmount', align: 'right', render: r => <span className="text-sm text-green-400">{formatPKR(r.paidAmount || 0)}</span> },
        {
          label: 'Outstanding', align: 'right',
          render: r => <span className="text-sm font-bold text-red-400">{formatPKR(Number(r.totalAmount || 0) - Number(r.paidAmount || 0))}</span>,
        },
      ];
      case 'cash': return [
        { label: 'Type', field: 'type', render: r => <span className="text-xs capitalize">{r.type}</span> },
        { label: 'Amount', field: 'amount', align: 'right', render: r => <span className="text-sm font-semibold">{formatPKR(r.amount)}</span> },
        { label: 'Reason', field: 'reason', render: r => <span className="text-xs text-gray-400">{r.reason}</span> },
        { label: 'Branch', field: 'storeId', render: r => <span className="text-[10px] text-gray-500">{r.storeId}</span> },
        { label: 'Date', field: 'createdAt', render: r => <span className="text-[10px] text-gray-500">{getRelativeTime(r.createdAt)}</span> },
      ];
      case 'commission': return [
        { label: 'Salesperson', field: 'name', render: r => <span className="text-xs font-medium">{r.name || r.displayName || r.email}</span> },
        { label: 'Earned', field: 'commissionEarned', align: 'right', render: r => <span className="text-sm text-green-400">{formatPKR(r.commissionEarned || 0)}</span> },
        { label: 'Pending', field: 'commissionPending', align: 'right', render: r => <span className="text-sm text-orange-400">{formatPKR(r.commissionPending || 0)}</span> },
        { label: 'Paid', field: 'commissionPaid', align: 'right', render: r => <span className="text-sm text-blue-400">{formatPKR(r.commissionPaid || 0)}</span> },
      ];
      case 'discount': return [
        { label: 'Bill', field: 'serialNo', render: r => <span className="text-xs">{r.serialNo || (r.localId || '').slice(-8)}</span> },
        { label: 'Customer', field: 'customerName', render: r => <span className="text-xs">{r.customer?.name || r.customerName || 'Walk-in'}</span> },
        { label: 'Total', field: 'totalAmount', align: 'right', render: r => <span className="text-sm">{formatPKR(r.totalAmount)}</span> },
        { label: 'Discount', field: 'discountAmount', align: 'right', render: r => <span className="text-sm font-bold text-pink-400">{formatPKR(r.discountAmount || 0)}</span> },
        { label: 'Date', field: 'savedAt', render: r => <span className="text-[10px] text-gray-500">{getRelativeTime(r.savedAt)}</span> },
      ];
      case 'return': return [
        { label: 'Return ID', field: 'returnId', render: r => <span className="text-xs font-mono">{(r.returnId || '').slice(-10)}</span> },
        { label: 'Bill', field: 'originalBillId', render: r => <span className="text-xs">{(r.originalBillId || '').slice(-10)}</span> },
        { label: 'Reason', field: 'reason', render: r => <span className="text-xs text-gray-400">{r.reason}</span> },
        { label: 'Refund', field: 'refundAmount', align: 'right', render: r => <span className="text-sm font-bold text-red-400">{formatPKR(r.refundAmount)}</span> },
        { label: 'Status', field: 'status', render: r => <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{r.status}</span> },
      ];
      case 'managerApproved': return [
        { label: 'Bill', field: 'billId', render: r => <span className="text-xs">{r.billId || r.billSnapshot?.serialNo || '—'}</span> },
        { label: 'Total', field: 'billSnapshot.totalAmount', align: 'right', render: r => <span className="text-sm font-semibold">{formatPKR(r.billSnapshot?.totalAmount || r.total || 0)}</span> },
        { label: 'Approved By', field: 'approvedByName', render: r => <span className="text-xs text-gray-400">{r.approvedByName || r.approvedBy}</span> },
        { label: 'Approved At', field: 'approvedAt', render: r => <span className="text-[10px] text-gray-500">{getRelativeTime(r.approvedAt)}</span> },
        { label: 'Store', field: 'storeId', render: r => <span className="text-[10px] text-gray-500">{r.storeId}</span> },
      ];
      default: return [];
    }
  }, [reportType]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-500" /> Reports
        </h2>
        <ExportMenu
          data={results}
          filename={reportType + '_report_' + new Date().toISOString().slice(0, 10)}
          pdfOptions={{
            title: REPORT_TYPE_LABELS[reportType],
            dateRange: filters.from && filters.to ? filters.from + ' → ' + filters.to : 'All time',
            headers: columns.map(c => c.label),
            rows: results.map(r => columns.map(c => {
              if (c.field) return r[c.field] || '';
              return '';
            })),
          }}
        />
      </div>

      {/* Report Type Selector */}
      <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Select Report</p>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
          {Object.entries(REPORT_TYPE_LABELS).filter(([k]) => REPORT_ICONS[k]).map(([key, label]) => {
            const meta = REPORT_ICONS[key];
            const Icon = meta.icon;
            const active = reportType === key;
            return (
              <button key={key} onClick={() => setReportType(key)}
                className={
                  'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ' +
                  (active
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-[#0a0805] border-[#2a1f0d] text-gray-500 hover:text-gray-300 hover:border-amber-500/20')
                }
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium text-center">{label.replace(' Report', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.total !== undefined && <StatCard label="Total Amount" value={stats.total} prefix="Rs " icon={DollarSign} color="amber" loading={loading} />}
          {stats.count !== undefined && <StatCard label="Records" value={stats.count} icon={FileText} color="blue" loading={loading} />}
          {stats.avg !== undefined && <StatCard label="Average" value={Math.round(stats.avg)} prefix="Rs " icon={BarChart3} color="green" loading={loading} />}
          {stats.earned !== undefined && <StatCard label="Earned" value={stats.earned} prefix="Rs " icon={Briefcase} color="green" loading={loading} />}
          {stats.pending !== undefined && <StatCard label="Pending" value={stats.pending} prefix="Rs " icon={Briefcase} color="orange" loading={loading} />}
        </div>
      )}

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder="Search in results…"
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={() => setFilters({ search: '', from: '', to: '', branchId: '' })}
        resultCount={results.length}
      />

      <DataTable
        columns={columns}
        data={results}
        loading={loading}
        emptyMessage="No data for this report"
        emptySubtext="Try different filters or date range"
        rowKey={results[0]?.localId ? 'localId' : results[0]?.expenseId ? 'expenseId' : results[0]?.returnId ? 'returnId' : results[0]?.txId ? 'txId' : results[0]?.uid ? 'uid' : 'id'}
        pageSize={50}
        enableVirtualization
      />
    </div>
  );
};

export default Reports;