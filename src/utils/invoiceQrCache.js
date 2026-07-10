// src/utils/invoiceQrCache.js
// Shared in-memory QR cache — instant load on invoice open (biller, cashier, admin, manager).
// Offline-safe: uses local qrcode library only.

import QRCode from 'qrcode';
import { encodeQRData } from '../services/qrHashService';
import { getInvoiceQrSerial, getOrderDisplayTotal } from './invoiceUtils';

const _cache = new Map();
const _inflight = new Map();

export const buildInvoiceQrKey = (serialNo, totalAmount) => {
  const serial = String(serialNo || '').trim().toUpperCase();
  const amt = Number(totalAmount) || 0;
  return `${serial}:${amt}`;
};

/** Synchronous read — returns cached data-URL or empty string. */
export const getCachedInvoiceQr = (serialNo, totalAmount) => {
  const key = buildInvoiceQrKey(serialNo, totalAmount);
  return _cache.get(key) || '';
};

const _generateQrDataUrl = async (serialNo, totalAmount) => {
  const serial = String(serialNo || '').trim().toUpperCase();
  const qrSerial = getInvoiceQrSerial(serial);
  if (!qrSerial) return '';

  let qrPayload = qrSerial;
  try {
    qrPayload = encodeQRData(serial.toUpperCase(), totalAmount);
  } catch {
    qrPayload = qrSerial;
  }

  // Short serial first — most reliable; full JSON hash payload as fallback for cashier scan.
  const payloads = [...new Set([qrSerial, qrPayload].filter(Boolean))];

  for (const text of payloads) {
    for (const level of ['L', 'M']) {
      try {
        const url = await QRCode.toDataURL(text, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: level,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        if (url && url.startsWith('data:image')) return url;
      } catch (err) {
        console.warn('[invoiceQr] generate failed:', text?.slice?.(0, 40), err?.message || err);
      }
    }
  }
  return '';
};

/**
 * Generate (or return cached) invoice QR data-URL.
 * Deduplicates concurrent requests for the same bill.
 */
export const generateInvoiceQr = async (serialNo, totalAmount) => {
  const serial = String(serialNo || '').trim();
  if (!serial || serial === '----') return '';

  const key = buildInvoiceQrKey(serial, totalAmount);
  const cached = _cache.get(key);
  if (cached) return cached;

  if (_inflight.has(key)) return _inflight.get(key);

  const promise = _generateQrDataUrl(serial, totalAmount)
    .then((url) => {
      if (url) _cache.set(key, url);
      return url;
    })
    .finally(() => {
      _inflight.delete(key);
    });

  _inflight.set(key, promise);
  return promise;
};

/** Block until QR data-URL is ready (uses cache / deduped inflight). */
export const ensureInvoiceQr = (serialNo, totalAmount) =>
  generateInvoiceQr(serialNo, totalAmount);

/** Pre-warm QR before opening invoice modal — call as early as possible. */
export const warmInvoiceQr = (order) => {
  if (!order) return Promise.resolve('');
  const serial = order.serialNo || order.billSerial || order.billNo || '';
  const total = getOrderDisplayTotal(order);
  return generateInvoiceQr(serial, total);
};

/** Clear cache entry when bill total changes (edited bills). */
export const invalidateInvoiceQr = (serialNo, totalAmount) => {
  _cache.delete(buildInvoiceQrKey(serialNo, totalAmount));
};
