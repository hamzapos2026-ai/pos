import { cn } from '../../utils/cn';

/** Pill switch — modern ON/OFF */
export const ModernToggle = ({ checked, onChange, isDark, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={cn(
      'relative w-12 h-7 rounded-full transition-all duration-200 shrink-0',
      checked
        ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/30'
        : isDark ? 'bg-gray-700' : 'bg-gray-300',
      disabled && 'opacity-50 cursor-not-allowed',
    )}
  >
    <span
      className={cn(
        'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200',
        checked && 'translate-x-5',
      )}
    />
  </button>
);

export const SettingsCard = ({ title, subtitle, icon: Icon, isDark, children, accent = 'amber' }) => {
  const accentMap = {
    amber: isDark ? 'from-amber-500/20 to-orange-500/5 border-amber-500/25' : 'from-amber-100 to-orange-50 border-amber-200',
    blue: isDark ? 'from-blue-500/20 to-cyan-500/5 border-blue-500/25' : 'from-blue-100 to-cyan-50 border-blue-200',
    emerald: isDark ? 'from-emerald-500/20 to-green-500/5 border-emerald-500/25' : 'from-emerald-100 to-green-50 border-emerald-200',
    purple: isDark ? 'from-purple-500/20 to-violet-500/5 border-purple-500/25' : 'from-purple-100 to-violet-50 border-purple-200',
  };

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-white border-amber-100 shadow-sm',
    )}>
      <div className={cn('px-4 py-3 border-b bg-gradient-to-r flex items-center gap-3', accentMap[accent] || accentMap.amber, isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
        {Icon && (
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', isDark ? 'bg-black/30' : 'bg-white/80 shadow-sm')}>
            <Icon className="w-4 h-4 text-amber-500" />
          </div>
        )}
        <div className="min-w-0">
          <p className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>{title}</p>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
};

export const ToggleRow = ({ label, hint, checked, onChange, isDark, icon: Icon, badge, disabled = false }) => (
  <div className={cn(
    'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
    isDark ? 'bg-[#070503] border-[#2a1f0d] hover:border-amber-500/20' : 'bg-amber-50/30 border-amber-100 hover:border-amber-200',
    disabled && 'opacity-60',
  )}>
    {Icon && (
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', isDark ? 'bg-amber-500/10' : 'bg-amber-100')}>
        <Icon className="w-4 h-4 text-amber-500" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className={cn('font-semibold text-sm', isDark ? 'text-white' : 'text-gray-900')}>{label}</p>
        {badge && (
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide', checked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400')}>
            {checked ? 'ON' : 'OFF'}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
    <ModernToggle checked={checked} onChange={onChange} isDark={isDark} disabled={disabled} />
  </div>
);

export const FontSlider = ({ label, hint, value, min, max, onChange, isDark, preview }) => (
  <div className={cn(
    'rounded-xl border p-4 space-y-2.5',
    isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/40 border-amber-100',
  )}>
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>{label}</p>
        {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <span className="text-base font-black text-amber-500 tabular-nums shrink-0">{value}px</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-500 h-2" />
    {preview && (
      <p style={{ fontSize: `${value}px` }} className={cn('font-bold truncate pt-1', isDark ? 'text-amber-400' : 'text-amber-700')}>
        {preview}
      </p>
    )}
  </div>
);

export const FilterTabs = ({ tabs, active, onChange, isDark }) => (
  <div className={cn(
    'flex flex-wrap gap-1.5 p-1.5 rounded-xl border',
    isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-100',
  )}>
    {tabs.map((tab) => {
      const on = active === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-3 py-2 rounded-lg text-xs font-bold transition-all',
            on
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25'
              : isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:bg-white hover:text-gray-900',
          )}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
