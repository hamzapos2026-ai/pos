// src/components/cashier/BillRow.jsx — Row layout for cashier list
import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Eye, Edit3, XCircle, Zap,
  Clock, User, Phone, Hash, Package, Tag, CreditCard, AlertTriangle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/* ── safe timestamp ── */
const safeDate = (ts) => {
  if (!ts) return null;
  try {
    if (ts?.toDate) return ts.toDate();
    if (ts?.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
};
const timeAgo = (ts) => {
  const d = safeDate(ts);
  if (!d) return '';
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString('en-PK', { day:'numeric', month:'short' });
};
const fmtTime = (ts) => {
  const d = safeDate(ts);
  if (!d) return '';
  return d.toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' });
};
const fmt = (n) => Number(n||0).toLocaleString('en-PK');

const STATUS = {
  pending:   { Icon: Clock,   bar: 'bg-amber-500',   badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25'   },
  cancelled: { Icon: XCircle, bar: 'bg-red-500',     badge: 'bg-red-500/15 text-red-400 border-red-500/25'         },
};

const BillRow = memo(({ bill, index, onView, onPay, onCancel, onEdit }) => {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);

  const status = (bill.status === 'paid' ? 'pending' : bill.status) || 'pending'; // safety
  const cfg    = STATUS[status] || STATUS.pending;
  const { Icon } = cfg;

  const serial   = bill.billSerial || bill.serialNo || bill.billId || bill.id?.slice(-6) || '—';
  const customer = bill.customerName || bill.customer?.name || 'Walk-in';
  const phone    = bill.customerPhone || bill.customer?.phone;
  const amount   = bill.total ?? bill.grandTotal ?? bill.totalAmount ?? 0;
  const items    = bill.items || [];
  const discount = bill.billDiscount || bill.totalDiscount || 0;
  const isEdited = bill.isEdited || bill.wasEdited;

  const tx   = isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]';
  const mu   = isDark ? 'text-[#a8a29e]' : 'text-[#78716c]';
  const div  = isDark ? 'border-[#2a1f0d]' : 'border-amber-100';
  const rowH = isDark ? 'hover:bg-amber-500/[0.04]' : 'hover:bg-amber-50/60';
  const rowBg= isDark ? 'bg-[#0f0a04]/60' : 'bg-amber-50/60';
  const expBg= isDark ? 'bg-[#120d06]/80' : 'bg-amber-50/50';

  return (
    <div className={`border-b ${div} last:border-b-0 transition-colors ${rowH}`}>
      {/* ── Main row ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status bar + icon */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-1 h-10 rounded-full ${cfg.bar}`}/>
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${cfg.badge}`}>
            <Icon className="w-3.5 h-3.5"/>
          </div>
        </div>

        {/* Serial + customer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-bold font-mono ${tx}`}>{serial}</span>
            {isEdited && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/25">
                <Edit3 className="w-2.5 h-2.5"/>EDITED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs ${mu}`}>
              <User className="w-3 h-3 text-amber-500"/>{customer}
            </span>
            {phone && <span className={`flex items-center gap-1 text-xs ${mu}`}><Phone className="w-3 h-3 text-amber-500"/>{phone}</span>}
            {bill.paymentType && <span className={`flex items-center gap-1 text-[10px] ${mu}`}><CreditCard className="w-3 h-3"/>{bill.paymentType}</span>}
          </div>
        </div>

        {/* Time (md+) */}
        <div className="hidden sm:flex flex-col items-end shrink-0">
          <span className={`text-xs font-medium ${mu}`}>{fmtTime(bill.createdAt)}</span>
          <span className={`text-[10px] ${mu}`}>{timeAgo(bill.createdAt)}</span>
        </div>

        {/* Amount */}
        <div className="text-right shrink-0 w-24">
          <p className="text-base font-bold text-amber-500">Rs.{fmt(amount)}</p>
          {discount > 0 && <p className={`text-[10px] line-through ${mu}`}>Rs.{fmt(amount + discount)}</p>}
          <p className={`text-[10px] ${mu}`}>{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {items.length > 0 && (
            <button onClick={() => setOpen(p => !p)}
              className={`p-1.5 rounded-lg border transition-all active:scale-95 ${div} ${mu} hover:text-amber-400 hover:border-amber-500/40`}>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="block">
                <ChevronDown className="w-3.5 h-3.5"/>
              </motion.span>
            </button>
          )}
          <button onClick={() => onView(bill)} title="View"
            className={`p-1.5 rounded-lg border transition-all active:scale-95 ${div} ${mu} hover:text-blue-400 hover:border-blue-500/40`}>
            <Eye className="w-3.5 h-3.5"/>
          </button>
          {status === 'pending' && <>
            <button onClick={() => onEdit(bill)} title="Edit"
              className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all active:scale-95">
              <Edit3 className="w-3.5 h-3.5"/>
            </button>
            <button onClick={() => onPay(bill)} title="Pay Now"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95">
              <Zap className="w-3.5 h-3.5"/>
              <span className="hidden md:inline">Pay</span>
            </button>
            <button onClick={() => onCancel(bill)} title="Cancel"
              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 transition-all active:scale-95">
              <XCircle className="w-3.5 h-3.5"/>
            </button>
          </>}
          {status === 'cancelled' && (
            <span className={`hidden sm:flex items-center gap-1 text-[10px] ${mu} italic`}>
              <AlertTriangle className="w-3 h-3 text-red-400"/>
              {(bill.cancelReason||'Cancelled').slice(0,25)}
            </span>
          )}
        </div>
      </div>

      {/* ── Expand: items ── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="items" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className={`mx-4 mb-3 rounded-xl border ${div} overflow-hidden`}>
              {items.map((item, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-2 text-xs border-b ${div} last:border-b-0 ${expBg}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash className="w-3 h-3 text-amber-500 shrink-0"/>
                    <span className={`${tx} truncate font-medium`}>{item.productName || item.name || 'Item'}</span>
                    {item.serialId && <span className={`${mu} font-mono text-[10px]`}>#{item.serialId}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={mu}>×{item.qty || 1} @ Rs.{fmt(item.price || item.rate || 0)}</span>
                    <span className="font-semibold text-amber-500">Rs.{fmt(item.total || ((item.price || 0) * (item.qty || 1)))}</span>
                  </div>
                </div>
              ))}
              {discount > 0 && (
                <div className={`flex justify-between px-4 py-2 text-xs ${rowBg} border-t ${div}`}>
                  <span className={`flex items-center gap-1 ${mu}`}><Tag className="w-3 h-3"/>Discount</span>
                  <span className="text-green-400 font-semibold">-Rs.{fmt(discount)}</span>
                </div>
              )}
              <div className={`flex justify-between px-4 py-2 text-xs font-bold ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                <span className={tx}>Total</span>
                <span className="text-amber-500">Rs.{fmt(amount)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

BillRow.displayName = 'BillRow';
export default BillRow;
