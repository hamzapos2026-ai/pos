// src/components/cashier/BillCard.jsx — Premium Glass UI v2
import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Eye, Edit3, CreditCard, XCircle,
  Clock, CheckCircle, User, Phone, Package,
  Tag, Hash, Zap, AlertTriangle,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/* ─── helpers ─── */
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const timeAgo = (ts) => {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString('en-PK');
};

/* ─── Status config ─── */
const STATUS = {
  pending:   { Icon: Clock,        bar: 'from-amber-500 to-orange-400', glow: 'shadow-amber-500/10',  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  paid:      { Icon: CheckCircle,  bar: 'from-emerald-500 to-green-400', glow: 'shadow-emerald-500/10', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  cancelled: { Icon: XCircle,      bar: 'from-red-500 to-rose-400',      glow: 'shadow-red-500/10',    badge: 'bg-red-500/15 text-red-400 border-red-500/25' },
};

const BillCard = memo(({ bill, onView, onPay, onCancel, onEdit, index = 0 }) => {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);

  const status = bill.status || 'pending';
  const cfg = STATUS[status] || STATUS.pending;
  const { Icon } = cfg;

  const serial   = bill.serialNo || bill.billSerial || bill.billId || `#${(bill.id||'').slice(-4)}`;
  const customer = bill.customerName || bill.customer?.name || 'Walk-in';
  const phone    = bill.customerPhone || bill.customer?.phone;
  const amount   = bill.total ?? bill.grandTotal ?? bill.totalAmount ?? 0;
  const items    = bill.items || [];
  const discount = bill.billDiscount || bill.totalDiscount || bill.discountApplied || 0;
  const subtotal = bill.subtotal || amount;
  const isEdited = bill.isEdited || bill.wasEdited || bill.lastEditedBy;
  const isPending = status === 'pending';

  /* glass classes */
  const card  = isDark ? 'bg-[#1a1208]/70 border-[#2a1f0d]/80' : 'bg-white/80 border-amber-200/80';
  const muted = isDark ? 'text-[#a8a29e]' : 'text-[#78716c]';
  const txt   = isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]';
  const rowBg = isDark ? 'bg-[#0f0a04]/60' : 'bg-amber-50/60';
  const divBg = isDark ? 'border-[#2a1f0d]' : 'border-amber-100';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.03 }}
      className={`rounded-2xl border backdrop-blur-xl overflow-hidden transition-shadow duration-300 hover:shadow-xl ${cfg.glow} ${card}`}
    >
      {/* ── Status bar ── */}
      <div className={`h-[3px] bg-gradient-to-r ${cfg.bar}`} />

      <div className="p-4">
        {/* ── Header row ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Status icon circle */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${cfg.badge}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-sm font-bold font-mono ${txt}`}>{serial}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.badge}`}>
                  <Icon className="w-2.5 h-2.5" />
                  {status.toUpperCase()}
                </span>
                {isEdited && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/25">
                    <Edit3 className="w-2.5 h-2.5" />
                    EDITED
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${muted}`}>{timeAgo(bill.createdAt || bill.savedAt)}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-amber-500">Rs.{fmt(amount)}</p>
            {discount > 0 && <p className={`text-xs line-through ${muted}`}>Rs.{fmt(subtotal)}</p>}
            <p className={`text-[10px] ${muted}`}>{items.length} item{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* ── Customer info ── */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className={`flex items-center gap-1 text-xs ${muted}`}>
            <User className="w-3 h-3 text-amber-500" />
            <span className={txt}>{customer}</span>
          </span>
          {phone && (
            <span className={`flex items-center gap-1 text-xs ${muted}`}>
              <Phone className="w-3 h-3 text-amber-500" />
              {phone}
            </span>
          )}
          {bill.paymentType && (
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg border ${divBg} ${muted}`}>
              <CreditCard className="w-2.5 h-2.5" />
              {bill.paymentType}
            </span>
          )}
          {discount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20">
              <Tag className="w-2.5 h-2.5" />
              -Rs.{fmt(discount)}
            </span>
          )}
        </div>

        {/* ── Collapse toggle: Items ── */}
        {items.length > 0 && (
          <>
            <button
              onClick={() => setOpen(p => !p)}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${muted} hover:text-amber-500`}
            >
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.span>
              <Package className="w-3 h-3" />
              {open ? 'Hide' : 'Show'} items ({items.length})
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1">
                    {items.map((item, i) => (
                      <div key={i} className={`flex items-center justify-between text-xs py-2 px-3 rounded-xl ${rowBg}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Hash className={`w-3 h-3 text-amber-500 shrink-0`} />
                          <span className={`${txt} truncate font-medium`}>{item.productName || item.name || 'Item'}</span>
                          {item.serialId && <span className={`${muted} font-mono text-[10px]`}>{item.serialId}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={muted}>×{item.qty || item.quantity || 1}</span>
                          <span className="font-semibold text-amber-500">Rs.{fmt(item.total || (item.price * (item.qty || 1)))}</span>
                        </div>
                      </div>
                    ))}
                    {/* Summary */}
                    <div className={`border-t ${divBg} pt-2 mt-1 space-y-1`}>
                      {discount > 0 && (
                        <div className="flex justify-between text-xs px-1">
                          <span className={muted}>Discount</span>
                          <span className="text-green-400">-Rs.{fmt(discount)}</span>
                        </div>
                      )}
                      <div className={`flex justify-between text-xs font-bold px-2 py-1.5 rounded-xl ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                        <span className={txt}>Total</span>
                        <span className="text-amber-500">Rs.{fmt(amount)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ── Action bar ── */}
      <div className={`flex items-center gap-2 px-4 py-3 border-t ${divBg} flex-wrap ${isDark ? 'bg-[#0f0a04]/40' : 'bg-amber-50/40'}`}>
        {/* View */}
        <button onClick={() => onView(bill)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-95 ${isDark ? `border-[#2a1f0d] ${muted} hover:border-amber-600/50 hover:text-amber-400` : 'border-amber-200 text-[#78716c] hover:border-amber-400 hover:text-amber-600'}`}>
          <Eye className="w-3.5 h-3.5" /> View
        </button>

        {isPending && (
          <>
            <button onClick={() => onEdit(bill)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-95 ${isDark ? 'border-amber-700/50 text-amber-400 hover:bg-amber-900/30' : 'border-amber-300 text-amber-600 hover:bg-amber-50'}`}>
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={() => onPay(bill)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-500/20 active:scale-95">
              <Zap className="w-3.5 h-3.5" /> Pay Now
            </button>
            <button onClick={() => onCancel(bill)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 transition-all active:scale-95">
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </>
        )}

        {status === 'paid' && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 ml-auto">
            <CheckCircle className="w-3.5 h-3.5" />
            Paid via {bill.paymentType || 'Cash'}
          </span>
        )}
        {status === 'cancelled' && (
          <span className={`flex items-center gap-1 text-xs ${muted} italic ml-auto`}>
            <AlertTriangle className="w-3 h-3 text-red-400" />
            {(bill.cancelReason || 'Cancelled').slice(0, 40)}
          </span>
        )}
      </div>
    </motion.div>
  );
});

BillCard.displayName = 'BillCard';
export default BillCard;
