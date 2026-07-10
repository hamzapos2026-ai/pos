import { useEffect, useMemo, useState } from 'react';
import { Flag } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import {
  subscribeCashierDeletedFlags,
  fetchCashierDeletedFlags,
  dismissCashierFlag,
} from '../../services/cashierDeletedBillService';

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;

const CashierDeletedFlagsPanel = ({
  storeIds = null,
  title = 'Cashier Flags — Cancelled Bills',
  description = 'Cashier ne cancelled bill flag ki — flag reason neeche hai.',
  canDismiss = true,
  liveUpdates = true,
  className,
}) => {
  const { isDark } = useTheme();
  const [flags, setFlags] = useState([]);

  const storeSet = useMemo(
    () => (storeIds?.length ? new Set(storeIds.filter(Boolean).map(String)) : null),
    [storeIds],
  );

  useEffect(() => {
    let cancelled = false;

    const applyRows = (rows) => {
      const pending = rows.filter((f) => f.status !== 'reviewed');
      const filtered = storeSet
        ? pending.filter((f) => storeSet.has(String(f.storeId || '')))
        : pending;
      setFlags(filtered);
    };

    if (!liveUpdates) {
      fetchCashierDeletedFlags()
        .then((rows) => { if (!cancelled) applyRows(rows); })
        .catch(() => { if (!cancelled) setFlags([]); });
      return () => { cancelled = true; };
    }

    const unsub = subscribeCashierDeletedFlags((rows) => {
      if (!cancelled) applyRows(rows);
    }, () => {});
    return () => {
      cancelled = true;
      unsub();
    };
  }, [storeSet, liveUpdates]);

  if (!flags.length) return null;

  return (
    <div className={cn(
      'rounded-2xl border p-4',
      isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200',
      className,
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Flag className="w-5 h-5 text-orange-500" />
        <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
          {title} ({flags.length})
        </h3>
      </div>
      <p className={cn('text-xs mb-3', isDark ? 'text-gray-400' : 'text-gray-600')}>
        {description}
      </p>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {flags.map((flag) => (
          <div
            key={flag.id}
            className={cn(
              'flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3',
              isDark ? 'border-orange-500/20 bg-black/20' : 'border-orange-100 bg-white',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                Bill #{flag.billSerial} — {flag.flaggedByName || 'Cashier'}
              </p>
              <p className={cn('text-xs mt-0.5', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <span className="font-semibold text-orange-500">Cashier flag reason:</span>{' '}
                {flag.flagReason || flag.message}
              </p>
              {flag.billSnapshot?.customer && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Customer: {flag.billSnapshot.customer} · {fmt(flag.billSnapshot.totalAmount || 0)}
                  {flag.billSnapshot?.cancelReason && (
                    <> · Cancelled as: {flag.billSnapshot.cancelReason}</>
                  )}
                  {!flag.billSnapshot?.cancelReason && flag.billSnapshot?.deleteReason && (
                    <> · Deleted as: {flag.billSnapshot.deleteReason}</>
                  )}
                </p>
              )}
            </div>
            {canDismiss && (
            <button
              type="button"
              onClick={() => dismissCashierFlag(flag.id).then(() =>
                setFlags((prev) => prev.filter((f) => f.id !== flag.id)),
              )}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shrink-0"
            >
              Mark Reviewed
            </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashierDeletedFlagsPanel;
