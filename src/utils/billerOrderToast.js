/**
 * One toast per bill serial — replaces previous instead of stacking.
 * Priority: paid > sent > synced (offline catch-up only).
 */
import { toast } from 'react-hot-toast';
import { normalizeSerial } from './serialMatch';
import { showValidationAlert, showFieldAlert } from './fieldAlert';

const TOAST_MS = 1600;
const DEDUPE_MS = 12_000;

/** @type {Map<string, { kind: string, at: number }>} */
const recent = new Map();

const PRIORITY = { paid: 3, sent: 2, saved: 2, synced: 1 };

const serialKey = (serial) => normalizeSerial(serial).replace(/^#+/, '');

const fmtAmt = (n) => Number(n || 0).toLocaleString('en-PK');

/**
 * @param {'sent'|'paid'|'synced'|'saved'} kind
 * @param {{ serial?: string, amount?: number, cashierName?: string, offline?: boolean }} opts
 */
export const showBillerBillToast = (kind, { serial, amount, cashierName, offline = false } = {}) => {
  const key = serialKey(serial);
  if (!key) return false;

  const now = Date.now();
  const prev = recent.get(key);
  const toastId = `biller-bill-${key}`;

  if (prev) {
    const age = now - prev.at;
    if (age < DEDUPE_MS) {
      if (PRIORITY[kind] < PRIORITY[prev.kind]) return false;
      if (kind === prev.kind) return false;
      if (kind === 'synced' && (prev.kind === 'sent' || prev.kind === 'paid' || prev.kind === 'saved')) return false;
    }
  }

  recent.set(key, { kind, at: now });

  let message;
  if (kind === 'paid') {
    message = `💰 #${key} paid — ${cashierName || 'Cashier'} · Rs.${fmtAmt(amount)}`;
  } else if (kind === 'sent') {
    message = offline
      ? `📴 #${key} saved offline`
      : `📤 #${key} sent to cashier`;
  } else if (kind === 'saved') {
    message = `✅ #${key} saved`;
  } else if (kind === 'synced') {
    message = `☁️ #${key} synced`;
  } else {
    return false;
  }

  toast.dismiss(toastId);
  toast.success(message, { id: toastId, duration: TOAST_MS });
  return true;
};

/** Session guard for Firebase listener re-fires (Top5 refresh). */
export const wasBillerBillToastShown = (serial, kind) => {
  const key = serialKey(serial);
  if (!key) return false;
  const prev = recent.get(key);
  return Boolean(prev && prev.kind === kind && Date.now() - prev.at < DEDUPE_MS);
};

const MSG_TOAST_MS = 1400;
const MSG_DEDUPE_MS = 2200;
/** @type {Map<string, number>} */
const msgRecent = new Map();

const msgToastId = (text) =>
  `biller-msg-${String(text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72)}`;

/** Map common biller messages to styled field presets. */
const BILLER_MSG_PRESETS = {
  'valid price required.': 'price',
  'enter quantity first.': 'quantity',
  'product name required.': 'productName',
  'select a salesperson first.': 'salesperson',
  'select a salesperson.': 'salesperson',
  'add at least one item.': 'items',
  'add items first.': 'items',
  'press insert first.': 'insertFirst',
  'press insert to start.': 'insertFirst',
};

/** Deduped biller UI toast — validation uses centered field alert. */
export const showBillerToast = (text, type = 'warning', { duration = MSG_TOAST_MS, dedupeMs = MSG_DEDUPE_MS } = {}) => {
  const msg = String(text || '').trim();
  if (!msg) return false;

  const id = msgToastId(msg);
  const now = Date.now();
  const prev = msgRecent.get(id);
  if (prev && now - prev < dedupeMs) return false;
  msgRecent.set(id, now);

  if (type === 'success') {
    toast.dismiss(id);
    toast.success(msg, { id, duration });
    return true;
  }

  const presetKey = BILLER_MSG_PRESETS[msg.toLowerCase()];
  if (presetKey) {
    return showFieldAlert(presetKey, { message: msg });
  }

  return showValidationAlert(msg, {
    variant: type === 'error' ? 'error' : 'warning',
    title: type === 'error' ? 'Cannot Continue' : 'Please Check',
    confirmLabel: 'Got it',
  });
};
