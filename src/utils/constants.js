// File: src/utils/constants.js
// Purpose: Application-wide constants and configuration
// Features: Roles, Bill Status, Sync Status, Payment Methods, Routes, Hotkeys,
//           Cancel Reasons, Manager Module (Expenses, Returns, Approvals, Reports)
// Offline: Yes
// Last Updated: Manager Module v1.0

// ============================================
// USER ROLES
// ============================================
export const ROLES = {
  superAdmin: 'superAdmin',
  admin: 'admin',
  manager: 'manager',
  biller: 'biller',
  cashier: 'cashier',
  salesperson: 'salesperson',
};

// ============================================
// BILL STATUS
// ============================================
export const BILL_STATUS = {
  draft: 'draft',
  completed: 'completed',
  synced: 'synced',
  deleted: 'deleted',
  pending: 'pending',
  returned: 'returned',
  cancelled: 'cancelled',
  manager_approved: 'manager_approved',
  pending_superadmin: 'pending_superadmin',
};

// ============================================
// SYNC STATUS
// ============================================
export const SYNC_STATUS = {
  pending: 'pending',
  syncing: 'syncing',
  synced: 'synced',
  failed: 'failed',
};

// ============================================
// SHIFT STATUS
// ============================================
export const SHIFT_STATUS = {
  open: 'open',
  closed: 'closed',
  pending: 'pending',
};

// ============================================
// CASH TRANSACTION TYPES
// ============================================
export const CASH_TX_TYPES = {
  deposit: 'deposit',
  withdrawal: 'withdrawal',
  adjustment: 'adjustment',
  receive: 'receive',
  handover: 'handover',
  transfer: 'transfer',
  expense: 'expense',
  refund: 'refund',
  commission: 'commission',
};

// ============================================
// PAYMENT METHODS
// ============================================
export const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', label: 'Cash', icon: 'Banknote', enabled: true, order: 1, requiresVerification: false, fee: 0 },
  { id: 'easypaisa', name: 'EasyPaisa', label: 'EasyPaisa', icon: 'Phone', enabled: true, order: 2, requiresVerification: true, fee: 0 },
  { id: 'jazzcash', name: 'JazzCash', label: 'JazzCash', icon: 'Smartphone', enabled: true, order: 3, requiresVerification: true, fee: 0 },
  { id: 'bank', name: 'Bank Transfer', label: 'Bank Transfer', icon: 'Landmark', enabled: true, order: 4, requiresVerification: true, fee: 0 },
  { id: 'card', name: 'Debit/Credit Card', label: 'Card', icon: 'CreditCard', enabled: true, order: 5, requiresVerification: true, fee: 2.5 },
];

export const PAYMENT_METHOD_LABELS = PAYMENT_METHODS.reduce((acc, method) => {
  acc[method.id] = method.label;
  return acc;
}, {});

// ============================================
// PAYMENT STATUS (for bills)
// ============================================
export const PAYMENT_STATUS = {
  paid: 'paid',
  partial: 'partial',
  unpaid: 'unpaid',
  refunded: 'refunded',
  overpaid: 'overpaid',
};

export const PAYMENT_STATUS_LABELS = {
  [PAYMENT_STATUS.paid]: 'Paid',
  [PAYMENT_STATUS.partial]: 'Partial',
  [PAYMENT_STATUS.unpaid]: 'Unpaid',
  [PAYMENT_STATUS.refunded]: 'Refunded',
  [PAYMENT_STATUS.overpaid]: 'Overpaid',
};

// ============================================
// FIRESTORE COLLECTION NAMES
// ============================================
export const COLLECTION_NAMES = {
  orders: 'orders',
  users: 'users',
  customers: 'customers',
  settings: 'settings',
  auditLogs: 'auditLogs',
  deletedBills: 'deletedBills',
  fraudAlerts: 'fraudAlerts',
  clearedData: 'clearedData',
  shifts: 'shifts',
  cashTransactions: 'cashTransactions',
  returns: 'returns',
  heldBills: 'heldBills',
  approvalRequests: 'approvalRequests',
  managerApprovedOrders: 'managerApprovedOrders',
  managerCancelledOrders: 'managerCancelledOrders',
  superApprovalRequests: 'superApprovalRequests',
  superAdminApprovedOrders: 'superAdminApprovedOrders',
  superAdminCancelledOrders: 'superAdminCancelledOrders',
  stores: 'stores',
  activityLogs: 'activityLogs',
  expenses: 'expenses',
  payments: 'payments',
  commissions: 'commissions',
  notifications: 'notifications',
};

// ============================================
// APPLICATION ROUTES
// ============================================
export const APP_ROUTES = {
  login: '/login',
  dashboard: '/',
  biller: '/biller',
  cashier: '/cashier',
  manager: '/manager',
  admin: '/admin',
  superAdmin: '/super-admin',
  settings: '/settings',
  reports: '/reports',
  inventory: '/inventory',
  customers: '/customers',
};

// ============================================
// MANAGER MODULE ROUTES
// ============================================
export const MANAGER_ROUTES = {
  dashboard: '/manager',
  bills: '/manager/bills',
  cashflow: '/manager/cashflow',
  credits: '/manager/credits',
  customers: '/manager/customers',
  expenses: '/manager/expenses',
  returns: '/manager/returns',
  reports: '/manager/reports',
  salespersons: '/manager/salespersons',
  shifts: '/manager/shifts',
  activityLogs: '/manager/activity-logs',
  approvals: '/manager/approvals',
  userMonitoring: '/manager/user-monitoring',
  staff: '/manager/staff',
};

// ============================================
// BILL CANCEL REASONS
// ============================================
export const CANCEL_REASONS = [
  { id: 'wrong_item', label: 'Wrong Item Added' },
  { id: 'wrong_price', label: 'Incorrect Pricing' },
  { id: 'customer_changed_mind', label: 'Customer Changed Mind' },
  { id: 'customer_no_cash', label: 'Customer - No Cash' },
  { id: 'payment_failed', label: 'Payment Failed' },
  { id: 'system_error', label: 'System Error/Crash' },
  { id: 'duplicate_bill', label: 'Duplicate Bill' },
  { id: 'test_bill', label: 'Test/Training Bill' },
  { id: 'incorrect_customer', label: 'Incorrect Customer' },
  { id: 'wrong_discount', label: 'Wrong Discount Applied' },
  { id: 'out_of_stock', label: 'Item Out of Stock' },
  { id: 'printer_error', label: 'Printer Failure' },
  { id: 're-billing', label: 'Re-billing with Changes' },
  { id: 'other', label: 'Other (Specify in notes)' },
];

// ============================================
// EXPENSE CATEGORIES (Manager Module)
// ============================================
export const EXPENSE_CATEGORIES = [
  { id: 'utilities', label: 'Utilities (Electricity/Gas/Water)', icon: 'Zap', color: 'amber' },
  { id: 'rent', label: 'Rent', icon: 'Home', color: 'blue' },
  { id: 'salary', label: 'Salaries & Wages', icon: 'Users', color: 'purple' },
  { id: 'maintenance', label: 'Maintenance & Repair', icon: 'Wrench', color: 'orange' },
  { id: 'transport', label: 'Transport & Fuel', icon: 'Truck', color: 'cyan' },
  { id: 'food', label: 'Food & Beverages', icon: 'Coffee', color: 'pink' },
  { id: 'stationery', label: 'Stationery & Printing', icon: 'FileText', color: 'green' },
  { id: 'marketing', label: 'Marketing & Advertising', icon: 'Megaphone', color: 'red' },
  { id: 'cleaning', label: 'Cleaning & Hygiene', icon: 'Droplet', color: 'blue' },
  { id: 'security', label: 'Security', icon: 'Shield', color: 'purple' },
  { id: 'insurance', label: 'Insurance', icon: 'ShieldCheck', color: 'green' },
  { id: 'tax', label: 'Tax & Compliance', icon: 'FileCheck', color: 'orange' },
  { id: 'misc', label: 'Miscellaneous', icon: 'MoreHorizontal', color: 'gray' },
];

export const EXPENSE_CATEGORY_LABELS = EXPENSE_CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = cat.label;
  return acc;
}, {});

// ============================================
// RETURN REASONS (Manager Module)
// ============================================
export const RETURN_REASONS = [
  { id: 'defective', label: 'Defective Product' },
  { id: 'wrong_item', label: 'Wrong Item Delivered' },
  { id: 'size_issue', label: 'Size / Fit Issue' },
  { id: 'quality_issue', label: 'Quality Issue' },
  { id: 'not_as_described', label: 'Not As Described' },
  { id: 'customer_dissatisfied', label: 'Customer Dissatisfied' },
  { id: 'duplicate_order', label: 'Duplicate Order' },
  { id: 'late_delivery', label: 'Late Delivery' },
  { id: 'damage_in_transit', label: 'Damaged in Transit' },
  { id: 'price_match', label: 'Price Match Request' },
  { id: 'exchange', label: 'Exchange for Another Item' },
  { id: 'other', label: 'Other (Specify in notes)' },
];

export const RETURN_REASON_LABELS = RETURN_REASONS.reduce((acc, r) => {
  acc[r.id] = r.label;
  return acc;
}, {});

// ============================================
// APPROVAL SYSTEM (Manager Module)
// ============================================
export const APPROVAL_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

export const APPROVAL_STATUS_LABELS = {
  [APPROVAL_STATUS.pending]: 'Pending',
  [APPROVAL_STATUS.approved]: 'Approved',
  [APPROVAL_STATUS.rejected]: 'Rejected',
  [APPROVAL_STATUS.cancelled]: 'Cancelled',
};

export const APPROVAL_TYPES = {
  discount: 'discount',
  credit: 'credit',
  return: 'return',
  expense: 'expense',
  refund: 'refund',
  cashTransfer: 'cashTransfer',
  largeBill: 'largeBill',
  voidBill: 'voidBill',
};

export const APPROVAL_TYPE_LABELS = {
  [APPROVAL_TYPES.discount]: 'Special Discount',
  [APPROVAL_TYPES.credit]: 'Credit Sale',
  [APPROVAL_TYPES.return]: 'Sale Return',
  [APPROVAL_TYPES.expense]: 'Expense Entry',
  [APPROVAL_TYPES.refund]: 'Refund Payment',
  [APPROVAL_TYPES.cashTransfer]: 'Cash Transfer',
  [APPROVAL_TYPES.largeBill]: 'Large Amount Bill',
  [APPROVAL_TYPES.voidBill]: 'Void / Cancel Bill',
};

// ============================================
// REPORT TYPES (Manager Module)
// ============================================
export const REPORT_TYPES = {
  sales: 'sales',
  cash: 'cash',
  expense: 'expense',
  credit: 'credit',
  commission: 'commission',
  discount: 'discount',
  return: 'return',
  customer: 'customer',
  product: 'product',
  user: 'user',
  shift: 'shift',
  managerApproved: 'managerApproved',
};

export const REPORT_TYPE_LABELS = {
  [REPORT_TYPES.sales]: 'Sales Report',
  [REPORT_TYPES.cash]: 'Cash Flow Report',
  [REPORT_TYPES.expense]: 'Expense Report',
  [REPORT_TYPES.credit]: 'Credit / Outstanding Report',
  [REPORT_TYPES.commission]: 'Commission Report',
  [REPORT_TYPES.discount]: 'Discount Report',
  [REPORT_TYPES.return]: 'Returns Report',
  [REPORT_TYPES.customer]: 'Customer Report',
  [REPORT_TYPES.product]: 'Product Sales Report',
  [REPORT_TYPES.user]: 'User Performance Report',
  [REPORT_TYPES.shift]: 'Shift Report',
  [REPORT_TYPES.managerApproved]: 'Manager Approved Orders',
};

// ============================================
// MANAGER PERMISSIONS (Granular)
// ============================================
export const MANAGER_PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'view_dashboard',

  // Bills
  VIEW_BILLS: 'view_bills',
  EDIT_BILLS: 'edit_bills',
  DELETE_BILLS: 'delete_bills',
  VIEW_DELETED_BILLS: 'view_deleted_bills',
  RESTORE_BILLS: 'restore_bills',

  // Customers
  VIEW_CUSTOMERS: 'view_customers',
  MANAGE_CUSTOMERS: 'manage_customers',
  EDIT_CUSTOMERS: 'edit_customers',
  DELETE_CUSTOMERS: 'delete_customers',

  // Salespersons
  VIEW_SALESPERSONS: 'view_salespersons',
  MANAGE_SALESPERSONS: 'manage_salespersons',
  PAY_COMMISSION: 'pay_commission',
  SET_COMMISSION_RATE: 'set_commission_rate',

  // Expenses
  VIEW_EXPENSES: 'view_expenses',
  ADD_EXPENSES: 'add_expenses',
  APPROVE_EXPENSES: 'approve_expenses',
  DELETE_EXPENSES: 'delete_expenses',

  // Returns
  VIEW_RETURNS: 'view_returns',
  APPROVE_RETURNS: 'approve_returns',
  PROCESS_REFUNDS: 'process_refunds',

  // Discounts
  APPROVE_DISCOUNTS: 'approve_discounts',
  GIVE_SPECIAL_DISCOUNT: 'give_special_discount',

  // Payments
  COLLECT_PAYMENTS: 'collect_payments',
  PARTIAL_PAYMENT: 'partial_payment',
  REFUND_PAYMENT: 'refund_payment',

  // Reports
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  VIEW_FINANCIAL_REPORTS: 'view_financial_reports',

  // Activity & Monitoring
  VIEW_ACTIVITY_LOGS: 'view_activity_logs',
  VIEW_USER_MONITORING: 'view_user_monitoring',

  // Shifts
  MANAGE_SHIFTS: 'manage_shifts',
  OPEN_SHIFT: 'open_shift',
  CLOSE_SHIFT: 'close_shift',

  // Cash
  CASH_TRANSFER: 'cash_transfer',
  CASH_RECEIVE: 'cash_receive',
  CASH_HANDOVER: 'cash_handover',
  RECONCILE_CASH: 'reconcile_cash',

  // Approvals
  VIEW_APPROVALS: 'view_approvals',
  PROCESS_APPROVALS: 'process_approvals',
};

// ============================================
// DEFAULT MANAGER PERMISSIONS (out-of-box)
// ============================================
export const DEFAULT_MANAGER_PERMISSIONS = [
  MANAGER_PERMISSIONS.VIEW_DASHBOARD,
  MANAGER_PERMISSIONS.VIEW_BILLS,
  MANAGER_PERMISSIONS.VIEW_CUSTOMERS,
  MANAGER_PERMISSIONS.MANAGE_CUSTOMERS,
  MANAGER_PERMISSIONS.VIEW_SALESPERSONS,
  MANAGER_PERMISSIONS.VIEW_EXPENSES,
  MANAGER_PERMISSIONS.ADD_EXPENSES,
  MANAGER_PERMISSIONS.APPROVE_EXPENSES,
  MANAGER_PERMISSIONS.VIEW_RETURNS,
  MANAGER_PERMISSIONS.APPROVE_RETURNS,
  MANAGER_PERMISSIONS.PROCESS_REFUNDS,
  MANAGER_PERMISSIONS.COLLECT_PAYMENTS,
  MANAGER_PERMISSIONS.PARTIAL_PAYMENT,
  MANAGER_PERMISSIONS.VIEW_REPORTS,
  MANAGER_PERMISSIONS.EXPORT_REPORTS,
  MANAGER_PERMISSIONS.VIEW_ACTIVITY_LOGS,
  MANAGER_PERMISSIONS.VIEW_USER_MONITORING,
  MANAGER_PERMISSIONS.MANAGE_SHIFTS,
  MANAGER_PERMISSIONS.OPEN_SHIFT,
  MANAGER_PERMISSIONS.CLOSE_SHIFT,
  MANAGER_PERMISSIONS.CASH_RECEIVE,
  MANAGER_PERMISSIONS.CASH_HANDOVER,
  MANAGER_PERMISSIONS.RECONCILE_CASH,
  MANAGER_PERMISSIONS.VIEW_APPROVALS,
  MANAGER_PERMISSIONS.PROCESS_APPROVALS,
];

// ============================================
// BILL FILTERS (for Manager Bills page)
// ============================================
export const BILL_FILTERS = {
  ALL: 'all',
  DRAFT: 'draft',
  COMPLETED: 'completed',
  PAID: 'paid',
  CREDIT: 'credit',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
  RETURNED: 'returned',
  DELETED: 'deleted',
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
};

export const BILL_FILTER_LABELS = {
  [BILL_FILTERS.ALL]: 'All Bills',
  [BILL_FILTERS.DRAFT]: 'Drafts',
  [BILL_FILTERS.COMPLETED]: 'Completed',
  [BILL_FILTERS.PAID]: 'Paid',
  [BILL_FILTERS.CREDIT]: 'Credit',
  [BILL_FILTERS.PARTIAL]: 'Partial Payment',
  [BILL_FILTERS.UNPAID]: 'Unpaid',
  [BILL_FILTERS.RETURNED]: 'Returned',
  [BILL_FILTERS.DELETED]: 'Deleted',
  [BILL_FILTERS.TODAY]: "Today's Bills",
  [BILL_FILTERS.THIS_WEEK]: 'This Week',
  [BILL_FILTERS.THIS_MONTH]: 'This Month',
};

// ============================================
// ACTIVITY LOG ACTIONS (Manager Module)
// ============================================
export const ACTIVITY_ACTIONS = {
  // Auth
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',

  // Bills
  BILL_CREATED: 'BILL_CREATED',
  BILL_UPDATED: 'BILL_UPDATED',
  BILL_DELETED: 'BILL_DELETED',
  BILL_RESTORED: 'BILL_RESTORED',
  BILL_VOIDED: 'BILL_VOIDED',

  // Payments
  PAYMENT_COLLECTED: 'PAYMENT_COLLECTED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',

  // Customers
  CUSTOMER_ADDED: 'CUSTOMER_ADDED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_DELETED: 'CUSTOMER_DELETED',

  // Expenses
  EXPENSE_ADDED: 'EXPENSE_ADDED',
  EXPENSE_APPROVED: 'EXPENSE_APPROVED',
  EXPENSE_REJECTED: 'EXPENSE_REJECTED',
  EXPENSE_DELETED: 'EXPENSE_DELETED',

  // Returns
  RETURN_CREATED: 'RETURN_CREATED',
  RETURN_APPROVED: 'RETURN_APPROVED',
  RETURN_REJECTED: 'RETURN_REJECTED',

  // Cash
  CASH_TX_CREATED: 'CASH_TX_CREATED',
  CASH_TX_RECONCILED: 'CASH_TX_RECONCILED',
  COMMISSION_PAID: 'COMMISSION_PAID',

  // Shifts
  SHIFT_OPENED: 'SHIFT_OPENED',
  SHIFT_CLOSED: 'SHIFT_CLOSED',

  // Discounts
  DISCOUNT_APPROVED: 'DISCOUNT_APPROVED',
  DISCOUNT_REJECTED: 'DISCOUNT_REJECTED',

  // Salespersons
  SALESPERSON_ADDED: 'SALESPERSON_ADDED',
  SALESPERSON_UPDATED: 'SALESPERSON_UPDATED',
  COMMISSION_RATE_CHANGED: 'COMMISSION_RATE_CHANGED',
};

// ============================================
// SHIFT TYPES
// ============================================
export const SHIFT_TYPES = {
  morning: 'morning',
  evening: 'evening',
  night: 'night',
  full_day: 'full_day',
};

export const SHIFT_TYPE_LABELS = {
  [SHIFT_TYPES.morning]: 'Morning Shift',
  [SHIFT_TYPES.evening]: 'Evening Shift',
  [SHIFT_TYPES.night]: 'Night Shift',
  [SHIFT_TYPES.full_day]: 'Full Day',
};

// ============================================
// DATE RANGE PRESETS (Manager Reports)
// ============================================
export const DATE_PRESETS = {
  today: 'today',
  yesterday: 'yesterday',
  last7days: 'last7days',
  last30days: 'last30days',
  thisMonth: 'thisMonth',
  lastMonth: 'lastMonth',
  thisYear: 'thisYear',
  custom: 'custom',
};

export const DATE_PRESET_LABELS = {
  [DATE_PRESETS.today]: 'Today',
  [DATE_PRESETS.yesterday]: 'Yesterday',
  [DATE_PRESETS.last7days]: 'Last 7 Days',
  [DATE_PRESETS.last30days]: 'Last 30 Days',
  [DATE_PRESETS.thisMonth]: 'This Month',
  [DATE_PRESETS.lastMonth]: 'Last Month',
  [DATE_PRESETS.thisYear]: 'This Year',
  [DATE_PRESETS.custom]: 'Custom Range',
};

// ============================================
// EXPORT FORMATS
// ============================================
export const EXPORT_FORMATS = {
  CSV: 'csv',
  EXCEL: 'excel',
  PDF: 'pdf',
  JSON: 'json',
};

export const EXPORT_FORMAT_LABELS = {
  [EXPORT_FORMATS.CSV]: 'CSV File',
  [EXPORT_FORMATS.EXCEL]: 'Excel (.xlsx)',
  [EXPORT_FORMATS.PDF]: 'PDF Document',
  [EXPORT_FORMATS.JSON]: 'JSON Data',
};

// ============================================
// PAGINATION DEFAULTS
// ============================================
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100, 200],
  VIRTUAL_THRESHOLD: 100,
  MAX_ROWS_EXPORT: 50000,
};

// ============================================
// HOTKEYS
// ============================================
export const HOTKEYS = {
  BILLER: {
    NEW_BILL: 'Insert',
    HELP: 'F1',
    ADD_ITEM: 'F2',
    FOCUS_PRODUCT: 'F3',
    FOCUS_PRICE: 'F4',
    FOCUS_QTY: 'F5',
    FOCUS_DISCOUNT: 'F6',
    CUSTOMER_DIALOG: 'F7',
    CHECKOUT: 'F8',
    SAVE_DRAFT: 'F9',
    HOLD_BILL: 'F10',
    REPRINT_LAST: 'F11',
    CLOSE: 'Escape',
    FOCUS_PHONE: 'Home',
    CLEAR_BILL: 'Delete',
    DELETE_LAST: 'Minus',
    FOCUS_QTY_ALT: 'NumpadAdd',
    FOCUS_DISCOUNT_ALT: 'NumpadDivide',
    ADD_ITEM_ALT: 'NumpadEnter',
    ADD_ITEM_ENTER: 'Enter',
    NAV_UP: 'ArrowUp',
    NAV_DOWN: 'ArrowDown',
    JUMP_UP: 'PageUp',
    JUMP_DOWN: 'PageDown',
    TOGGLE_SOUND: 'Ctrl+M',
    NEW_TAB_N: 'Ctrl+N',
    NEW_TAB_T: 'Ctrl+T',
    CLOSE_TAB: 'Ctrl+W',
    SAVE_DRAFT_S: 'Ctrl+S',
    RETURN_REFUND: 'Ctrl+R',
    SWITCH_TAB_1: 'Ctrl+1',
    SWITCH_TAB_2: 'Ctrl+2',
    SWITCH_TAB_3: 'Ctrl+3',
    SWITCH_TAB_4: 'Ctrl+4',
    SWITCH_TAB_5: 'Ctrl+5',
    CLEAR_CUSTOMER: 'Ctrl+Shift+C',
    TOGGLE_BILL_DISCOUNT: 'Ctrl+Shift+D',
    TOGGLE_SPEECH: 'Ctrl+Shift+V',
    TOGGLE_SPEECH_LANG: 'Ctrl+Shift+L',
    CLOSE_CURRENT_TAB: 'Ctrl+Shift+X',
    CLEAR_CACHE: 'Ctrl+Shift+Delete',
    SHOW_HELP: '?',
  },
  SUPER_ADMIN: {
    NEW: 'Ctrl+N',
    EXPORT: 'Ctrl+E',
    SEARCH: 'Ctrl+F',
    HELP: 'F1',
    REFRESH: 'F5',
    SAVE_SETTINGS: 'F9',
    CLOSE: 'Escape',
    NAV_UP: 'ArrowUp',
    NAV_DOWN: 'ArrowDown',
    SELECT: 'Enter',
    SAVE_FORM: 'Ctrl+S',
  },
  MANAGER: {
    HELP: 'F1',
    REFRESH: 'F5',
    SEARCH: 'Ctrl+F',
    EXPORT: 'Ctrl+E',
    NEW_EXPENSE: 'Ctrl+Shift+E',
    NEW_CUSTOMER: 'Ctrl+Shift+C',
    OPEN_SHIFT: 'Ctrl+Shift+O',
    CLOSE_SHIFT: 'Ctrl+Shift+L',
    APPROVALS: 'Ctrl+Shift+A',
    DASHBOARD: 'Ctrl+1',
    BILLS: 'Ctrl+2',
    CASHFLOW: 'Ctrl+3',
    REPORTS: 'Ctrl+4',
    CLOSE: 'Escape',
  },
};

// ============================================
// NOTIFICATION TYPES
// ============================================
export const NOTIFICATION_TYPES = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
  approval_request: 'approval_request',
  large_bill: 'large_bill',
  low_cash: 'low_cash',
  pending_credit: 'pending_credit',
};

// ============================================
// CURRENCY & FORMATTING
// ============================================
export const CURRENCY = {
  CODE: 'PKR',
  SYMBOL: 'Rs',
  NAME: 'Pakistani Rupee',
  DECIMAL_PLACES: 2,
  LOCALE: 'en-PK',
};

// ============================================
// BRANCH / STORE FILTERS
// ============================================
export const BRANCH_ACCESS_TYPES = {
  ALL: 'all',
  ASSIGNED: 'assigned',
  PRIMARY: 'primary',
  CUSTOM: 'custom',
};

// ============================================
// THRESHOLDS / LIMITS
// ============================================
export const LIMITS = {
  // Bills
  MAX_DISCOUNT_PERCENT: 50,
  MAX_DISCOUNT_AMOUNT: 100000,
  REQUIRES_APPROVAL_AMOUNT: 500000,

  // Cash
  LOW_CASH_THRESHOLD: 5000,
  MAX_CASH_HANDOVER: 1000000,

  // Customer
  DEFAULT_CREDIT_LIMIT: 50000,
  MAX_CREDIT_LIMIT: 1000000,

  // Pagination
  MAX_BILLS_PER_PAGE: 200,
  MAX_SEARCH_RESULTS: 500,

  // Activity logs
  ACTIVITY_LOG_RETENTION_DAYS: 90,
  MAX_ACTIVITY_LOGS_DISPLAY: 1000,
};

// ============================================
// USER STATUS
// ============================================
export const USER_STATUS = {
  active: 'active',
  inactive: 'inactive',
  suspended: 'suspended',
  pending: 'pending',
};

export const USER_STATUS_LABELS = {
  [USER_STATUS.active]: 'Active',
  [USER_STATUS.inactive]: 'Inactive',
  [USER_STATUS.suspended]: 'Suspended',
  [USER_STATUS.pending]: 'Pending Approval',
};

// ============================================
// DEFAULT EXPORT (full constants object)
// ============================================
const constants = {
  ROLES,
  BILL_STATUS,
  SYNC_STATUS,
  SHIFT_STATUS,
  CASH_TX_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  COLLECTION_NAMES,
  APP_ROUTES,
  MANAGER_ROUTES,
  CANCEL_REASONS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_TYPES,
  APPROVAL_TYPE_LABELS,
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  MANAGER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  BILL_FILTERS,
  BILL_FILTER_LABELS,
  ACTIVITY_ACTIONS,
  SHIFT_TYPES,
  SHIFT_TYPE_LABELS,
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABELS,
  PAGINATION,
  HOTKEYS,
  NOTIFICATION_TYPES,
  CURRENCY,
  BRANCH_ACCESS_TYPES,
  LIMITS,
  USER_STATUS,
  USER_STATUS_LABELS,
};

export default constants;