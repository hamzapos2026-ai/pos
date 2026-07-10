/** Roman Urdu short guides — har Super Admin page ke liye */
export const ADMIN_PAGE_GUIDES = {
  '/admin': 'Yahan se poori shop ka snapshot dekho — users, sales aur system health ek nazar mein.',
  '/admin/users': 'Staff accounts banao, role do (biller/cashier/manager) aur branch assign karo.',
  '/admin/branches': 'Branches add/edit karo — har branch alag bills aur reports ke liye.',
  '/admin/customers': 'Customer list dekho, search karo aur walk-in / registered customers manage karo.',
  '/admin/bills': 'Saari bills live dekho, fraud flag, delete/restore aur payment status control karo.',
  '/admin/cashflow': 'Cash in/out, deposits aur branch cash movement monitor karo.',
  '/admin/reconciliation': 'Cashier payments aur bills match karo — galat payment ya missing bill pakro.',
  '/admin/reports': 'Sales report — bill par click karke poori detail, discount aur payment dekho.',
  '/admin/sp-reports': 'Salesperson commission aur unki performance ki reports.',
  '/admin/audit-logs': 'Kis ne kya action liya — edit, delete, payment sab ka record.',
  '/admin/sync-monitor': 'Online/offline sync status — kaunsi bills abhi sync honi baqi hain.',
  '/admin/devices': 'Registered devices aur POS terminals ki list aur access.',
  '/admin/shop-settings': 'Shop name, address, invoice footer aur basic shop info.',
  '/admin/permissions': 'Har role ko kaunsa module dikhe — bills, reports, settings control.',
  '/admin/backup': 'Data backup lo aur export karo — rozana PC ya cloud par mehfooz karo. Roman Urdu guide page par hai.',
  '/admin/firebase-assistant': 'Firebase quota, warnings, smart backup aur Google Drive guide — Super Admin assistant.',
  '/admin/commission': 'Salesperson commission rules set karo — % ya fixed.',
  '/admin/payment-methods': 'Cash, Card, EasyPaisa waghera enable/disable karo cashier ke liye.',
  '/admin/discounts': 'Biller item discount limit (%) — biller kitna discount de sakta hai.',
  '/admin/biller-summary-discount': 'F8 summary screen par bill discount limit set karo.',
  '/admin/cashier-discounts': 'Cashier extra discount control — branch aur cashier wise Rs / % limit.',
  '/admin/settings/superAdmin': 'Super Admin global settings — fonts, flow aur system defaults.',
  '/admin/settings/biller': 'Biller screen size, UI aur bill flow settings.',
  '/admin/settings/product-catalog': 'Product catalog manage karo — search aur shared catalog items ek dedicated page par.',
  '/admin/settings/cashier': 'Cashier font, row height aur offline payment on/off.',
  '/admin/settings/manager': 'Manager dashboard aur bills view ki settings.',
};

export const getAdminPageGuide = (pathname) => {
  const path = String(pathname || '').replace(/\/$/, '') || '/admin';
  if (ADMIN_PAGE_GUIDES[path]) return ADMIN_PAGE_GUIDES[path];
  if (path.startsWith('/admin/settings/')) {
    const role = path.split('/').pop();
    const map = {
      superAdmin: ADMIN_PAGE_GUIDES['/admin/settings/superAdmin'],
      biller: ADMIN_PAGE_GUIDES['/admin/settings/biller'],
      cashier: ADMIN_PAGE_GUIDES['/admin/settings/cashier'],
      manager: ADMIN_PAGE_GUIDES['/admin/settings/manager'],
    };
    return map[role] || 'Is role ki screen aur behavior ki settings yahan se control hoti hain.';
  }
  return null;
};
