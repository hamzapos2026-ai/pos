import { cn } from '../../utils/cn';

/** Dark glass panel shell */
export const glassPanel = (className) => cn(
  'rounded-2xl border border-white/[0.08] p-4 space-y-3',
  'bg-gradient-to-br from-[#0a0908]/98 via-[#0e0c0a]/95 to-[#060504]/98',
  'backdrop-blur-2xl shadow-2xl shadow-black/50',
  className,
);

/** Icon chip — dark bg, muted icon */
export const glassIconBox = (className) => cn(
  'flex items-center justify-center shrink-0 rounded-lg',
  'bg-[#050403]/90 border border-white/[0.06] shadow-inner shadow-black/40',
  className,
);

export const glassIcon = (className) => cn(
  'text-stone-500 transition-colors duration-200',
  'group-hover:text-stone-300 group-focus-within:text-stone-300',
  className,
);

/** Glass select / dropdown */
export const glassSelect = cn(
  'w-full appearance-none rounded-xl border border-white/[0.08]',
  'bg-[#080706]/80 backdrop-blur-xl text-white text-xs font-semibold',
  'pl-9 pr-9 py-2.5 shadow-inner shadow-black/30',
  'hover:bg-[#0c0a08]/90 hover:border-white/12',
  'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/30',
  'transition-all duration-200 cursor-pointer',
);

export const glassInput = cn(
  'w-full rounded-xl border border-white/[0.08] text-sm text-white',
  'bg-[#080706]/80 backdrop-blur-xl placeholder:text-stone-600',
  'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/30',
  'hover:bg-[#0c0a08]/90 transition-all duration-200',
);

export const glassLabel = 'text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500 pl-0.5';

/** Buttons */
export const glassBtnPrimary = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2',
  'text-[11px] font-bold transition-all duration-200',
  'bg-gradient-to-b from-amber-500 to-amber-600 text-[#1a1208]',
  'border border-amber-400/30 shadow-lg shadow-amber-500/15',
  'hover:brightness-110 hover:shadow-amber-500/25 active:scale-[0.98]',
  'disabled:opacity-40 disabled:pointer-events-none',
);

export const glassBtnGhost = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2',
  'text-[11px] font-bold transition-all duration-200',
  'border border-white/[0.08] bg-[#080706]/70 backdrop-blur-sm text-stone-400',
  'hover:bg-white/[0.06] hover:text-stone-200 hover:border-white/12',
  'active:scale-[0.98] disabled:opacity-35 disabled:pointer-events-none',
);

export const glassBtnDanger = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2',
  'text-[11px] font-bold transition-all duration-200',
  'border border-rose-500/25 bg-rose-950/40 text-rose-300/90',
  'hover:bg-rose-500/15 hover:border-rose-500/35',
  'active:scale-[0.98]',
);

/** Table row icon actions */
const ACTION_TONES = {
  view: 'text-stone-500 hover:text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/20',
  edit: 'text-stone-500 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20',
  delete: 'text-stone-500 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20',
  default: 'text-stone-500 hover:text-stone-200 hover:bg-white/[0.06] hover:border-white/12',
};

export const glassActionBtn = (tone = 'default', className) => cn(
  'inline-flex items-center justify-center p-2 rounded-xl border border-transparent',
  'bg-[#080706]/60 backdrop-blur-sm transition-all duration-200 active:scale-95',
  ACTION_TONES[tone] || ACTION_TONES.default,
  className,
);

/** Pagination */
export const glassPaginationShell = (isDark = true, className) => cn(
  'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t',
  'backdrop-blur-xl transition-colors duration-200',
  isDark
    ? 'border-white/[0.06] bg-[#060504]/85'
    : 'border-amber-100 bg-amber-50/50',
  className,
);

export const glassPagBtn = (isDark = true, className) => cn(
  'inline-flex items-center justify-center p-2 rounded-xl border transition-all duration-200',
  'active:scale-95 disabled:opacity-30 disabled:pointer-events-none',
  isDark
    ? 'border-white/[0.08] bg-[#080706]/80 text-stone-600 hover:bg-white/[0.06] hover:text-stone-300 hover:border-white/12'
    : 'border-amber-200 bg-white text-gray-500 hover:bg-amber-50 hover:text-amber-700',
  className,
);

export const glassPagPageBtn = (active, isDark = true) => cn(
  'min-w-[2rem] h-8 rounded-xl text-xs font-bold transition-all duration-200',
  active
    ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-[#1a1208] shadow-md shadow-amber-500/20 scale-105 border border-amber-400/30'
    : isDark
      ? 'text-stone-500 hover:bg-white/[0.05] hover:text-stone-300 border border-transparent'
      : 'text-gray-500 hover:bg-amber-100 hover:text-amber-700 border border-transparent',
);

export const glassPagSelect = (isDark = true) => cn(
  'rounded-xl px-2.5 py-1.5 text-xs font-bold border outline-none appearance-none',
  'transition-all duration-200 cursor-pointer',
  isDark
    ? 'bg-[#080706]/90 border-white/[0.08] text-stone-400 hover:border-white/12'
    : 'bg-white border-amber-200 text-gray-700',
);

/** Online / offline status pill */
export const glassStatusPill = (online) => cn(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border',
  online
    ? 'bg-emerald-950/50 border-emerald-500/20 text-emerald-400/90'
    : 'bg-rose-950/50 border-rose-500/20 text-rose-400/90',
);

export const glassStatusIcon = 'text-stone-600';
