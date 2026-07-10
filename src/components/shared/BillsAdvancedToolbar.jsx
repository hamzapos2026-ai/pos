import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, X, RefreshCw, ChevronDown, ChevronUp,
  SlidersHorizontal, Calendar, DollarSign, User, Store, Wifi,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  DEFAULT_BILLS_FILTERS,
  countActiveAdvancedFilters,
  extractBillMeta,
} from '../../utils/billsFilterUtils';

const QUICK_CHIPS = [
  { id: 'all', labelKey: 'bills.filterAll', fallback: 'All' },
  { id: 'pending_cashier', labelKey: 'bills.pendingCashier', fallback: 'Pending Cashier' },
  { id: 'pending_mgr_cashier', labelKey: 'bills.pendingMgrCashier', fallback: 'Cashier Paid · Mgr Pending' },
  { id: 'dual_mode', labelKey: 'bills.dualMode', fallback: 'Dual Mode' },
  { id: 'offline', labelKey: 'bills.cashierOfflinePay', fallback: 'Cashier Offline Pay' },
  { id: 'pending_mgr', labelKey: 'bills.pendingMgr', fallback: 'Mgr Approval' },
  { id: 'paid', labelKey: 'bills.paid', fallback: 'Confirmed' },
  { id: 'unpaid', labelKey: 'bills.unpaid', fallback: 'Unpaid' },
  { id: 'active', labelKey: 'bills.filterActive', fallback: 'Active' },
  { id: 'edited', labelKey: 'bills.filterEdited', fallback: 'Edited' },
  { id: 'deleted', labelKey: 'bills.filterDeleted', fallback: 'Deleted' },
];

const inputCls =
  'bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2.5 py-2 rounded-lg outline-none focus:border-amber-500/50 w-full';

const selectCls = `${inputCls} min-w-[130px]`;

const BillsAdvancedToolbar = ({
  filters,
  onChange,
  onReset,
  bills = [],
  shownCount = 0,
  totalCount = 0,
  shownValue = 0,
  isLoading = false,
  liveAt = null,
  onRefresh,
  showLive = true,
  showShowAll = true,
  hideDatePreset = false,
  t = (k, fb) => fb,
}) => {
  const f = { ...DEFAULT_BILLS_FILTERS, ...filters };
  const { branches, billers, billerLabels } = useMemo(() => extractBillMeta(bills), [bills]);
  const activeCount = countActiveAdvancedFilters(f);
  const liveSec = liveAt ? Math.max(0, Math.floor((Date.now() - liveAt) / 1000)) : null;

  const set = (patch) => onChange({ ...f, ...patch });

  return (
    <div className="rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] overflow-hidden">
      {/* Quick chips row */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-[#2a1f0d]/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => set({ quick: chip.id })}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all',
                f.quick === chip.id
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                  : 'bg-[#0f0a05] border-[#2a1f0d] text-slate-400 hover:border-amber-500/25 hover:text-amber-400/80'
              )}
            >
              {t(chip.labelKey, chip.fallback)}
            </button>
          ))}
        </div>
      </div>

      {/* Search + actions */}
      <div className="p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={f.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder={t('bills.searchAdvanced', 'Serial, customer, phone, biller…')}
              className="w-full pl-8 pr-3 py-2 text-xs bg-[#0f0a05] border border-[#2a1f0d] rounded-lg text-gray-200 placeholder-slate-500 outline-none focus:border-amber-500/50"
            />
          </div>

          <button
            type="button"
            onClick={() => set({ showAdvanced: !f.showAdvanced })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium',
              f.showAdvanced
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-[#0f0a05] border-[#2a1f0d] text-slate-400 hover:text-amber-400'
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('bills.advanced', 'Advanced')}
            {activeCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0 rounded-full bg-amber-500/25 text-amber-300 text-[9px] font-bold">
                {activeCount}
              </span>
            )}
            {f.showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-lg border border-[#2a1f0d] text-slate-400 hover:text-amber-400 hover:border-amber-500/30"
              title={t('common.refresh', 'Refresh')}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </button>
          )}

          {showShowAll && (
            <button
              type="button"
              onClick={() => set({ showAll: !f.showAll, quick: f.showAll ? f.quick : 'all' })}
              className={cn(
                'px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap',
                f.showAll
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                  : 'bg-[#0f0a05] border-[#2a1f0d] text-slate-400'
              )}
            >
              {f.showAll ? t('bills.activeOnly', 'Active Only') : t('bills.showAll', 'Show All')}
            </button>
          )}

          {(f.search || activeCount > 0) && (
            <button
              type="button"
              onClick={onReset}
              className="p-2 text-slate-500 hover:text-rose-400"
              title={t('common.clearFilters', 'Clear filters')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Advanced panel */}
        <AnimatePresence>
          {f.showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-[#2a1f0d] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <Filter className="w-3 h-3" /> {t('bills.payment', 'Payment')}
                    </label>
                    <select
                      value={f.paymentStatus}
                      onChange={(e) => set({ paymentStatus: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">{t('common.all', 'All')}</option>
                      <option value="pending_cashier">{t('bills.pendingCashier', 'Pending Cashier')}</option>
                      <option value="pending_mgr_cashier">{t('bills.pendingMgrCashier', 'Cashier Paid · Mgr Pending')}</option>
                      <option value="pending_payment">pending_payment</option>
                      <option value="pending_approval">pending_approval</option>
                      <option value="paid">{t('bills.paid', 'Paid')}</option>
                      <option value="partial">{t('bills.partial', 'Partial')}</option>
                      <option value="unpaid">{t('bills.unpaid', 'Unpaid')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <Filter className="w-3 h-3" /> {t('common.status', 'Bill Status')}
                    </label>
                    <select
                      value={f.billStatus}
                      onChange={(e) => set({ billStatus: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">{t('common.all', 'All')}</option>
                      <option value="pending">{t('common.pending', 'Pending')}</option>
                      <option value="approved">{t('bills.approved', 'Approved')}</option>
                      <option value="paid">{t('bills.paid', 'Paid')}</option>
                      <option value="cancelled">{t('bills.cancelled', 'Cancelled')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <Store className="w-3 h-3" /> {t('bills.branch', 'Branch')}
                    </label>
                    <select
                      value={f.branchId || 'all'}
                      onChange={(e) => set({ branchId: e.target.value })}
                      className={selectCls}
                    >
                      <option value="all">{t('bills.allBranches', 'All Branches')}</option>
                      {branches.map((b) => (
                        <option key={b} value={b}>{b.length > 18 ? `${b.slice(0, 18)}…` : b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <User className="w-3 h-3" /> {t('admin.billsPage.colBiller', 'Biller')}
                    </label>
                    <select
                      value={f.billerId || 'all'}
                      onChange={(e) => set({ billerId: e.target.value })}
                      className={selectCls}
                    >
                      <option value="all">{t('bills.allBillers', 'All Billers')}</option>
                      {billers.map((id) => (
                        <option key={id} value={id}>{billerLabels[id] || id}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {!hideDatePreset && (
                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <Calendar className="w-3 h-3" /> {t('bills.dateRange', 'Date')}
                    </label>
                    <select
                      value={f.datePreset}
                      onChange={(e) => set({ datePreset: e.target.value })}
                      className={selectCls}
                    >
                      <option value="all">{t('bills.allTime', 'All Time')}</option>
                      <option value="today">{t('bills.today', 'Today')}</option>
                      <option value="week">{t('bills.last7Days', 'Last 7 Days')}</option>
                      <option value="month">{t('bills.last30Days', 'Last 30 Days')}</option>
                      <option value="custom">{t('bills.customRange', 'Custom Range')}</option>
                    </select>
                  </div>
                  )}

                  {!hideDatePreset && f.datePreset === 'custom' && (
                    <>
                      <div>
                        <label className="text-[9px] uppercase tracking-wide text-slate-500 mb-1 block">{t('bills.from', 'From')}</label>
                        <input type="date" value={f.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase tracking-wide text-slate-500 mb-1 block">{t('bills.to', 'To')}</label>
                        <input type="date" value={f.dateTo} onChange={(e) => set({ dateTo: e.target.value })} className={inputCls} />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <DollarSign className="w-3 h-3" /> {t('bills.amountMin', 'Min Rs')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={f.amountMin}
                      onChange={(e) => set({ amountMin: e.target.value })}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <DollarSign className="w-3 h-3" /> {t('bills.amountMax', 'Max Rs')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={f.amountMax}
                      onChange={(e) => set({ amountMax: e.target.value })}
                      placeholder="∞"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500 mb-1">
                      <Wifi className="w-3 h-3" /> {t('bills.sync', 'Sync')}
                    </label>
                    <select
                      value={f.syncStatus}
                      onChange={(e) => set({ syncStatus: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">{t('common.all', 'All')}</option>
                      <option value="synced">{t('bills.synced', 'Synced')}</option>
                      <option value="pending">{t('bills.syncPending', 'Sync Pending')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2a1f0d] text-[10px] text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-300">
              {shownCount.toLocaleString()} / {totalCount.toLocaleString()} {t('manager.bills', 'bills')}
            </span>
            <span className="text-amber-400/80 font-mono">
              Rs {Number(shownValue || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {showLive && liveAt && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE · {liveSec}s
              </span>
            )}
            {activeCount > 0 && (
              <span className="text-amber-400">{activeCount} {t('common.filtersActive', 'filters active')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillsAdvancedToolbar;
