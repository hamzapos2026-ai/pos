import {
  Users, UserCheck, Hash, User, Calendar, Clock, CalendarDays,
  CalendarRange, Sparkles, Crown, Moon, AlertTriangle, CreditCard,
  Filter,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  CUSTOMER_TYPE_FILTERS,
  CUSTOMER_VISIT_FILTERS,
  CUSTOMER_PERSONA_FILTERS,
} from '../../utils/customerFilterUtils';

const ICONS = {
  users: Users,
  walkin: User,
  auto: Hash,
  registered: UserCheck,
  all_time: Calendar,
  today: Clock,
  yesterday: CalendarDays,
  week: CalendarRange,
  month: Calendar,
  new: Sparkles,
  all: Filter,
  vip: Crown,
  inactive: Moon,
  recovery: AlertTriangle,
  credit: CreditCard,
};

const TONES = {
  amber: {
    active: 'bg-gradient-to-r from-amber-500 to-amber-600 text-[#1a1208] border-amber-400 shadow-lg shadow-amber-500/25',
    idle: 'bg-amber-500/8 text-amber-400/90 border-amber-500/20 hover:bg-amber-500/15 hover:border-amber-500/40 hover:text-amber-300',
  },
  sky: {
    active: 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white border-sky-400 shadow-lg shadow-sky-500/20',
    idle: 'bg-sky-500/8 text-sky-400/90 border-sky-500/20 hover:bg-sky-500/15 hover:border-sky-500/40 hover:text-sky-300',
  },
  violet: {
    active: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white border-violet-400 shadow-lg shadow-violet-500/20',
    idle: 'bg-violet-500/8 text-violet-400/90 border-violet-500/20 hover:bg-violet-500/15 hover:border-violet-500/40 hover:text-violet-300',
  },
};

const FILTER_META = {
  all: { icon: 'users', tone: 'amber' },
  walkin: { icon: 'walkin', tone: 'amber' },
  auto: { icon: 'auto', tone: 'amber' },
  registered: { icon: 'registered', tone: 'amber' },
  visited_today: { icon: 'today', tone: 'sky' },
  visited_yesterday: { icon: 'yesterday', tone: 'sky' },
  visited_week: { icon: 'week', tone: 'sky' },
  visited_month: { icon: 'month', tone: 'sky' },
  new_week: { icon: 'new', tone: 'sky' },
  vip: { icon: 'vip', tone: 'violet' },
  inactive: { icon: 'inactive', tone: 'violet' },
  recovery: { icon: 'recovery', tone: 'violet' },
  credit: { icon: 'credit', tone: 'violet' },
};

const Pill = ({ active, onClick, label, count, isDark, tone = 'amber', iconKey = 'all' }) => {
  const Icon = ICONS[iconKey] || Filter;
  const t = TONES[tone] || TONES.amber;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold',
        'border transition-all duration-200 active:scale-[0.97]',
        active ? t.active : (isDark ? t.idle : `${t.idle} bg-white`),
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} />
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className={cn(
          'ml-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold',
          active ? 'bg-black/15 text-inherit' : 'bg-black/20 text-inherit opacity-70',
        )}
        >
          {count}
        </span>
      )}
    </button>
  );
};

const Section = ({ title, subtitle, children, isDark }) => (
  <div className={cn(
    'rounded-xl border p-2.5',
    isDark ? 'bg-[#0a0805]/80 border-[#2a1f0d]' : 'bg-amber-50/30 border-amber-100',
  )}
  >
    <div className="flex items-baseline gap-2 mb-2 px-0.5">
      <span className={cn('text-[10px] font-black uppercase tracking-widest', isDark ? 'text-amber-500/80' : 'text-amber-700')}>
        {title}
      </span>
      {subtitle && (
        <span className={cn('text-[9px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{subtitle}</span>
      )}
    </div>
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
      {children}
    </div>
  </div>
);

/**
 * Persona filter bar — Type · Visit · VIP/Credit (Master Prompt).
 */
const CustomerPersonaFilterBar = ({
  typeFilter = 'all',
  onTypeFilterChange,
  visitFilter = 'all',
  onVisitFilterChange,
  personaFilter = 'all',
  onPersonaFilterChange,
  counts = {},
  isDark = false,
  showTypeFilters = true,
  className,
}) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {showTypeFilters && onTypeFilterChange && (
      <Section title="Customer Type" isDark={isDark}>
        {CUSTOMER_TYPE_FILTERS.map((f) => {
          const meta = FILTER_META[f.key] || { icon: 'all', tone: 'amber' };
          return (
            <Pill
              key={f.key}
              label={f.label}
              count={counts.type?.[f.key]}
              active={typeFilter === f.key}
              onClick={() => onTypeFilterChange(f.key)}
              isDark={isDark}
              tone={meta.tone}
              iconKey={meta.icon}
            />
          );
        })}
      </Section>
    )}
    {onVisitFilterChange && (
      <Section title="Last Visit" subtitle="first visit = New" isDark={isDark}>
        {CUSTOMER_VISIT_FILTERS.map((f) => {
          const meta = FILTER_META[f.key] || { icon: 'all_time', tone: 'sky' };
          return (
            <Pill
              key={f.key}
              label={f.label}
              count={counts.visit?.[f.key]}
              active={visitFilter === f.key}
              onClick={() => onVisitFilterChange(f.key)}
              isDark={isDark}
              tone="sky"
              iconKey={f.key === 'all' ? 'all_time' : meta.icon}
            />
          );
        })}
      </Section>
    )}
    {onPersonaFilterChange && (
      <Section title="Persona" subtitle="auto-updated after each bill" isDark={isDark}>
        {CUSTOMER_PERSONA_FILTERS.map((f) => {
          const meta = FILTER_META[f.key] || { icon: 'all', tone: 'violet' };
          return (
            <Pill
              key={f.key}
              label={f.label}
              count={counts.persona?.[f.key]}
              active={personaFilter === f.key}
              onClick={() => onPersonaFilterChange(f.key)}
              isDark={isDark}
              tone="violet"
              iconKey={meta.icon}
            />
          );
        })}
      </Section>
    )}
  </div>
);

export default CustomerPersonaFilterBar;
