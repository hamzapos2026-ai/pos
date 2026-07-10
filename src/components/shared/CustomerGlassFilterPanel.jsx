import {

  Search, X, ChevronDown, RotateCcw, Building2, MapPin,

  Users, Calendar, Sparkles, ArrowUpDown, Filter, Loader2,

  Wifi, WifiOff,

} from 'lucide-react';

import { cn } from '../../utils/cn';

import {

  CUSTOMER_TYPE_FILTERS,

  CUSTOMER_VISIT_FILTERS,

  CUSTOMER_PERSONA_FILTERS,

} from '../../utils/customerFilterUtils';

import {

  glassPanel, glassSelect, glassInput, glassLabel,

  glassIconBox, glassIcon, glassBtnPrimary, glassBtnDanger,

  glassStatusPill, glassStatusIcon,

} from './glassUiTheme';



const GlassDropdown = ({

  label,

  icon: Icon,

  value,

  onChange,

  options = [],

  className,

}) => (

  <div className={cn('flex flex-col gap-1 min-w-[0] group', className)}>

    <span className={glassLabel}>{label}</span>

    <div className="relative">

      {Icon && (

        <span className={glassIconBox('absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 z-[1] pointer-events-none')}>

          <Icon className={cn(glassIcon(), 'w-3 h-3')} />

        </span>

      )}

      <select

        value={value}

        onChange={(e) => onChange(e.target.value)}

        className={glassSelect}

      >

        {options.map((o) => (

          <option key={o.value} value={o.value} className="bg-[#0a0806] text-white">

            {o.label}

            {typeof o.count === 'number' ? `  ·  ${o.count}` : ''}

          </option>

        ))}

      </select>

      <ChevronDown className={cn(glassIcon(), 'pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4')} />

    </div>

  </div>

);



/**

 * All customer filters — separate glass dropdowns with counts (Admin + Manager).

 */

const CustomerGlassFilterPanel = ({

  search = '',

  onSearchChange,

  searchLoading = false,

  branchFilter = 'all',

  branches = [],

  onBranchChange,

  showBranch = true,

  branchLabel = 'All Branches',

  cityFilter = '',

  cities = [],

  onCityChange,

  showCity = true,

  typeFilter = 'all',

  onTypeFilterChange,

  visitFilter = 'all',

  onVisitFilterChange,

  personaFilter = 'all',

  onPersonaFilterChange,

  sortValue = 'totalSpent:desc',

  onSortChange,

  sortOptions = [],

  counts = {},

  onClear,

  hasActiveFilters = false,

  filteredCount = 0,

  paginatedCount = 0,

  searchHasMore = false,

  onLoadMore,

  isOnline = true,

  className,

}) => {

  const typeOpts = CUSTOMER_TYPE_FILTERS.map((f) => ({

    value: f.key,

    label: f.label,

    count: counts.type?.[f.key],

  }));



  const visitOpts = CUSTOMER_VISIT_FILTERS.map((f) => ({

    value: f.key,

    label: f.label,

    count: counts.visit?.[f.key],

  }));



  const personaOpts = CUSTOMER_PERSONA_FILTERS.map((f) => ({

    value: f.key,

    label: f.label,

    count: counts.persona?.[f.key],

  }));



  const branchOpts = [

    { value: 'all', label: branchLabel, count: counts.type?.all },

    ...branches.map((b) => ({ value: b.id, label: b.label || b.id })),

  ];



  const cityOpts = [

    { value: '', label: 'All Cities', count: counts.type?.all },

    ...cities.map((c) => ({ value: c, label: c })),

  ];



  const sortOpts = sortOptions.map((o) => ({

    value: `${o.key}:${o.dir}`,

    label: o.label,

  }));



  return (

    <div className={glassPanel(className)}>

      <div className="flex items-center gap-2 flex-wrap">

        <div className="flex items-center gap-2">

          <span className={glassIconBox('w-8 h-8')}>

            <Filter className={cn(glassIcon(), 'w-3.5 h-3.5')} />

          </span>

          <span className="text-xs font-black uppercase tracking-widest text-stone-200">

            Customer Filters

          </span>

        </div>



        <div className="flex items-center gap-2 ml-auto flex-wrap">

          <span className={glassStatusPill(isOnline)}>

            {isOnline ? (

              <Wifi className={cn('w-3 h-3', glassStatusIcon)} />

            ) : (

              <WifiOff className={cn('w-3 h-3', glassStatusIcon)} />

            )}

            {isOnline ? 'Online' : 'Offline'}

          </span>

          {searchLoading && (

            <span className="inline-flex items-center gap-1.5 text-[10px] text-stone-500">

              <Loader2 className={cn('w-3 h-3 animate-spin', glassStatusIcon)} />

              Syncing…

            </span>

          )}

        </div>

      </div>



      {/* Search */}

      <div className="relative group">

        <span className={glassIconBox('absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 z-[1] pointer-events-none')}>

          <Search className={cn(glassIcon(), 'w-3.5 h-3.5')} />

        </span>

        <input

          value={search}

          onChange={(e) => onSearchChange?.(e.target.value)}

          placeholder="Search name, phone, city, email..."

          className={cn(glassInput, 'pl-11 pr-10 py-3')}

        />

        {search && (

          <button

            type="button"

            onClick={() => onSearchChange?.('')}

            className={cn(glassActionBtnClear())}

            aria-label="Clear search"

          >

            <X className={cn(glassIcon(), 'w-3.5 h-3.5')} />

          </button>

        )}

      </div>



      {/* Row 1 */}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">

        {showBranch && onBranchChange && (

          <GlassDropdown

            label="Branch"

            icon={Building2}

            value={branchFilter}

            onChange={onBranchChange}

            options={branchOpts}

          />

        )}

        {showCity && onCityChange && cities.length > 0 && (

          <GlassDropdown

            label="City"

            icon={MapPin}

            value={cityFilter}

            onChange={onCityChange}

            options={cityOpts}

          />

        )}

        {onTypeFilterChange && (

          <GlassDropdown

            label="Customer Type"

            icon={Users}

            value={typeFilter}

            onChange={onTypeFilterChange}

            options={typeOpts}

          />

        )}

        {onSortChange && sortOpts.length > 0 && (

          <GlassDropdown

            label="Sort By"

            icon={ArrowUpDown}

            value={sortValue}

            onChange={onSortChange}

            options={sortOpts}

          />

        )}

      </div>



      {/* Row 2 */}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">

        {onVisitFilterChange && (

          <GlassDropdown

            label="Last Visit / First Visit"

            icon={Calendar}

            value={visitFilter}

            onChange={onVisitFilterChange}

            options={visitOpts}

          />

        )}

        {onPersonaFilterChange && (

          <GlassDropdown

            label="Persona (VIP · Credit · Recovery)"

            icon={Sparkles}

            value={personaFilter}

            onChange={onPersonaFilterChange}

            options={personaOpts}

          />

        )}

      </div>



      {/* Footer */}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.05]">

        <p className="text-[11px] text-stone-500">

          Showing <span className="text-amber-500/90 font-bold">{paginatedCount}</span>

          {' '}of <span className="text-stone-300 font-semibold">{filteredCount}</span> customers

        </p>

        <div className="flex items-center gap-2">

          {hasActiveFilters && onClear && (

            <button type="button" onClick={onClear} className={glassBtnDanger}>

              <RotateCcw className={cn(glassIcon(), 'w-3.5 h-3.5')} />

              Clear All

            </button>

          )}

          {searchHasMore && onLoadMore && (

            <button

              type="button"

              disabled={searchLoading}

              onClick={onLoadMore}

              className={glassBtnPrimary}

            >

              Load More

            </button>

          )}

        </div>

      </div>

    </div>

  );

};



const glassActionBtnClear = () => cn(

  'absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg',

  'bg-[#080706]/80 border border-white/[0.06] hover:bg-white/[0.06] transition-all',

);



export default CustomerGlassFilterPanel;

