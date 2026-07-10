import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { cn } from '../../utils/cn';
import { getDatePresets } from '../../utils/datePresetUtils';

/**
 * Cash Flow style date chips — Today / Yesterday / 7 Days / 30 Days / All Time / Custom
 */
const DatePresetBar = ({
  datePreset,
  onPresetChange,
  customFrom = '',
  customTo = '',
  onCustomFromChange,
  onCustomToChange,
  isDark = false,
  className,
}) => (
  <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
    {Object.entries(getDatePresets()).map(([key, p]) => (
      <button
        key={key}
        type="button"
        onClick={() => onPresetChange(key)}
        className={cn(
          'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border',
          datePreset === key
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
            : isDark
              ? 'bg-[#0f0a05] text-gray-500 border-[#2a1f0d] hover:text-gray-300'
              : 'bg-white text-gray-500 border-amber-100 hover:text-gray-700',
        )}
      >
        {p.label}
      </button>
    ))}
    <button
      type="button"
      onClick={() => onPresetChange('custom')}
      className={cn(
        'px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border flex items-center gap-1',
        datePreset === 'custom'
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
          : isDark
            ? 'bg-[#0f0a05] text-gray-500 border-[#2a1f0d] hover:text-gray-300'
            : 'bg-white text-gray-500 border-amber-100',
      )}
    >
      <Calendar className="w-3 h-3" /> Custom
    </button>

    {datePreset === 'custom' && onCustomFromChange && (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2"
      >
        <input
          type="date"
          value={customFrom}
          onChange={(e) => onCustomFromChange(e.target.value)}
          className={cn(
            'rounded-lg border px-2 py-1 text-[10px]',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d] text-gray-300' : 'bg-white border-amber-100',
          )}
        />
        <span className="text-xs text-gray-500">→</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => onCustomToChange(e.target.value)}
          className={cn(
            'rounded-lg border px-2 py-1 text-[10px]',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d] text-gray-300' : 'bg-white border-amber-100',
          )}
        />
      </motion.div>
    )}
  </div>
);

export default DatePresetBar;
