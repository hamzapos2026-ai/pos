import { cn } from '../../utils/cn';
import { glassActionBtn } from './glassUiTheme';

export { glassActionBtn };

export const customersTableShell = (isDark = true) => cn(
  'rounded-2xl border overflow-hidden',
  isDark
    ? 'border-white/10 bg-[#0a0806]/80 backdrop-blur-xl shadow-xl shadow-black/30'
    : 'border-amber-200 bg-white shadow-lg',
);

export const customersTableHead = (isDark = true) => cn(
  'text-[10px] font-black uppercase tracking-wider',
  isDark ? 'bg-white/[0.04] text-white/45' : 'bg-amber-50 text-gray-500',
);

export const customersTableRow = (isDark = true, { walkin = false, active = false } = {}) => cn(
  'border-t transition-colors duration-150',
  isDark
    ? cn(
      'border-white/[0.06] hover:bg-white/[0.04]',
      walkin && 'bg-blue-500/[0.04]',
      active && 'opacity-50',
    )
    : cn(
      'border-amber-100 hover:bg-amber-50/60',
      walkin && 'bg-blue-50/40',
      active && 'opacity-50',
    ),
);

export const customersTh = (isDark = true) => cn(
  'px-4 py-3.5 text-start font-bold whitespace-nowrap',
  isDark ? 'text-white/40' : 'text-gray-500',
);

export const customersTd = (isDark = true) => cn(
  'px-4 py-3 align-middle',
  isDark ? 'text-gray-200' : 'text-gray-800',
);
