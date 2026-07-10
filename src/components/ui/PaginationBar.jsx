import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import {
  glassPaginationShell, glassPagBtn, glassPagPageBtn, glassPagSelect, glassIcon,
} from '../shared/glassUiTheme';

const buildPageNumbers = (page, totalPages, max = 5) => {
  if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + max - 1);
  start = Math.max(1, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

const PaginationBar = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  className,
  compact = false,
  variant = 'glass',
}) => {
  const { isDark } = useTheme();
  const useGlass = variant === 'glass' || isDark;
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);
  const pages = buildPageNumbers(safePage, totalPages);

  if (totalItems === 0) return null;

  const shellCls = useGlass
    ? glassPaginationShell(isDark, className)
    : cn(
      'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t transition-colors',
      isDark ? 'border-[#2a1f0d] bg-[#0a0805]/80' : 'border-amber-100 bg-amber-50/40',
      className,
    );

  const btnCls = (extra) => (useGlass ? glassPagBtn(isDark, extra) : cn('pag-btn', isDark && 'pag-btn-dark', extra));
  const pageBtnCls = (active) => (useGlass
    ? glassPagPageBtn(active, isDark)
    : cn(
      'min-w-[2rem] h-8 rounded-lg text-xs font-bold transition-all',
      active
        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105'
        : isDark
          ? 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          : 'text-gray-500 hover:bg-amber-100 hover:text-amber-700',
    ));

  return (
    <div className={shellCls}>
      <p className={cn(
        'text-xs font-semibold tabular-nums',
        useGlass ? 'text-stone-500' : isDark ? 'text-gray-400' : 'text-gray-500',
      )}
      >
        {from.toLocaleString()}–{to.toLocaleString()} of {totalItems.toLocaleString()}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        {pageSizeOptions?.length > 0 && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => {
              onPageChange(1);
              onPageSizeChange(Number(e.target.value));
            }}
            className={useGlass ? glassPagSelect(isDark) : cn(
              'rounded-lg px-2 py-1.5 text-xs font-bold border outline-none',
              isDark ? 'bg-[#13101a] border-white/10 text-gray-300' : 'bg-white border-amber-200 text-gray-700',
            )}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}

        {!compact && (
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(1)}
            className={btnCls()}
            title="First"
          >
            <ChevronsLeft className={cn('w-3.5 h-3.5', useGlass && glassIcon())} />
          </button>
        )}
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className={btnCls()}
          title="Previous"
        >
          <ChevronLeft className={cn('w-3.5 h-3.5', useGlass && glassIcon())} />
        </button>

        <div className="hidden sm:flex items-center gap-0.5">
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={pageBtnCls(p === safePage)}
            >
              {p}
            </button>
          ))}
        </div>

        <span className={cn(
          'sm:hidden text-xs font-bold tabular-nums px-1',
          useGlass ? 'text-amber-500/90' : 'text-amber-500',
        )}
        >
          {safePage}/{totalPages}
        </span>

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className={btnCls()}
          title="Next"
        >
          <ChevronRight className={cn('w-3.5 h-3.5', useGlass && glassIcon())} />
        </button>
        {!compact && (
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className={btnCls()}
            title="Last"
          >
            <ChevronsRight className={cn('w-3.5 h-3.5', useGlass && glassIcon())} />
          </button>
        )}
      </div>

      {!useGlass && (
        <style>{`
          .pag-btn {
            display: flex; align-items: center; justify-content: center;
            padding: 0.375rem 0.5rem; border-radius: 0.5rem;
            border: 1px solid rgba(0,0,0,0.08); background: white;
            color: #6b7280; transition: all 0.15s;
          }
          .pag-btn:hover:not(:disabled) { background: #fffbeb; color: #d97706; }
          .pag-btn:disabled { opacity: 0.35; cursor: not-allowed; }
          .pag-btn-dark {
            background: #13101a; border-color: rgba(255,255,255,0.08); color: #9ca3af;
          }
          .pag-btn-dark:hover:not(:disabled) { background: rgba(245,158,11,0.1); color: #fbbf24; }
        `}</style>
      )}
    </div>
  );
};

export default PaginationBar;
