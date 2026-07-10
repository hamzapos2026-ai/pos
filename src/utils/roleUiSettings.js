/** Cashier Offline Payment modal + PAY OFFLINE button (default ON). */
export const isCashierOfflinePaymentEnabled = (settings) => {
  if (settings?.disableCashierOffline === true) return false;
  const ui = settings?.cashierUI || {};
  if (ui.enableOfflinePayment === false) return false;
  if (ui.enableManualBill === false) return false;
  return true;
};

/** @deprecated alias */
export const isCashierManualBillEnabled = isCashierOfflinePaymentEnabled;

/**
 * Biller offline checkout mode (default ON).
 * ON  = direct checkout offline — no manual Collect modal.
 * OFF = show manual Collect Payment modal when offline.
 */
export const isBillerOfflineDirectCheckout = (settings) =>
  settings?.billFlow?.enableOfflinePayment !== false;

/** @alias */
export const isBillerOfflinePaymentEnabled = isBillerOfflineDirectCheckout;

/** When direct checkout ON — auto-record cash without typing (default ON). */
export const isBillerOfflineAutoCollect = (settings) =>
  settings?.billFlow?.offlineAutoCollect !== false;
