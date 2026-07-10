import {
  Search, X, MapPin, Building2, ChevronDown, RotateCcw,
} from 'lucide-react';
import { cn } from '../../utils/cn';

const selectCls = (isDark) => cn(
  'appearance-none rounded-xl border pl-3 pr-9 py-2.5 text-sm font-medium',
  'transition-all duration-200 cursor-pointer',
  'focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50',
  'hover:border-amber-500/35',
  isDark
    ? 'bg-gradient-to-b from-[#1a1208] to-[#120d07] border-[#2a1f0d] text-gray-100'
    : 'bg-gradient-to-b from-white to-amber-50/40 border-amber-200 text-gray-800',
);

const SelectWrap = ({ children, isDark, className }) => (
  <div className={cn('relative shrink-0', className)}>
    {children}
    <ChevronDown className={cn(
      'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4',
      isDark ? 'text-amber-500/70' : 'text-amber-600/70',
    )}
    />
  </div>
);

/**
 * Modern customer search + branch/city toolbar (Admin + Manager).
 */
const CustomerFilterToolbar = ({
  search = '',
  onSearchChange,
  searchLoading = false,
  branchFilter = 'all',
  branches = [],
  onBranchChange,
  branchLabel = 'All Branches',
  cityFilter = '',
  cities = [],
  onCityChange,
  showCity = true,
  onClear,
  hasActiveFilters = false,
  isDark = false,
  className,
}) => (
  <div className={cn('flex flex-col sm:flex-row gap-2', className)}>
    <div className="relative flex-1 min-w-0">
      <Search className={cn(
        'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
        isDark ? 'text-amber-500/60' : 'text-amber-600/60',
      )}
      />
      <input
        value={search}
        onChange={(e) => onSearchChange?.(e.target.value)}
        placeholder="Search name, phone, city, email..."
        className={cn(
          'w-full rounded-xl border pl-10 pr-10 py-2.5 text-sm transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50',
          isDark
            ? 'bg-gradient-to-b from-[#1a1208] to-[#120d07] border-[#2a1f0d] text-gray-100 placeholder:text-gray-600'
            : 'bg-gradient-to-b from-white to-amber-50/30 border-amber-200 text-gray-900 placeholder:text-gray-400',
        )}
      />
      {searchLoading && (
        <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 animate-pulse">
          ...
        </span>
      )}
      {search && (
        <button
          type="button"
          onClick={() => onSearchChange?.('')}
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors',
            isDark ? 'text-gray-500 hover:text-amber-300 hover:bg-white/5' : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50',
          )}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>

    {onBranchChange && (
      <SelectWrap isDark={isDark} className="min-w-[150px]">
        <Building2 className={cn(
          'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10',
          isDark ? 'text-amber-500/50' : 'text-amber-600/50',
        )}
        />
        <select
          value={branchFilter}
          onChange={(e) => onBranchChange(e.target.value)}
          className={cn(selectCls(isDark), 'pl-8 min-w-[150px]')}
        >
          <option value="all">{branchLabel}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.label || b.id}</option>
          ))}
        </select>
      </SelectWrap>
    )}

    {showCity && onCityChange && cities.length > 0 && (
      <SelectWrap isDark={isDark} className="min-w-[130px]">
        <MapPin className={cn(
          'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 z-10',
          isDark ? 'text-sky-500/50' : 'text-sky-600/50',
        )}
        />
        <select
          value={cityFilter}
          onChange={(e) => onCityChange(e.target.value)}
          className={cn(selectCls(isDark), 'pl-8 min-w-[130px]')}
        >
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </SelectWrap>
    )}

    {hasActiveFilters && onClear && (
      <button
        type="button"
        onClick={onClear}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold',
          'border transition-all duration-200 shrink-0',
          isDark
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50'
            : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300',
        )}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Clear
      </button>
    )}
  </div>
);

export default CustomerFilterToolbar;
