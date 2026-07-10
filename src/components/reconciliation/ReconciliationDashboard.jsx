// Reconciliation — Fraud / Duplicate / Offline / Sync (no pending bills)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { Link } from 'react-router-dom';

import {

  RefreshCw, AlertTriangle, CreditCard, WifiOff, CheckCircle, XCircle,

  Scale, Wifi, Zap, ExternalLink, Check, X, RotateCcw, Copy, Store, Loader2,

} from 'lucide-react';

import { useTheme } from '../../context/ThemeContext';

import { useNetwork } from '../../context/NetworkContext';

import { useLanguage } from '../../hooks/useLanguage';

import useStoresMap, { resolveStoreName } from '../../hooks/useStoresMap';

import {

  getReconciliationDashboardData,

  watchReconciliationDashboardData,

  fixReconciliationIssue,

  forceReconciliationSync,

  ISSUE_TYPES,

} from '../../services/paymentReconciliationService';

import PageHeader from '../admin/PageHeader';

import StatCard from '../admin/StatCard';

import Badge from '../ui/Badge';

import Button from '../ui/Button';

import { SettingsCard, FilterTabs } from '../admin/SettingsUi';

import { cn } from '../../utils/cn';

import { getBillSerialDisplay } from '../../utils/billsListHelpers';

import { RECON_HINTS, ISSUE_TYPE_META, getFraudAttribution } from '../../utils/reconciliationHints';

import { getIssueStableKey, markReconciliationResolved } from '../../utils/reconciliationDismissedStore';

import { toast } from 'react-hot-toast';



const formatPKR = (n) => `Rs.${(Number(n) || 0).toLocaleString()}`;



const formatWhen = (ts) => {

  if (!ts) return '—';

  try {

    const d = ts?.toDate ? ts.toDate() : new Date(ts);

    if (Number.isNaN(d.getTime())) return '—';

    return d.toLocaleString('en-PK', {

      day: '2-digit', month: 'short', year: 'numeric',

      hour: '2-digit', minute: '2-digit', hour12: true,

    });

  } catch {

    return '—';

  }

};



const issueRowKey = (item) => getIssueStableKey(item);



const ACTION_SUCCESS_MSG = {

  retry: 'Retry successful — issue hata di',

  approve: 'Approve ho gaya — issue hata di',

  dismiss: 'Dismiss ho gaya — issue hata di',

  reject: 'Reject ho gaya — issue hata di',

  release: 'Cashier ko wapas bhej diya',

  fix: 'Sync retry ho gaya',

};



const FILTER_TAB_IDS = [

  { id: 'all', labelKey: 'Sab' },

  { id: ISSUE_TYPES.FRAUD, labelKey: 'Fraud' },

  { id: ISSUE_TYPES.DUPLICATE, labelKey: 'Duplicate' },

  { id: ISSUE_TYPES.OFFLINE, labelKey: 'Offline' },

  { id: ISSUE_TYPES.SYNC_FAILED, labelKey: 'Sync Fail' },

];



const NameHighlight = ({ label, name, accent = 'amber', isDark }) => {

  const styles = {

    amber: isDark ? 'border-amber-500/35 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-900',

    blue: isDark ? 'border-sky-500/35 bg-sky-500/10 text-sky-300' : 'border-sky-300 bg-sky-50 text-sky-900',

    purple: isDark ? 'border-violet-500/35 bg-violet-500/10 text-violet-300' : 'border-violet-300 bg-violet-50 text-violet-900',

    rose: isDark ? 'border-rose-500/35 bg-rose-500/10 text-rose-300' : 'border-rose-300 bg-rose-50 text-rose-900',

  };

  return (

    <div className={cn('rounded-xl border px-2.5 py-2 min-w-0', styles[accent] || styles.amber)}>

      <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</p>

      <p className="text-sm font-black truncate mt-0.5">{name || '—'}</p>

    </div>

  );

};



const ActionBtn = ({ onClick, disabled, busy, children, variant = 'default', isDark }) => (

  <button

    type="button"

    disabled={disabled || busy}

    onClick={(e) => {

      e.preventDefault();

      e.stopPropagation();

      onClick?.(e);

    }}

    className={cn(

      'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all disabled:opacity-40',

      variant === 'success' && (isDark ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'),

      variant === 'danger' && (isDark ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : 'border-rose-300 text-rose-700 hover:bg-rose-50'),

      variant === 'primary' && (isDark ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-amber-300 text-amber-800 hover:bg-amber-50'),

      variant === 'default' && (isDark ? 'border-[#2a1f0d] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'),

    )}

  >

    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}

    {children}

  </button>

);



const ActionWithHint = ({ hint, isDark, children }) => (

  <div className="flex flex-col gap-0.5 min-w-[4.5rem] max-w-[9.5rem]">

    {children}

    {hint && (

      <p className={cn('text-[9px] leading-snug px-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>

        {hint}

      </p>

    )}

  </div>

);



const getAttributionStyle = (who, isDark) => {

  if (who === 'cashier') return isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-800';

  if (who === 'biller') return isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-900';

  return isDark ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-sky-200 bg-sky-50 text-sky-800';

};



const IssueRow = ({ item, sno, storesMap, isDark, acting, onAction }) => {

  const meta = ISSUE_TYPE_META[item.issueType] || ISSUE_TYPE_META.fraud;

  const key = issueRowKey(item);

  const busy = acting === key;

  const isCloud = item.source === 'cloud' || item.source === 'cloud_match';

  const branch = resolveStoreName(item.storeId, storesMap) || 'Branch —';

  const serial = getBillSerialDisplay(item) || '—';

  const hasBill = Boolean(item.billId);

  const attribution = getFraudAttribution(item);



  return (

    <div className={cn(

      'rounded-xl border p-3 space-y-3',

      isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-white border-amber-100 shadow-sm',

    )}>

      <div className="flex flex-wrap items-start justify-between gap-2">

        <div className="min-w-0 flex-1 space-y-1.5">

          <div className="flex flex-wrap items-center gap-1.5">

            <span className={cn(

              'inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg text-[11px] font-black border',

              isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-amber-200 bg-amber-50 text-amber-800',

            )}>

              #{sno}

            </span>

            <span className={cn('font-black text-base font-mono', isDark ? 'text-amber-400' : 'text-amber-700')}>

              SNO: {serial}

            </span>

            <Badge variant={meta.color === 'rose' ? 'error' : meta.color === 'purple' ? 'purple' : meta.color === 'blue' ? 'info' : 'warning'} className="text-[9px]">

              {meta.label}

            </Badge>

            <Badge variant={isCloud ? 'info' : 'warning'} className="text-[9px]">

              {isCloud ? RECON_HINTS.cloudTag : RECON_HINTS.localTag}

            </Badge>

          </div>

          <p className={cn('text-[11px] font-semibold', isDark ? 'text-rose-300/90' : 'text-rose-700')}>

            {item.reasonLabel || item.reason}

          </p>

          {item.details && (

            <p className="text-[10px] text-gray-500 leading-snug">{item.details}</p>

          )}

          <div className={cn('rounded-lg border px-2.5 py-2 text-[10px] leading-snug', getAttributionStyle(attribution.who, isDark))}>

            <span className="font-black uppercase tracking-wide">{attribution.short}</span>

            <span className="opacity-80"> — {attribution.explain}</span>

          </div>

        </div>

        {item.paymentAmount != null && (

          <span className="font-mono text-sm font-black text-amber-500 shrink-0 tabular-nums">

            {formatPKR(item.paymentAmount)}

          </span>

        )}

      </div>



      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">

        <NameHighlight label="Branch" name={branch} accent="amber" isDark={isDark} />

        <NameHighlight label="Biller" name={item.billerName} accent="blue" isDark={isDark} />

        <NameHighlight label="Cashier" name={item.cashierName} accent="purple" isDark={isDark} />

        <NameHighlight

          label={item.issueType === ISSUE_TYPES.FRAUD ? 'Fraud By (Cashier)' : 'Payment By'}

          name={item.fraudByName || item.cashierName}

          accent="rose"

          isDark={isDark}

        />

      </div>



      <div className={cn('flex flex-wrap items-center gap-2 text-[10px] px-2 py-1.5 rounded-lg border', isDark ? 'border-[#2a1f0d] bg-black/20 text-gray-400' : 'border-gray-100 bg-gray-50 text-gray-500')}>

        <span>Date / Time:</span>

        <span className={cn('font-bold', isDark ? 'text-gray-200' : 'text-gray-800')}>{formatWhen(item.createdAt)}</span>

      </div>



      <div className="flex flex-wrap gap-2 pt-0.5">

        {(item.issueType === ISSUE_TYPES.OFFLINE || item.issueType === ISSUE_TYPES.SYNC_FAILED) && (

          <ActionWithHint

            isDark={isDark}

            hint={item.issueType === ISSUE_TYPES.SYNC_FAILED ? RECON_HINTS.hintFix : RECON_HINTS.hintRetry}

          >

            <ActionBtn variant="primary" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, item.issueType === ISSUE_TYPES.SYNC_FAILED ? 'fix' : 'retry')}>

              <RotateCcw className="w-3 h-3" /> {item.issueType === ISSUE_TYPES.SYNC_FAILED ? RECON_HINTS.btnFix : RECON_HINTS.btnRetry}

            </ActionBtn>

          </ActionWithHint>

        )}

        {(item.issueType === ISSUE_TYPES.FRAUD || item.issueType === ISSUE_TYPES.DUPLICATE) && (

          <>

            <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintRetry}>

              <ActionBtn variant="primary" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'retry')}>

                <RotateCcw className="w-3 h-3" /> {RECON_HINTS.btnRetry}

              </ActionBtn>

            </ActionWithHint>

            {isCloud && hasBill && (

              <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintApprove}>

                <ActionBtn variant="success" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'approve')}>

                  <Check className="w-3 h-3" /> {RECON_HINTS.btnApprove}

                </ActionBtn>

              </ActionWithHint>

            )}

            {!isCloud && (

              <>

                <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintApprove}>

                  <ActionBtn variant="success" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'approve')}>

                    <Check className="w-3 h-3" /> {RECON_HINTS.btnApprove}

                  </ActionBtn>

                </ActionWithHint>

                <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintReject}>

                  <ActionBtn variant="danger" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'reject')}>

                    <X className="w-3 h-3" /> {RECON_HINTS.btnReject}

                  </ActionBtn>

                </ActionWithHint>

                <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintCashierFix}>

                  <ActionBtn variant="default" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'release')}>

                    {RECON_HINTS.btnCashierRetry}

                  </ActionBtn>

                </ActionWithHint>

              </>

            )}

            {isCloud && (

              <>

                <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintDismiss}>

                  <ActionBtn variant="danger" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'dismiss')}>

                    <X className="w-3 h-3" /> {RECON_HINTS.btnDismiss}

                  </ActionBtn>

                </ActionWithHint>

                <ActionWithHint isDark={isDark} hint={RECON_HINTS.hintReject}>

                  <ActionBtn variant="danger" isDark={isDark} busy={busy} disabled={busy} onClick={() => onAction(key, item, 'reject')}>

                    <X className="w-3 h-3" /> {RECON_HINTS.btnReject}

                  </ActionBtn>

                </ActionWithHint>

              </>

            )}

          </>

        )}

      </div>

    </div>

  );

};



const ReconciliationDashboard = ({

  storeIds = null,

  storeAliases = [],

  elevated = false,

  scopeLabel = '',

  branchName = '',

  userData = null,

  billsPath = '/admin/bills',

}) => {

  const { isDark } = useTheme();

  const { isOnline } = useNetwork();

  const { t } = useLanguage();

  const storesMap = useStoresMap();

  const [data, setData] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const [acting, setActing] = useState(null);

  const [filter, setFilter] = useState('all');

  const [liveSync, setLiveSync] = useState(false);



  const hasDataRef = useRef(false);

  const pauseWatchRef = useRef(false);



  const scopeParams = useMemo(() => ({ storeIds, storeAliases, elevated }), [storeIds, storeAliases, elevated]);



  const load = useCallback(async ({ silent = false } = {}) => {

    if (!silent) setRefreshing(true);

    try {

      const result = await getReconciliationDashboardData(scopeParams);

      setData(result);

      hasDataRef.current = true;

    } catch (err) {

      console.error('[Reconciliation]', err);

      toast.error('Data load nahi hui');

    } finally {

      setInitialLoading(false);

      setRefreshing(false);

    }

  }, [scopeParams]);



  useEffect(() => {

    if (!isOnline) {

      setLiveSync(false);

      if (!hasDataRef.current) setInitialLoading(true);

      load({ silent: hasDataRef.current });

      return undefined;

    }



    setLiveSync(true);

    if (!hasDataRef.current) setInitialLoading(true);



    const unsub = watchReconciliationDashboardData(

      scopeParams,

      (result) => {

        setData(result);

        hasDataRef.current = true;

        setInitialLoading(false);

        setRefreshing(false);

      },

      (err) => {

        console.error('[Reconciliation] live sync:', err);

        setLiveSync(false);

        load({ silent: hasDataRef.current });

      },

      { getPaused: () => pauseWatchRef.current },

    );



    return () => {

      setLiveSync(false);

      unsub();

    };

  }, [scopeParams, isOnline, load]);



  const handleForceSync = async () => {

    if (!isOnline) {

      toast.error('Internet nahi — pehle online aao');

      return;

    }

    setSyncing(true);

    const tid = toast.loading('Bills + payments sync ho rahi hain...');

    try {

      const result = await forceReconciliationSync();

      pauseWatchRef.current = true;

      await load({ silent: true });

      if (result?.success === false) {

        toast.error(result.error || 'Sync fail', { id: tid });

        return;

      }

      const parts = [];

      if (result.billsSynced) parts.push(`${result.billsSynced} bill`);

      if (result.matched) parts.push(`${result.matched} payment match`);

      if (result.needsRetry) parts.push(`${result.needsRetry} bill wait`);

      toast.success(parts.length ? `Sync: ${parts.join(', ')}` : 'Sync complete — ab Retry try karo', { id: tid });

    } catch (err) {

      toast.error(err?.message || 'Sync fail', { id: tid });

    } finally {

      setSyncing(false);

      setTimeout(() => { pauseWatchRef.current = false; }, 1500);

    }

  };



  const removeIssueFromState = useCallback((key) => {

    setData((prev) => {

      if (!prev) return prev;

      const strip = (list = []) => list.filter((i) => issueRowKey(i) !== key);

      const fraudIssues = strip(prev.fraudIssues);

      const duplicateIssues = strip(prev.duplicateIssues);

      const offlineIssues = strip(prev.offlineIssues);

      const syncFailures = strip(prev.syncFailures);

      const stats = {

        fraud: fraudIssues.length,

        duplicates: duplicateIssues.length,

        offline: offlineIssues.length,

        syncFailed: syncFailures.length,

        total: fraudIssues.length + duplicateIssues.length + offlineIssues.length + syncFailures.length,

      };

      return { ...prev, fraudIssues, duplicateIssues, offlineIssues, syncFailures, stats };

    });

  }, []);



  const runAction = async (key, item, action) => {

    setActing(key);

    pauseWatchRef.current = true;

    const tid = toast.loading('Processing...');

    try {

      const result = await fixReconciliationIssue(item, action, userData);

      if (result?.success === false) {

        toast.error(result.error || 'Action fail', { id: tid });

      } else {

        markReconciliationResolved(item);

        removeIssueFromState(key);

        toast.success(ACTION_SUCCESS_MSG[action] || 'Issue hata di', { id: tid });

      }

    } catch (err) {

      toast.error(err?.message || 'Action fail', { id: tid });

    } finally {

      setActing(null);

      setTimeout(() => { pauseWatchRef.current = false; }, 2000);

    }

  };



  const stats = data?.stats || {};

  const filterTabs = useMemo(() => {

    const counts = {

      all: stats.total || 0,

      [ISSUE_TYPES.FRAUD]: stats.fraud || 0,

      [ISSUE_TYPES.DUPLICATE]: stats.duplicates || 0,

      [ISSUE_TYPES.OFFLINE]: stats.offline || 0,

      [ISSUE_TYPES.SYNC_FAILED]: stats.syncFailed || 0,

    };

    return FILTER_TAB_IDS.map((tab) => ({

      id: tab.id,

      label: `${tab.labelKey} (${counts[tab.id] ?? 0})`,

    }));

  }, [stats]);



  const allIssues = useMemo(() => [

    ...(data?.fraudIssues || []),

    ...(data?.duplicateIssues || []),

    ...(data?.offlineIssues || []),

    ...(data?.syncFailures || []),

  ], [data]);



  const filteredIssues = useMemo(() => {

    if (filter === 'all') return allIssues;

    return allIssues.filter((i) => i.issueType === filter);

  }, [allIssues, filter]);



  const branchGroups = useMemo(() => {

    const sorted = [...filteredIssues].sort((a, b) => {

      const ba = resolveStoreName(a.storeId, storesMap) || '';

      const bb = resolveStoreName(b.storeId, storesMap) || '';

      if (ba !== bb) return ba.localeCompare(bb);

      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();

      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();

      return tb - ta;

    });

    const groups = [];

    let current = null;

    for (const item of sorted) {

      const branch = resolveStoreName(item.storeId, storesMap) || 'Branch nahi';

      if (!current || current.branch !== branch) {

        current = { branch, items: [] };

        groups.push(current);

      }

      current.items.push(item);

    }

    return groups;

  }, [filteredIssues, storesMap]);



  return (

    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

      <PageHeader

        icon={Scale}

        title={t('reconciliation.title', 'Payment Reconciliation')}

        description={

          !elevated && branchName

            ? `${RECON_HINTS.page} — ${scopeLabel}`

            : RECON_HINTS.page

        }

        actions={

          <div className="flex flex-wrap gap-2">

            <Link

              to={billsPath}

              className={cn(

                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors',

                isDark ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-200 text-amber-800 hover:bg-amber-50',

              )}

            >

              Bills Page <ExternalLink className="w-3.5 h-3.5" />

            </Link>

            <Button onClick={() => load({ silent: true })} disabled={refreshing} size="sm" variant="secondary">

              <RefreshCw className={cn('w-4 h-4 me-1', refreshing && 'animate-spin')} />

              {RECON_HINTS.btnRefresh}

            </Button>

            <Button onClick={handleForceSync} disabled={syncing} size="sm" variant="primary">

              <RefreshCw className={cn('w-4 h-4 me-1', syncing && 'animate-spin')} />

              Force Sync

            </Button>

          </div>

        }

      />



      <div className={cn(

        'rounded-2xl border px-4 py-3 space-y-3',

        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',

      )}>

        <div className="flex flex-wrap items-center gap-2">

          <span className={cn(

            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border',

            isOnline

              ? isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'

              : isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-600',

          )}>

            {isOnline ? <><Wifi className="w-3.5 h-3.5" /> Online</> : <><WifiOff className="w-3.5 h-3.5" /> {RECON_HINTS.offline}</>}

          </span>

          <Badge variant={elevated ? 'purple' : 'info'} className="text-[10px]">

            {scopeLabel || (elevated ? RECON_HINTS.scopeAll : RECON_HINTS.scopeStore)}

          </Badge>

          {liveSync && isOnline && (

            <span className={cn(

              'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border',

              isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700',

            )}>

              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />

              Live — Manager/Admin sync

            </span>

          )}

          {!elevated && branchName && (

            <span className={cn(

              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border',

              isDark ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800',

            )}>

              <Store className="w-3.5 h-3.5" />

              {branchName}

            </span>

          )}

          <Badge variant="warning" className="text-[10px]">

            Total: {stats.total || 0}

          </Badge>

        </div>

        <FilterTabs tabs={filterTabs} active={filter} onChange={setFilter} isDark={isDark} />

        <p className={cn('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>

          <Zap className="w-3 h-3 inline me-1 text-amber-500" />

          {RECON_HINTS.actionHint}

        </p>

      </div>



      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

        <StatCard label="Total Issues" value={stats.total || 0} icon={AlertTriangle} color="amber" compact />

        <StatCard label="Fraud" value={stats.fraud || 0} icon={AlertTriangle} color="rose" subtitle={RECON_HINTS.fraud} compact />

        <StatCard label="Duplicate" value={stats.duplicates || 0} icon={Copy} color="purple" subtitle={RECON_HINTS.duplicates} compact />

        <StatCard label="Offline" value={stats.offline || 0} icon={CreditCard} color="blue" subtitle={RECON_HINTS.offlineIssues} compact />

        <StatCard label="Sync Fail" value={stats.syncFailed || 0} icon={XCircle} color="amber" subtitle={RECON_HINTS.syncFailures} compact />

      </div>



      {initialLoading ? (

        <div className="flex flex-col items-center justify-center py-20 gap-3">

          <RefreshCw className="w-7 h-7 animate-spin text-amber-500" />

          <p className="text-sm text-gray-500">Data load ho rahi hai...</p>

        </div>

      ) : filteredIssues.length === 0 ? (

        <SettingsCard title="Issues" subtitle={RECON_HINTS.allClear} icon={CheckCircle} isDark={isDark} accent="emerald">

          <div className={cn(

            'flex items-center gap-2 py-8 justify-center text-sm rounded-xl border border-dashed',

            isDark ? 'border-emerald-500/20 text-emerald-400/80' : 'border-emerald-200 text-emerald-700',

          )}>

            <CheckCircle className="w-5 h-5" />

            {RECON_HINTS.allClear}

          </div>

        </SettingsCard>

      ) : (

        <div className="space-y-4">

          <div className={cn(

            'rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2',

            isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200',

          )}>

            <p className={cn('text-sm font-black', isDark ? 'text-amber-300' : 'text-amber-800')}>

              Total Issues: {stats.total || 0}

              {filter !== 'all' && ` — Filter: ${filteredIssues.length}`}

            </p>

            <p className="text-[10px] text-gray-500">{RECON_HINTS.billsNote}</p>

          </div>

          {branchGroups.map((group) => (

            <SettingsCard

              key={group.branch}

              title={group.branch}

              subtitle={`${group.items.length} issue${group.items.length !== 1 ? 's' : ''} — SNO #1 se #${filteredIssues.length}`}

              icon={Store}

              isDark={isDark}

              accent="amber"

            >

              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">

                {group.items.map((item) => {

                  const globalSno = filteredIssues.findIndex(

                    (i) => issueRowKey(i) === issueRowKey(item),

                  ) + 1;

                  return (

                    <IssueRow

                      key={issueRowKey(item)}

                      sno={globalSno}

                      item={item}

                      storesMap={storesMap}

                      isDark={isDark}

                      acting={acting}

                      onAction={runAction}

                    />

                  );

                })}

              </div>

            </SettingsCard>

          ))}

        </div>

      )}

    </div>

  );

};



export default ReconciliationDashboard;

