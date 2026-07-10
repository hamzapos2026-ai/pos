/** Roman Urdu — Permissions page short working descriptions */

export const PERM_HINTS = {
  dualMode: 'ON = biller par Dual/Cashier button khulega, khud payment le sakta hai. OFF = sirf cashier ko bhejega.',
  commissionLink: 'Commission system ON/OFF, agents, rates — sirf Finance → Commission page se.',
  settingsLink: 'Font, Product Name, Discount, Offline — Admin → Settings → Super Admin.',
  liveSync: 'Toggle turant sab PCs par apply — reload ki zaroorat nahi.',
  commissionView: 'Manager Salespersons page dekh sakta hai.',
  commissionEdit: 'Commission amount change kar sakta hai.',
  commissionDelete: 'Pending commission reset kar sakta hai.',
  commissionApprove: 'Commission pay / approve kar sakta hai.',
  commissionExport: 'Excel/PDF download kar sakta hai.',
  activityView: 'Activity Logs page khulegi (/manager/activity).',
  activityExport: 'Logs CSV download button enable hoga.',
  billerNote: 'Biller ki UI (font, product name, discount) Settings → Biller ya Super Admin se control hoti hai.',
};

export const WIRED_FEATURES = ['commission', 'activityLogs'];

export const FEATURES_BY_ROLE = {
  manager: ['commission', 'activityLogs'],
  cashier: ['activityLogs'],
  biller: [],
};

export const FEATURE_HINTS = {
  commission: 'Manager → Salespersons page. View, edit amount, pay, reset, export.',
  activityLogs: 'Login, bills, payment, cancel — poori activity history.',
};

export const ACTION_HINTS = {
  commission: {
    view: 'commissionView',
    edit: 'commissionEdit',
    delete: 'commissionDelete',
    approve: 'commissionApprove',
    export: 'commissionExport',
  },
  activityLogs: {
    view: 'activityView',
    export: 'activityExport',
  },
};
