// src/components/biller/InvoicePrint.jsx
// ✅ MASTER ARCHITECTURE v5 — PRODUCTION READY
// ✅ FIXED: BroadcastChannel for F8 completion
// ✅ FIXED: onF8Press callback prop

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  memo,
  useMemo,
} from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer,
  X,
  FileText,
  Smartphone,
  Maximize2,
  Settings,
  Volume2,
  VolumeX,
  Check,
  Keyboard,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../hooks/useLanguage";
import { useSettings } from "../../context/SettingsContext";
import { cn } from "../../utils/cn";

// ═══════════════════════════════════════════════════════════════
// § 1. CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const PAPER_SIZES = [
  {
    id: "thermal",
    label: "Thermal",
    icon: Smartphone,
    hint: "Alt+1",
    width: "72mm",
    maxWidth: "72mm",
    previewMax: "280px",
    font: "'Courier New',Courier,monospace",
  },
  {
    id: "a4",
    label: "A4",
    icon: Maximize2,
    hint: "Alt+2",
    width: "100%",
    maxWidth: "210mm",
    previewMax: "340px",
    font: "Arial,sans-serif",
  },
  {
    id: "a5",
    label: "A5",
    icon: FileText,
    hint: "Alt+3",
    width: "100%",
    maxWidth: "148mm",
    previewMax: "300px",
    font: "Arial,sans-serif",
  },
];

const SYNC_STATUS_CONFIG = {
  synced: {
    label: "Synced",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    icon: Check,
  },
  pending: {
    label: "Pending",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    icon: RefreshCw,
  },
  failed: {
    label: "Sync Failed",
    color: "text-red-500",
    bg: "bg-red-500/10",
    icon: AlertCircle,
  },
  syncing: {
    label: "Syncing…",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    icon: RefreshCw,
  },
};

// ═══════════════════════════════════════════════════════════════
// § 2. PURE UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const fmtTime = (d) => {
  if (!d) return "—";
  const dd = d instanceof Date ? d : new Date(d?.seconds ? d.seconds * 1000 : d);
  return isNaN(dd) ? "—" : dd.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const fmtDate = (d) => {
  if (!d) return "—";
  const dd = d instanceof Date ? d : new Date(d?.seconds ? d.seconds * 1000 : d);
  return isNaN(dd) ? "—" : dd.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const resolveDate = (createdAt) => {
  if (!createdAt) return new Date();
  if (createdAt instanceof Date) return isNaN(createdAt) ? new Date() : createdAt;
  if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
  const d = new Date(createdAt);
  return isNaN(d) ? new Date() : d;
};

const truncName = (raw = "", maxLen = 20) => {
  const clean = raw.startsWith("Item - ITEM-")
    ? raw.replace(/^Item - ITEM-[0-9]+-[0-9]+-?/, "").trim()
    : raw;
  return (clean || "Item").length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
};

const generateHash = (billId, amount) => {
  const seed = `${billId}_${amount}_AONE2026`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 8).padEnd(8, "X");
};

const buildQrPayload = (order, store, serialNo) => {
  const amount = Number(order?.totalAmount) || 0;
  const hash = generateHash(serialNo, amount);
  return JSON.stringify({
    id: serialNo,
    amt: amount,
    qty: order?.totalQty || 0,
    ts: Date.now(),
    h: hash,
    s: (store?.name || "STORE").slice(0, 20),
    v: "5.0",
  });
};

const numberToWords = (num) => {
  if (!num || num === 0) return "Zero Rupees Only";
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
    "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety",
  ];

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
// § 3. CSS STYLES
// ═══════════════════════════════════════════════════════════════

const THERMAL_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; width: 72mm; max-width: 72mm; margin: 0 auto; padding: 3mm 4mm; line-height: 1.35; overflow-x: hidden; word-wrap: break-word; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 1px 2px; font-size: 10px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
  th { border-bottom: 1px solid #000; font-weight: bold; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .dashed { border-top: 1px dashed #000; margin: 3px 0; }
  .solid { border-top: 1px solid #000; margin: 3px 0; }
  .qr { text-align: center; padding: 4px 0; }
  .qr img { display: block; margin: 0 auto; width: 88px; height: 88px; }
  .serial-box { font-size: 14px; font-weight: 900; font-family: monospace; letter-spacing: 3px; border: 2px solid #000; display: inline-block; padding: 2px 8px; margin: 3px auto; }
  .watermark { position: fixed; top: 35%; left: 5%; opacity: 0.07; font-size: 36px; font-weight: 900; transform: rotate(-30deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
  @media print { html, body { width: 72mm; max-width: 72mm; padding: 2mm 3mm; } @page { margin: 0; size: 80mm auto; } .watermark { position: absolute; } }
`;

const A4_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; width: 210mm; margin: 0 auto; padding: 15mm; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; font-size: 11px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; font-weight: bold; border-bottom: 2px solid #000; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .dashed { border-top: 1px dashed #000; margin: 6px 0; }
  .solid { border-top: 2px solid #000; margin: 6px 0; }
  .qr { text-align: center; padding: 8px 0; }
  .qr img { width: 110px; height: 110px; display: block; margin: 0 auto; }
  .serial-box { font-size: 18px; font-weight: 900; letter-spacing: 3px; border: 2px solid #000; display: inline-block; padding: 4px 12px; margin: 4px auto; }
  .watermark { position: fixed; top: 40%; left: 15%; opacity: 0.06; font-size: 72px; font-weight: 900; transform: rotate(-30deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
  @media print { @page { margin: 10mm; size: A4; } .watermark { position: absolute; } }
`;

const A5_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; width: 148mm; margin: 0 auto; padding: 10mm; line-height: 1.4; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; font-size: 10px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; font-weight: bold; border-bottom: 2px solid #000; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: bold; }
  .dashed { border-top: 1px dashed #000; margin: 4px 0; }
  .solid { border-top: 1px solid #000; margin: 4px 0; }
  .qr { text-align: center; padding: 6px 0; }
  .qr img { width: 90px; height: 90px; display: block; margin: 0 auto; }
  .serial-box { font-size: 15px; font-weight: 900; letter-spacing: 2px; border: 2px solid #000; display: inline-block; padding: 2px 10px; margin: 3px auto; }
  .watermark { position: fixed; top: 38%; left: 10%; opacity: 0.07; font-size: 54px; font-weight: 900; transform: rotate(-30deg); pointer-events: none; user-select: none; color: #000; z-index: 0; }
  @media print { @page { margin: 8mm; size: A5; } .watermark { position: absolute; } }
`;

const CSS_MAP = { thermal: THERMAL_CSS, a4: A4_CSS, a5: A5_CSS };

// ═══════════════════════════════════════════════════════════════
// § 4. SOUND HELPER
// ═══════════════════════════════════════════════════════════════

const playSound = (enabled, type = "print") => {
  if (!enabled) return;
  const paths = { print: "/sounds/print.mp3", open: "/sounds/open.mp3", success: "/sounds/success.mp3" };
  try {
    const a = new Audio(paths[type] || paths.print);
    a.volume = 0.65;
    a.play().catch(() => {});
  } catch {}
};

// ═══════════════════════════════════════════════════════════════
// § 5. BROADCAST CHANNEL
// ═══════════════════════════════════════════════════════════════

const getPrintChannel = () => {
  try { return new BroadcastChannel("aone_print_events"); } catch { return null; }
};

// ═══════════════════════════════════════════════════════════════
// § 6. KEYBOARD HINTS
// ═══════════════════════════════════════════════════════════════

const KeyboardHints = memo(({ isDark }) => (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 4 }}
    className={cn(
      "absolute bottom-full mb-2 right-0 z-50 rounded-xl border shadow-xl p-3 text-[10px] min-w-[180px]",
      isDark ? "bg-[#1a1710] border-yellow-500/20 text-gray-300" : "bg-white border-gray-200 text-gray-600",
    )}
  >
    <div className="font-bold mb-1.5 text-[11px]"><Keyboard size={10} className="inline mr-1" />Shortcuts</div>
    {[
      ["F8", "Print & Close"],
      ["Ctrl+P", "Print only"],
      ["Ctrl+M", "Toggle sound"],
      ["Alt+1", "Thermal paper"],
      ["Alt+2", "A4 paper"],
      ["Alt+3", "A5 paper"],
      ["ESC", "Close / Back"],
    ].map(([key, desc]) => (
      <div key={key} className="flex justify-between gap-4 py-0.5">
        <kbd className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono font-bold", isDark ? "bg-gray-700 text-yellow-400" : "bg-gray-100 text-gray-700")}>{key}</kbd>
        <span className="text-right">{desc}</span>
      </div>
    ))}
  </motion.div>
));
KeyboardHints.displayName = "KeyboardHints";

// ═══════════════════════════════════════════════════════════════
// § 7. SYNC BADGE
// ═══════════════════════════════════════════════════════════════

const SyncBadge = memo(({ status, isDark }) => {
  const cfg = SYNC_STATUS_CONFIG[status] || SYNC_STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const isSpinning = status === "syncing" || status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold", cfg.bg, cfg.color)}
    >
      <motion.div animate={isSpinning ? { rotate: 360 } : {}} transition={isSpinning ? { repeat: Infinity, duration: 1.5, ease: "linear" } : {}}>
        <Icon size={9} />
      </motion.div>
      <span>{cfg.label}</span>
    </motion.div>
  );
});
SyncBadge.displayName = "SyncBadge";

// ═══════════════════════════════════════════════════════════════
// § 8. PRINT HTML BUILDER
// ═══════════════════════════════════════════════════════════════

const buildPrintHtml = ({ bodyHtml, css, serialNo, copies }) => {
  const copyDivider = '<div style="page-break-after:always;"></div>';
  const repeated = Array(copies).fill(`<div>${bodyHtml}</div>`).join(copyDivider);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice #${serialNo}</title>
  <style>${css}</style>
</head>
<body>
${repeated}
<script>
  window.onload = function() {
    setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 1000); }, 300);
  };
<\/script>
</body>
</html>`;
};

// ═══════════════════════════════════════════════════════════════
// § 9. MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const InvoicePrint = ({
  order,
  store,
  onClose,
  directPrint = false,
  autoClose = false,
  fontSize,
  defaultSize = "thermal",
  isReprint = false,
  soundEnabled = false,
  billNote = "",
  paymentType = "",
  paymentReference = "",
  billerName = "",
  onF8Press,  // ✅ ADDED: callback for F8 completion
}) => {
  // ── Context hooks ────────────────────────────────────────────
  const { isDark } = useTheme();
  const { dir } = useLanguage();
  const { settings } = useSettings();

  // ── Refs ────────────────────────────────────────────────────
  const printRef = useRef(null);
  const hasPrinted = useRef(false);
  const hasClosedRef = useRef(false);
  const channelRef = useRef(null);

  // ── State ───────────────────────────────────────────────────
  const [qrUrl, setQrUrl] = useState("");
  const [qrReady, setQrReady] = useState(false);
  const [paperSize, setPaperSize] = useState(defaultSize);
  const [showSettings, setShowSettings] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [copies, setCopies] = useState(1);
  const [localSoundEnabled, setLocalSoundEnabled] = useState(() => {
    try {
      const uid = localStorage.getItem("aone_current_user") || "default";
      const stored = localStorage.getItem(`aone_sound_enabled_${uid}`);
      if (stored !== null) return stored === "true";
    } catch {}
    return typeof soundEnabled === "boolean" ? soundEnabled : false;
  });

  // ── Memoized values ──────────────────────────────────────────
  const serialNo = useMemo(() => order?.serialNo || order?.billSerial || "----", [order]);
  const items = useMemo(() => (order?.items || order?.cartItems || order?.products || order?.orderItems || []).filter(Boolean), [order]);
  const totalAmount = useMemo(() => Number(order?.totalAmount || 0), [order]);
  const totalDiscount = useMemo(() => Number(order?.totalDiscount || 0), [order]);
  const billDate = useMemo(() => resolveDate(order?.createdAt), [order?.createdAt]);
  const salesperson = useMemo(() => order?.salesperson || order?.salesAgent || {}, [order]);
  const showSalesperson = useMemo(() => settings?.salesperson?.showOnInvoice !== false && !!salesperson?.name, [settings, salesperson]);
  
  const uniqueSalespersons = useMemo(() => {
    const names = new Set();
    const agents = [];
    (order?.items || order?.cartItems || order?.products || order?.orderItems || []).forEach(i => {
      if (i.salespersonName && !names.has(i.salespersonName)) {
        names.add(i.salespersonName);
        agents.push(i.salespersonName);
      }
    });
    return agents;
  }, [order]);
  const footerNote = useMemo(() => settings?.invoice?.footerNote || "Thank you for your business!", [settings]);
  const syncStatus = useMemo(() => order?.syncStatus || "pending", [order]);
  const resolvedBillerName = useMemo(() => order?.billerName || billerName || "", [order, billerName]);
  const resolvedNote = useMemo(() => order?.billNote || billNote || "", [order, billNote]);
  const resolvedPaymentType = useMemo(() => order?.paymentType || paymentType || "", [order, paymentType]);
  const resolvedPaymentRef = useMemo(() => order?.paymentReference || paymentReference || "", [order, paymentReference]);
  const customer = useMemo(() => order?.customer || {}, [order]);
  const isWalkingCustomer = useMemo(() => !customer?.name || /^Walking\s*Customer$/i.test(customer.name) || /^Walk-?in$/i.test(customer.name), [customer]);
  const paperConfig = useMemo(() => PAPER_SIZES.find((p) => p.id === paperSize) || PAPER_SIZES[0], [paperSize]);

  // ── QR Code generation ───────────────────────────────────────
  useEffect(() => {
    hasPrinted.current = false;
    hasClosedRef.current = false;
    setQrUrl("");
    setQrReady(false);

    if (!serialNo || serialNo === "----") { setQrReady(true); return; }

    const qrData = buildQrPayload(order, store, serialNo);

    QRCode.toDataURL(qrData, { width: 150, margin: 1, errorCorrectionLevel: "H", color: { dark: "#000000", light: "#FFFFFF" } })
      .then((url) => { setQrUrl(url); setQrReady(true); })
      .catch(() => {
        QRCode.toDataURL(serialNo, { width: 100, margin: 1, errorCorrectionLevel: "M" })
          .then((url) => { setQrUrl(url); setQrReady(true); })
          .catch(() => { setQrUrl(""); setQrReady(true); });
      });
  }, [serialNo, order, store]);

  // ── BroadcastChannel setup ────────────────────────────────────
  useEffect(() => {
    channelRef.current = getPrintChannel();
    return () => { try { channelRef.current?.close(); } catch {} };
  }, []);

  // ── Sound on open ────────────────────────────────────────────
  useEffect(() => {
    if (!directPrint) playSound(localSoundEnabled, "open");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getCurrentCss = useCallback(() => CSS_MAP[paperSize] || CSS_MAP.thermal, [paperSize]);

  // ── Core print handler ───────────────────────────────────────
  const handlePrint = useCallback(() => {
    const content = printRef.current;
    if (!content) return;

    const bodyHtml = content.innerHTML;
    const css = getCurrentCss();
    const html = buildPrintHtml({ bodyHtml, css, serialNo, copies });

    let printed = false;

    // Strategy 1: popup window
    try {
      const win = window.open("", `aone_print_${Date.now()}`, "width=420,height=750,toolbar=no,menubar=no,scrollbars=yes");
      if (win) { win.document.write(html); win.document.close(); printed = true; }
    } catch {}

    // Strategy 2: iframe fallback
    if (!printed) {
      try {
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;border:none;";
        document.body.appendChild(iframe);
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (idoc) {
          idoc.open(); idoc.write(html); idoc.close();
          iframe.contentWindow?.focus();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 4000);
          }, 300);
          printed = true;
        }
      } catch {}
    }

    if (printed) {
      playSound(localSoundEnabled, "print");

      // Broadcast to other tabs
      try { channelRef.current?.postMessage({ type: "PRINT_EXECUTED", serialNo, ts: Date.now() }); } catch {}

      // ✅ NEW: Broadcast F8 completion for BillerDashboard
      try {
        const billingChannel = new BroadcastChannel('aone_pos_billing');
        billingChannel.postMessage({ type: 'F8_COMPLETED', serialNo, timestamp: Date.now() });
        billingChannel.close();
      } catch {}
    }
  }, [serialNo, copies, getCurrentCss, localSoundEnabled]);

  // ── Direct print mode ─────────────────────────────────────────
  useEffect(() => {
    if (!directPrint || !qrReady || hasPrinted.current) return;
    hasPrinted.current = true;

    const timer = setTimeout(() => {
      handlePrint();
      if (!hasClosedRef.current) { hasClosedRef.current = true; onClose?.(); }
    }, 200);

    return () => clearTimeout(timer);
  }, [directPrint, qrReady, handlePrint, onClose]);

  // ── Sound toggle ──────────────────────────────────────────────
  const toggleSound = useCallback(() => {
    try {
      const uid = localStorage.getItem("aone_current_user") || "default";
      const next = !localSoundEnabled;
      localStorage.setItem(`aone_sound_enabled_${uid}`, String(next));
      setLocalSoundEnabled(next);
      if (next) playSound(true, "success");
    } catch {}
  }, [localSoundEnabled]);

  const safeClose = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    onClose?.();
  }, [onClose]);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    if (directPrint) return;

    const handler = (e) => {
      // F8 → Print & Close
      if (e.key === "F8") {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
        setTimeout(safeClose, 300);
        return;
      }

      // Ctrl+P → Print only
      if (e.ctrlKey && e.key.toLowerCase() === "p") { e.preventDefault(); e.stopPropagation(); handlePrint(); return; }

      // Ctrl+M → Toggle sound
      if (e.ctrlKey && e.key.toLowerCase() === "m") { e.preventDefault(); e.stopPropagation(); toggleSound(); return; }

      // ESC
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (showHints) { setShowHints(false); return; }
        if (showSettings) { setShowSettings(false); return; }
        safeClose();
        return;
      }

      // Alt+1/2/3 → paper size
      if (e.altKey && e.key === "1") { e.preventDefault(); setPaperSize("thermal"); }
      if (e.altKey && e.key === "2") { e.preventDefault(); setPaperSize("a4"); }
      if (e.altKey && e.key === "3") { e.preventDefault(); setPaperSize("a5"); }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [directPrint, handlePrint, safeClose, toggleSound, showSettings, showHints]);

  // ═══════════════════════════════════════════════════════════
  // § 10. RECEIPT CONTENT
  // ═══════════════════════════════════════════════════════════

  const ReceiptContent = useCallback(() => {
    const isThermal = paperSize === "thermal";
    const S = {
      root: { width: "100%", fontFamily: isThermal ? "'Courier New',Courier,monospace" : "Arial,sans-serif", fontSize: isThermal ? "11px" : "12px", color: "#000", background: "#fff", position: "relative", overflow: "hidden" },
      center: { textAlign: "center" },
      bold: { fontWeight: "900" },
      dashed: { borderTop: "1px dashed #000", margin: "3px 0" },
      solid: { borderTop: "1px solid #000", margin: "3px 0" },
      labelXs: { fontSize: "9px", color: "#555", textTransform: "uppercase", letterSpacing: "0.8px" },
      rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    };
    const qrDimension = isThermal ? 88 : 110;

    return (
      <div style={S.root}>
        {/* REPRINT watermark */}
        {isReprint && (
          <div style={{ position: "absolute", top: isThermal ? "35%" : "40%", left: isThermal ? "5%" : "15%", opacity: 0.07, fontSize: isThermal ? "36px" : "72px", fontWeight: "900", transform: "rotate(-30deg)", pointerEvents: "none", userSelect: "none", color: "#000", zIndex: 0, whiteSpace: "nowrap" }}>
            REPRINT
          </div>
        )}

        {/* STORE HEADER */}
        <div style={{ ...S.center, marginBottom: "4px", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: isThermal ? "15px" : "22px", fontWeight: "900", letterSpacing: "2px" }}>{store?.name || "A ONE JEWELRY"}</div>
          {store?.tagline && <div style={{ fontSize: "9px", marginTop: "1px", fontStyle: "italic" }}>{store.tagline}</div>}
          {store?.address && <div style={{ fontSize: "9px", marginTop: "1px" }}>{store.address}</div>}
          {store?.phone && <div style={{ fontSize: "9px" }}>Ph: {store.phone}</div>}
          {store?.email && <div style={{ fontSize: "8px", color: "#555" }}>{store.email}</div>}
          {store?.ntn && <div style={{ fontSize: "8px", color: "#555" }}>NTN: {store.ntn}</div>}
        </div>

        <div style={S.dashed} />

        {/* BILL SERIAL + DATE */}
        <div style={{ ...S.center, marginBottom: "4px" }}>
          <div style={{ fontSize: isThermal ? "14px" : "18px", fontWeight: "900", fontFamily: "monospace", letterSpacing: "3px", border: "2px solid #000", display: "inline-block", padding: isThermal ? "2px 8px" : "4px 14px", margin: "3px auto" }}>#{serialNo}</div>
          {isReprint && <div style={{ fontSize: "8px", background: "#000", color: "#fff", display: "inline-block", padding: "1px 6px", borderRadius: "2px", margin: "2px auto" }}>★ REPRINT ★</div>}
          <div style={{ fontSize: "9px", marginTop: "3px" }}>{billDate.toLocaleDateString("en-PK", { weekday: "short", year: "numeric", month: "short", day: "2-digit" })}</div>
          <div style={{ fontSize: "9px" }}>{fmtTime(order?.billStartTime)} — {fmtTime(order?.billEndTime || billDate)}</div>
        </div>

        {/* CUSTOMER INFO */}
        {!isWalkingCustomer && (
          <>
            <div style={S.dashed} />
            <div style={{ fontSize: "10px", marginBottom: "3px" }}>
              {customer.name && <div style={S.rowBetween}><span style={S.bold}>Customer:</span><span>{customer.name}</span></div>}
              {customer.phone && <div style={S.rowBetween}><span style={S.bold}>Phone:</span><span>{customer.phone}</span></div>}
              {customer.address && <div style={{ fontSize: "9px", color: "#555", marginTop: "1px" }}>{customer.address}</div>}
            </div>
          </>
        )}

        <div style={S.dashed} />

        {/* ITEMS TABLE */}
        {items.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isThermal ? "11px" : "11px", marginBottom: "2px", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #000" }}>
                <th style={{ width: "20px", padding: "1px 2px", fontWeight: "900", fontSize: "10px" }}>#</th>
                <th style={{ textAlign: "right", width: "24px", padding: "1px 2px", fontWeight: "900", fontSize: "10px" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "1px 2px", fontWeight: "900", fontSize: "10px" }}>Rate</th>
                {totalDiscount > 0 && <th style={{ textAlign: "right", width: "34px", padding: "1px 2px", fontWeight: "900", fontSize: "10px" }}>Disc</th>}
                <th style={{ textAlign: "right", width: "44px", padding: "1px 2px", fontWeight: "900", fontSize: "10px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const price = Number(item.price || item.rate || 0);
                const qty = Number(item.qty || item.quantity || 1);
                const discVal = Number(item.discount || 0);
                const discAmt = item.discountType === "percent" ? Math.round((price * discVal) / 100) : discVal;
                const lineTotal = (price - discAmt) * qty;

                return (
                  <tr key={idx} style={{ borderBottom: "1px dotted #ccc" }}>
                    <td style={{ padding: "1px 2px", fontSize: "10px" }}>{String(idx + 1).padStart(2, "0")}</td>
                    <td style={{ textAlign: "right", padding: "1px 2px", fontWeight: "900" }}>{qty}</td>
                    <td style={{ textAlign: "right", padding: "1px 2px" }}>{price.toLocaleString()}</td>
                    {totalDiscount > 0 && <td style={{ textAlign: "right", padding: "1px 2px", color: "#c00" }}>{discAmt > 0 ? `-${discAmt.toLocaleString()}` : "—"}</td>}
                    <td style={{ textAlign: "right", padding: "1px 2px", fontWeight: "900" }}>{lineTotal.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={S.solid} />

        {/* TOTALS BLOCK */}
        <div style={{ margin: "4px 0", position: "relative", zIndex: 1 }}>
          <div style={{ ...S.rowBetween, marginBottom: "2px" }}>
            <span style={S.labelXs}>Total Items</span>
            <span style={{ fontWeight: "900", fontSize: isThermal ? "13px" : "15px" }}>{order?.totalQty || items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}</span>
          </div>
          {totalDiscount > 0 && (
            <div style={{ ...S.rowBetween, marginBottom: "2px", fontSize: "10px" }}>
              <span>Total Discount:</span>
              <span style={{ ...S.bold, color: "#c00" }}>-Rs.{totalDiscount.toLocaleString()}</span>
            </div>
          )}
          <div style={S.dashed} />
          <div style={{ ...S.rowBetween, margin: "4px 0" }}>
            <span style={S.labelXs}>Grand Total</span>
            <span style={{ fontWeight: "900", fontSize: isThermal ? "20px" : "26px" }}>Rs.{totalAmount.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: "9px", fontStyle: "italic", textAlign: "center", color: "#444", marginBottom: "3px" }}>{numberToWords(totalAmount)}</div>

          {(resolvedPaymentType || Number(order?.amountReceived || 0) > 0) && (
            <>
              <div style={S.dashed} />
              <div style={{ fontSize: "10px", margin: "3px 0" }}>
                {resolvedPaymentType && <div style={{ ...S.rowBetween, marginBottom: "1px" }}><span>Payment Mode:</span><span style={S.bold}>{resolvedPaymentType.toUpperCase()}</span></div>}
                {resolvedPaymentRef && <div style={{ ...S.rowBetween, marginBottom: "1px" }}><span>Reference:</span><span style={{ ...S.bold, fontSize: "9px" }}>{resolvedPaymentRef}</span></div>}
                {Number(order?.amountReceived || 0) > 0 && <div style={{ ...S.rowBetween, marginBottom: "1px" }}><span>Cash Received:</span><span style={S.bold}>Rs.{Number(order.amountReceived).toLocaleString()}</span></div>}
                {Number(order?.changeGiven || 0) > 0 && <div style={{ ...S.rowBetween, padding: "2px 4px", background: "#e8f5e9", borderRadius: "3px" }}><span style={S.bold}>Change:</span><span style={{ ...S.bold, color: "#1b5e20" }}>Rs.{Number(order.changeGiven).toLocaleString()}</span></div>}
              </div>
            </>
          )}
        </div>

        {/* BILL NOTE */}
        {resolvedNote && (<><div style={S.dashed} /><div style={{ fontSize: "9px", fontStyle: "italic", textAlign: "center", padding: "2px 0" }}>📝 {resolvedNote}</div></>)}

        {/* SERVED BY */}
        {(resolvedBillerName || showSalesperson || uniqueSalespersons.length > 0) && (
          <>
            <div style={S.dashed} />
            {resolvedBillerName && <div style={{ fontSize: "9px", textAlign: "center", color: "#555" }}>Served by: {resolvedBillerName}</div>}
            {showSalesperson && salesperson.name && (
              <div style={{ fontSize: "9px", textAlign: "center", color: "#555", marginTop: "1px" }}>
                Salesperson: {salesperson.name}
                {Number(salesperson.commissionAmount || 0) > 0 && <span style={{ display: "block", fontSize: "8px", color: "#777", marginTop: "1px" }}>Commission: Rs.{Number(salesperson.commissionAmount).toLocaleString()}</span>}
              </div>
            )}
            {!showSalesperson && settings?.salesperson?.showOnInvoice !== false && uniqueSalespersons.length > 0 && (
              <div style={{ fontSize: "9px", textAlign: "center", color: "#555", marginTop: "1px" }}>
                Salespersons: {uniqueSalespersons.join(", ")}
              </div>
            )}
          </>
        )}

        {/* QR CODE */}
        {qrUrl && (<><div style={S.dashed} /><div style={{ textAlign: "center", margin: "4px 0 2px" }}><img src={qrUrl} alt={`QR ${serialNo}`} style={{ width: qrDimension, height: qrDimension, display: "inline-block", border: "1px solid #ddd", padding: "3px", background: "#fff" }} /><div style={{ fontSize: "8px", color: "#888", marginTop: "1px" }}>Scan to verify</div></div></>)}

        {/* FOOTER */}
        <div style={S.solid} />
        <div style={{ textAlign: "center", fontSize: "9px", paddingTop: "3px" }}>
          <div style={{ wordBreak: "break-word", marginBottom: "1px" }}>{footerNote}</div>
          {store?.name && <div style={{ fontWeight: "900", fontSize: "10px", marginTop: "1px" }}>{store.name}</div>}
          <div style={{ fontSize: "8px", marginTop: "2px", color: "#999" }}>Powered by A One POS v5</div>
        </div>
      </div>
    );
  }, [paperSize, serialNo, store, order, qrUrl, footerNote, isReprint, resolvedBillerName, resolvedNote, resolvedPaymentType, resolvedPaymentRef, items, totalAmount, totalDiscount, customer, isWalkingCustomer, showSalesperson, salesperson, billDate]);

  // ═══════════════════════════════════════════════════════════
  // § 11. DIRECT PRINT MODE
  // ═══════════════════════════════════════════════════════════

  if (directPrint) {
    return (
      <div aria-hidden="true" style={{ position: "fixed", top: -99999, left: -99999, opacity: 0, pointerEvents: "none", width: "80mm", zIndex: -1 }}>
        <div ref={printRef}><ReceiptContent /></div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // § 12. PREVIEW MODAL UI
  // ═══════════════════════════════════════════════════════════

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-3 sm:p-4"
        onClick={safeClose}
        aria-modal="true"
        role="dialog"
        aria-label={`Invoice ${serialNo}`}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "relative flex max-h-[95vh] w-full max-w-[400px] flex-col rounded-2xl shadow-2xl overflow-hidden",
            isDark ? "bg-[#15120d] border border-yellow-500/20" : "bg-white border border-yellow-200",
          )}
        >
          {/* MODAL HEADER */}
          <div className={cn("flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0", isDark ? "border-yellow-500/20" : "border-yellow-100")}>
            <div className="flex items-center gap-2 min-w-0">
              <Printer size={14} className="text-yellow-500 flex-shrink-0" />
              <span className={cn("font-bold text-sm truncate", isDark ? "text-white" : "text-gray-900")}>Invoice</span>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0", isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700", )}>#{serialNo}</span>
              <SyncBadge status={syncStatus} isDark={isDark} />
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={toggleSound} title={`Sound ${localSoundEnabled ? "ON" : "OFF"} [Ctrl+M]`} className={cn("p-1.5 rounded-lg transition-colors border", localSoundEnabled ? isDark ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "bg-yellow-50 text-yellow-700 border-yellow-300" : isDark ? "bg-gray-700/40 text-gray-400 border-gray-600/40" : "bg-gray-100 text-gray-400 border-gray-200")}>
                <AnimatePresence mode="wait">
                  <motion.div key={localSoundEnabled ? "vol-on" : "vol-off"} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.12 }}>
                    {localSoundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  </motion.div>
                </AnimatePresence>
              </motion.button>

              <div className="relative">
                <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => setShowHints((p) => !p)} title="Keyboard shortcuts" className={cn("p-1.5 rounded-lg transition-colors", showHints ? isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700" : isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100")}>
                  <Keyboard size={12} />
                </motion.button>
                <AnimatePresence>{showHints && <KeyboardHints isDark={isDark} />}</AnimatePresence>
              </div>

              <motion.button type="button" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} onClick={() => setShowSettings((p) => !p)} title="Settings" className={cn("p-1.5 rounded-lg transition-colors", showSettings ? isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700" : isDark ? "text-gray-400 hover:bg-white/5" : "text-gray-500 hover:bg-gray-100")}>
                <Settings size={12} />
              </motion.button>

              <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={safeClose} title="Close [ESC]" className={cn("p-1.5 rounded-lg transition-colors", isDark ? "text-gray-400 hover:bg-white/8" : "text-gray-500 hover:bg-gray-100")}>
                <X size={13} />
              </motion.button>
            </div>
          </div>

          {/* PAPER SIZE TABS */}
          <div className={cn("flex items-center gap-1 px-3 py-2 border-b", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
            {PAPER_SIZES.map(({ id, label, icon: Ico, hint }) => {
              const active = paperSize === id;
              return (
                <motion.button key={id} type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setPaperSize(id)} title={`${label} [${hint}]`} className={cn("flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border transition-all font-medium", active ? isDark ? "bg-yellow-500/15 border-yellow-500/40 text-yellow-400" : "bg-yellow-100 border-yellow-300 text-yellow-700" : isDark ? "bg-gray-700/30 border-gray-600/30 text-gray-400 hover:bg-gray-700/50" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100")}>
                  <Ico size={10} /><span>{label}</span>
                  {active && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}><Check size={9} /></motion.div>}
                </motion.button>
              );
            })}
          </div>

          {/* SETTINGS PANEL */}
          <AnimatePresence>
            {showSettings && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className={cn("overflow-hidden border-b", isDark ? "border-yellow-500/10 bg-[#0d0b08]" : "border-yellow-100 bg-gray-50")}>
                <div className="px-4 py-2.5 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className={cn("text-[10px] font-semibold", isDark ? "text-gray-300" : "text-gray-700")}>Copies:</label>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((n) => (
                        <motion.button key={n} type="button" whileTap={{ scale: 0.88 }} onClick={() => setCopies(n)} className={cn("w-7 h-7 rounded-lg text-[11px] font-bold transition-colors", copies === n ? "bg-yellow-500 text-black shadow-sm" : isDark ? "bg-gray-700 text-gray-400 hover:bg-gray-600" : "bg-gray-200 text-gray-600 hover:bg-gray-300")}>{n}</motion.button>
                      ))}
                    </div>
                  </div>
                  <span className={cn("text-[9px]", isDark ? "text-gray-500" : "text-gray-400")}>{copies > 1 ? `${copies} page-separated copies` : "Single copy"}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* PREVIEW AREA */}
          <div className={cn("flex-1 overflow-y-auto flex justify-center p-3", isDark ? "bg-[#0a0908]" : "bg-gray-100")}>
            <motion.div
              key={paperSize}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              style={{
                width: paperConfig.width,
                maxWidth: paperConfig.previewMax,
                minWidth: paperSize === "thermal" ? "240px" : "auto",
                fontFamily: paperConfig.font,
                fontSize: 11,
                color: "#000",
                background: "#fff",
                padding: "10px 12px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                borderRadius: 8,
              }}
            >
              <div ref={printRef}><ReceiptContent /></div>
            </motion.div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className={cn("flex items-center justify-between gap-2 px-4 py-2.5 border-t flex-shrink-0", isDark ? "border-yellow-500/20" : "border-yellow-200")}>
            <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={safeClose} className={cn("rounded-xl px-3 py-1.5 text-xs font-medium border transition-colors", isDark ? "border-gray-600 text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-100")}>← ESC</motion.button>

            <div className="flex gap-2">
              <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handlePrint} title="Print only [Ctrl+P]" className={cn("inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors", isDark ? "border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50")}>
                <Printer size={12} />Print
              </motion.button>

              <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => { handlePrint(); setTimeout(safeClose, 280); }} title="Print & Close [F8]" className={cn("inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 px-5 py-1.5 text-sm font-bold text-black hover:from-yellow-400 hover:to-amber-400 active:scale-95 transition-all shadow-lg shadow-amber-500/25")}>
                <Printer size={13} />F8 — Print &amp; Close
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default memo(InvoicePrint);