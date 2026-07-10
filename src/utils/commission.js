/**
 * Commission helpers — POS standard:
 * Percent: rate is whole number (1 = 1%, 5 = 5%) → sale × rate ÷ 100
 * Fixed: Rs. per unit × quantity
 */
export function computeCommission({ type = 'percent', rate = 0, pct = 0, fixed = 0, lineTotal = 0, qty = 1 }) {
  const r = Number(rate || 0);
  const p = Number(pct || 0);
  const f = Number(fixed || 0);
  const lt = Math.max(0, Number(lineTotal || 0));
  const q = Math.max(1, Number(qty || 1));

  const t = String(type || 'percent').toLowerCase();

  if (t === 'fixed') {
    const perUnit = f > 0 ? f : (r > 0 ? r : (p > 0 ? p : 0));
    return Math.round(perUnit * q * 100) / 100;
  }

  if (t === 'percent') {
    const pctWhole = p > 0 ? p : (r > 0 ? r : 0);
    if (pctWhole <= 0) return 0;
    return Math.round((lt * pctWhole) / 100 * 100) / 100;
  }

  if (r > 0) return Math.round((lt * r) / 100 * 100) / 100;
  if (f > 0) return Math.round(f * q * 100) / 100;
  return 0;
}
