/**
 * Centered field-validation alerts for biller & cashier.
 * Modern modal style (CenterAlert) instead of corner toasts.
 */

/** @type {((payload: object|null) => void)|null} */
let emit = null;
/** @type {object[]} */
const pending = [];

export const FIELD_ALERT_PRESETS = {
  customerName: {
    variant: 'warning',
    title: 'Customer Name Required',
    message: 'Super Admin has enabled required customer name. Enter the customer name to continue checkout.',
    fieldLabel: 'Customer Name',
    confirmLabel: 'Enter Name',
  },
  customerPhone: {
    variant: 'warning',
    title: 'Phone Number Required',
    message: 'Super Admin has enabled required phone number. Enter a valid customer phone to continue.',
    fieldLabel: 'Phone Number',
    confirmLabel: 'Enter Phone',
  },
  customerPhoneInvalid: {
    variant: 'error',
    title: 'Invalid Phone Number',
    message: 'Use 03XXXXXXXXX or +923XXXXXXXXX format (no 0 after +92).',
    fieldLabel: 'Phone Number',
    confirmLabel: 'Fix Phone',
  },
  customerPhoneDuplicate: {
    variant: 'error',
    title: 'Phone Already Registered',
    message: 'This phone number is already linked to another customer. Use the existing customer or enter a different number.',
    fieldLabel: 'Phone Number',
    confirmLabel: 'Got it',
  },
  price: {
    variant: 'warning',
    title: 'Price Required',
    message: 'Enter a valid item price before adding to the bill.',
    fieldLabel: 'Price',
    confirmLabel: 'Enter Price',
  },
  quantity: {
    variant: 'warning',
    title: 'Quantity Required',
    message: 'Enter item quantity before adding to the bill.',
    fieldLabel: 'Quantity',
    confirmLabel: 'Enter Qty',
  },
  productName: {
    variant: 'warning',
    title: 'Product Name Required',
    message: 'Enter the product name for this line item.',
    fieldLabel: 'Product Name',
    confirmLabel: 'Enter Name',
  },
  salesperson: {
    variant: 'warning',
    title: 'Salesperson Required',
    message: 'Select a salesperson before checkout or adding items.',
    fieldLabel: 'Salesperson',
    confirmLabel: 'Select',
  },
  items: {
    variant: 'warning',
    title: 'Add Items First',
    message: 'Add at least one item to the bill before checkout.',
    fieldLabel: 'Bill Items',
    confirmLabel: 'Got it',
  },
  paymentAmount: {
    variant: 'warning',
    title: 'Amount Required',
    message: 'Enter the payment amount received from the customer.',
    fieldLabel: 'Amount',
    confirmLabel: 'Enter Amount',
  },
  paymentReference: {
    variant: 'warning',
    title: 'Reference Required',
    message: 'Enter the payment reference number for this method.',
    fieldLabel: 'Reference',
    confirmLabel: 'Enter Reference',
  },
  discountReason: {
    variant: 'warning',
    title: 'Discount Reason Required',
    message: 'Super Admin policy requires a reason when applying discount.',
    fieldLabel: 'Discount Reason',
    confirmLabel: 'Add Reason',
  },
  cancelReason: {
    variant: 'warning',
    title: 'Cancel Reason Required',
    message: 'Select or type a reason before cancelling this bill.',
    fieldLabel: 'Cancel Reason',
    confirmLabel: 'Add Reason',
  },
  offlineSerial: {
    variant: 'warning',
    title: 'Bill Serial Required',
    message: 'Enter the bill serial and amount from the printed receipt.',
    fieldLabel: 'Serial / Amount',
    confirmLabel: 'Enter Details',
  },
  insertFirst: {
    variant: 'info',
    title: 'Press INSERT',
    message: 'Press INSERT to unlock and start a new bill.',
    fieldLabel: 'New Bill',
    confirmLabel: 'Got it',
  },
};

export const bindFieldAlertHost = (fn) => {
  emit = fn;
  pending.splice(0).forEach((p) => fn(p));
  return () => {
    if (emit === fn) emit = null;
  };
};

/**
 * @param {string|object} input — preset key or full options
 * @param {object} [overrides]
 */
export const showFieldAlert = (input, overrides = {}) => {
  const base = typeof input === 'string'
    ? (FIELD_ALERT_PRESETS[input] || {})
    : (input || {});

  const payload = {
    open: true,
    key: Date.now(),
    variant: 'warning',
    title: 'Required Field',
    confirmLabel: 'Got it',
    ...base,
    ...overrides,
  };

  if (!payload.message) {
    payload.message = typeof input === 'string'
      ? 'Please fill this field to continue.'
      : 'Please check the required field and try again.';
  }

  if (emit) emit(payload);
  else pending.push(payload);
  return true;
};

/** Map free-text validation to a centered alert. */
export const showValidationAlert = (message, {
  variant = 'warning',
  title = 'Action Required',
  fieldLabel,
  confirmLabel = 'Got it',
} = {}) => showFieldAlert({
  variant,
  title,
  message: String(message || '').trim(),
  fieldLabel,
  confirmLabel,
});
