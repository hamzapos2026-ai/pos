/**
 * Single source for enabled payment methods from Super Admin settings.
 * Keys match PaymentMethods.jsx admin page (bankTransfer, creditCard).
 */

const REGISTRY = [
  { key: 'cash', aliases: ['cash'], defaultLabel: 'Cash' },
  { key: 'easypaisa', aliases: ['easypaisa'], defaultLabel: 'EasyPaisa' },
  { key: 'jazzcash', aliases: ['jazzcash'], defaultLabel: 'JazzCash' },
  { key: 'bankTransfer', aliases: ['bankTransfer', 'bank'], defaultLabel: 'Bank Transfer' },
  { key: 'creditCard', aliases: ['creditCard', 'card'], defaultLabel: 'Card' },
];

const readCfg = (pm, key, aliases) => {
  if (pm[key] != null) return pm[key];
  for (const a of aliases) {
    if (pm[a] != null) return pm[a];
  }
  return null;
};

/** All methods with enabled flag from settings (default OFF except explicit ON). */
export const resolvePaymentMethodConfig = (settings) => {
  const pm = settings?.paymentMethods || {};
  return REGISTRY.map((reg) => {
    const cfg = readCfg(pm, reg.key, reg.aliases);
    const enabled = typeof cfg === 'boolean' ? cfg : Boolean(cfg?.enabled);
    const label = typeof cfg === 'object' && cfg?.label ? cfg.label : reg.defaultLabel;
    return { ...reg, label, enabled };
  });
};

/** Only methods toggled ON in /admin/payment-methods */
export const getEnabledPaymentMethods = (settings) => {
  const enabled = resolvePaymentMethodConfig(settings).filter((m) => m.enabled);
  if (enabled.length > 0) return enabled;
  return [{ key: 'cash', aliases: ['cash'], defaultLabel: 'Cash', label: 'Cash', enabled: true }];
};

export const getEnabledPaymentLabels = (settings) =>
  getEnabledPaymentMethods(settings).map((m) => m.label);

/** Match saved order payment string to registry label */
export const normalizePaymentLabel = (raw, settings) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return getEnabledPaymentLabels(settings)[0] || 'Cash';
  const methods = resolvePaymentMethodConfig(settings);
  const hit = methods.find((m) =>
    m.label.toLowerCase() === s
    || m.key.toLowerCase() === s
    || m.aliases.some((a) => a.toLowerCase() === s || s.includes(a.toLowerCase())),
  );
  return hit?.label || raw || 'Cash';
};

export const isPaymentMethodEnabled = (labelOrKey, settings) => {
  const s = String(labelOrKey || '').toLowerCase();
  return getEnabledPaymentMethods(settings).some((m) =>
    m.label.toLowerCase() === s
    || m.key.toLowerCase() === s
    || m.aliases.some((a) => a.toLowerCase() === s),
  );
};
