// ✨ NEW: src/components/cashier/BillSearch.jsx
// Purpose: Debounced search with keyboard-navigable dropdown
// Features: 8-suggestion max, ↑↓ navigation, ENTER select, ESC close

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, CheckCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';

function cn(...i) { return twMerge(clsx(i)); }

const timeAgo = (ts) => {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const statusIcon = {
  pending: <Clock className="w-3 h-3 text-amber-400" />,
  paid: <CheckCircle className="w-3 h-3 text-green-400" />,
  cancelled: <XCircle className="w-3 h-3 text-red-400" />,
};

// ══════════════════════════════════════════════════════════════
// BILL SEARCH
// ══════════════════════════════════════════════════════════════

const BillSearch = ({ bills = [], onSelect, searchRef }) => {
  const { isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // ── Debounced search ───────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const lower = query.toLowerCase().trim();
      const results = bills
        .filter(b =>
          b.serialNo?.toLowerCase().includes(lower) ||
          b.billSerial?.toLowerCase().includes(lower) ||
          b.billId?.toLowerCase().includes(lower) ||
          b.customerName?.toLowerCase().includes(lower) ||
          b.customerPhone?.includes(lower)
        )
        .slice(0, 8); // max 8 suggestions
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIdx(-1);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, bills]);

  // ── Click outside close ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Keyboard navigation ────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        handleSelect(suggestions[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }, [isOpen, suggestions, activeIdx]); // eslint-disable-line

  const handleSelect = useCallback((bill) => {
    setQuery('');
    setIsOpen(false);
    setSuggestions([]);
    setActiveIdx(-1);
    onSelect?.(bill);
  }, [onSelect]);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Input */}
      <div className="relative">
        <Search className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none',
          isDark ? 'text-[#a8a29e]' : 'text-[#78716c]',
        )} />
        <input
          ref={searchRef}
          id="cashier-bill-search"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query && suggestions.length > 0 && setIsOpen(true)}
          placeholder="Search Bill#, customer, phone... (INSERT)"
          className={cn(
            'w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-all',
            isDark
              ? 'bg-[#120d06] border-[#2a1f0d] text-[#f5f5f4] placeholder-[#a8a29e] focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10'
              : 'bg-white border-amber-200 text-[#1c1917] placeholder-[#78716c] focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10',
          )}
          autoComplete="off"
        />
      </div>

      {/* Dropdown suggestions */}
      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.div
            data-dropdown-open="true"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute top-full mt-2 left-0 right-0 rounded-xl border shadow-2xl z-50 overflow-hidden',
              isDark
                ? 'bg-[#1a1208] border-[#2a1f0d] shadow-black/50'
                : 'bg-white border-amber-200 shadow-amber-100',
            )}
          >
            {suggestions.map((bill, idx) => {
              const serial = bill.serialNo || bill.billSerial || bill.billId || '';
              const customer = bill.customerName || bill.customer?.name || 'Walk-in';
              const phone = bill.customerPhone || bill.customer?.phone || '';
              const amount = bill.total ?? bill.grandTotal ?? bill.totalAmount ?? 0;

              return (
                <button
                  key={bill.id || idx}
                  onMouseDown={() => handleSelect(bill)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b transition-colors last:border-b-0',
                    idx === activeIdx
                      ? isDark ? 'bg-[#2a1f0d]' : 'bg-amber-50'
                      : isDark ? 'hover:bg-[#2a1f0d]/60' : 'hover:bg-amber-50/50',
                    isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-xs font-mono font-bold',
                          isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]',
                        )}>
                          {serial}
                        </span>
                        {statusIcon[bill.status]}
                        <span className={cn(
                          'text-xs capitalize',
                          bill.status === 'paid' ? 'text-green-400'
                          : bill.status === 'cancelled' ? 'text-red-400'
                          : 'text-amber-400',
                        )}>
                          {bill.status || 'pending'}
                        </span>
                      </div>
                      <p className={cn('text-sm mt-0.5', isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]')}>
                        {customer}
                        {phone && <span className={cn('ml-2 text-xs', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>• {phone}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-amber-500">
                        Rs. {Number(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                      </p>
                      <p className={cn('text-xs', isDark ? 'text-[#a8a29e]' : 'text-[#78716c]')}>
                        {timeAgo(bill.createdAt || bill.savedAt)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(BillSearch);
