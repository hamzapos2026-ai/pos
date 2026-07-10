import {
  Crown, Moon, AlertTriangle, CreditCard,
  Calendar, ShoppingBag, Wallet, TrendingUp,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { buildPersonaDisplaySections } from '../../utils/customerFilterUtils';

const Flag = ({ label, cls, icon: Icon }) => (
  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border', cls)}>
    {Icon && <Icon className="w-3 h-3" />}
    {label}
  </span>
);

const Stat = ({ label, value, icon: Icon, accent, isDark }) => (
  <div className={cn(
    'rounded-xl border p-3 transition-colors',
    isDark ? 'bg-[#1a1208] border-[#2a1f0d]' : 'bg-white border-amber-100',
  )}
  >
    <div className="flex items-center gap-1.5 mb-1">
      {Icon && <Icon className={cn('w-3.5 h-3.5', accent)} />}
      <p className={cn('text-[9px] font-bold uppercase tracking-wide', isDark ? 'text-gray-500' : 'text-gray-400')}>
        {label}
      </p>
    </div>
    <p className={cn('text-sm font-bold truncate', isDark ? 'text-gray-100' : 'text-gray-900')}>{value}</p>
  </div>
);

/**
 * Full Customer Persona Foundation display (Master Prompt fields).
 */
const CustomerPersonaDetailPanel = ({ customer, isDark = false, fmt = (v) => String(v || '—'), fmtDate = () => '—' }) => {
  if (!customer || customer.isWalkin) return null;

  const sections = buildPersonaDisplaySections(customer, { fmt, fmtDate });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {customer.vipStatus && (
          <Flag label="VIP" icon={Crown} cls="bg-amber-500/15 text-amber-400 border-amber-500/30" />
        )}
        {customer.hasCredit && (
          <Flag label="Credit Due" icon={CreditCard} cls="bg-orange-500/15 text-orange-400 border-orange-500/30" />
        )}
        {customer.inactiveStatus && (
          <Flag label="Inactive" icon={Moon} cls="bg-gray-500/15 text-gray-400 border-gray-500/30" />
        )}
        {customer.recoveryRiskStatus && (
          <Flag label="Recovery Risk" icon={AlertTriangle} cls="bg-rose-500/15 text-rose-400 border-rose-500/30" />
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Total Bills" value={customer.purchaseCount ?? customer.totalBills ?? 0} icon={ShoppingBag} accent="text-amber-400" isDark={isDark} />
        <Stat label="Total Sales" value={fmt(customer.totalSpent ?? customer.totalSales)} icon={TrendingUp} accent="text-emerald-400" isDark={isDark} />
        <Stat label="Total Paid" value={fmt(customer.totalPaidAmount)} icon={Wallet} accent="text-sky-400" isDark={isDark} />
        <Stat label="Pending" value={fmt(customer.pendingAmount)} icon={CreditCard} accent="text-orange-400" isDark={isDark} />
      </div>

      {sections.map((section) => (
        <div
          key={section.title}
          className={cn('rounded-xl border overflow-hidden', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}
        >
          <div className={cn(
            'px-3 py-2 text-[10px] font-black uppercase tracking-widest',
            isDark ? 'bg-[#1a1208] text-amber-500/70' : 'bg-amber-50 text-amber-700',
          )}
          >
            {section.title}
          </div>
          <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-px', isDark ? 'bg-[#2a1f0d]' : 'bg-amber-100')}>
            {section.rows.map((row) => (
              <div key={row.label} className={cn('px-3 py-2', isDark ? 'bg-[#0f0a05]' : 'bg-white')}>
                <p className={cn('text-[9px] uppercase tracking-wide', isDark ? 'text-gray-600' : 'text-gray-400')}>{row.label}</p>
                <p className={cn('text-xs font-semibold mt-0.5 break-words', isDark ? 'text-gray-200' : 'text-gray-800')}>{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CustomerPersonaDetailPanel;
