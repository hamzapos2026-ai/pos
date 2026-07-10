// File: src/components/billing/SalespersonSelector.jsx
// Purpose: Billers can ONLY select existing salespersons (read-only).
//          Only SuperAdmin can add/edit them via Commission Settings page.

import { useState, useRef, useEffect } from 'react';
import {
  Users, ChevronDown, Check, X, AlertCircle, Lock,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const fmt = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString()}`;

// ═══════════════════════════════════════════════════════════════
// CURRENT SALESPERSON SELECTOR BAR
// Shows above the items table — sets SP for all new items
// 🔒 NO ADD BUTTON — billers can only select existing agents
// ═══════════════════════════════════════════════════════════════
export const CurrentSPBar = ({
  agents,
  currentSPId,
  onSelect,
  required,
  isDark,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = agents.find((a) => a.id === currentSPId);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors w-full sm:w-auto min-w-[200px]',
          current
            ? isDark
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              : 'border-amber-300 bg-amber-50 text-amber-700'
            : required
            ? isDark
              ? 'border-red-500/40 bg-red-500/5 text-red-400'
              : 'border-red-300 bg-red-50 text-red-600'
            : isDark
            ? 'border-[#2a1f0d] bg-[#1a1208] text-gray-400'
            : 'border-gray-200 bg-white text-gray-600'
        )}
      >
        <Users className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate flex-1 text-left">
          {current
            ? current.name
            : required
            ? 'Select Salesperson *'
            : 'Select Salesperson'}
        </span>
        {required && !current && (
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        )}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 z-50 min-w-[240px] rounded-xl border shadow-xl overflow-hidden',
            isDark ? 'bg-[#12100a] border-[#2a1f0d]' : 'bg-white border-gray-200'
          )}
        >
          {/* None option — only shown when not required */}
          {!required && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-2 w-full px-4 py-2.5 text-xs text-left transition-colors',
                !currentSPId
                  ? isDark
                    ? 'bg-[#2a1f0d] text-amber-400'
                    : 'bg-amber-50 text-amber-700'
                  : isDark
                  ? 'text-gray-400 hover:bg-[#1a1208]'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <X className="w-3.5 h-3.5" />
              <span>None</span>
              {!currentSPId && (
                <Check className="w-3 h-3 ml-auto text-amber-500" />
              )}
            </button>
          )}

          {/* Agent list OR empty state */}
          {agents.length === 0 ? (
            // 🔒 Admin-only notice when no agents configured
            <div
              className={cn(
                'px-4 py-6 text-center',
                isDark ? 'bg-[#0a0805]' : 'bg-gray-50'
              )}
            >
              <Lock
                className={cn(
                  'w-7 h-7 mx-auto mb-2',
                  isDark ? 'text-gray-600' : 'text-gray-400'
                )}
              />
              <p
                className={cn(
                  'text-xs font-semibold mb-1',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}
              >
                No Salespersons Available
              </p>
              <p
                className={cn(
                  'text-[10px] leading-relaxed',
                  isDark ? 'text-gray-500' : 'text-gray-500'
                )}
              >
                Only the SuperAdmin can add new salespersons.
                <br />
                Please contact your administrator.
              </p>
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onSelect(a.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-2 w-full px-4 py-2.5 text-xs text-left transition-colors',
                    currentSPId === a.id
                      ? isDark
                        ? 'bg-[#2a1f0d] text-amber-400'
                        : 'bg-amber-50 text-amber-700'
                      : isDark
                      ? 'text-gray-300 hover:bg-[#1a1208]'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <span
                    className={cn(
                      'w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                      isDark
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-amber-100 text-amber-700'
                    )}
                  >
                    {a.name[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{a.name}</div>
                  </div>
                  {currentSPId === a.id && (
                    <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* 🔒 Persistent admin-only footer notice */}
          {agents.length > 0 && (
            <div
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 border-t text-[9px]',
                isDark
                  ? 'border-[#2a1f0d] bg-[#0a0805] text-gray-500'
                  : 'border-gray-100 bg-gray-50 text-gray-500'
              )}
            >
              <Lock className="w-2.5 h-2.5" />
              Managed by SuperAdmin only
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// INLINE ITEM-LEVEL SP SELECTOR (for table row override)
// 🔒 Read-only dropdown — no add option
// ═══════════════════════════════════════════════════════════════
export const ItemSPSelector = ({ agents, value, onChange, isDark }) => {
  if (agents.length === 0) {
    return (
      <span
        className={cn(
          'text-[10px] italic',
          isDark ? 'text-gray-600' : 'text-gray-400'
        )}
      >
        No agents
      </span>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'text-[10px] rounded-lg border px-1.5 py-1 outline-none w-full max-w-[130px]',
        isDark
          ? 'bg-[#0a0805] border-[#2a1f0d] text-gray-300'
          : 'bg-white border-gray-200 text-gray-700'
      )}
    >
      <option value="">— None —</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
};

// ═══════════════════════════════════════════════════════════════
// COMMISSION SUMMARY PANEL (shown at bill bottom)
// ═══════════════════════════════════════════════════════════════
export const CommissionSummaryPanel = ({ summary, paidRatio, isDark }) => {
  if (!summary || summary.length === 0) return null;

  const totalComm = summary.reduce((s, a) => s + a.earnedCommission, 0);

  return (
    <div className={cn('mt-3 rounded-xl border overflow-hidden', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
      <div className={cn('px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between', isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600')}>
        <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> Salesperson Commissions</span>
        {paidRatio < 1 && <span className="text-amber-500 normal-case font-normal">{Math.round(paidRatio * 100)}% payment received</span>}
      </div>

      <div className={cn(isDark ? 'divide-y divide-[#2a1f0d]' : 'divide-amber-50')}> 
        {summary.map((a) => (
          <div key={a.salespersonId} className={cn('flex items-center justify-between px-3 py-1.5 text-xs', isDark ? 'text-gray-300' : 'text-gray-700')}>
            <div className="truncate">
              <span className="font-semibold">{a.salespersonName}</span>
              <span className={cn('ml-2 text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>· {a.itemCount} item{a.itemCount !== 1 ? 's' : ''} • {fmt(a.totalNet)} sales</span>
            </div>
            <div className="text-right ml-4">
              <span className="font-bold text-emerald-500">{fmt(a.earnedCommission)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={cn('flex justify-between items-center px-3 py-1.5 text-xs font-bold border-t', isDark ? 'border-[#2a1f0d] text-white bg-[#1a1208]' : 'border-amber-100 text-gray-900 bg-amber-50')}>
        <span>Total Commission</span>
        <span className="text-emerald-500">{fmt(totalComm)}</span>
      </div>
    </div>
  );
};