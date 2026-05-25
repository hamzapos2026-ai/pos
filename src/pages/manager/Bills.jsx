// File: src/pages/manager/Bills.jsx
// Purpose: Bills monitoring with advanced filters, virtual scrolling
// Features: 10k+ rows, filters, export, drill-down

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Eye, FileText, AlertCircle, Check, X } from 'lucide-react';
import managerService from '../../services/managerService';
import { formatPKR, getBillPaymentStatus, getBillStatusInfo, getRelativeTime, truncate } from '../../utils/managerHelpers';
import { BILL_FILTERS, BILL_FILTER_LABELS } from '../../utils/constants';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import BillDetail from './BillDetail';

const Bills = () => {
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    paymentStatus: '',
    from: '',
    to: '',
    branchId: '',
  });
  const [selectedBill, setSelectedBill] = useState(null);

  const loader = useCallback(
    () => managerService.getBills({ ...filters, limit: 10000 }),
    [filters]
  );
  const { data, loading, refresh } = useManagerData(loader, [filters]);

  const bills = data?.items || [];

  // ============ TABLE COLUMNS ============
  const columns = useMemo(() => [
    {
      label: 'Bill #',
      field: 'serialNo',
      width: '120px',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-100 truncate">
            {row.serialNo || row.billSerial || row.localId?.slice(-8)}
          </p>
          <p className="text-[10px] text-gray-600">{getRelativeTime(row.savedAt || row.createdAt)}</p>
        </div>
      ),
    },
    {
      label: 'Customer',
      field: 'customerName',
      render: (row) => {
        const name = row.customer?.name || row.customerName || 'Walk-in';
        const phone = row.customer?.phone || row.customerPhone || '';
        return (
          <div className="min-w-0">
            <p className="text-sm text-gray-200 truncate">{truncate(name, 22)}</p>
            {phone && <p className="text-[10px] text-gray-600">{phone}</p>}
          </div>
        );
      },
    },
    {
      label: 'Biller',
      field: 'billerName',
      render: (row) => (
        <span className="text-xs text-gray-400 truncate block max-w-[120px]">
          {truncate(row.billerName || row.billerId || '—', 16)}
        </span>
      ),
    },
    {
      label: 'Total',
      field: 'totalAmount',
      align: 'right',
      render: (row) => (
        <span className="text-sm font-semibold text-gray-100">
          {formatPKR(row.totalAmount || row.total)}
        </span>
      ),
    },
    {
      label: 'Paid',
      field: 'paidAmount',
      align: 'right',
      render: (row) => (
        <span className="text-sm text-green-400">{formatPKR(row.paidAmount || 0)}</span>
      ),
    },
    {
      label: 'Outstanding',
      field: 'outstandingAmount',
      align: 'right',
      sortValue: (row) => Number(row.totalAmount || row.total || 0) - Number(row.paidAmount || 0),
      render: (row) => {
        const total = Number(row.totalAmount || row.total || 0);
        const paid = Number(row.paidAmount || 0);
        const out = total - paid;
        return (
          <span className={'text-sm font-medium ' + (out > 0 ? 'text-red-400' : 'text-gray-500')}>
            {out > 0 ? formatPKR(out) : '—'}
          </span>
        );
      },
    },
    {
      label: 'Payment',
      field: 'paymentStatus',
      sortable: false,
      render: (row) => {
        const ps = getBillPaymentStatus(row);
        const colorMap = {
          green: 'bg-green-500/15 text-green-400 border-green-500/30',
          orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
          red: 'bg-red-500/15 text-red-400 border-red-500/30',
          gray: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
        };
        return (
          <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ' + (colorMap[ps.color] || colorMap.gray)}>
            {ps.label}
          </span>
        );
      },
    },
    {
      label: 'Status',
      field: 'status',
      sortable: false,
      render: (row) => {
        const info = getBillStatusInfo(row.status);
        return (
          <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ' + info.bg + ' ' + info.text}>
            {info.label}
          </span>
        );
      },
    },
    {
      label: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          {row.status === 'pending' && (
            <>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm('Approve this bill?')) return;
                  try {
                    const requests = await managerService.getApprovalRequests({ status: 'pending' });
                    const req = requests.find(r => r.billId === row.billId || r.localBillId === row.localId || r.localBillId === row.id);
                    if (!req) return alert('Approval request not found');
                    const res = await managerService.processApprovalRequest(req.requestId || req.id, 'approve', 'Approved from list');
                    if (res && res.success) { alert('Approved'); refresh(); }
                    else alert(res.error || 'Approve failed');
                  } catch (err) { console.error(err); alert('Approve failed'); }
                }}
                className="p-1.5 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors"
                title="Approve"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const reason = prompt('Enter cancel reason:');
                  if (reason == null) return; // cancelled prompt
                  if (!reason || reason.trim().length === 0) return alert('Reason required');
                  try {
                    const requests = await managerService.getApprovalRequests({ status: 'pending' });
                    const req = requests.find(r => r.billId === row.billId || r.localBillId === row.localId || r.localBillId === row.id);
                    if (!req) return alert('Approval request not found');
                    const res = await managerService.processApprovalRequest(req.requestId || req.id, 'cancel', reason);
                    if (res && res.success) { alert('Cancelled'); refresh(); }
                    else alert(res.error || 'Cancel failed');
                  } catch (err) { console.error(err); alert('Cancel failed'); }
                }}
                className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedBill(row.localId || row.id); }}
            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors"
            title="View"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ], []);

  // Mobile card renderer
  const mobileCard = useCallback((row) => {
    const ps = getBillPaymentStatus(row);
    const total = Number(row.totalAmount || row.total || 0);
    const paid = Number(row.paidAmount || 0);
    const out = total - paid;
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setSelectedBill(row.localId || row.id)}
        className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208] hover:border-amber-500/30 cursor-pointer transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-sm font-bold text-gray-100">{row.serialNo || row.localId?.slice(-8)}</p>
            <p className="text-[10px] text-gray-500">{getRelativeTime(row.savedAt)}</p>
          </div>
          <span className={'text-[10px] px-2 py-0.5 rounded-full ' + ({
            green: 'bg-green-500/15 text-green-400',
            orange: 'bg-orange-500/15 text-orange-400',
            red: 'bg-red-500/15 text-red-400',
            gray: 'bg-gray-500/15 text-gray-400',
          }[ps.color] || 'bg-gray-500/15 text-gray-400')}>{ps.label}</span>
        </div>
        <p className="text-xs text-gray-300 mb-2 truncate">{row.customer?.name || row.customerName || 'Walk-in'}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Total: <span className="text-gray-200 font-medium">{formatPKR(total)}</span></span>
          {out > 0 && <span className="text-red-400 font-medium">Due {formatPKR(out)}</span>}
        </div>
      </motion.div>
    );
  }, []);

  // Export data
  const exportRows = useMemo(() =>
    bills.map(b => ({
      Serial: b.serialNo || b.billSerial || b.localId,
      Date: (b.savedAt || b.createdAt || '').slice(0, 19).replace('T', ' '),
      Customer: b.customer?.name || b.customerName || 'Walk-in',
      Phone: b.customer?.phone || b.customerPhone || '',
      Biller: b.billerName || b.billerId || '',
      Total: Number(b.totalAmount || b.total || 0),
      Paid: Number(b.paidAmount || 0),
      Outstanding: Number(b.totalAmount || b.total || 0) - Number(b.paidAmount || 0),
      Status: b.status,
      Branch: b.storeId,
    })),
    [bills]
  );

  const handleReset = () => {
    setFilters({ search: '', status: '', paymentStatus: '', from: '', to: '', branchId: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            Bills Monitoring
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {bills.length.toLocaleString()} bills • Real-time data
          </p>
        </div>
        <ExportMenu
          data={exportRows}
          filename={'bills_' + new Date().toISOString().slice(0, 10)}
          pdfOptions={{
            title: 'Bills Report',
            subtitle: bills.length + ' bills',
            headers: ['Serial', 'Date', 'Customer', 'Phone', 'Biller', 'Total', 'Paid', 'Outstanding', 'Status'],
            rows: exportRows.map(r => [r.Serial, r.Date, r.Customer, r.Phone, r.Biller, r.Total, r.Paid, r.Outstanding, r.Status]),
          }}
        />
      </div>

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder="Search by serial, customer, phone…"
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={handleReset}
        resultCount={bills.length}
        customFilters={[
          {
            key: 'paymentStatus',
            label: 'Payment',
            value: filters.paymentStatus,
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'unpaid', label: 'Unpaid' },
            ],
            onChange: (v) => setFilters(f => ({ ...f, paymentStatus: v })),
          },
          {
            key: 'status',
            label: 'Status',
            value: filters.status,
            options: Object.entries(BILL_FILTER_LABELS).map(([value, label]) => ({ value, label })),
            onChange: (v) => setFilters(f => ({ ...f, status: v })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={bills}
        loading={loading}
        emptyMessage="No bills found"
        emptySubtext="Try adjusting filters or date range"
        rowKey="localId"
        onRowClick={(row) => setSelectedBill(row.localId || row.id)}
        mobileCardRenderer={mobileCard}
        pageSize={25}
        enableVirtualization={true}
        virtualizationThreshold={100}
        maxHeight="650px"
      />

      {selectedBill && (
        <BillDetail
          localId={selectedBill}
          onClose={() => { setSelectedBill(null); refresh(); }}
        />
      )}
    </div>
  );
};

export default Bills;