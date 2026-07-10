// src/components/cashier/PaymentModal.jsx — Premium Glass v2
import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, CreditCard, Banknote, Smartphone,
  Building2, Phone, Tag, AlertCircle, ChevronDown, Zap,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useSettings } from '../../context/SettingsContext';
import { getEnabledPaymentMethods } from '../../utils/paymentMethodsUtils';
import { useSound } from '../../hooks/useSound';
import useLanguage from '../../hooks/useLanguage';
import { showFieldAlert, showValidationAlert } from '../../utils/fieldAlert';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });

const ALL_METHODS = [
  { id: 'cash',        Icon: Banknote,   labelKey: 'cash',        label: 'Cash',        ref: false, keys: ['cash'] },
  { id: 'easypaisa',   Icon: Phone,      labelKey: 'easypaisa',   label: 'EasyPaisa',   ref: true,  keys: ['easypaisa'] },
  { id: 'jazzcash',    Icon: Smartphone, labelKey: 'jazzcash',    label: 'JazzCash',    ref: true,  keys: ['jazzcash'] },
  { id: 'bank',        Icon: Building2,  labelKey: 'bankTransfer', label: 'Bank',        ref: true,  keys: ['bankTransfer', 'bank'] },
  { id: 'card',        Icon: CreditCard, labelKey: 'card',        label: 'Card',        ref: true,  keys: ['creditCard', 'card'] },
];
const REF_LABEL = {
  easypaisa: 'EasyPaisa Ref #',
  jazzcash: 'JazzCash Ref #',
  bank: 'Account / Ref #',
  card: 'Last 4 Digits',
};
const QUICK = [500,1000,2000,5000];

const PaymentModal = ({ isOpen, bill, onClose, onConfirm, isOffline = false }) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const { userData, user } = useAuth();
  const { isOnline } = useNetwork();
  const { settings } = useSettings();
  const { playPaid, playError } = useSound();

  const enabledKeys = useMemo(
    () => new Set(getEnabledPaymentMethods(settings).flatMap((m) => [m.key, ...m.aliases])),
    [settings?.paymentMethods],
  );
  const methods = useMemo(
    () => ALL_METHODS.filter((m) => m.keys.some((k) => enabledKeys.has(k))),
    [enabledKeys],
  );
  const defaultMethod = methods[0]?.id || 'cash';

  const [method, setMethod]   = useState(defaultMethod);
  const [amount, setAmount]   = useState('');
  const [ref, setRef]         = useState('');
  const [discVal, setDiscVal] = useState('');
  const [discPct, setDiscPct] = useState(false);
  const [discReason, setDiscReason] = useState('');
  const [busy, setBusy]       = useState(false);
  const [shake, setShake]     = useState(false);
  const amtRef = useRef(null);

  const base    = bill?.total ?? bill?.grandTotal ?? bill?.totalAmount ?? 0;
  const discAmt = (() => { const v = parseFloat(discVal)||0; if(!v) return 0; return discPct ? Math.round(base*v/100) : Math.min(v,base); })();
  const total   = Math.max(0, base - discAmt);
  const recv    = parseFloat(amount) || 0;
  const change  = recv - total;

  useEffect(() => {
    if (isOpen) {
      setMethod(defaultMethod); setAmount(''); setRef('');
      setDiscVal(''); setDiscPct(false); setDiscReason('');
      setBusy(false);
      setTimeout(() => amtRef.current?.focus(), 30);
    }
  }, [isOpen, defaultMethod]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  const triggerShake = () => { setShake(true); setTimeout(()=>setShake(false),500); playError(); };

  const validate = () => {
    if (method === 'cash' && (!amount || recv < total)) {
      showFieldAlert('paymentAmount', {
        message: t('amountLessThan', `Need at least Rs.${fmt(total)}`),
      });
      triggerShake();
      return false;
    }
    const m = methods.find(x=>x.id===method);
    if (m?.ref && !ref.trim()) {
      showFieldAlert('paymentReference', {
        message: t('enterReferenceNumber', `Enter ${REF_LABEL[method]||'reference'}`),
        fieldLabel: REF_LABEL[method] || 'Reference',
      });
      triggerShake();
      return false;
    }
    if (discAmt > 0 && !discReason.trim()) {
      showFieldAlert('discountReason', {
        message: t('discountReasonRequired', 'Discount reason required'),
      });
      triggerShake();
      return false;
    }
    return true;
  };

  const handleConfirm = useCallback(async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      await onConfirm?.(bill, {
        paymentType: method, paymentMethod: method,
        amountReceived: method==='cash' ? recv : total,
        changeGiven: method==='cash' ? Math.max(0,change) : 0,
        discountApplied: discAmt, discountType: discPct?'percent':'fixed',
        discountValue: parseFloat(discVal)||0, discountReason: discReason.trim()||null,
        finalAmount: total, reference: ref.trim()||null,
        paidBy: userData?.uid||user?.uid,
        paidByName: userData?.name||userData?.displayName||'Cashier',
        cashierId: userData?.uid||user?.uid,
        offlineMode: !isOnline,
      });
      playPaid(); onClose();
    } catch(e) {
      showValidationAlert(`Payment failed: ${e.message}`, { variant: 'error', title: 'Payment Failed' });
      playError();
    } finally { setBusy(false); }
  }, [method,recv,total,change,discAmt,discPct,discVal,discReason,ref,bill,userData,user,isOnline,onConfirm,onClose,playPaid,playError,validate]);

  /* glass vars */
  const g  = isDark ? 'bg-[#1a1208] border-[#2a1f0d]' : 'bg-white border-amber-200';
  const gIn = isDark ? 'bg-[#120d06] border-[#2a1f0d] text-[#f5f5f4] placeholder-[#a8a29e]' : 'bg-white border-amber-200 text-[#1c1917] placeholder-[#78716c]';
  const mu = isDark ? 'text-[#a8a29e]' : 'text-[#78716c]';
  const tx = isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]';
  const div= isDark ? 'border-[#2a1f0d]' : 'border-amber-100';
  const rBg= isDark ? 'bg-[#120d06]' : 'bg-amber-50';

  if (!isOpen || !bill) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{background:'rgba(0,0,0,0.72)'}}
        onClick={e => e.target===e.currentTarget && onClose()}
      >
        <motion.div
          animate={shake ? {x:[-10,10,-10,10,0]} : {x:0}}
          initial={{scale:0.92,y:20,opacity:0}}
          whileInView={{scale:1,y:0,opacity:1}}
          exit={{scale:0.92,y:20,opacity:0}}
          transition={{type:'spring',stiffness:420,damping:32}}
          className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl ${g}`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-4 border-b ${div}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/25">
                <CreditCard className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className={`font-bold text-base ${tx}`}>{t('receivePayment', 'Receive Payment')}</h2>
                <p className={`text-xs ${mu}`}>{bill.serialNo||bill.billSerial||bill.billId}
                  {!isOnline && <span className="ml-2 text-blue-400">• Offline</span>}
                </p>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg ${mu} hover:text-red-400 hover:bg-red-500/10 transition-colors`}>
              <X className="w-4 h-4"/>
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[68vh] overflow-y-auto">
            {/* Bill summary */}
            <div className={`rounded-xl px-4 py-3 ${rBg}`}>
              <div className="flex justify-between items-center">
                <span className={`text-xs ${mu}`}>{t('customer', 'Customer')}</span>
                <span className={`text-sm font-medium ${tx}`}>{bill.customerName||bill.customer?.name||t('walkingCustomer', 'Walk-in')}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className={`font-semibold text-sm ${tx}`}>{t('totalDue', 'Amount Due')}</span>
                <span className="text-2xl font-bold text-amber-500">Rs.{fmt(base)}</span>
              </div>
            </div>

            {/* Method selector */}
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${mu}`}>{t('paymentMethod', 'Payment Method')}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {methods.map(({id,Icon,label,labelKey}) => (
                  <button key={id} onClick={() => {setMethod(id);setRef('');}}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all active:scale-95 ${
                      method===id ? 'border-amber-500 bg-amber-500/15 text-amber-400 shadow-md shadow-amber-500/15'
                      : `${isDark?'border-[#2a1f0d] text-[#a8a29e] hover:border-amber-700/50':'border-amber-200 text-[#78716c] hover:border-amber-300'}`}`}>
                    <Icon className="w-4 h-4"/>
                    <span className="text-[10px] leading-none">{t(labelKey, label)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference (non-cash) */}
            {method !== 'cash' && (
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${mu}`}>{REF_LABEL[method]||'Reference'}</p>
                <input type="text" value={ref} onChange={e=>setRef(e.target.value)}
                  placeholder={t('enterReferencePlaceholder', 'Enter reference number...')}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 ${gIn}`}/>
              </div>
            )}

            {/* Discount */}
            <div>
              <p className={`text-xs font-semibold mb-1.5 ${mu}`}>{t('discount', 'Discount')} <span className={`font-normal ${mu}`}>
                ({t('optional', 'optional')})
              </span></p>
              <div className="flex gap-2">
                <div className={`flex rounded-xl border overflow-hidden ${isDark?'border-[#2a1f0d]':'border-amber-200'}`}>
                  {[{l:'Rs',v:false},{l:'%',v:true}].map(({l,v})=>(
                    <button key={l} onClick={()=>setDiscPct(v)}
                      className={`px-3 py-2 text-xs font-bold transition-colors ${discPct===v?'bg-amber-500 text-white':'text-[#a8a29e] hover:text-amber-400'}`}>{l}</button>
                  ))}
                </div>
                <input type="number" value={discVal} onChange={e=>setDiscVal(e.target.value)}
                  placeholder={t('zero', '0')} min="0" max={discPct?100:base}
                  className={`flex-1 px-3 py-2 rounded-xl border text-sm outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 ${gIn}`}/>
              </div>
              {discAmt>0 && (
                <input type="text" value={discReason} onChange={e=>setDiscReason(e.target.value)}
                  placeholder="Reason for discount (required)..."
                  className={`w-full mt-2 px-3 py-2 rounded-xl border text-xs outline-none focus:border-amber-500/60 ${gIn}`}/>
              )}
            </div>

            {/* Cash input */}
            {method === 'cash' && (
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${mu}`}>{t('amountReceived', 'Amount Received')}</p>
                <input ref={amtRef} type="number" value={amount} onChange={e=>setAmount(e.target.value)}
                  placeholder="0" min="0"
                  className={`w-full px-4 py-3 rounded-xl border text-xl font-bold outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 ${gIn}`}/>
                {/* Quick amounts */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  <button onClick={()=>setAmount(String(Math.ceil(total)))}
                    className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${isDark?'border-[#2a1f0d] text-amber-400 hover:bg-[#2a1f0d]':'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>Exact</button>
                  {QUICK.map(q=>(
                    <button key={q} onClick={()=>setAmount(String(Math.ceil(total/q)*q))}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${isDark?'border-[#2a1f0d] text-[#a8a29e] hover:bg-[#2a1f0d]':'border-amber-200 text-[#78716c] hover:bg-amber-50'}`}>{q}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Summary box */}
            <div className={`rounded-xl p-4 space-y-2 ${rBg}`}>
              {discAmt>0 && <>
                <div className={`flex justify-between text-sm ${mu}`}><span>{t('subtotal', 'Subtotal')}</span><span className={tx}>Rs.{fmt(base)}</span></div>
                <div className="flex justify-between text-sm"><span className={mu}>{t('discount', 'Discount')}</span><span className="text-green-400">-Rs.{fmt(discAmt)}</span></div>
              </>}
              <div className={`flex justify-between font-bold text-base ${discAmt>0?`border-t ${div} pt-2`:''}`}>
                <span className={tx}>{t('total', 'Total')}</span>
                <span className="text-amber-500">Rs.{fmt(total)}</span>
              </div>
              {method==='cash' && recv>0 && (
                <div className={`flex justify-between font-bold border-t ${div} pt-2`}>
                  <span className={tx}>{t('change', 'Change')}</span>
                  <span className={change>=0?'text-emerald-400':'text-red-400'}>
                    Rs.{fmt(Math.abs(change))}{change<0?` (${t('short', 'short')})`:''}
                  </span>
                </div>
              )}
            </div>

            {/* Offline notice */}
            {!isOnline && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-blue-400">{t('offlinePaymentSaved', 'Offline — payment saved locally, syncs on reconnect.')}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex gap-3 px-5 py-4 border-t ${div}`}>
            <button onClick={onClose} disabled={busy}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark?`border-[#2a1f0d] ${mu} hover:bg-[#2a1f0d]`:'border-amber-200 text-[#78716c] hover:bg-amber-50'}`}>
              {t('cancel', 'Cancel')}
            </button>
            <button onClick={handleConfirm} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98] disabled:opacity-50">
              {busy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Zap className="w-4 h-4"/>}
              {busy ? 'Processing...' : `Confirm Rs.${fmt(total)}`}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
export default memo(PaymentModal);
