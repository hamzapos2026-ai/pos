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
        { 
          label: 'Serial / Date', 
          field: 'serialNo', 
          render: r => (
            <div>
              <span className="text-xs font-semibold font-mono text-gray-200 block truncate max-w-[120px]">
                {r.serialNo || r.billSerial || (r.localId || '').slice(-8)}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {getRelativeTime(r.savedAt || r.createdAt)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Customer / Biller', 
          field: 'customerName', 
          render: r => (
            <div>
              <span className="text-xs text-slate-300 font-medium block truncate max-w-[120px]">
                {r.customer?.name || r.customerName || 'Walk-in'}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5 truncate max-w-[100px]">
                Biller: {r.billerName || r.billerId || '—'}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Financials (Total / Paid)', 
          field: 'totalAmount', 
          align: 'right', 
          render: r => (
            <div className="text-right">
              <span className="text-xs font-bold text-gray-200 block font-mono">
                {formatPKR(r.totalAmount || r.total)}
              </span>
              <span className="text-[11px] text-emerald-400 block font-mono mt-0.5">
                Paid: {formatPKR(r.paidAmount || 0)}
              </span>
            </div>
          ) 
        },
      ];
      case 'expense': return [
        { 
          label: 'Category', 
          field: 'category', 
          width: '90px',
          render: r => <span className="text-xs font-bold capitalize text-amber-500">{r.category}</span> 
        },
        { 
          label: 'Description / Date', 
          field: 'description', 
          render: r => (
            <div>
              <p className="text-xs text-slate-300 line-clamp-2">{r.description || '—'}</p>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {getRelativeTime(r.date || r.createdAt)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Amount / Status', 
          field: 'amount', 
          align: 'right', 
          width: '120px',
          render: r => (
            <div className="text-right">
              <span className="text-xs font-bold text-orange-400 font-mono block">
                {formatPKR(r.amount)}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/10 font-bold inline-block mt-0.5">
                {r.status}
              </span>
            </div>
          ) 
        },
      ];
      case 'credit': return [
        { 
          label: 'Bill / Date', 
          field: 'serialNo', 
          render: r => (
            <div>
              <span className="text-xs font-semibold font-mono text-gray-200 block">
                {r.serialNo || (r.localId || '').slice(-8)}
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {getRelativeTime(r.savedAt || r.createdAt)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Customer', 
          field: 'customerName', 
          render: r => (
            <div>
              <p className="text-xs text-slate-300 font-medium truncate max-w-[120px]">
                {r.customer?.name || r.customerName || 'Walk-in'}
              </p>
              <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                {r.customer?.phone || '—'}
              </p>
            </div>
          ) 
        },
        { 
          label: 'Financials (Total / Due)', 
          align: 'right', 
          render: r => {
            const out = Number(r.totalAmount || 0) - Number(r.paidAmount || 0);
            return (
              <div className="text-right">
                <span className="text-xs font-bold text-gray-200 font-mono block">
                  {formatPKR(r.totalAmount)}
                </span>
                <span className="text-[10px] text-rose-400 font-bold font-mono block mt-0.5">
                  Due: {formatPKR(out)}
                </span>
              </div>
            );
          }
        },
      ];
      case 'cash': return [
        { 
          label: 'Type / Branch', 
          field: 'type', 
          width: '100px',
          render: r => (
            <div>
              <span className="text-xs font-bold capitalize text-amber-500 block">{r.type}</span>
              <span className="text-[9px] text-slate-500 font-mono block mt-0.5 truncate max-w-[80px]">
                {r.storeId || '—'}
              </span>
            </div>
          )
        },
        { 
          label: 'Reason / Date', 
          field: 'reason', 
          render: r => (
            <div>
              <p className="text-xs text-slate-300 line-clamp-2">{r.reason || '—'}</p>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {getRelativeTime(r.createdAt)}
              </span>
            </div>
          )
        },
        { 
          label: 'Amount', 
          field: 'amount', 
          align: 'right', 
          width: '90px',
          render: r => <span className="text-xs font-bold text-gray-100 font-mono">{formatPKR(r.amount)}</span> 
        },
      ];
      case 'commission': return [
        { 
          label: 'Salesperson', 
          field: 'name', 
          render: r => <span className="text-xs font-bold text-gray-200">{r.name || r.displayName || r.email}</span> 
        },
        { 
          label: 'Commission (Earned / Pending / Paid)', 
          field: 'commissionEarned', 
          align: 'right', 
          render: r => (
            <div className="text-right">
              <span className="text-xs font-bold text-green-400 font-mono block">
                Earned: {formatPKR(r.commissionEarned || 0)}
              </span>
              <div className="flex gap-2 justify-end text-[10px] mt-0.5 font-mono">
                <span className="text-orange-400">Pend: {formatPKR(r.commissionPending || 0)}</span>
                <span className="text-blue-400">Paid: {formatPKR(r.commissionPaid || 0)}</span>
              </div>
            </div>
          ) 
        },
      ];
      case 'discount': return [
        { 
          label: 'Bill / Date', 
          field: 'serialNo', 
          render: r => (
            <div>
              <span className="text-xs font-semibold font-mono text-gray-200 block">
                {r.serialNo || (r.localId || '').slice(-8)}
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {getRelativeTime(r.savedAt)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Customer', 
          field: 'customerName', 
          render: r => <span className="text-xs text-slate-300">{r.customer?.name || r.customerName || 'Walk-in'}</span> 
        },
        { 
          label: 'Total / Discount', 
          field: 'discountAmount', 
          align: 'right', 
          render: r => (
            <div className="text-right">
              <span className="text-xs font-medium text-slate-400 font-mono block">
                {formatPKR(r.totalAmount)}
              </span>
              <span className="text-xs font-bold text-pink-400 font-mono block mt-0.5">
                Disc: {formatPKR(r.discountAmount || 0)}
              </span>
            </div>
          ) 
        },
      ];
      case 'return': return [
        { 
          label: 'IDs (Return / Bill)', 
          field: 'returnId', 
          render: r => (
            <div>
              <span className="text-xs font-mono font-bold text-gray-200 block">
                Ret: {(r.returnId || '').slice(-8)}
              </span>
              <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                Bill: {(r.originalBillId || '').slice(-8)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Reason / Status', 
          field: 'reason', 
          render: r => (
            <div>
              <p className="text-xs text-slate-300 line-clamp-1">{r.reason || '—'}</p>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/10 font-bold inline-block mt-0.5">
                {r.status}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Refund', 
          field: 'refundAmount', 
          align: 'right', 
          render: r => <span className="text-xs font-bold text-rose-400 font-mono">{formatPKR(r.refundAmount)}</span> 
        },
      ];
      case 'managerApproved': return [
        { 
          label: 'Bill / Store', 
          field: 'billId', 
          render: r => (
            <div>
              <span className="text-xs font-semibold font-mono text-gray-200 block">
                {r.billId || r.billSnapshot?.serialNo || '—'}
              </span>
              <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                Store: {r.storeId || '—'}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Approved By / Time', 
          field: 'approvedByName', 
          render: r => (
            <div>
              <span className="text-xs text-slate-300 font-medium block">
                {r.approvedByName || r.approvedBy}
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                {getRelativeTime(r.approvedAt)}
              </span>
            </div>
          ) 
        },
        { 
          label: 'Total', 
          field: 'billSnapshot.totalAmount', 
          align: 'right', 
          render: r => <span className="text-xs font-bold text-gray-100 font-mono">{formatPKR(r.billSnapshot?.totalAmount || r.total || 0)}</span> 
        },
      ];
      default: return [];
    }
  }, [reportType]);

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1600px] mx-auto space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-500" /> 
          Reports Analytics
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
      <div className="rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208]/90 to-[#0f0a05]/95 backdrop-blur-md p-2.5">
        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Select Report Type</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-1.5">
          {Object.entries(REPORT_TYPE_LABELS).filter(([k]) => REPORT_ICONS[k]).map(([key, label]) => {
            const meta = REPORT_ICONS[key];
            const Icon = meta.icon;
            const active = reportType === key;
            return (
              <button key={key} onClick={() => setReportType(key)}
                className={
                  'flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border transition-all duration-200 ' +
                  (active
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-md shadow-amber-500/5'
                    : 'bg-[#0a0805] border-[#2a1f0d] text-slate-500 hover:text-slate-200 hover:border-amber-500/20')
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[9px] font-bold tracking-tight text-center truncate w-full">{label.replace(' Report', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
        className="rounded-xl border border-[#2a1f0d] overflow-hidden"
      />
    </div>
  );
};

export default Reports;