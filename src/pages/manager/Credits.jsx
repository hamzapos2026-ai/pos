// File: src/pages/manager/Credits.jsx
// Purpose: View & collect outstanding payments

import React, { useState, useCallback, useMemo } from 'react';
import { CreditCard, DollarSign, AlertCircle } from 'lucide-react';
import { DEFAULT_FETCH_ORDERS_LIMIT } from '../../utils/ordersQueryUtils';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime, truncate } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import { useLanguage } from '../../hooks/useLanguage';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';
import PaymentModal from './PaymentModal';

const Credits = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });
  const [selectedBill, setSelectedBill] = useState(null);

  const loader = useCallback(
    () => managerService.getBills({ paymentStatus: 'unpaid', limit: DEFAULT_FETCH_ORDERS_LIMIT })
      .then(r1 => managerService.getBills({ paymentStatus: 'partial', limit: DEFAULT_FETCH_ORDERS_LIMIT })
        .then(r2 => ({ items: [...(r1.items || []), ...(r2.items || [])] }))),
    []
  );

  const { data, loading, refresh } = useManagerData(loader, [], {
    refreshInterval: 120000,
  });

  const allCredits = data?.items || [];

  const filtered = useMemo(() => {
    let list = allCredits;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(o =>
        (o.serialNo || '').toString().toLowerCase().includes(q) ||
        (o.customer?.name || o.customerName || '').toLowerCase().includes(q) ||
        (o.customer?.phone || o.customerPhone || '').includes(q)
      );
    }
    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      list = list.filter(o => new Date(o.savedAt || 0).getTime() >= ts);
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      list = list.filter(o => new Date(o.savedAt || 0).getTime() <= ts);
    }
    return list;
  }, [allCredits, filters]);

  const stats = useMemo(() => {
    const totalOutstanding = filtered.reduce((s, o) =>
      s + (Number(o.totalAmount || 0) - Number(o.paidAmount || 0)), 0);
    const totalBills = filtered.length;
    const overdueBills = filtered.filter(o => {
      const age = Date.now() - new Date(o.savedAt || 0).getTime();
      return age > 30 * 86400000;
    }).length;
    return { totalOutstanding, totalBills, overdueBills };
  }, [filtered]);

  const columns = useMemo(() => [
    {
      label: t('manager.common.billNo', 'Bill #'),
      field: 'serialNo',
      render: (row) => (
        <div>
          <p className="font-medium text-gray-100">{row.serialNo || row.localId?.slice(-8)}</p>
          <p className="text-[10px] text-gray-500">{getRelativeTime(row.savedAt)}</p>
        </div>
      ),
    },
    {
      label: t('manager.common.customer', 'Customer'),
      field: 'customerName',
      render: (row) => (
        <div>
          <p className="text-sm text-gray-200">{truncate(row.customer?.name || row.customerName || t('manager.common.walkInCustomer', 'Walk-in Customer'), 22)}</p>
          <p className="text-[10px] text-gray-500">{row.customer?.phone || row.customerPhone || ''}</p>
        </div>
      ),
    },
    {
      label: t('manager.common.total', 'Total'), field: 'totalAmount', align: 'right',
      render: (row) => <span className="text-sm">{formatPKR(row.totalAmount)}</span>
    },
    {
      label: t('manager.common.paid', 'Paid'), field: 'paidAmount', align: 'right',
      render: (row) => <span className="text-sm text-green-400">{formatPKR(row.paidAmount || 0)}</span>
    },
    {
      label: t('manager.common.outstanding', 'Outstanding'),
      align: 'right',
      sortValue: (row) => Number(row.totalAmount || 0) - Number(row.paidAmount || 0),
      render: (row) => {
        const out = Number(row.totalAmount || 0) - Number(row.paidAmount || 0);
        return <span className="text-sm font-bold text-red-400">{formatPKR(out)}</span>;
      },
    },
    {
      label: t('manager.common.action', 'Action'),
      sortable: false,
      align: 'right',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedBill(row); }}
          className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors"
        >
          {t('manager.common.collect', 'Collect')}
        </button>
      ),
    },
  ], [t]);

  const mobileCard = (row) => {
    const out = Number(row.totalAmount || 0) - Number(row.paidAmount || 0);
    return (
      <div className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-sm font-bold text-gray-100">{row.serialNo || row.localId?.slice(-8)}</p>
            <p className="text-xs text-gray-400">{row.customer?.name || row.customerName || t('manager.common.walkInCustomer', 'Walk-in Customer')}</p>
            <p className="text-[10px] text-gray-500">{getRelativeTime(row.savedAt)}</p>
          </div>
          <p className="text-sm font-bold text-red-400">{formatPKR(out)}</p>
        </div>
        <button
          onClick={() => setSelectedBill(row)}
          className="w-full mt-2 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium"
        >
          <DollarSign className="w-3 h-3 inline mr-1" /> {t('manager.creditsPage.collectPayment', 'Collect Payment')}
        </button>
      </div>
    );
  };

  const exportRows = filtered.map(o => ({
    Serial: o.serialNo, Customer: o.customer?.name || o.customerName,
    Phone: o.customer?.phone || o.customerPhone, Total: Number(o.totalAmount || 0),
    Paid: Number(o.paidAmount || 0),
    Outstanding: Number(o.totalAmount || 0) - Number(o.paidAmount || 0),
    Date: (o.savedAt || '').slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-amber-500" /> {t('manager.creditsPage.title', 'Credit / Pending Payments')}
        </h2>
        <ExportMenu data={exportRows} filename={'credits_' + new Date().toISOString().slice(0, 10)}
          pdfOptions={{ title: t('manager.creditsPage.title', 'Credits'), headers: Object.keys(exportRows[0] || {}), rows: exportRows.map(r => Object.values(r)) }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('manager.creditsPage.totalOutstanding', 'Total Outstanding')} value={stats.totalOutstanding} prefix="Rs " icon={AlertCircle} color="red" loading={loading} />
        <StatCard label={t('manager.creditsPage.pendingBills', 'Pending Bills')} value={stats.totalBills} icon={CreditCard} color="amber" loading={loading} />
        <StatCard label={t('manager.creditsPage.overdueDays', 'Overdue (30+ days)')} value={stats.overdueBills} icon={AlertCircle} color="orange" loading={loading} />
      </div>

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder={t('manager.creditsPage.searchPh', 'Search bill or customer…')}
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={() => setFilters({ search: '', from: '', to: '' })}
        resultCount={filtered.length}
        totalCount={allCredits.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyMessage={t('manager.creditsPage.noPending', 'No pending credits')}
        emptySubtext={t('manager.creditsPage.allPaidSubtext', 'All bills are fully paid 🎉')}
        rowKey="localId"
        mobileCardRenderer={mobileCard}
        pageSize={25}
      />

      {selectedBill && (
        <PaymentModal
          localId={selectedBill.localId || selectedBill.id}
          total={Number(selectedBill.totalAmount || 0)}
          outstanding={Number(selectedBill.totalAmount || 0) - Number(selectedBill.paidAmount || 0)}
          onClose={() => setSelectedBill(null)}
          onSaved={() => { setSelectedBill(null); refresh(); }}
        />
      )}
    </div>
  );
};

export default Credits;
