/** Normalize bill serial for comparison */
export const normalizeSerial = (s) => String(s || "").trim().toUpperCase();

/** Canonical key for dedupe — strips # prefix, uppercases, ignores empty/placeholder. */
export const getBillSerialKey = (bill) => {
  const raw = bill?.billSerial || bill?.serialNo || bill?.serial || '';
  const norm = normalizeSerial(raw).replace(/^#+/, '');
  if (!norm || norm === '----') return '';
  return norm;
};

/** Last segment after final dash, e.g. AON-BIL-050626-000030 → 000030 */
export const serialTail = (serial) => {
  const s = normalizeSerial(serial);
  if (!s) return "";
  const parts = s.split("-");
  return parts[parts.length - 1] || s;
};

/** Parse DDMMYY segment from serial → sortable YYYYMMDD number */
const serialDateSortKey = (sixDigits) => {
  const s = String(sixDigits || '').padStart(6, '0');
  const dd = parseInt(s.slice(0, 2), 10) || 0;
  const mm = parseInt(s.slice(2, 4), 10) || 0;
  const yy = parseInt(s.slice(4, 6), 10) || 0;
  return (2000 + yy) * 10000 + mm * 100 + dd;
};

/** Numeric sort key: calendar date (DDMMYY) + serial tail — 090626-000077 > 310526-000026 */
export const serialSortKey = (serial) => {
  const s = normalizeSerial(serial);
  if (!s) return 0;
  const m = s.match(/-(\d{6})-(\d{1,6})(?:-[A-Z])?$/);
  if (m) {
    const dateKey = serialDateSortKey(m[1]);
    const numPart = parseInt(m[2], 10) || 0;
    return dateKey * 1_000_000 + numPart;
  }
  const glued = s.match(/-(\d{6})-(\d+)([A-Z])$/);
  if (glued) {
    const dateKey = serialDateSortKey(glued[1]);
    const numPart = parseInt(glued[2], 10) || 0;
    return dateKey * 1_000_000 + numPart;
  }
  const tail = parseInt(serialTail(s), 10);
  return Number.isFinite(tail) ? tail : 0;
};

export const compareSerialsDesc = (a, b) => serialSortKey(b) - serialSortKey(a);

/**
 * Match user input against full bill serial.
 * Supports: full serial, suffix (000030), or contains.
 */
export const serialMatches = (input, fullSerial) => {
  const q = normalizeSerial(input);
  const s = normalizeSerial(fullSerial);
  if (!q || !s) return false;
  if (s === q) return true;
  if (s.endsWith(q)) return true;
  if (serialTail(s) === q) return true;
  if (q.length >= 3 && s.includes(q)) return true;
  return false;
};

/** Find pending orders matching serial input (exact first, then partial). */
export const findOrdersBySerialInput = (orders, input, { limit = 12 } = {}) => {
  const q = normalizeSerial(input);
  if (!q) return [];

  const exact = [];
  const partial = [];

  for (const o of orders) {
    const serial = normalizeSerial(o.billSerial || o.serialNo || o.id);
    if (!serial) continue;
    if (serial === q) {
      exact.push(o);
      continue;
    }
    if (serialMatches(q, serial)) {
      partial.push(o);
    }
  }

  if (exact.length) return exact.slice(0, limit);
  return partial.slice(0, limit);
};

/** Pick single order when input uniquely identifies one bill. */
export const resolveUniqueSerialMatch = (orders, input) => {
  const matches = findOrdersBySerialInput(orders, input);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const tails = new Set(matches.map((o) => serialTail(o.billSerial || o.serialNo)));
    if (tails.size === 1) return matches[0];
  }
  return null;
};
