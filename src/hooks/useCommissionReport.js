// src/hooks/useCommissionReport.js
// ✅ FIXED: date range bug + default range expanded

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getLocalOrdersForCommission,
  filterOrdersByDateRange,
  getDateRangePreset,
  calcOrderItemCommission,
  buildAgentMap,
  subscribeCommissionSettings,
} from '../services/commissionService';

export const useCommissionReport = (agents = [], { enabled = true } = {}) => {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [selAgent,   setSelAgent]   = useState('all');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [datePreset, setDatePreset] = useState('all'); // ✅ default 'all' not 'monthly'

  const loadOrders = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const local = await getLocalOrdersForCommission();
      setOrders(local);
    } catch (e) {
      console.warn('[useCommissionReport] loadOrders failed', e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    loadOrders();

    let ch;
    const handleUpdate = () => loadOrders();
    try {
      ch = new BroadcastChannel('aone_pos_orders');
      ch.addEventListener('message', handleUpdate);
    } catch { /* ignore */ }

    const unsubSettings = subscribeCommissionSettings(handleUpdate);
    window.addEventListener('online', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    return () => {
      try { ch?.removeEventListener('message', handleUpdate); } catch { /* ignore */ }
      try { ch?.close(); } catch { /* ignore */ }
      try { unsubSettings?.(); } catch { /* ignore */ }
      window.removeEventListener('online', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, [enabled, loadOrders]);

  // ✅ FIXED: 'all' preset means no date filter
  useEffect(() => {
    if (datePreset === 'custom') return;
    if (datePreset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const range = getDateRangePreset(datePreset);
    setDateFrom(range.from || '');
    setDateTo(range.to || '');
  }, [datePreset]);

  // ✅ FIXED: empty date strings = show all
  const filteredOrders = useMemo(() => {
    if (!dateFrom && !dateTo) return orders;
    return filterOrdersByDateRange(orders, dateFrom, dateTo);
  }, [orders, dateFrom, dateTo]);

  const report = useMemo(() => {
    if (!agents.length) return [];

    const registry = buildAgentMap(agents);
    const agentMap = {};
    agents.forEach((a) => {
      agentMap[a.id] = {
        id:                a.id,
        uid:               a.id,
        name:              a.name,
        commissionRate:    Number(a.commissionRate || 0),
        commissionType:    a.commissionType || 'percent',
        isActive:          a.isActive !== false,
        totalSales:        0,
        paidSales:         0,
        pendingSales:      0,
        commissionEarned:  0,
        commissionPending: 0,
        itemsSold:         0,
        billsInvolved:     new Set(),
      };
    });

    filteredOrders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;

      const grandTotal = Number(
        order.grandTotal ?? order.totalAmount ?? order.finalAmount ?? order.total ?? 0,
      );
      const paidAmount = Number(order.paidAmount ?? order.amountReceived ?? grandTotal);
      const paidRatio  = grandTotal > 0 ? Math.min(1, paidAmount / grandTotal) : 1;
      const billKey    = order.id || order.localId || order.billId || order.billNumber;

      const items = Array.isArray(order.items) ? order.items : [];
      let hasItemLevelSp = false;

      items.forEach((item) => {
        const spId = item.salespersonId;
        if (!spId || !agentMap[spId]) return;
        hasItemLevelSp = true;

        const { net, rawComm } = calcOrderItemCommission(item, registry, { preferAgentRegistry: true });
        const qty = Math.max(1, Number(item.qty || item.quantity || 1));

        agentMap[spId].totalSales        += net;
        agentMap[spId].paidSales         += net * paidRatio;
        agentMap[spId].pendingSales      += net * (1 - paidRatio);
        agentMap[spId].commissionEarned  += rawComm * paidRatio;
        agentMap[spId].commissionPending += rawComm * (1 - paidRatio);
        agentMap[spId].itemsSold         += qty;
        agentMap[spId].billsInvolved.add(billKey);
      });

      const spId = order.salespersonId;
      if (spId && agentMap[spId] && !hasItemLevelSp) {
        const agent    = registry[spId];
        const rate     = Number(agent?.commissionRate || 0);
        const stored   = Number(order.salespersonCommission || 0);
        const calcComm = stored > 0
          ? stored
          : Math.round((grandTotal * rate) / 100 * 100) / 100;

        agentMap[spId].totalSales        += grandTotal;
        agentMap[spId].paidSales         += grandTotal * paidRatio;
        agentMap[spId].pendingSales      += grandTotal * (1 - paidRatio);
        agentMap[spId].commissionEarned  += calcComm * paidRatio;
        agentMap[spId].commissionPending += calcComm * (1 - paidRatio);
        agentMap[spId].itemsSold         += items.length || 1;
        agentMap[spId].billsInvolved.add(billKey);
      }
    });

    return Object.values(agentMap).map((a) => {
      const rate = Number(a.commissionRate || 0);
      if (a.totalSales > 0 && rate > 0) {
        const fullComm   = Math.round((a.totalSales * rate) / 100 * 100) / 100;
        const paidRatio  = a.paidSales / a.totalSales;
        a.commissionEarned  = Math.round(fullComm * paidRatio       * 100) / 100;
        a.commissionPending = Math.round(fullComm * (1 - paidRatio) * 100) / 100;
      }
      return {
        ...a,
        billsInvolved: a.billsInvolved.size,
      };
    });
  }, [agents, filteredOrders]);

  const displayReport = useMemo(
    () => selAgent === 'all' ? report : report.filter((r) => r.id === selAgent),
    [report, selAgent],
  );

  const totals = useMemo(
    () => displayReport.reduce(
      (acc, r) => ({
        sales:    acc.sales    + (r.totalSales        || 0),
        paid:     acc.paid     + (r.paidSales         || 0),
        pending:  acc.pending  + (r.pendingSales      || 0),
        earned:   acc.earned   + (r.commissionEarned  || 0),
        pendingC: acc.pendingC + (r.commissionPending || 0),
        bills:    acc.bills    + (r.billsInvolved     || 0),
      }),
      { sales: 0, paid: 0, pending: 0, earned: 0, pendingC: 0, bills: 0 },
    ),
    [displayReport],
  );

  const resetFilters = useCallback(() => {
    setSelAgent('all');
    setDatePreset('all'); // ✅ default 'all' (show everything)
  }, []);

  return {
    loading,
    loadOrders,
    orders,
    filteredOrders,
    selAgent,    setSelAgent,
    dateFrom,    setDateFrom,
    dateTo,      setDateTo,
    datePreset,  setDatePreset,
    displayReport,
    totals,
    resetFilters,
  };
};

export default useCommissionReport;