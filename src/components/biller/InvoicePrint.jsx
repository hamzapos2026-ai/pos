// src/components/biller/InvoicePrint.jsx
// ✅ MASTER ARCHITECTURE v7 — PRODUCTION READY
// ✅ FIXED: Summary row gap between label & value
// ✅ FIXED: Grand Total alignment (label left, value right with proper spacing)
// ✅ FIXED: Font sizes balanced, darker colors
// ✅ FIXED: 200+ items auto-fit single page (thermal)
// ✅ FIXED: All alignment issues across thermal/A4/A5

import {
  useRef, useEffect, useLayoutEffect, useCallback,
  useState, memo, useMemo,
} from "react";
import { motion } from "framer-motion";
import { Printer, X, FileText, Smartphone, Maximize2, Check, RefreshCw, AlertCircle } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../hooks/useLanguage";
import { useSettings } from "../../context/SettingsContext";
import { resolveInvoiceBadges } from "../../utils/billChannelUtils";
import { cn } from "../../utils/cn";
import {
  getInvoiceQrSerial,
  formatInvoiceCustomerLine,
  isGenericWalkInName,
  getItemQtyLess,
  getItemFraqLessAmount,
  getItemDisplayUnitPrice,
  getItemLineTotal,
  getItemDiscAmt,
  getOrderFraqLessTotal,
  getOrderDisplayTotal,
  getOrderSignedQtyTotal,
  hasNegativeQtyInvoice,
  hasDisplayProductName,
} from "../../utils/invoiceUtils";
import { encodeQRData } from "../../services/qrHashService";
import { generateInvoiceQr, getCachedInvoiceQr, ensureInvoiceQr, warmInvoiceQr } from "../../utils/invoiceQrCache";
import { resolveCustomerName, normalizePhone } from "../../utils/customerUtils";

/** Modern invoice typography — black ink, hierarchy (not all bold) */
const C = { ink: "#000", border: "#000", borderSoft: "#d4d4d4", bg: "#fff" };
const T = {
  body: { color: C.ink, fontWeight: 400 },
  med: { color: C.ink, fontWeight: 500 },
  semi: { color: C.ink, fontWeight: 600 },
  bold: { color: C.ink, fontWeight: 700 },
  label: { color: C.ink, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.55px" },
  meta: { color: C.ink, fontWeight: 400 },
  mono: { fontFamily: "'SF Mono', 'Consolas', 'Courier New', monospace" },
};

const _closedSessions = new Set();
let _activePrintWin = null;
const DIRECT_PRINT_CLOSE_MS = 400;
const CHECKOUT_PRINT_CLOSE_MS = 350;
const DIRECT_QR_WAIT_MS = 60;
const DIRECT_IMAGE_WAIT_MS = 80;

const _markClosed = (key) => { if (!key) return; _closedSessions.add(key); setTimeout(() => _closedSessions.delete(key), 30_000); };

const waitForPrintDom = async (nodeRef, maxFrames = 40) => {
  for (let i = 0; i < maxFrames; i += 1) {
    if (nodeRef.current?.innerHTML?.trim()) return true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return Boolean(nodeRef.current);
};
const _closeActivePrintWin = () => { try { _activePrintWin?.close?.(); } catch {} _activePrintWin = null; };
export const closeActivePrintWindow = () => _closeActivePrintWin();

// ═══════════════════════════════════════════════════════════════
// § 1. CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PAPER_SIZES = [
  { id: "thermal", label: "Thermal", icon: Smartphone, hint: "Alt+1", width: "72mm", maxWidth: "72mm", previewMax: "280px", font: "'Courier New',Courier,monospace" },
  { id: "a4", label: "A4", icon: Maximize2, hint: "Alt+2", width: "100%", maxWidth: "210mm", previewMax: "380px", font: "'Segoe UI',Arial,sans-serif" },
  { id: "a5", label: "A5", icon: FileText, hint: "Alt+3", width: "100%", maxWidth: "148mm", previewMax: "320px", font: "'Segoe UI',Arial,sans-serif" },
];

const SYNC_STATUS_CONFIG = {
  synced: { label: "Synced", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Check },
  pending: { label: "Pending", color: "text-yellow-500", bg: "bg-yellow-500/10", icon: RefreshCw },
  failed: { label: "Sync Failed", color: "text-red-500", bg: "bg-red-500/10", icon: AlertCircle },
  syncing: { label: "Syncing…", color: "text-blue-400", bg: "bg-blue-500/10", icon: RefreshCw },
};

// ═══════════════════════════════════════════════════════════════
// § 2. UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const fmtTime = (d) => {
  if (!d) return "—";
  const dd = d instanceof Date ? d : new Date(d?.seconds ? d.seconds * 1000 : d);
  return isNaN(dd) ? "—" : dd.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
};

const resolveDate = (createdAt) => {
  if (!createdAt) return new Date();
  if (createdAt instanceof Date) return isNaN(createdAt) ? new Date() : createdAt;
  if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
  const d = new Date(createdAt);
  return isNaN(d) ? new Date() : d;
};

const truncName = (raw = "", maxLen = 20) => {
  const clean = raw.startsWith("Item - ITEM-") ? raw.replace(/^Item - ITEM-[0-9]+-[0-9]+-?/, "").trim() : raw;
  return (clean || "Item").length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
};

const numberToWords = (num) => {
  if (!num || num === 0) return "Zero Rupees Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const toWords = (n) => {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "") + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + toWords(n % 100);
    if (n < 100000) return toWords(Math.floor(n / 1000)) + "Thousand " + toWords(n % 1000);
    if (n < 10000000) return toWords(Math.floor(n / 100000)) + "Lakh " + toWords(n % 100000);
    return toWords(Math.floor(n / 10000000)) + "Crore " + toWords(n % 10000000);
  };
  const intPart = Math.floor(Math.abs(num));
  const paisaPart = Math.round((Math.abs(num) - intPart) * 100);
  let result = toWords(intPart).trim() + " Rupees";
  if (paisaPart > 0) result += " and " + toWords(paisaPart).trim() + " Paisa";
  return result + " Only";
};

// ═══════════════════════════════════════════════════════════════
// § 2.1 RESPONSIVE LAYOUT ENGINE (v7 — supports 200+ items)
// ═══════════════════════════════════════════════════════════════

const computeReceiptLayout = ({ paperSize, itemCount = 0, showDiscCol = false, showProductCol = false, hasQr = true, fontScale = 1 }) => {
  const isThermal = paperSize === "thermal";
  const isA5 = paperSize === "a5";
  const n = Math.max(Number(itemCount) || 0, 1);
  const fs = Math.max(0.85, Math.min(1.25, Number(fontScale) || 1));

  const pct = (weights) => {
    const sum = weights.reduce((s, w) => s + w.n, 0);
    const out = {};
    weights.forEach((w) => { out[w.k] = `${((w.n / sum) * 100).toFixed(1)}%`; });
    return out;
  };

  const buildCols = (withDisc) => {
    if (!showProductCol) {
      if (withDisc) {
        return pct([
          { k: "hash", n: 1 },
          { k: "price", n: 2 },
          { k: "disc", n: 1.5 },
          { k: "qty", n: 2 },
          { k: "total", n: 2 },
        ]);
      }
      return pct([
        { k: "hash", n: 1 },
        { k: "price", n: 2 },
        { k: "qty", n: 2 },
        { k: "total", n: 2 },
      ]);
    }
    if (withDisc) {
      return pct([
        { k: "hash", n: 1 },
        { k: "product", n: 2.6 },
        { k: "price", n: 2 },
        { k: "disc", n: 1.5 },
        { k: "qty", n: 2 },
        { k: "total", n: 2 },
      ]);
    }
    return pct([
      { k: "hash", n: 1 },
      { k: "product", n: 2.6 },
      { k: "price", n: 2 },
      { k: "qty", n: 2 },
      { k: "total", n: 2 },
    ]);
  };
  const minCols = showProductCol
    ? pct([
      { k: "hash", n: 1 },
      { k: "product", n: 2.6 },
      { k: "qty", n: 2 },
      { k: "rate", n: 2 },
      { k: "total", n: 2 },
    ])
    : pct([
      { k: "hash", n: 1 },
      { k: "qty", n: 2 },
      { k: "rate", n: 2 },
      { k: "total", n: 2 },
    ]);

  // ── A4 ──
  if (!isThermal && !isA5) {
    return {
      isThermal: false, isA5: false, scale: 1,
      storeName: `${Math.round(28 * fs)}px`,
      storeTagline: `${Math.round(14 * fs)}px`,
      storeDetail: `${Math.round(12 * fs)}px`,
      thSize: `${Math.round(13 * fs)}px`,
      tdSize: `${Math.round(12.5 * fs)}px`,
      bodySize: `${Math.round(13 * fs)}px`,
      smSize: `${Math.round(11.5 * fs)}px`,
      xsSize: `${Math.round(10 * fs)}px`,
      mdSize: `${Math.round(13 * fs)}px`,
      summaryLabel: `${Math.round(12 * fs)}px`,
      summaryValue: `${Math.round(13 * fs)}px`,
      grandLabel: `${Math.round(14 * fs)}px`,
      grandSize: `${Math.round(24 * fs)}px`,
      serialSize: `10px`,
      metaSize: `${Math.round(14 * fs)}px`,
      qrDim: 120,
      thPad: "8px 10px",
      rowPad: "6px 10px",
      marginTight: "5px 0",
      sectionGap: "10px",
      summaryGap: "20px",
      cols: buildCols(showDiscCol),
      minCols,
    };
  }

  // ── A5 ──
  if (isA5) {
    return {
      isThermal: false, isA5: true, scale: 1,
      storeName: `${Math.round(22 * fs)}px`,
      storeTagline: `${Math.round(12 * fs)}px`,
      storeDetail: `${Math.round(11 * fs)}px`,
      thSize: `${Math.round(12 * fs)}px`,
      tdSize: `${Math.round(11.5 * fs)}px`,
      bodySize: `${Math.round(12 * fs)}px`,
      smSize: `${Math.round(11 * fs)}px`,
      xsSize: `${Math.round(10 * fs)}px`,
      mdSize: `${Math.round(12 * fs)}px`,
      summaryLabel: `${Math.round(11.5 * fs)}px`,
      summaryValue: `${Math.round(12 * fs)}px`,
      grandLabel: `${Math.round(13 * fs)}px`,
      grandSize: `${Math.round(22 * fs)}px`,
      serialSize: `10px`,
      metaSize: `${Math.round(13 * fs)}px`,
      qrDim: 100,
      thPad: "6px 8px",
      rowPad: "5px 8px",
      marginTight: "4px 0",
      sectionGap: "8px",
      summaryGap: "16px",
      cols: buildCols(showDiscCol),
      minCols,
    };
  }

  // ── Thermal — 4-tier + xxl for 200+ items ──
  let tier = "normal";
  if (n > 100) tier = "xxl";
  else if (n > 50) tier = "xl";
  else if (n > 20) tier = "lg";
  else if (n > 10) tier = "md";

  const tierMap = {
    normal: { td: 13, th: 12, body: 13, sm: 12, xs: 11, md: 13, meta: 12, sumL: 12, sumV: 13, grL: 12, grand: 19, store: 17, serial: 10, qr: 88, pad: "2px 2px", margin: "3px 0", sGap: "5px", sumGap: "10px" },
    md:     { td: 14, th: 13, body: 14, sm: 13, xs: 13, md: 15, meta: 15, sumL: 14, sumV: 15, grL: 14, grand: 18, store: 20, serial: 10, qr: 96, pad: "2px 2px", margin: "2px 0", sGap: "4px", sumGap: "10px" },
    lg:     { td: 13, th: 12, body: 13, sm: 12, xs: 12, md: 14, meta: 14, sumL: 13, sumV: 14, grL: 13, grand: 17, store: 18, serial: 10, qr: 88, pad: "2px 2px", margin: "2px 0", sGap: "3px", sumGap: "8px" },
    xl:     { td: 12, th: 11, body: 12, sm: 11, xs: 11, md: 13, meta: 13, sumL: 12, sumV: 13, grL: 12, grand: 16, store: 17, serial: 10, qr: 80, pad: "1px 2px", margin: "1px 0", sGap: "3px", sumGap: "6px" },
    xxl:    { td: 11, th: 10, body: 11, sm: 10, xs: 10, md: 12, meta: 12, sumL: 11, sumV: 12, grL: 11, grand: 15, store: 16, serial: 10, qr: 72, pad: "1px 1px", margin: "1px 0", sGap: "2px", sumGap: "5px" },
  };
  const t = tierMap[tier];
  const tMin = (v, floor = 10) => `${Math.max(v * fs, floor).toFixed(1)}px`;

  const cols = buildCols(showDiscCol);

  return {
    isThermal: true, isA5: false, scale: 1, tier,
    storeName: tMin(t.store, 20),
    storeTagline: tMin(t.sm, 15),
    storeDetail: tMin(t.xs, 15),
    thSize: tMin(t.th, 15),
    tdSize: tMin(t.td, 15),
    bodySize: tMin(t.body, 16),
    smSize: tMin(t.sm, 15),
    xsSize: tMin(t.xs, 15),
    mdSize: tMin(t.md, 12),
    metaSize: tMin(t.meta, 11),
    summaryLabel: tMin(t.sumL, 11),
    summaryValue: tMin(t.sumV, 12),
    grandLabel: tMin(t.grL, 12),
    grandSize: tMin(t.grand, 18),
    serialSize: tMin(t.serial, 17),
    qrDim: Math.round(t.qr * fs),
    thPad: t.pad,
    rowPad: t.pad,
    marginTight: t.margin,
    sectionGap: t.sGap,
    summaryGap: t.sumGap,
    cols,
    minCols,
  };
};

// ═══════════════════════════════════════════════════════════════
// § 3. CSS — Improved alignment + darker colors
// ═══════════════════════════════════════════════════════════════

const PRINT_CLARITY_CSS = `
  html, body, .receipt-root {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
    text-shadow: none !important;
    color: #000 !important;
  }
  @media print {
    html, body, .receipt-root {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      filter: none !important;
      opacity: 1 !important;
    }
  }
`;

const THERMAL_FONT_STACK = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const THERMAL_MONO_STACK = "'Consolas', 'Courier New', Courier, monospace";

const SHARED_RECEIPT_CSS = `
  ${PRINT_CLARITY_CSS}
  .receipt-root { width: 100%; margin: 0 auto; page-break-inside: avoid; break-inside: avoid; color: #000; font-weight: 400; }
  .inv-frame { border: 1.5px dashed #000; background: #fff; }
  .inv-section { padding: 0; }
  .inv-rule { border: none; border-top: 1px dashed #999; margin: 6px 0; }
  .inv-rule-soft { border: none; border-top: 1px dashed #bbb; margin: 5px 0; }
  .inv-rule-strong { border: none; border-top: 2px dashed #000; margin: 7px 0; }
  .inv-pill { display: inline-block; border: none; border-radius: 4px; padding: 4px 10px; }
  .inv-box { border: 1px dashed #000; border-radius: 4px; padding: 6px 8px; background: #fff; }
  table.invoice-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1.5px dashed #000; }
  table.invoice-table th,
  table.invoice-table td { font-weight: 400; border-bottom: 1px dashed #bbb; vertical-align: middle; padding: 2px 4px !important; box-sizing: border-box; }
  table.invoice-table th { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 0.88em; background: #fff; border-bottom: 1.5px dashed #000; }
  table.invoice-table tbody tr:last-child td { border-bottom: 1.5px dashed #000; }
  table.invoice-table .col-hash { text-align: center !important; overflow: hidden; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.invoice-table td.col-hash, table.invoice-table th.col-hash { overflow: hidden; }
  table.invoice-table .col-product { text-align: left !important; white-space: nowrap; }
  table.invoice-table th.col-product { overflow: visible; text-overflow: clip; font-size: 0.88em; }
  table.invoice-table td.col-product { overflow: hidden; text-overflow: ellipsis; max-width: 0; }
  table.invoice-table .col-price,
  table.invoice-table .col-rate,
  table.invoice-table .col-disc,
  table.invoice-table .col-qty,
  table.invoice-table .col-total { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.invoice-table td.col-total { font-weight: 600; }
  .summary-row { display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 12px; padding: 3px 0; }
  .summary-row .lbl { text-align: left; color: #000; flex: 0 0 auto; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; font-size: 0.92em; }
  .summary-row .val { text-align: right; font-weight: 600; white-space: nowrap; color: #000; flex: 1 1 auto; font-variant-numeric: tabular-nums; }
  .inv-grand { border: 2px dashed #000; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #fff; }
  .inv-grand .gt-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .inv-grand .inv-grand-value { font-weight: 700; font-variant-numeric: tabular-nums; }
  .bottom-zone { width: 100%; text-align: center; }
  .qr-block { width: 100%; text-align: center; padding: 6px 0; }
  .qr-block img, .qr-block [data-invoice-qr-ph] { display: block; margin: 0 auto; border: 1px dashed #000; border-radius: 4px; padding: 4px; background: #fff; }
  .footer-block { width: 100%; text-align: center; padding: 6px 2px; line-height: 1.45; color: #000; font-weight: 400; }
  .serial-box { font-family: ${THERMAL_MONO_STACK}; font-weight: 700; letter-spacing: 0.5px; white-space: nowrap; overflow-x: visible; overflow-y: hidden; text-overflow: clip; max-width: none; display: inline-block; }
  .reprint-badge { font-size: 11px; background: #000; color: #fff; display: inline-block; padding: 2px 8px; border-radius: 3px; margin: 4px auto; font-weight: 600; letter-spacing: 0.8px; }
  .dual-mode-badge { font-size: 10px; background: #7c3aed; color: #fff; display: inline-block; padding: 2px 8px; border-radius: 3px; margin: 4px auto 2px; font-weight: 700; letter-spacing: 0.6px; }
  .offline-badge { font-size: 10px; background: #b45309; color: #fff; display: inline-block; padding: 2px 8px; border-radius: 3px; margin: 4px auto 2px; font-weight: 700; letter-spacing: 0.6px; }
  .offline-meta { font-size: 9px; color: #92400e; text-align: center; line-height: 1.35; margin-top: 2px; }
  .offline-meta span { display: block; }
  .invoice-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px; }
  .watermark { position: fixed; top: 35%; left: 5%; opacity: 0.05; font-size: 36px; font-weight: 700; transform: rotate(-28deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
`;

const THERMAL_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; color: #000; }
  html, body { font-family: ${THERMAL_FONT_STACK}; font-size: 13px; font-weight: 400; color: #000; background: #fff; width: 72mm; max-width: 72mm; margin: 0 auto; padding: 2mm; line-height: 1.45; overflow-x: hidden; word-wrap: break-word; }
  ${SHARED_RECEIPT_CSS}
  .receipt-root { max-width: 72mm; padding: 6px 5px; }
  table.invoice-table th, table.invoice-table td { padding: 2px 4px !important; line-height: 1.3; font-size: inherit; }
  table.invoice-table td.col-product { max-width: 0; }
  @media print {
    html, body { width: 72mm; max-width: 72mm; padding: 1mm; }
    @page { margin: 0; size: 80mm auto; }
    .receipt-root { page-break-inside: avoid; width: 72mm; }
    .watermark { position: absolute; }
  }
`;

const A4_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #000; background: #fff; width: 210mm; margin: 0 auto; padding: 12mm; line-height: 1.5; }
  ${SHARED_RECEIPT_CSS}
  .receipt-root { padding: 14px 16px; }
  table.invoice-table th, table.invoice-table td { padding: 8px 10px; }
  .watermark { position: fixed; top: 40%; left: 15%; opacity: 0.05; font-size: 72px; font-weight: 700; transform: rotate(-28deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
  @media print { @page { margin: 10mm; size: A4; } .watermark { position: absolute; } }
`;

const A5_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #000; background: #fff; width: 148mm; margin: 0 auto; padding: 8mm; line-height: 1.45; }
  ${SHARED_RECEIPT_CSS}
  .receipt-root { padding: 10px 12px; }
  table.invoice-table th, table.invoice-table td { padding: 6px 8px; }
  .watermark { position: fixed; top: 38%; left: 10%; opacity: 0.05; font-size: 54px; font-weight: 700; transform: rotate(-28deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
  @media print { @page { margin: 8mm; size: A5; } .watermark { position: absolute; } }
`;

const CSS_MAP = { thermal: THERMAL_CSS, a4: A4_CSS, a5: A5_CSS };

/** Preview/direct-print: inject table CSS (print path uses full CSS_MAP in print window). */
const getReceiptScopedCss = (paperSize) => {
  const pad =
    paperSize === "thermal"
      ? `table.invoice-table th, table.invoice-table td { padding: 2px 4px !important; line-height: 1.3; }
table.invoice-table th.col-product { overflow: visible; text-overflow: clip; }
table.invoice-table td.col-product { max-width: 0; }`
      : paperSize === "a5"
        ? "table.invoice-table th, table.invoice-table td { padding: 6px 8px; }"
        : "table.invoice-table th, table.invoice-table td { padding: 8px 10px; }";
  return `${SHARED_RECEIPT_CSS}\n${pad}`;
};

// ═══════════════════════════════════════════════════════════════
// § 4. SOUND + BROADCAST
// ═══════════════════════════════════════════════════════════════

const playSound = (enabled, type = "print") => {
  if (!enabled) return;
  const paths = { print: "/sounds/print.mp3", open: "/sounds/open.mp3", success: "/sounds/success.mp3" };
  try { const a = new Audio(paths[type] || paths.print); a.volume = 0.65; a.play().catch(() => {}); } catch {}
};

const getPrintChannel = () => { try { return new BroadcastChannel("aone_print_events"); } catch { return null; } };

// ═══════════════════════════════════════════════════════════════
// § 5. SYNC BADGE
// ═══════════════════════════════════════════════════════════════

const SyncBadge = memo(({ status, isDark }) => {
  const cfg = SYNC_STATUS_CONFIG[status] || SYNC_STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const isSpinning = status === "syncing" || status === "pending";
  return (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold", cfg.bg, cfg.color)}>
      <motion.div animate={isSpinning ? { rotate: 360 } : {}} transition={isSpinning ? { repeat: Infinity, duration: 1.5, ease: "linear" } : {}}>
        <Icon size={9} />
      </motion.div>
      <span>{cfg.label}</span>
    </motion.div>
  );
});
SyncBadge.displayName = "SyncBadge";

// ═══════════════════════════════════════════════════════════════
// § 6. PRINT HTML BUILDER
// ═══════════════════════════════════════════════════════════════

const QR_MARKER_RE = /<span[^>]*data-aone-invoice-qr-marker="true"[^>]*><\/span>/i;
const stripQrLoadingOnly = (html) => html ? html.replace(/<div[^>]*data-invoice-qr-ph="true"[^>]*>[\s\S]*?<\/div>/gi, "") : html;
const stripScanToVerifyText = (html) => {
  if (!html) return html;
  return html
    .replace(/<[^>]*>\s*scan\s+to\s+verify\s*<\/[^>]*>/gi, '')
    .replace(/scan\s+to\s+verify/gi, '');
};

const injectQrIntoHtml = (html, qrDataUrl, qrDimension = 88) => {
  if (!html) return html;
  let out = stripScanToVerifyText(stripQrLoadingOnly(html));
  if (!qrDataUrl) return out;
  const safeSrc = qrDataUrl.replace(/"/g, "&quot;");
  const qrImg = `<img src="${safeSrc}" alt="Invoice QR" data-invoice-qr="true" width="${qrDimension}" height="${qrDimension}" style="width:${qrDimension}px;height:${qrDimension}px;display:block;margin:0 auto;border:2px solid #000;padding:4px;background:#fff" />`;
  out = out.replace(/<img[^>]*data-invoice-qr="true"[^>]*\/?>/gi, "");
  if (QR_MARKER_RE.test(out)) return out.replace(QR_MARKER_RE, qrImg);
  if (/data-invoice-qr-slot="true"/i.test(out)) {
    return out.replace(/(<div[^>]*data-invoice-qr-slot="true"[^>]*>)/i, `$1${qrImg}`);
  }
  if (out.includes("Scan to pay")) return out.replace("Scan to pay", `${qrImg}<span>Scan to pay</span>`);
  return `${qrImg}${out}`;
};

const waitForPrintImages = (doc, maxMs = 1200) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    const timer = setTimeout(finish, maxMs);
    try {
      const imgs = [...(doc?.images || [])].filter((img) => img.src?.startsWith("data:"));
      if (!imgs.length) { clearTimeout(timer); finish(); return; }
      let loaded = 0;
      const onImg = () => { loaded += 1; if (loaded >= imgs.length) { clearTimeout(timer); finish(); } };
      imgs.forEach((img) => { if (img.complete && img.naturalWidth > 0) onImg(); else { img.onload = onImg; img.onerror = onImg; } });
    } catch { clearTimeout(timer); finish(); }
  });

const buildPrintHtml = ({ bodyHtml, css, serialNo, copies, qrDataUrl, qrDimension, watermarkText }) => {
  const enriched = injectQrIntoHtml(bodyHtml, qrDataUrl, qrDimension);
  const wm = watermarkText ? `<div class="watermark">${watermarkText}</div>` : "";
  const copyDivider = '<div style="page-break-after:always;"></div>';
  const repeated = Array(copies).fill(`<div style="position:relative;font-weight:400;color:#000;">${wm}${enriched}</div>`).join(copyDivider);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Invoice #${serialNo}</title><style>${css}</style></head><body style="font-weight:400;color:#000;background:#fff;">${repeated}</body></html>`;
};

// ═══════════════════════════════════════════════════════════════
// § 7. MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const InvoicePrint = ({
  order, store, onClose, directPrint = false, checkoutPrint = false, autoClose = false,
  fontSize, defaultSize = "thermal", isReprint = false, soundEnabled = false,
  billNote = "", paymentType = "", paymentReference = "", billerName = "",
  showDualMode = false, showOffline = false, offlineLines = null,
  onF8Press, onPrintError, extraFooter = null, printControlRef = null,
}) => {
  const { isDark } = useTheme();
  const { dir, t } = useLanguage();
  const { settings } = useSettings();

  const printRef = useRef(null);
  const instanceIdRef = useRef(`pi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const hasPrinted = useRef(false);
  const hasClosedRef = useRef(false);
  const channelRef = useRef(null);
  const qrUrlRef = useRef("");
  const printTimerRef = useRef(null);
  const printFrameRef = useRef(null);

  const [qrUrl, setQrUrl] = useState("");
  const [qrReady, setQrReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [paperSize, setPaperSize] = useState(defaultSize);
  const [copies, setCopies] = useState(1);
  const [localSoundEnabled] = useState(() => {
    try {
      const uid = localStorage.getItem("aone_current_user") || "default";
      const stored = localStorage.getItem(`aone_sound_enabled_${uid}`);
      if (stored !== null) return stored === "true";
    } catch {}
    return typeof soundEnabled === "boolean" ? soundEnabled : false;
  });

  const serialNo = useMemo(() => order?.serialNo || order?.billSerial || "----", [order]);
  const qrSerial = useMemo(() => getInvoiceQrSerial(serialNo), [serialNo]);
  const qrRequired = useMemo(() => Boolean(qrSerial), [qrSerial]);
  const printSessionKey = useMemo(
    () => `${instanceIdRef.current}:${order?.id || serialNo}`,
    [order?.id, serialNo],
  );
  const items = useMemo(() => (order?.items || order?.cartItems || order?.products || order?.orderItems || []).filter(Boolean), [order]);
  const totalAmount = useMemo(() => getOrderDisplayTotal(order), [order]);
  const orderFraqTotal = useMemo(() => getOrderFraqLessTotal(order), [order]);
  const signedQtyTotal = useMemo(() => getOrderSignedQtyTotal(order), [order]);
  const showMinimizeSummary = useMemo(() => hasNegativeQtyInvoice(order), [order]);
  const qrPayload = useMemo(() => {
    if (!qrSerial || !serialNo || serialNo === "----") return "";
    try { return encodeQRData(String(serialNo).toUpperCase(), totalAmount); } catch { return qrSerial; }
  }, [qrSerial, serialNo, totalAmount]);
  const previousTotal = useMemo(() => Number(order?.previousTotal || 0), [order]);
  const editedTotalDifference = useMemo(() => {
    if (typeof order?.editedTotalDifference === "number") return Number(order.editedTotalDifference || 0);
    if (previousTotal > 0) return Number(totalAmount - previousTotal);
    return 0;
  }, [order, totalAmount, previousTotal]);
  const totalDiscount = useMemo(() => Number(order?.totalDiscount || 0), [order]);
  const billDate = useMemo(() => resolveDate(order?.createdAt), [order?.createdAt]);
  const salesperson = useMemo(() => order?.salesperson || order?.salesAgent || {}, [order]);
  const showSalesperson = useMemo(() => settings?.salesperson?.showOnInvoice !== false && !!salesperson?.name, [settings, salesperson]);
  const uniqueSalespersons = useMemo(() => {
    const names = new Set();
    const agents = [];
    (order?.items || order?.cartItems || order?.products || order?.orderItems || []).forEach(i => {
      if (i.salespersonName && !names.has(i.salespersonName)) { names.add(i.salespersonName); agents.push(i.salespersonName); }
    });
    return agents;
  }, [order]);
  const footerNote = useMemo(() => store?.receiptFooter || settings?.store?.receiptFooter || settings?.invoice?.footerNote || "Thank you for your business!", [store, settings]);
  const showReprintWatermark = useMemo(() => isReprint && settings?.invoice?.reprintWatermark !== false, [isReprint, settings?.invoice?.reprintWatermark]);
  const { showDualMode: showDualModeBadge, showOffline: showOfflinePayBadge, showOfflineBillBadge, offlineLines: resolvedOfflineLines } = useMemo(
    () => {
      const badges = resolveInvoiceBadges(order, { showDualMode, showOffline });
      return {
        showDualMode: badges.showDualMode,
        showOffline: badges.showOffline,
        showOfflineBillBadge: badges.showOfflineBillBadge,
        offlineLines: offlineLines ?? badges.offlineLines ?? [],
      };
    },
    [order, showDualMode, showOffline, offlineLines],
  );
  const resolvedBillerName = useMemo(() => {
    const candidates = [
      order?.billerName,
      order?.biller?.name,
      order?.biller?.displayName,
      order?.createdByName,
      order?.billerSubmittedBy,
      order?.submittedByName,
      billerName,
    ];
    return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
  }, [order, billerName]);
  const syncStatus = useMemo(() => order?.syncStatus || "pending", [order]);
  const resolvedNote = useMemo(() => order?.billNote || billNote || "", [order, billNote]);
  const resolvedPaymentType = useMemo(() => order?.paymentType || paymentType || "", [order, paymentType]);
  const resolvedPaymentRef = useMemo(() => order?.paymentReference || paymentReference || "", [order, paymentReference]);
  const customer = useMemo(() => order?.customer || {}, [order]);
  const invoiceCustomerLine = useMemo(() => formatInvoiceCustomerLine(customer), [customer]);
  const invoiceCustomerName = useMemo(() => resolveCustomerName(customer), [customer]);
  const invoiceCustomerPhone = useMemo(() => {
    const p = String(customer?.phone || customer?.customerPhone || "").trim();
    if (!p) return "";
    if (p.startsWith("+")) return p;
    const n = normalizePhone(p);
    return n.startsWith("92") ? `+${n}` : p;
  }, [customer]);
  const invoiceCustomerView = useMemo(() => {
    const rawName = String(customer?.name || customer?.customerName || "").trim();
    const phone = invoiceCustomerPhone;
    const resolved = invoiceCustomerName;
    const isPhoneFallback = /^Customer\s*\([^)]+\)$/i.test(resolved);
    const isNumbered = /^Customer\s+\d+$/i.test(rawName);

    if (isPhoneFallback && phone) {
      return { label: "Customer", value: phone, showPhone: false };
    }
    if (isNumbered && phone) {
      return { label: "Customer", value: resolved, showPhone: true, phone };
    }
    if (rawName && !isGenericWalkInName(rawName)) {
      return { label: "Customer", value: rawName, showPhone: Boolean(phone), phone };
    }
    if (phone) {
      return { label: "Customer", value: phone, showPhone: false };
    }
    return { label: "Customer", value: invoiceCustomerLine, showPhone: false };
  }, [customer, invoiceCustomerName, invoiceCustomerPhone, invoiceCustomerLine]);
  const paperConfig = useMemo(() => PAPER_SIZES.find((p) => p.id === paperSize) || PAPER_SIZES[0], [paperSize]);
  const cachedQrSync = useMemo(() => getCachedInvoiceQr(serialNo, totalAmount), [serialNo, totalAmount]);
  const effectiveQrUrl = useMemo(
    () => qrUrl || cachedQrSync || qrUrlRef.current || "",
    [qrUrl, cachedQrSync],
  );

  useEffect(() => { hasPrinted.current = false; hasClosedRef.current = false; }, [printSessionKey]);

  const applyQrUrl = useCallback((url) => { const next = url || ""; qrUrlRef.current = next; setQrUrl(next); setQrReady(true); }, []);

  useEffect(() => {
    if (cachedQrSync && !qrUrlRef.current) applyQrUrl(cachedQrSync);
  }, [cachedQrSync, applyQrUrl]);

  const ensureQrForPrint = useCallback(async (maxWaitMs = 350) => {
    if (!qrRequired) return "";
    const cached = qrUrlRef.current || getCachedInvoiceQr(serialNo, totalAmount);
    if (cached) { if (!qrUrlRef.current) applyQrUrl(cached); return cached; }
    const timeout = new Promise((resolve) => setTimeout(() => resolve(""), maxWaitMs));
    const url = await Promise.race([ensureInvoiceQr(serialNo, totalAmount), timeout]);
    if (url) applyQrUrl(url);
    return url || "";
  }, [qrRequired, serialNo, totalAmount, applyQrUrl]);

  useLayoutEffect(() => {
    let cancelled = false;
    if (!qrSerial) { applyQrUrl(""); return () => { cancelled = true; }; }
    const cached = getCachedInvoiceQr(serialNo, totalAmount);
    if (cached) { applyQrUrl(cached); return () => { cancelled = true; }; }
    setQrUrl(""); setQrReady(false);
    warmInvoiceQr({ serialNo, billSerial: serialNo, totalAmount });
    const loadQr = () => {
      generateInvoiceQr(serialNo, totalAmount).then((url) => {
        if (!cancelled && url) applyQrUrl(url);
      });
    };
    if (directPrint) {
      const defer = typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (fn) => setTimeout(fn, 0);
      defer(loadQr);
    } else {
      loadQr();
    }
    return () => { cancelled = true; };
  }, [printSessionKey, qrSerial, serialNo, totalAmount, applyQrUrl, directPrint]);

  useEffect(() => { channelRef.current = getPrintChannel(); return () => { try { channelRef.current?.close(); } catch {} }; }, []);
  useEffect(() => { if (!directPrint) playSound(localSoundEnabled, "open"); }, []); // eslint-disable-line

  const getCurrentCss = useCallback(() => CSS_MAP[paperSize] || CSS_MAP.thermal, [paperSize]);

  const clearPendingPrintTimer = useCallback(() => {
    if (printTimerRef.current) {
      clearTimeout(printTimerRef.current);
      printTimerRef.current = null;
    }
  }, []);

  const safeClose = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    clearPendingPrintTimer();
    _markClosed(printSessionKey);
    _closeActivePrintWin();
    try { window.speechSynthesis?.cancel?.(); } catch {}
    onClose?.();
  }, [clearPendingPrintTimer, onClose, printSessionKey]);

  const notifyPrintDone = useCallback(() => {
    playSound(localSoundEnabled, "print");
    try { channelRef.current?.postMessage({ type: "PRINT_EXECUTED", serialNo, ts: Date.now() }); } catch {}
    try { const bc = new BroadcastChannel('aone_pos_billing'); bc.postMessage({ type: 'F8_COMPLETED', serialNo, timestamp: Date.now() }); bc.close(); } catch {}
    onF8Press?.();
  }, [localSoundEnabled, serialNo, onF8Press]);

  const notifyPrintFailed = useCallback((reason = 'Printer not connected') => {
    try { onPrintError?.(reason); } catch { /* ignore */ }
  }, [onPrintError]);

  const handlePrint = useCallback(async ({ closeAfter = false, allowRetry = true, manual = false, fastClose = false } = {}) => {
    if (!manual && _closedSessions.has(printSessionKey)) return false;
    if (!printRef.current?.innerHTML?.trim()) {
      await waitForPrintDom(printRef, 40);
    }
    const content = printRef.current;
    if (!content?.innerHTML?.trim()) return false;
    let qrDataUrl = "";
    if (qrRequired) {
      qrDataUrl = effectiveQrUrl || qrUrlRef.current || getCachedInvoiceQr(serialNo, totalAmount) || "";
      if (!qrDataUrl) qrDataUrl = await ensureQrForPrint(manual ? 1200 : (directPrint ? DIRECT_QR_WAIT_MS : 800));
      if (!qrDataUrl) qrDataUrl = getCachedInvoiceQr(serialNo, totalAmount) || qrUrlRef.current || "";
      if (qrDataUrl) applyQrUrl(qrDataUrl);
    }
    const bodyHtml = content.innerHTML;
    const css = getCurrentCss();
    const qrDimension = paperSize === "thermal" ? 88 : paperSize === "a5" ? 100 : 120;
    const html = buildPrintHtml({ bodyHtml, css, serialNo, copies, qrDataUrl, qrDimension, watermarkText: showReprintWatermark ? "DUPLICATE" : "" });

    let printed = false;
    let printTriggered = false;
    const imageWaitMs = fastClose || checkoutPrint
      ? DIRECT_IMAGE_WAIT_MS
      : manual ? 600 : (directPrint ? DIRECT_IMAGE_WAIT_MS : 800);

    const scheduleCloseAfterPrint = (targetWin) => {
      if (!closeAfter) return;
      clearPendingPrintTimer();
      let finished = false;
      const finish = () => {
        if (finished || hasClosedRef.current) return;
        finished = true;
        _closeActivePrintWin();
        try { targetWin?.close?.(); } catch {}
        notifyPrintDone();
        safeClose();
      };
      try { if (targetWin) targetWin.onafterprint = () => setTimeout(finish, 40); } catch {}
      try {
        const onMainFocus = () => { window.removeEventListener('focus', onMainFocus); setTimeout(finish, 40); };
        setTimeout(() => window.addEventListener('focus', onMainFocus, { once: true }), 60);
      } catch {}
      printTimerRef.current = setTimeout(
        finish,
        fastClose || checkoutPrint
          ? CHECKOUT_PRINT_CLOSE_MS
          : directPrint
            ? DIRECT_PRINT_CLOSE_MS
            : (manual ? 1200 : 3000),
      );
    };

    const runIframePrint = () => {
      try {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
        document.body.appendChild(iframe);
        printFrameRef.current = iframe;
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!idoc || printTriggered || hasClosedRef.current) return false;
        idoc.open(); idoc.write(html); idoc.close();
        printTriggered = true;
        waitForPrintImages(idoc, imageWaitMs).then(() => {
          try {
            const iwin = iframe.contentWindow;
            if (!iwin) return;
            iwin.focus();
            setTimeout(() => {
              try { iwin.print(); printed = true; } catch (err) {
                console.warn('[InvoicePrint] iframe.print failed:', err);
              }
            }, 20);
          } catch {}
          scheduleCloseAfterPrint(iframe.contentWindow);
          setTimeout(() => {
            try { if (printFrameRef.current === iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch {}
            if (printFrameRef.current === iframe) printFrameRef.current = null;
          }, 2000);
        });
        return true;
      } catch {
        return false;
      }
    };

    const runWindowPrint = () => {
      try {
        const win = window.open("", `aone_print_${Date.now()}`, "width=420,height=750,toolbar=no,menubar=no,scrollbars=yes");
        if (!win || win.closed || printTriggered || hasClosedRef.current) return false;
        _activePrintWin = win;
        win.document.open();
        win.document.write(html);
        win.document.close();
        const printFn = async () => {
          if (printTriggered || hasClosedRef.current) return;
          printTriggered = true;
          try {
            await waitForPrintImages(win.document, imageWaitMs);
            win.focus();
            setTimeout(() => {
              try { win.print(); printed = true; } catch (err) {
                console.warn('[InvoicePrint] window.print failed:', err);
              }
            }, 20);
          } catch {}
          scheduleCloseAfterPrint(win);
        };
        if (win.document.readyState === "complete") printFn();
        else win.addEventListener("load", () => printFn(), { once: true });
        return true;
      } catch {
        return false;
      }
    };

    _closeActivePrintWin();
    printed = (directPrint && !manual) || (manual && fastClose)
      ? (runWindowPrint() || runIframePrint())
      : manual
        ? (runWindowPrint() || runIframePrint())
        : (runIframePrint() || runWindowPrint());
    if (!printed && allowRetry) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!hasClosedRef.current && printRef.current?.innerHTML?.trim()) {
        return handlePrint({ closeAfter, allowRetry: false, manual });
      }
    }
    if (!printed && (directPrint || checkoutPrint) && !manual) notifyPrintFailed();
    return printed;
  }, [serialNo, copies, paperSize, getCurrentCss, notifyPrintDone, notifyPrintFailed, safeClose, printSessionKey, ensureQrForPrint, qrRequired, showReprintWatermark, directPrint, checkoutPrint, effectiveQrUrl, applyQrUrl]);

  const qrHasImage = Boolean(effectiveQrUrl);

  const handleFastCheckoutPrint = useCallback(async () => {
    if (hasClosedRef.current || printing) return;
    setPrinting(true);
    try {
      hasClosedRef.current = false;
      hasPrinted.current = true;
      await waitForPrintDom(printRef, 6);
      if (qrRequired) {
        const cached = effectiveQrUrl || qrUrlRef.current || getCachedInvoiceQr(serialNo, totalAmount);
        if (cached) applyQrUrl(cached);
        else await ensureQrForPrint(DIRECT_QR_WAIT_MS);
      }
      let printed = await handlePrint({ closeAfter: true, manual: true, fastClose: true });
      if (!printed && !hasClosedRef.current) {
        await new Promise((r) => setTimeout(r, 40));
        printed = await handlePrint({ closeAfter: true, allowRetry: false, manual: true, fastClose: true });
      }
      if (!printed && !hasClosedRef.current) {
        notifyPrintFailed();
        safeClose();
      }
    } finally {
      setPrinting(false);
    }
  }, [handlePrint, printing, ensureQrForPrint, qrRequired, serialNo, totalAmount, effectiveQrUrl, applyQrUrl, notifyPrintFailed, safeClose]);

  const handlePrintAndClose = useCallback(async () => {
    if (checkoutPrint) {
      return handleFastCheckoutPrint();
    }
    if (printing) return;
    setPrinting(true);
    const unlockTimer = setTimeout(() => setPrinting(false), 8000);
    try {
      hasClosedRef.current = false;
      await waitForPrintDom(printRef, 50);
      if (qrRequired) {
        const cached = effectiveQrUrl || qrUrlRef.current || getCachedInvoiceQr(serialNo, totalAmount);
        if (cached) {
          applyQrUrl(cached);
        } else {
          const url = await ensureQrForPrint(1200);
          if (url) applyQrUrl(url);
        }
        await waitForPrintDom(printRef, 40);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await handlePrint({ closeAfter: true, manual: true });
    } finally {
      clearTimeout(unlockTimer);
      setPrinting(false);
    }
  }, [handlePrint, printing, ensureQrForPrint, qrRequired, serialNo, totalAmount, effectiveQrUrl, applyQrUrl, checkoutPrint, handleFastCheckoutPrint]);

  const triggerDirectPrint = useCallback(async () => {
    if (checkoutPrint) return handleFastCheckoutPrint();
    if (hasClosedRef.current || printing) return;
    setPrinting(true);
    try {
      hasClosedRef.current = false;
      hasPrinted.current = true;
      await waitForPrintDom(printRef, 12);
      if (qrRequired) {
        const cached = effectiveQrUrl || qrUrlRef.current || getCachedInvoiceQr(serialNo, totalAmount);
        if (cached) applyQrUrl(cached);
        else await ensureQrForPrint(DIRECT_QR_WAIT_MS);
      }
      let printed = await handlePrint({ closeAfter: true, manual: true });
      if (!printed && !hasClosedRef.current) {
        await new Promise((r) => setTimeout(r, 60));
        printed = await handlePrint({ closeAfter: true, allowRetry: false, manual: true });
      }
      if (!printed && !hasClosedRef.current) {
        notifyPrintFailed();
        safeClose();
      }
    } finally {
      setPrinting(false);
    }
  }, [handlePrint, printing, ensureQrForPrint, qrRequired, serialNo, totalAmount, effectiveQrUrl, applyQrUrl, notifyPrintFailed, safeClose, checkoutPrint, handleFastCheckoutPrint]);

  useEffect(() => {
    if (!printControlRef) return undefined;
    const runPrint = checkoutPrint ? handleFastCheckoutPrint : triggerDirectPrint;
    printControlRef.current = {
      print: runPrint,
      skip: safeClose,
    };
    return () => { printControlRef.current = null; };
  }, [printControlRef, triggerDirectPrint, handleFastCheckoutPrint, checkoutPrint, safeClose]);

  // Preload receipt + QR, then open Windows print dialog immediately (no preview UI)
  useEffect(() => {
    if (!directPrint || !autoClose || hasClosedRef.current) return undefined;
    if (_closedSessions.has(printSessionKey)) { safeClose(); return undefined; }
    if (hasPrinted.current) return undefined;

    let cancelled = false;
    const watchdog = setTimeout(() => {
      if (!hasClosedRef.current) {
        _closeActivePrintWin();
        safeClose();
      }
    }, 8000);

    (async () => {
      await waitForPrintDom(printRef, 6);
      if (qrRequired) {
        const cached = getCachedInvoiceQr(serialNo, totalAmount);
        if (cached) applyQrUrl(cached);
        else await ensureQrForPrint(DIRECT_QR_WAIT_MS);
      }
      if (cancelled || hasClosedRef.current || hasPrinted.current) return;
      hasPrinted.current = true;
      let printed = await handlePrint({ closeAfter: true, manual: false, fastClose: true });
      if (!printed && !cancelled && !hasClosedRef.current) {
        await new Promise((r) => setTimeout(r, 40));
        printed = await handlePrint({ closeAfter: true, allowRetry: false, manual: false, fastClose: true });
      }
      if (!printed && !cancelled) {
        notifyPrintFailed();
        safeClose();
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      clearPendingPrintTimer();
    };
  }, [directPrint, autoClose, printSessionKey, handlePrint, safeClose, ensureQrForPrint, qrRequired, clearPendingPrintTimer, notifyPrintFailed, serialNo, totalAmount, applyQrUrl]);

  // Preload only when direct print without auto (reprint path)
  useEffect(() => {
    if (!directPrint || autoClose || hasClosedRef.current) return undefined;
    let cancelled = false;
    (async () => {
      await waitForPrintDom(printRef, 8);
      if (cancelled || hasClosedRef.current) return;
      if (qrRequired) {
        const cached = getCachedInvoiceQr(serialNo, totalAmount);
        if (cached) applyQrUrl(cached);
        else await ensureQrForPrint(DIRECT_QR_WAIT_MS);
      }
    })();
    return () => { cancelled = true; };
  }, [directPrint, autoClose, printSessionKey, ensureQrForPrint, qrRequired, serialNo, totalAmount, applyQrUrl]);

  useEffect(() => {
    if (!directPrint) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        _closeActivePrintWin(); safeClose();
        return;
      }
      if (e.key === "F8") {
        if (e.repeat || printing) return;
        e.preventDefault(); e.stopPropagation();
        triggerDirectPrint();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [directPrint, safeClose, triggerDirectPrint, printing]);

  useEffect(() => {
    if (directPrint) return;
    const handler = (e) => {
      if (e.key === "F8" || (e.ctrlKey && e.key.toLowerCase() === "p")) { e.preventDefault(); e.stopPropagation(); handlePrintAndClose(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); safeClose(); return; }
      if (e.altKey && e.key === "1") { e.preventDefault(); setPaperSize("thermal"); }
      if (e.altKey && e.key === "2") { e.preventDefault(); setPaperSize("a4"); }
      if (e.altKey && e.key === "3") { e.preventDefault(); setPaperSize("a5"); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [directPrint, handlePrintAndClose, safeClose]);

  // ═══════════════════════════════════════════════════════════
  // § 8. RECEIPT CONTENT (v7 — Fixed Alignment & Gaps)
  // ═══════════════════════════════════════════════════════════

  const ReceiptContent = useCallback(() => {
    const isThermal = paperSize === "thermal";
    const showDiscCol = !showMinimizeSummary && (
      totalDiscount > 0
      || Number(order?.billDiscountValue ?? order?.billDiscount ?? 0) > 0
      || items.some((i) => getItemDiscAmt(i) > 0)
    );
    const showProductCol = items.some((i) => hasDisplayProductName(i));
    const fontScale = (Number(fontSize) || Number(settings?.fonts?.invoiceFontSize) || 14) / 14;
    const layout = computeReceiptLayout({ paperSize, itemCount: items.length, showDiscCol, showProductCol, hasQr: qrRequired, fontScale });

    const tableCols = showMinimizeSummary && layout.minCols ? layout.minCols : layout.cols;
    const uniformPad = "2px 4px";
    const stdLayout = !showProductCol;
    const colAlign = {
      hash: {
        textAlign: "center",
        padding: uniformPad,
        fontVariantNumeric: "tabular-nums",
      },
      product: {
        textAlign: "left",
        padding: uniformPad,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      num: {
        textAlign: "right",
        padding: uniformPad,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      },
      total: {
        textAlign: "right",
        padding: uniformPad,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        fontWeight: 600,
      },
    };
    const thStyle = (extra = {}) => ({ fontSize: layout.thSize, ...T.semi, verticalAlign: "middle", ...extra });
    const thHashStyle = () => thStyle({ ...colAlign.hash, textTransform: "none", letterSpacing: 0 });
    const thNumStyle = (extra = {}) => thStyle({
      ...colAlign.num,
      textTransform: "none",
      letterSpacing: 0,
      fontSize: layout.thSize,
      ...extra,
    });
    const tdStyle = (extra = {}) => ({ fontSize: layout.tdSize, ...T.body, verticalAlign: "middle", background: "#fff", ...extra });

    const S = {
      root: {
        width: "100%",
        fontFamily: isThermal ? THERMAL_FONT_STACK : "'Segoe UI',Arial,sans-serif",
        fontSize: layout.bodySize,
        ...T.body,
        background: C.bg,
        position: "relative",
        overflow: "hidden",
        lineHeight: 1.45,
        border: `1.5px dashed ${C.border}`,
        borderRadius: isThermal ? 0 : 6,
        padding: isThermal ? "6px 5px" : "12px 14px",
      },
      center: { textAlign: "center" },
      bold: T.bold,
      semi: T.semi,
      meta: T.meta,
      dashed: { border: "none", borderTop: `1px dashed ${C.borderSoft}`, margin: layout.marginTight },
      solid: { border: "none", borderTop: `1px solid ${C.border}`, margin: layout.marginTight },
      doubleLine: { border: "none", borderTop: `2px solid ${C.border}`, margin: layout.marginTight },
      labelXs: { ...T.label, fontSize: layout.summaryLabel },
      sectionGap: { marginBottom: layout.sectionGap },
    };
    const qrDimension = layout.qrDim;

    // ✅ FIXED: Summary row with proper gap between label and value
    const SummaryRow = ({ label, value, valueStyle = {}, rowStyle = {}, labelStyle = {} }) => (
      <div className="summary-row inv-ink" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        gap: layout.summaryGap,
        padding: "3px 0",
        marginBottom: "1px",
        ...T.body,
        ...rowStyle,
      }}>
        <span className="lbl" style={{ textAlign: "left", flex: "0 0 auto", ...T.semi, ...labelStyle }}>{label}</span>
        <span className="val" style={{
          textAlign: "right",
          whiteSpace: "nowrap",
          ...T.semi,
          flex: "1 1 auto",
          ...valueStyle,
        }}>{value}</span>
      </div>
    );

    return (
      <div className="receipt-root inv-frame" style={S.root}>
        <style dangerouslySetInnerHTML={{ __html: getReceiptScopedCss(paperSize) }} />
        {showReprintWatermark && (
          <div style={{
            position: "absolute", top: "28%", left: "50%", transform: "translate(-50%, -50%) rotate(-28deg)",
            fontSize: isThermal ? "28px" : "48px", fontWeight: "900", color: "#000", opacity: 0.06,
            pointerEvents: "none", userSelect: "none", whiteSpace: "nowrap", zIndex: 0,
          }}>DUPLICATE</div>
        )}

        {/* ═══ STORE HEADER ═══ */}
        <div className="inv-store inv-ink inv-section" style={{ ...S.center, ...S.sectionGap, position: "relative", zIndex: 1, paddingBottom: "4px" }}>
          <div style={{
            fontSize: layout.storeName,
            ...T.bold,
            letterSpacing: isThermal ? "0.8px" : "1.5px",
            lineHeight: 1.15,
            textTransform: "uppercase",
          }}>
            {store?.name || "A ONE JEWELRY"}
          </div>
          {(store?.branchName || order?.branchName || order?.branchLabel) && (
            <div style={{ ...T.semi, fontSize: layout.storeDetail, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {store?.branchName || order?.branchName || order?.branchLabel}
            </div>
          )}
          {store?.tagline && (
            <div style={{ fontSize: layout.storeTagline, marginTop: "3px", ...T.meta }}>
              {store.tagline}
            </div>
          )}
          {store?.address && (
            <div style={{ fontSize: layout.storeDetail, marginTop: "3px", lineHeight: 1.35, ...T.meta }}>
              {store.address}
            </div>
          )}
          {store?.phone && <div style={{ ...T.med, fontSize: layout.metaSize || layout.mdSize, marginTop: "3px" }}>Ph: {store.phone}</div>}
          {store?.email && <div style={{ fontSize: layout.smSize, ...T.meta }}>{store.email}</div>}
          {store?.ntn && <div style={{ fontSize: layout.smSize, ...T.meta }}>NTN: {store.ntn}</div>}
        </div>

        <hr className="inv-rule-strong" style={S.solid} />

        {/* ═══ BILL SERIAL ═══ */}
        <div className="inv-serial inv-ink inv-section" style={{ ...S.center, ...S.sectionGap, position: "relative", zIndex: 1 }}>
          <div className="serial-box inv-pill" style={{
            fontSize: layout.serialSize,
            ...T.bold,
            ...T.mono,
            color: '#000',
            letterSpacing: isThermal ? "0.5px" : "1.5px",
            padding: isThermal ? "4px 10px" : "6px 14px",
            whiteSpace: 'nowrap',
            overflowX: 'visible',
            lineHeight: 1.1,
            maxWidth: '100%',
          }}>
            #{serialNo}
          </div>
          {showReprintWatermark && <div className="reprint-badge">★ REPRINT ★</div>}
          {(showDualModeBadge || showOfflineBillBadge || showOfflinePayBadge) && (
            <div className="invoice-badges">
              {showDualModeBadge && <div className="dual-mode-badge">DUAL MODE</div>}
              {showOfflineBillBadge && (
                <div className="offline-badge">{t('invoice.offlineBillBadge', 'OFFLINE BILL')}</div>
              )}
              {showOfflinePayBadge && (
                <div className="offline-badge">{t('invoice.offlinePayBadge', 'OFFLINE PAY')}</div>
              )}
            </div>
          )}
          {resolvedOfflineLines.length > 0 && (
            <div className="offline-meta inv-ink">
              {resolvedOfflineLines.map((line) => (
                <span key={line.key}>
                  {t('invoice.offlinePaidBy', 'Offline paid by')} {line.name}
                </span>
              ))}
            </div>
          )}
          <div className="inv-datetime" style={{ ...T.meta, fontSize: layout.metaSize || layout.smSize, marginTop: "5px" }}>
            {billDate.toLocaleDateString("en-PK", { weekday: "short", year: "numeric", month: "short", day: "2-digit" })}
          </div>
          <div className="inv-datetime" style={{ ...T.med, fontSize: layout.metaSize || layout.smSize, marginTop: "2px" }}>
            {fmtTime(order?.billStartTime)} — {fmtTime(order?.billEndTime || billDate)}
          </div>
        </div>

        {/* ═══ CUSTOMER ═══ */}
        {(invoiceCustomerView.value) && (
          <>
            <hr className="inv-rule-soft" style={S.dashed} />
            <div className="inv-customer inv-ink inv-box" style={{
              fontSize: layout.smSize,
              ...T.body,
              textAlign: "left",
              padding: isThermal ? "4px 6px" : "6px 8px",
              wordBreak: "break-word",
              lineHeight: 1.35,
              position: "relative",
              zIndex: 1,
            }}>
              <div style={{ fontSize: layout.smSize }}>
                <span style={T.semi}>{invoiceCustomerView.label}: </span>
                <span style={T.med}>{invoiceCustomerView.value}</span>
              </div>
              {invoiceCustomerView.showPhone && invoiceCustomerView.phone && (
                <div style={{ fontSize: layout.xsSize, marginTop: "3px", ...T.meta }}>
                  <span style={T.semi}>Phone: </span>
                  <span>{invoiceCustomerView.phone}</span>
                </div>
              )}
            </div>
          </>
        )}

        {resolvedBillerName && (
          <>
            <hr className="inv-rule-soft" style={S.dashed} />
            <div className="inv-biller inv-ink inv-box" style={{
              fontSize: layout.smSize,
              ...T.body,
              textAlign: "left",
              padding: isThermal ? "4px 6px" : "6px 8px",
              lineHeight: 1.35,
              position: "relative",
              zIndex: 1,
            }}>
              <span style={T.semi}>Biller: </span>
              <span style={T.med}>{resolvedBillerName}</span>
            </div>
          </>
        )}

        <hr className="inv-rule-soft" style={S.dashed} />

        {/* ═══ ITEMS TABLE ═══ */}
        {items.length > 0 && (
          <table className={cn("invoice-table", stdLayout && "invoice-table--std")} style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: layout.tdSize,
            marginBottom: "6px",
            tableLayout: "fixed",
            ...T.body,
          }}>
            <colgroup>
              {showMinimizeSummary ? (
                <>
                  <col className="col-hash" style={{ width: tableCols.hash }} />
                  {showProductCol && <col className="col-product" style={{ width: tableCols.product }} />}
                  <col className="col-qty" style={{ width: tableCols.qty }} />
                  <col className="col-rate" style={{ width: tableCols.rate }} />
                  <col className="col-total" style={{ width: tableCols.total }} />
                </>
              ) : (
                <>
                  <col className="col-hash" style={{ width: tableCols.hash }} />
                  {showProductCol && <col className="col-product" style={{ width: tableCols.product }} />}
                  <col className="col-price" style={{ width: tableCols.price }} />
                  {showDiscCol && <col className="col-disc" style={{ width: tableCols.disc }} />}
                  <col className="col-qty" style={{ width: tableCols.qty }} />
                  <col className="col-total" style={{ width: tableCols.total }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr style={{ background: C.bg }}>
                <th className="col-hash" style={thHashStyle()}>#</th>
                {showProductCol && (
                  <th className="col-product" style={thStyle({ ...colAlign.product, textTransform: "none", letterSpacing: 0, overflow: "visible" })}>
                    P Name
                  </th>
                )}
                {showMinimizeSummary ? (
                  <>
                    <th className="col-qty" style={thNumStyle()}>Qty</th>
                    <th className="col-rate" style={thNumStyle()}>Rate</th>
                    <th className="col-total" style={thNumStyle(colAlign.total)}>Total</th>
                  </>
                ) : (
                  <>
                    <th className="col-price" style={thNumStyle()}>Price</th>
                    {showDiscCol && (
                      <th className="col-disc" style={thNumStyle()}>Disc</th>
                    )}
                    <th className="col-qty" style={thNumStyle()}>Qty</th>
                    <th className="col-total" style={thNumStyle(colAlign.total)}>Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const price = Number(item.price || item.rate || 0);
                const qty = Number(item.qty ?? item.quantity ?? 0);
                const discAmt = getItemDiscAmt(item);
                const lineTotal = getItemLineTotal(item, discAmt);
                const netUnit = price - discAmt;
                const displayRate = getItemDisplayUnitPrice(item, discAmt);
                const productName = hasDisplayProductName(item)
                  ? String(item.productName || item.name || '').trim()
                  : '';

                return (
                  <tr key={idx} className="inv-item-row" style={{ background: "#fff" }}>
                    <td className="col-hash" style={tdStyle({ ...colAlign.hash, ...T.med })}>
                      {idx + 1}
                    </td>
                    {showProductCol && (
                      <td className="col-product" style={tdStyle(colAlign.product)}>
                        {productName || ""}
                      </td>
                    )}
                    {showMinimizeSummary ? (
                      <>
                        <td className="col-qty" style={tdStyle({ ...colAlign.num, ...T.med })}>{qty}</td>
                        <td className="col-rate" style={tdStyle({ ...colAlign.num, ...T.med })}>{displayRate.toLocaleString()}</td>
                        <td className="col-total" style={tdStyle({ ...colAlign.total, ...T.semi })}>{lineTotal.toLocaleString()}</td>
                      </>
                    ) : (
                      <>
                        <td className="col-price" style={tdStyle({ ...colAlign.num, ...T.med })}>{netUnit.toLocaleString()}</td>
                        {showDiscCol && (
                          <td className="col-disc" style={tdStyle({ ...colAlign.num, ...T.med })}>
                            {discAmt > 0 ? discAmt.toLocaleString() : "—"}
                          </td>
                        )}
                        <td className="col-qty" style={tdStyle({ ...colAlign.num, ...T.med })}>{qty}</td>
                        <td className="col-total" style={tdStyle({ ...colAlign.total, ...T.semi })}>{lineTotal.toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <hr className="inv-rule-strong" style={S.solid} />

        {/* ═══ TOTALS BLOCK ═══ */}
        <div className="inv-summary inv-ink" style={{ margin: layout.marginTight, position: "relative", zIndex: 1, ...S.sectionGap }}>
          {(order?.isEdited || order?.wasEdited) && previousTotal > 0 && (
            <>
              <SummaryRow
                label="Previous Total"
                value={`Rs. ${previousTotal.toLocaleString()}`}
                valueStyle={{ fontSize: layout.summaryValue }}
              />
              <SummaryRow
                label="Difference"
                value={`${editedTotalDifference >= 0 ? "+" : "-"}Rs. ${Math.abs(editedTotalDifference).toLocaleString()}`}
                valueStyle={{ fontSize: layout.summaryValue }}
              />
              <hr className="inv-rule-soft" style={S.dashed} />
            </>
          )}

          <SummaryRow
            label="Total Items"
            value={showMinimizeSummary ? signedQtyTotal : (order?.totalQty ?? signedQtyTotal)}
            valueStyle={{ fontSize: layout.summaryValue }}
          />

          {showMinimizeSummary && orderFraqTotal !== 0 && (
            <SummaryRow
              label={t("fraqLessTotal", "Fraq Less Total")}
              value={`Rs. ${orderFraqTotal.toLocaleString()}`}
              valueStyle={{ fontSize: layout.summaryValue }}
            />
          )}

          {totalDiscount > 0 && (
            <SummaryRow
              label="Total Discount"
              value={`-Rs. ${totalDiscount.toLocaleString()}`}
              valueStyle={{ fontSize: layout.summaryValue }}
            />
          )}

          <hr className="inv-rule" style={S.solid} />

          <div className="inv-grand inv-ink" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isThermal ? "6px 8px" : "10px 12px",
            margin: "5px 0",
            gap: isThermal ? "8px" : "14px",
            flexWrap: "nowrap",
          }}>
            <span className="gt-label" style={{ ...S.labelXs, fontSize: layout.grandLabel, ...T.semi }}>
              Grand Total
            </span>
            <span className="inv-grand-value" style={{
              ...T.bold,
              fontSize: layout.grandSize,
              lineHeight: 1,
              textAlign: "right",
              flex: "1 1 auto",
              minWidth: 0,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}>
              Rs. {totalAmount.toLocaleString()}
            </span>
          </div>

          <div className="inv-words inv-ink" style={{
            ...T.meta,
            fontSize: layout.smSize,
            textAlign: "center",
            marginTop: "6px",
            marginBottom: "4px",
            lineHeight: 1.4,
            padding: "0 6px",
            fontStyle: "italic",
          }}>
            {numberToWords(totalAmount)}
          </div>

          {/* ═══ PAYMENT INFO — FIXED gap ═══ */}
          {(resolvedPaymentType || Number(order?.amountReceived || 0) > 0) && (
            <>
              <hr className="inv-rule-soft" style={S.dashed} />
              <div className="inv-payment inv-ink inv-box" style={{ fontSize: layout.summaryValue, margin: layout.marginTight, padding: "6px 8px" }}>
                {resolvedPaymentType && (
                  <SummaryRow
                    label="Payment Mode"
                    value={resolvedPaymentType.toUpperCase()}
                    valueStyle={{ ...T.bold, fontSize: layout.summaryValue }}
                  />
                )}
                {resolvedPaymentRef && (
                  <SummaryRow label="Reference" value={resolvedPaymentRef} valueStyle={{ fontSize: layout.smSize }} />
                )}
                {Number(order?.amountReceived || 0) > 0 && (
                  <SummaryRow
                    label="Cash Received"
                    value={`Rs. ${Number(order.amountReceived).toLocaleString()}`}
                    valueStyle={{ fontSize: layout.summaryValue }}
                  />
                )}
                {Number(order?.changeGiven || 0) > 0 && (
                  <SummaryRow
                    label="Change"
                    value={`Rs. ${Number(order.changeGiven).toLocaleString()}`}
                    rowStyle={{ marginTop: "4px", paddingTop: "4px", borderTop: `1px dashed ${C.borderSoft}` }}
                    valueStyle={{ ...T.bold, fontSize: layout.summaryValue }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ═══ NOTE ═══ */}
        {resolvedNote && (
          <>
            <hr className="inv-rule-soft" style={S.dashed} />
            <div className="inv-note inv-ink inv-box" style={{
              fontSize: layout.smSize,
              textAlign: "center",
              padding: "6px 8px",
              ...T.med,
              margin: "4px 0",
            }}>
              Note: {resolvedNote}
            </div>
          </>
        )}

        {/* ═══ BOTTOM ZONE ═══ */}
        <div className="bottom-zone" style={{ position: "relative", zIndex: 1 }}>
          {(showSalesperson || uniqueSalespersons.length > 0) && (
            <>
              <hr className="inv-rule-soft" style={S.dashed} />
              {showSalesperson && salesperson.name && (
                <div className="inv-served inv-ink" style={{ ...T.meta, fontSize: layout.smSize, textAlign: "center", marginBottom: "2px", padding: "2px 0" }}>
                  Salesperson: <span style={T.semi}>{salesperson.name}</span>
                </div>
              )}
              {!showSalesperson && settings?.salesperson?.showOnInvoice !== false && uniqueSalespersons.length > 0 && (
                <div className="inv-served inv-ink" style={{ ...T.meta, fontSize: layout.smSize, textAlign: "center", marginTop: "2px", padding: "2px 0" }}>
                  Salespersons: <span style={T.med}>{uniqueSalespersons.join(", ")}</span>
                </div>
              )}
            </>
          )}

          {/* ═══ QR CODE ═══ */}
          {qrRequired && (
            <>
              <hr className="inv-rule-soft" style={S.dashed} />
              <div className="qr-block inv-qr inv-ink" data-invoice-qr-slot="true" style={{ padding: isThermal ? "6px 0" : "10px 0" }}>
                <span data-aone-invoice-qr-marker="true" style={{ display: "none" }} aria-hidden="true" />
                {effectiveQrUrl ? (
                  <img
                    src={effectiveQrUrl}
                    alt={`QR ${qrSerial}`}
                    data-invoice-qr="true"
                    style={{
                      width: qrDimension, height: qrDimension, display: "block", margin: "0 auto",
                      border: `1px dashed ${C.border}`, padding: "4px", background: C.bg, borderRadius: "4px",
                    }}
                  />
                ) : (
                  <div data-invoice-qr-ph="true" style={{
                    width: qrDimension, height: qrDimension, display: "block", margin: "0 auto",
                    textAlign: "center", lineHeight: `${qrDimension}px`, background: "#fafafa",
                    fontSize: layout.xsSize, ...T.meta, border: `1px dashed ${C.borderSoft}`, borderRadius: "4px",
                  }}>
                    {qrReady ? "QR unavailable" : "Loading QR…"}
                  </div>
                )}
                <div className="inv-qr-serial" style={{
                  fontSize: layout.smSize,
                  ...T.med,
                  ...T.mono,
                  letterSpacing: "1px", marginTop: "5px",
                  textAlign: "center", width: "100%",
                }}>
                  #{qrSerial}
                </div>
                <div className="inv-served inv-ink" style={{
                  ...T.meta,
                  fontSize: layout.smSize,
                  textAlign: "center",
                  marginTop: "6px",
                  padding: "2px 0",
                }}>
                  {t('invoice.servedBy', 'Served by')}{' '}
                  <span style={T.semi}>{resolvedBillerName || '—'}</span>
                </div>
              </div>
            </>
          )}

          {/* Served by — always shown (with or without QR) */}
          {!qrRequired && (
            <>
              <hr className="inv-rule-soft" style={S.dashed} />
              <div className="inv-served inv-ink" style={{
                ...T.meta,
                fontSize: layout.smSize,
                textAlign: "center",
                marginTop: "4px",
                padding: "4px 0",
              }}>
                {t('invoice.servedBy', 'Served by')}{' '}
                <span style={T.semi}>{resolvedBillerName || '—'}</span>
              </div>
            </>
          )}

          {/* ═══ FOOTER ═══ */}
          <hr className="inv-rule-strong" style={S.doubleLine} />
          <div className="inv-footer inv-ink footer-block" style={{
            fontSize: layout.smSize, textAlign: "center", width: "100%",
            padding: isThermal ? "6px 2px" : "10px 4px", ...T.meta,
          }}>
            <div style={{
              wordBreak: "break-word", marginBottom: "4px", ...T.med,
              textAlign: "center", fontSize: layout.mdSize, lineHeight: 1.4,
            }}>
              {footerNote}
            </div>
            {store?.name && (
              <div className="footer-store" style={{
                fontSize: layout.mdSize, textAlign: "center", ...T.semi,
                textTransform: "uppercase", letterSpacing: "0.6px", marginTop: "3px",
              }}>
                {store.name}
              </div>
            )}
            {store?.address && (
              <div style={{ fontSize: layout.smSize, ...T.meta, marginTop: "2px" }}>
                {store.address}
              </div>
            )}
            {store?.phone && (
              <div style={{ ...T.med, fontSize: layout.smSize, marginTop: "2px" }}>
                Ph: {store.phone}
              </div>
            )}
            <div className="footer-powered" style={{ ...T.meta, textAlign: "center", fontSize: layout.xsSize, marginTop: "5px", letterSpacing: "0.3px" }}>
              Powered by A One POS v7
            </div>
          </div>
        </div>
      </div>
    );
  }, [paperSize, serialNo, qrSerial, qrRequired, qrReady, store, order, effectiveQrUrl, footerNote, showReprintWatermark, showDualModeBadge, showOfflineBillBadge, showOfflinePayBadge, resolvedOfflineLines, resolvedBillerName, resolvedNote, resolvedPaymentType, resolvedPaymentRef, items, totalAmount, totalDiscount, customer, invoiceCustomerView, showSalesperson, salesperson, billDate, fontSize, settings, previousTotal, editedTotalDifference, uniqueSalespersons, showMinimizeSummary, t]);

  // ═══════════════════════════════════════════════════════════
  // § 9. DIRECT PRINT — Windows print dialog, no preview UI
  // ═══════════════════════════════════════════════════════════

  if (directPrint) {
    return (
      <>
        <div aria-hidden="true" style={{ position: "fixed", left: "-10000px", top: 0, width: "80mm", minHeight: "200px", overflow: "visible", pointerEvents: "none", zIndex: -1 }}>
          <div ref={printRef}><ReceiptContent /></div>
        </div>
        <button
          type="button"
          onClick={safeClose}
          title="Skip print [ESC]"
          className={cn(
            "fixed right-3 top-1/2 z-[310] -translate-y-1/2 rounded-xl border px-3 py-2 text-xs font-bold shadow-lg transition-colors",
            isDark
              ? "border-white/20 bg-black/85 text-gray-200 hover:bg-white/10"
              : "border-gray-300 bg-white/95 text-gray-700 hover:bg-gray-50",
          )}
        >
          Skip
        </button>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // § 10. PREVIEW MODAL UI (reprint / manual view)
  // ═══════════════════════════════════════════════════════════

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-3 sm:p-4"
      onClick={safeClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Invoice ${serialNo}`}
      data-biller-modal="true"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative flex max-h-[95vh] w-full max-w-[420px] flex-col rounded-2xl shadow-2xl overflow-hidden",
          isDark ? "bg-[#15120d] border border-yellow-500/20" : "bg-white border border-yellow-200",
        )}
      >
        <div className={cn("flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0", isDark ? "border-yellow-500/20" : "border-yellow-100")}>
          <div className="flex items-center gap-2 min-w-0">
            <Printer size={14} className="text-yellow-500 flex-shrink-0" />
            <span className={cn("font-bold text-sm truncate", isDark ? "text-white" : "text-gray-900")}>Invoice</span>
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0", isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700")}>#{serialNo}</span>
            <SyncBadge status={syncStatus} isDark={isDark} />
          </div>
          <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={safeClose} title="Close [ESC]" className={cn("p-1.5 rounded-lg transition-colors", isDark ? "text-gray-400 hover:bg-white/8" : "text-gray-500 hover:bg-gray-100")}>
            <X size={13} />
          </motion.button>
        </div>

        <div className={cn("flex items-center gap-1.5 px-3 py-2 border-b", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
          {PAPER_SIZES.map(({ id, label, icon: Ico, hint }) => {
            const active = paperSize === id;
            return (
              <motion.button key={id} type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setPaperSize(id)} title={`${label} [${hint}]`}
                className={cn("flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border transition-all font-semibold",
                  active ? isDark ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-400" : "bg-yellow-100 border-yellow-300 text-yellow-700"
                    : isDark ? "bg-gray-700/30 border-gray-600/30 text-gray-400 hover:bg-gray-700/50" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100")}>
                <Ico size={11} /><span>{label}</span>
                {active && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}><Check size={9} /></motion.div>}
              </motion.button>
            );
          })}
        </div>

        <div className={cn("flex-1 overflow-y-auto flex justify-center p-3", isDark ? "bg-[#0a0908]" : "bg-gray-100")}>
          <motion.div
            key={paperSize}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            style={{
              width: paperConfig.width,
              maxWidth: paperConfig.previewMax,
              minWidth: paperSize === "thermal" ? "260px" : "auto",
              fontFamily: paperSize === "thermal" ? THERMAL_FONT_STACK : paperConfig.font,
              fontWeight: 400,
              color: "#000",
              background: "#fff",
              padding: paperSize === "thermal" ? "10px 12px" : "14px 18px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              borderRadius: 8,
            }}
          >
            <div ref={printRef}><ReceiptContent /></div>
          </motion.div>
        </div>

        {extraFooter}

        <div className={cn("px-4 py-3 border-t flex-shrink-0 flex gap-2", isDark ? "border-yellow-500/20 bg-[#15120d]" : "border-yellow-200 bg-gray-50")}>
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={safeClose} title="Cancel [ESC]"
            className={cn("flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold border active:scale-95 transition-all",
              isDark ? "border-white/15 text-gray-300 hover:bg-white/8" : "border-gray-300 text-gray-700 hover:bg-gray-100")}>
            <X size={15} />Cancel
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={handlePrintAndClose} disabled={printing} title="Print & close [F8]"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 py-2.5 text-sm font-bold text-black hover:from-yellow-400 hover:to-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed">
            <Printer size={15} />
            {printing ? "Printing…" : (qrRequired && !qrHasImage ? "Print (loading QR…)" : "Print")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default memo(InvoicePrint);