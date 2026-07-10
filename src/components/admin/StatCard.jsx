import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';

const colorMap = {
  amber: { bg: 'from-amber-400/20 to-amber-600/10', icon: 'text-amber-500 bg-amber-500/10' },
  green: { bg: 'from-emerald-400/20 to-emerald-600/10', icon: 'text-emerald-500 bg-emerald-500/10' },
  blue: { bg: 'from-sky-400/20 to-sky-600/10', icon: 'text-sky-500 bg-sky-500/10' },
  purple: { bg: 'from-violet-400/20 to-violet-600/10', icon: 'text-violet-500 bg-violet-500/10' },
  rose: { bg: 'from-rose-400/20 to-rose-600/10', icon: 'text-rose-500 bg-rose-500/10' },
  cyan: { bg: 'from-cyan-400/20 to-cyan-600/10', icon: 'text-cyan-500 bg-cyan-500/10' },
};

const StatCard = ({ label, value, icon: Icon, color = 'amber', trend, trendValue, subtitle, onClick, compact = false }) => {
  const { isDark } = useTheme();
  const colors = colorMap[color] || colorMap.amber;
  const isPositive = trend === 'up';

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border transition-all duration-300 relative overflow-hidden',
        compact ? 'p-2 sm:p-3' : 'p-3 sm:p-4',
        onClick && 'cursor-pointer hover:-translate-y-1 hover:shadow-xl',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
      )}
    >
      <div className={cn('absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br opacity-20', colors.bg)} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
          <p className={cn(
            compact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs',
            'font-medium uppercase tracking-wider leading-tight',
            isDark ? 'text-gray-400' : 'text-gray-500'
          )}>{label}</p>
          {Icon && (
            <div className={cn(
              compact ? 'w-8 h-8 sm:w-9 sm:h-9' : 'w-9 h-9 sm:w-10 sm:h-10',
              'rounded-xl flex items-center justify-center shrink-0',
              colors.icon
            )}>
              <Icon className={cn(compact ? 'w-3 h-3 sm:w-4 sm:h-4' : 'w-4 h-4 sm:w-5 sm:h-5')} />
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn(
              compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl lg:text-3xl',
              'font-bold tracking-tight break-words',
              isDark ? 'text-white' : 'text-gray-900'
            )}>{value}</p>
            {subtitle && <p className={cn('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>{subtitle}</p>}
          </div>
          {trend && trendValue && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold',
              isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
            )}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trendValue}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;