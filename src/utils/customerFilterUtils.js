/**
 * Customer list filters — persona + visit presets (Master Prompt fields).
 * Client-side only — fast, no extra Firestore reads.
 */

import {
  normalizePersonaFromDoc,
  PERSONA_VIP_SALES_THRESHOLD,
  PERSONA_VIP_VISIT_THRESHOLD,
  PERSONA_INACTIVE_DAYS,
  PERSONA_RECOVERY_PAYMENT_GAP_DAYS,
} from './customerPersonaSchema';

const parseTs = (v) => {
  if (!v) return 0;
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

/** Pick the newest timestamp from legacy + persona + order fields. */
export const pickLatestCustomerDate = (...values) => {
  let best = null;
  let bestTs = 0;
  values.forEach((v) => {
    if (!v) return;
    const ts = parseTs(v);
    if (ts > bestTs) {
      bestTs = ts;
      best = v;
    }
  });
  return best;
};

/** Pick earliest date for first visit. */
export const pickEarliestCustomerDate = (...values) => {
  let best = null;
  let bestTs = Infinity;
  values.forEach((v) => {
    if (!v) return;
    const ts = parseTs(v);
    if (ts > 0 && ts < bestTs) {
      bestTs = ts;
      best = v;
    }
  });
  return best;
};

/** Read bill/visit totals from old + new customer document shapes. */
export const readLegacyBillCount = (doc = {}) => Math.max(
  Number(doc.purchaseCount ?? 0),
  Number(doc.totalBills ?? 0),
  Number(doc.billsCount ?? 0),
  Number(doc.orderCount ?? 0),
  Number(doc.ordersCount ?? 0),
  Number(doc.totalOrders ?? 0),
  Number(doc.numOrders ?? 0),
);

export const readLegacyVisitCount = (doc = {}) => {
  let visits = Math.max(
    Number(doc.visitCount ?? 0),
    Number(doc.visitFrequency ?? 0),
    Number(doc.visits ?? 0),
    Number(doc.totalVisits ?? 0),
    Number(doc.noOfVisits ?? 0),
  );
  if (Array.isArray(doc.visitHistory) && doc.visitHistory.length > visits) {
    visits = doc.visitHistory.length;
  }
  return visits;
};

/** Merge old DB fields (purchaseCount, lastOrderDate…) with persona + optional order metrics. */
export const mergeLegacyCustomerMetrics = (doc = {}, orderMetrics = {}) => {
  const orderCount = Number(orderMetrics.count || 0);
  const orderSpent = Number(orderMetrics.spent || 0);
  const orderFirstDate = orderMetrics.firstDate || null;

  const legacyBills = readLegacyBillCount(doc);
  const legacySales = Number(doc.totalSpent ?? doc.totalSales ?? doc.lifetimeValue ?? 0);
  const legacyVisits = readLegacyVisitCount(doc);

  const totalBills = Math.max(legacyBills, orderCount, Number(doc.totalBills ?? 0));
  const totalSales = Math.max(legacySales, orderSpent, Number(doc.totalSales ?? 0));
  const visitCount = Math.max(legacyVisits, totalBills, orderCount);

  const lastVisit = pickLatestCustomerDate(
    doc.lastVisit,
    doc.lastVisitDate,
    doc.lastPurchaseDate,
    doc.lastOrderDate,
    doc.lastBillDate,
    doc.lastPurchase,
    doc.lastBillAt,
    doc.lastPaymentDate,
    orderMetrics.lastDate,
  );
  const firstVisit = pickEarliestCustomerDate(
    doc.firstVisit,
    doc.firstOrderDate,
    doc.firstBillDate,
    doc.registeredAt,
    doc.joinDate,
    doc.createdAt,
    orderFirstDate,
  );

  const pendingAmount = Math.max(
    Number(doc.pendingAmount ?? 0),
    Number(doc.outstandingBalance ?? 0),
  );

  return {
    totalBills,
    totalSales,
    visitCount,
    lastVisit,
    firstVisit,
    pendingAmount,
    purchaseCount: totalBills,
    totalSpent: totalSales,
    lastOrderDate: lastVisit,
  };
};

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

const daysAgoStart = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.getTime();
};

const daysBetweenTs = (ts) => {
  if (!ts) return 9999;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
};

export const CUSTOMER_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'walkin', label: 'Walk-in' },
  { key: 'auto', label: 'Phone-only' },
  { key: 'registered', label: 'Named' },
];

export const CUSTOMER_VISIT_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'visited_today', label: 'Today' },
  { key: 'visited_yesterday', label: 'Yesterday' },
  { key: 'visited_week', label: '7 Days' },
  { key: 'visited_month', label: '30 Days' },
  { key: 'new_week', label: 'New (7d)' },
  { key: 'first_time', label: 'First Visit' },
  { key: 'repeat', label: 'Repeat' },
];

export const CUSTOMER_PERSONA_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'vip', label: 'VIP' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'credit', label: 'Credit Due' },
];

const computeLiveFlags = (row) => {
  const lastVisitTs = parseTs(row.lastVisit || row.lastOrderDate || row.lastPurchaseDate);
  const lastPayTs = parseTs(row.lastPaymentDate);
  const sales = Number(row.totalSpent ?? row.totalSales ?? 0);
  const visits = Number(row.visitCount ?? row.purchaseCount ?? row.totalBills ?? 0);
  const pending = Number(row.pendingAmount ?? row.outstandingBalance ?? 0);
  return {
    vipStatus: row.vipStatus === true
      || row.isVip === true
      || row.isVIP === true
      || row.vip === true
      || row.vipCustomer === true
      || row.customerType === 'vip'
      || sales >= PERSONA_VIP_SALES_THRESHOLD
      || visits >= PERSONA_VIP_VISIT_THRESHOLD,
    isRepeatCustomer: visits >= 2,
    inactiveStatus: row.inactiveStatus === true
      || (lastVisitTs > 0 && daysBetweenTs(lastVisitTs) >= PERSONA_INACTIVE_DAYS),
    recoveryRiskStatus: row.recoveryRiskStatus === true
      || (pending > 0 && lastPayTs > 0 && daysBetweenTs(lastPayTs) >= PERSONA_RECOVERY_PAYMENT_GAP_DAYS),
    hasCredit: pending > 0,
  };
};

/** Merge Firestore persona + legacy DB + order metrics into one list row. */
export const mapCustomerRowPersona = (base = {}, orderMetrics = {}) => {
  const persona = normalizePersonaFromDoc(base);
  const legacy = mergeLegacyCustomerMetrics({ ...persona, ...base }, orderMetrics);
  const flags = computeLiveFlags({ ...persona, ...base, ...legacy });

  return {
    ...base,
    ...persona,
    ...legacy,
    lifetimeValue: Number(persona.lifetimeValue || legacy.totalSales || 0),
    averageBill: legacy.totalBills > 0
      ? Math.round(legacy.totalSales / legacy.totalBills)
      : Number(persona.averageBill || 0),
    lastPurchaseDate: pickLatestCustomerDate(
      persona.lastPurchaseDate,
      base.lastPurchaseDate,
      legacy.lastVisit,
    ),
    lastPaymentDate: persona.lastPaymentDate || base.lastPaymentDate || null,
    lastReturnDate: persona.lastReturnDate || base.lastReturnDate || null,
    totalPaidAmount: Number(persona.totalPaidAmount ?? base.totalPaidAmount ?? 0),
    creditDays: persona.creditDays ?? base.creditDays ?? 0,
    creditHistory: persona.creditHistory ?? base.creditHistory ?? [],
    preferredBranch: persona.preferredBranch || base.preferredBranch || base.storeId || '',
    preferredSalesperson: persona.preferredSalesperson || base.preferredSalesperson || '',
    favoriteCategories: persona.favoriteCategories || {},
    favoriteProducts: persona.favoriteProducts || {},
    customerNotes: persona.customerNotes || base.notes || base.customerNotes || '',
    tenantId: persona.tenantId || base.tenantId,
    customerId: persona.customerId || base.customerId || base.id,
    branchName: base.branchName || persona.preferredBranch || base.storeId || '',
    vipStatus: flags.vipStatus,
    inactiveStatus: flags.inactiveStatus,
    recoveryRiskStatus: flags.recoveryRiskStatus,
    hasCredit: flags.hasCredit,
    isRepeatCustomer: flags.isRepeatCustomer,
    outstandingBalance: legacy.pendingAmount,
  };
};

const visitsForRow = (row) =>
  Number(row.visitCount ?? row.purchaseCount ?? row.totalBills ?? 0);

export const matchesVisitFilter = (row, filterKey) => {
  if (!filterKey || filterKey === 'all') return true;
  if (row.isWalkin) return false;

  const lastTs = parseTs(row.lastVisit || row.lastOrderDate);
  const firstTs = parseTs(row.firstVisit || row.createdAt);
  const todayStart = startOfDay();
  const yesterdayStart = daysAgoStart(1);

  switch (filterKey) {
    case 'visited_today':
      return lastTs >= todayStart;
    case 'visited_yesterday':
      return lastTs >= yesterdayStart && lastTs < todayStart;
    case 'visited_week':
      return lastTs >= daysAgoStart(7);
    case 'visited_month':
      return lastTs >= daysAgoStart(30);
    case 'new_week':
      return firstTs >= daysAgoStart(7);
    case 'first_time':
      return visitsForRow(row) <= 1;
    case 'repeat':
      return visitsForRow(row) >= 2;
    default:
      return true;
  }
};

export const matchesPersonaFilter = (row, filterKey) => {
  if (!filterKey || filterKey === 'all') return true;
  if (row.isWalkin) return false;

  switch (filterKey) {
    case 'vip':
      return row.vipStatus === true;
    case 'inactive':
      return row.inactiveStatus === true;
    case 'recovery':
      return row.recoveryRiskStatus === true;
    case 'credit':
      return Number(row.pendingAmount || row.outstandingBalance || 0) > 0;
    default:
      return true;
  }
};

export const applyCustomerFilters = (rows, {
  typeFilter = 'all',
  visitFilter = 'all',
  personaFilter = 'all',
  cityFilter = '',
  search = '',
  getCustomerType = () => 'registered',
  normalizePhone = (p) => p,
} = {}) => {
  let list = [...rows];

  if (search.trim()) {
    const s = search.toLowerCase().trim();
    const ph = search.replace(/\D/g, '');
    list = list.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) ||
        (ph.length >= 1 && normalizePhone(c.phone).includes(ph)) ||
        c.city?.toLowerCase().includes(s) ||
        c.market?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s) ||
        c.branchName?.toLowerCase().includes(s) ||
        String(c.storeId || '').toLowerCase().includes(s),
    );
  }

  if (cityFilter) {
    list = list.filter(
      (c) => c.isWalkin || c.city?.toLowerCase() === cityFilter.toLowerCase(),
    );
  }

  if (typeFilter !== 'all') {
    list = list.filter((c) => getCustomerType(c) === typeFilter);
  }

  if (visitFilter !== 'all') {
    list = list.filter((c) => matchesVisitFilter(c, visitFilter));
  }

  if (personaFilter !== 'all') {
    list = list.filter((c) => matchesPersonaFilter(c, personaFilter));
  }

  return list;
};

const fmtList = (obj) => {
  if (!obj || typeof obj !== 'object') return '—';
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!entries.length) return '—';
  return entries.map(([k, v]) => `${k} (${v})`).join(', ');
};

/** UI sections for Customer Persona Foundation detail panel. */
export const buildPersonaDisplaySections = (customer = {}, { fmt = (v) => v, fmtDate = () => '—' } = {}) => [
  {
    title: 'Identity',
    rows: [
      { label: 'Customer ID', value: customer.customerId || customer.id || '—' },
      { label: 'Name', value: customer.name || '—' },
      { label: 'Mobile', value: customer.phone || '—' },
      {
        label: 'All Numbers',
        value: Array.isArray(customer.numbers) && customer.numbers.length
          ? customer.numbers
            .map((n) => (typeof n === 'string' ? n : n?.phone || ''))
            .filter(Boolean)
            .join(', ')
          : (customer.phone || '—'),
      },
      { label: 'Email', value: customer.email || '—' },
      { label: 'Market', value: customer.market || '—' },
      { label: 'City', value: customer.city || '—' },
      { label: 'Tenant', value: customer.tenantId || 'aone' },
      { label: 'Branch', value: customer.branchName || customer.storeId || '—' },
    ],
  },
  {
    title: 'Visits & Dates',
    rows: [
      { label: 'First Visit', value: fmtDate(customer.firstVisit || customer.createdAt) },
      { label: 'Last Visit', value: fmtDate(customer.lastVisit || customer.lastOrderDate) },
      { label: 'Last Purchase', value: fmtDate(customer.lastPurchaseDate || customer.lastOrderDate) },
      { label: 'Last Payment', value: fmtDate(customer.lastPaymentDate) },
      { label: 'Last Return', value: fmtDate(customer.lastReturnDate) },
      { label: 'Visit Count', value: customer.visitCount ?? customer.purchaseCount ?? 0 },
      { label: 'Visit Frequency', value: customer.visitFrequency ?? customer.visitCount ?? 0 },
    ],
  },
  {
    title: 'Sales & Credit',
    rows: [
      { label: 'Total Bills', value: customer.totalBills ?? customer.purchaseCount ?? 0 },
      { label: 'Total Sales', value: fmt(customer.totalSales ?? customer.totalSpent) },
      { label: 'Total Paid', value: fmt(customer.totalPaidAmount) },
      { label: 'Average Bill', value: fmt(customer.averageBill) },
      { label: 'Pending Amount', value: fmt(customer.pendingAmount ?? customer.outstandingBalance) },
      { label: 'Credit Days', value: customer.creditDays ?? 0 },
      { label: 'Lifetime Value', value: fmt(customer.lifetimeValue ?? customer.totalSpent) },
      { label: 'Credit History', value: Array.isArray(customer.creditHistory) && customer.creditHistory.length
        ? `${customer.creditHistory.length} entries`
        : '—' },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { label: 'Preferred Branch', value: customer.preferredBranch || customer.storeId || '—' },
      { label: 'Preferred Salesperson', value: customer.preferredSalesperson || '—' },
      { label: 'Favorite Categories', value: fmtList(customer.favoriteCategories) },
      { label: 'Favorite Products', value: fmtList(customer.favoriteProducts) },
      { label: 'Notes', value: customer.customerNotes || '—' },
    ],
  },
];

export const countCustomerFilters = (rows, filters, helpers = {}) => {
  const counts = {
    visit: {},
    persona: {},
    type: {},
  };
  CUSTOMER_VISIT_FILTERS.forEach((f) => {
    counts.visit[f.key] = f.key === 'all'
      ? rows.length
      : rows.filter((r) => matchesVisitFilter(r, f.key)).length;
  });
  CUSTOMER_PERSONA_FILTERS.forEach((f) => {
    counts.persona[f.key] = f.key === 'all'
      ? rows.length
      : rows.filter((r) => matchesPersonaFilter(r, f.key)).length;
  });
  CUSTOMER_TYPE_FILTERS.forEach((f) => {
    if (f.key === 'all') counts.type.all = rows.length;
    else counts.type[f.key] = rows.filter((r) => helpers.getCustomerType?.(r) === f.key).length;
  });
  return counts;
};
