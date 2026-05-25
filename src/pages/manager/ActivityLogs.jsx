// File: src/pages/manager/ActivityLogs.jsx
// Purpose: View branch activity logs with filters and search

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, User, Clock, FileText, DollarSign, Receipt,
  CheckCircle, XCircle, RotateCcw, Edit3,
} from 'lucide-react';
import managerService from '../../services/managerService';
import { ACTIVITY_ACTIONS } from '../../utils/constants';
import { getRelativeTime, getInitials } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';

const ACTION_ICONS = {
  BILL_CREATED: { icon: FileText, color: 'green' },
  BILL_UPDATED: { icon: Edit3, color: 'blue' },
  BILL_DELETED: { icon: XCircle, color: 'red' },
  PAYMENT_COLLECTED: { icon: DollarSign, color: 'green' },
  PAYMENT_REFUNDED: { icon: DollarSign, color: 'orange' },
  CUSTOMER_ADDED: { icon: User, color: 'blue' },
  CUSTOMER_UPDATED: { icon: Edit3, color: 'blue' },
  EXPENSE_ADDED: { icon: Receipt, color: 'orange' },
  EXPENSE_APPROVED: { icon: CheckCircle, color: 'green' },
  EXPENSE_REJECTED: { icon: XCircle, color: 'red' },
  RETURN_APPROVED: { icon: RotateCcw, color: 'green' },
  RETURN_REJECTED: { icon: XCircle, color: 'red' },
  CASH_TX_CREATED: { icon: DollarSign, color: 'amber' },
  CASH_TX_RECONCILED: { icon: CheckCircle, color: 'green' },
  COMMISSION_PAID: { icon: DollarSign, color: 'purple' },
  SHIFT_OPENED: { icon: Clock, color: 'green' },
  SHIFT_CLOSED: { icon: Clock, color: 'red' },
  USER_LOGIN: { icon: User, color: 'cyan' },
  USER_LOGOUT: { icon: User, color: 'gray' },
};

const ActivityLogs = () => {
  const [filters, setFilters] = useState({ search: '', action: '', userId: '', from: '', to: '' });

  const loader = useCallback(() => managerService.getActivityLogs({ ...filters, limit: 1000 }), [filters]);
  const { data, loading } = useManagerData(loader, [filters], { autoRefresh: true, refreshInterval: 30000 });

  const logs = useMemo(() => {
    let list = data || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(l =>
        (l.action || '').toLowerCase().includes(q) ||
        (l.userName || '').toLowerCase().includes(q) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, filters.search]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = logs.filter(l => (l.timestamp || '').slice(0, 10) === today);
    const uniqueUsers = new Set(logs.map(l => l.userId)).size;
    const uniqueActions = new Set(logs.map(l => l.action)).size;
    return { count: logs.length, today: todayLogs.length, users: uniqueUsers, actions: uniqueActions };
  }, [logs]);

  const getActionStyle = (action) => {
    return ACTION_ICONS[action] || { icon: Activity, color: 'gray' };
  };

  const columns = [
    {
      label: 'Action', field: 'action',
      render: (r) => {
        const s = getActionStyle(r.action);
        const Icon = s.icon;
        const colorMap = {
          green: 'bg-green-500/15 text-green-400',
          red: 'bg-red-500/15 text-red-400',
          blue: 'bg-blue-500/15 text-blue-400',
          orange: 'bg-orange-500/15 text-orange-400',
          purple: 'bg-purple-500/15 text-purple-400',
          amber: 'bg-amber-500/15 text-amber-400',
          cyan: 'bg-cyan-500/15 text-cyan-400',
          gray: 'bg-gray-500/15 text-gray-400',
        };
        return (
          <div className="flex items-center gap-2">
            <div className={'h-7 w-7 rounded-lg flex items-center justify-center ' + (colorMap[s.color] || colorMap.gray)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium text-gray-200">{r.action.replace(/_/g, ' ')}</span>
          </div>
        );
      },
    },
    {
      label: 'User', field: 'userName',
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center text-[9px] font-bold">{getInitials(r.userName)}</div>
          <span className="text-xs text-gray-300">{r.userName || r.userId}</span>
        </div>
      ),
    },
    { label: 'Branch', field: 'storeId', render: (r) => <span className="text-[10px] text-gray-500 font-mono">{r.storeId || '—'}</span> },
    {
      label: 'Details', field: 'details', sortable: false,
      render: (r) => {
        const d = r.details || {};
        const keys = Object.keys(d).slice(0, 2);
        return (
          <div className="space-y-0.5">
            {keys.map(k => (
              <p key={k} className="text-[10px] text-gray-500">
                <span className="text-gray-600">{k}:</span> {typeof d[k] === 'object' ? JSON.stringify(d[k]).slice(0, 30) : String(d[k]).slice(0, 40)}
              </p>
            ))}
            {Object.keys(d).length > 2 && <p className="text-[10px] text-gray-700">+{Object.keys(d).length - 2} more</p>}
          </div>
        );
      },
    },
    {
      label: 'Time', field: 'timestamp',
      render: (r) => <span className="text-[10px] text-gray-500">{getRelativeTime(r.timestamp)}</span>,
    },
  ];

  const mobileCard = (r) => {
    const s = getActionStyle(r.action);
    const Icon = s.icon;
    const colorMap = {
      green: 'bg-green-500/15 text-green-400',
      red: 'bg-red-500/15 text-red-400',
      blue: 'bg-blue-500/15 text-blue-400',
      orange: 'bg-orange-500/15 text-orange-400',
      purple: 'bg-purple-500/15 text-purple-400',
      amber: 'bg-amber-500/15 text-amber-400',
      cyan: 'bg-cyan-500/15 text-cyan-400',
      gray: 'bg-gray-500/15 text-gray-400',
    };
    return (
      <div className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
        <div className="flex items-start gap-3">
          <div className={'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ' + (colorMap[s.color] || colorMap.gray)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-200">{r.action.replace(/_/g, ' ')}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {r.userName || r.userId} • {getRelativeTime(r.timestamp)}
            </p>
            {r.details && Object.keys(r.details).length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#0f0a04] text-[10px] text-gray-500 space-y-0.5">
                {Object.entries(r.details).slice(0, 3).map(([k, v]) => (
                  <p key={k}>
                    <span className="text-gray-600">{k}:</span>{' '}
                    {typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 40)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const exportRows = logs.map(l => ({
    Action: l.action,
    User: l.userName || l.userId,
    Branch: l.storeId,
    Details: JSON.stringify(l.details || {}),
    Timestamp: l.timestamp,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-500" /> Activity Logs
          <span className="text-[10px] font-normal text-green-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> Live
          </span>
        </h2>
        <ExportMenu data={exportRows} filename={'activity_' + new Date().toISOString().slice(0, 10)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Logs" value={stats.count} icon={Activity} color="amber" loading={loading} />
        <StatCard label="Today" value={stats.today} icon={Clock} color="green" loading={loading} />
        <StatCard label="Active Users" value={stats.users} icon={User} color="blue" loading={loading} />
        <StatCard label="Action Types" value={stats.actions} icon={FileText} color="purple" loading={loading} />
      </div>

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder="Search action, user, details…"
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={() => setFilters({ search: '', action: '', userId: '', from: '', to: '' })}
        resultCount={logs.length}
        customFilters={[{
          key: 'action', label: 'Action', value: filters.action,
          options: Object.keys(ACTIVITY_ACTIONS).map(k => ({ value: k, label: k.replace(/_/g, ' ') })),
          onChange: (v) => setFilters(f => ({ ...f, action: v })),
        }]}
      />

      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        emptyMessage="No activity logs"
        emptySubtext="Activity will appear here as users perform actions"
        rowKey="logId"
        mobileCardRenderer={mobileCard}
        pageSize={50}
        enableVirtualization
        virtualizationThreshold={100}
        maxHeight="650px"
      />
    </div>
  );
};

export default ActivityLogs;