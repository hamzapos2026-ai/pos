// src/pages/admin/SyncMonitor.jsx
// ✅ FIXED — Live data from IDB + Firebase sync tracking
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, AlertCircle, Clock,
  Wifi, Database, Trash2, Upload, WifiOff, RotateCcw,
} from 'lucide-react';
import { retryDeadLetter } from '../../services/syncWorker';
import {
  collection, getDocs, query, orderBy, limit,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import {
  syncOfflineOrders, getOfflineOrdersCount,
} from '../../services/localSyncService';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import { useLanguage } from '../../hooks/useLanguage';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import EmptyState from '../../components/admin/EmptyState';

const toDate = (v) => {
  if (!v) return new Date(0);
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  return new Date(v || 0);
};

const SyncMonitor = () => {
  const { isDark }   = useTheme();
  const { isOnline } = useNetwork();
  const { t, isRTL } = useLanguage();

  const [pendingCount,  setPendingCount]  = useState(0);
  const [recentSynced,  setRecentSynced]  = useState([]);
  const [failedItems,   setFailedItems]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [syncing,       setSyncing]       = useState(false);
  const [retryingId,    setRetryingId]    = useState(null);
  const [lastSyncTime,  setLastSyncTime]  = useState(null);

  // ── Load data ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Pending from IDB
      const count = await getOfflineOrdersCount().catch(() => 0);
      setPendingCount(count);

      // Recent synced from Firebase
      if (isFirebaseReady() && db) {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'orders'),
              orderBy('syncedAt', 'desc'),
              limit(20),
            ),
          );
          setRecentSynced(
            snap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(o => o.synced === true || o.syncStatus === 'synced'),
          );
        } catch {
          // syncedAt field may not exist — fallback
          try {
            const snap = await getDocs(
              query(
                collection(db, 'orders'),
                orderBy('createdAt', 'desc'),
                limit(20),
              ),
            );
            setRecentSynced(
              snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(o => o.synced === true || o.syncStatus === 'synced'),
            );
          } catch {}
        }
      }

      // Failed items from IDB
      try {
        const { openDB } = await import('idb');
        const idb = await openDB('aone_pos_db', undefined, {});
        if (idb.objectStoreNames.contains('failedSync')) {
          const tx = idb.transaction('failedSync', 'readonly');
          const all = await tx.store.getAll();
          setFailedItems(all || []);
        }
        idb.close();
      } catch {
        setFailedItems([]);
      }
    } catch (e) {
      console.error('[SyncMonitor]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 15s
  useEffect(() => {
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  // ── Retry all ──────────────────────────────────────────────
  const handleRetryAll = async () => {
    if (!isOnline) {
      toast.error(t('admin.syncPage.cannotSyncOffline', 'Cannot sync while offline'));
      return;
    }
    setSyncing(true);
    try {
      const result = await syncOfflineOrders();
      const synced = result?.synced || 0;
      if (synced > 0) {
        toast.success(t('admin.syncPage.syncedCount', `${synced} bill(s) synced!`, { count: synced }));
      } else {
        toast.success(t('admin.syncPage.allAlreadySynced', 'All bills already synced!'));
      }
      setLastSyncTime(new Date());
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error(t('admin.syncPage.syncFailed', 'Sync failed: {{msg}}', { msg: e.message || 'Unknown error' }));
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryFailed = async (item) => {
    const qid = item.queueId || item.id;
    if (!qid) return;
    setRetryingId(qid);
    try {
      const ok = await retryDeadLetter(String(qid));
      if (ok) {
        toast.success(t('admin.syncPage.retryQueued', 'Bill re-queued for sync'));
        await loadData();
      } else {
        toast.error(t('admin.syncPage.retryFailed', 'Could not retry — item missing'));
      }
    } catch (e) {
      toast.error(e?.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    pending:    pendingCount,
    synced:     recentSynced.length,
    failed:     failedItems.length,
    lastSync:   lastSyncTime
      ? lastSyncTime.toLocaleTimeString('en-PK', {
          hour: '2-digit', minute: '2-digit',
        })
      : 'Not yet',
  }), [pendingCount, recentSynced, failedItems, lastSyncTime]);

  const tableHeaders = [
    t('admin.syncPage.colSerial', 'Serial'),
    t('admin.syncPage.colCustomer', 'Customer'),
    t('admin.syncPage.colAmount', 'Amount'),
    t('admin.syncPage.colSyncedAt', 'Synced At'),
    t('common.status', 'Status'),
  ];

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      <PageHeader
        icon={RefreshCw}
        title={t('admin.syncPage.title', 'Sync Monitor')}
        description={t('admin.syncPage.subtitle', 'Track offline queue, sync status & retry failed orders')}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost"
              leftIcon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />}
              onClick={loadData} disabled={loading}>
              {t('common.refresh', 'Refresh')}
            </Button>
            <Button variant="primary"
              leftIcon={syncing
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              onClick={handleRetryAll}
              disabled={syncing || !isOnline}>
              {syncing ? t('network.syncing', 'Syncing...') : t('admin.syncPage.retryFailed', 'Retry All')}
            </Button>
          </div>
        }
      />

      {/* Connection status */}
      <div className={cn(
        'rounded-xl border px-4 py-2.5 flex items-center gap-2 text-xs font-semibold',
        isOnline
          ? isDark
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : isDark
            ? 'bg-rose-500/5 border-rose-500/20 text-rose-400'
            : 'bg-rose-50 border-rose-200 text-rose-700',
      )}>
        {isOnline
          ? <><Wifi className="w-4 h-4" /> {t('admin.syncPage.onlineConnected', 'Online — Firebase connected')}</>
          : <><WifiOff className="w-4 h-4" /> {t('admin.syncPage.offlineLocal', 'Offline — data saving locally')}</>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label={t('admin.syncPage.pending', 'Pending')}   value={stats.pending}  icon={Clock}       color="amber" />
        <StatCard label={t('admin.syncPage.synced', 'Synced')}    value={stats.synced}   icon={CheckCircle} color="green" />
        <StatCard label={t('admin.syncPage.failed', 'Failed')}    value={stats.failed}   icon={AlertCircle} color="rose"  />
        <StatCard label={t('admin.syncPage.lastSync', 'Last Sync')} value={stats.lastSync} icon={RefreshCw}   color="blue"  />
      </div>

      {/* Pending Queue */}
      <div className={cn(
        'rounded-2xl border p-5',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <h3 className={cn('font-bold mb-4 flex items-center gap-2',
          isDark ? 'text-white' : 'text-gray-900')}>
          <Database className="w-4 h-4 text-amber-500" />
          Offline Queue
        </h3>
        {pendingCount === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={t('admin.syncPage.allSynced', 'All synced!')}
            description={t('admin.syncPage.noPending', 'No pending items in the offline queue')}
          />
        ) : (
          <div className={cn(
            'rounded-xl border p-4 flex items-center justify-between',
            isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200',
          )}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10
                              flex items-center justify-center">
                <Database className="w-5 h-5 text-amber-500 animate-pulse" />
              </div>
              <div>
                <p className={cn('font-bold text-lg',
                  isDark ? 'text-white' : 'text-gray-900')}>
                  {pendingCount} order{pendingCount > 1 ? 's' : ''} pending
                </p>
                <p className="text-xs text-gray-500">
                  Waiting for internet connection to sync
                </p>
              </div>
            </div>
            <Button variant="primary" size="sm"
              onClick={handleRetryAll}
              disabled={syncing || !isOnline}
              leftIcon={syncing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5" />}>
              {syncing ? t('network.syncing', 'Syncing...') : t('admin.syncPage.syncNow', 'Sync Now')}
            </Button>
          </div>
        )}
      </div>

      {/* Recent Synced */}
      <div className={cn(
        'rounded-2xl border p-5',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <h3 className={cn('font-bold mb-4 flex items-center gap-2',
          isDark ? 'text-white' : 'text-gray-900')}>
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          Recently Synced ({recentSynced.length})
        </h3>

        {recentSynced.length === 0 ? (
          <EmptyState icon={Wifi} title={t('admin.syncPage.noSyncedYet', 'No synced orders yet')}
            description={t('admin.syncPage.syncedAppear', 'Orders will appear here after syncing')} />
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className={cn(
                'sticky top-0',
                isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600',
              )}>
                <tr>
                  {tableHeaders.map(h => (
                    <th key={h} className="px-4 py-2.5 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSynced.map(o => (
                  <tr key={o.id} className={cn(
                    'border-t transition-colors',
                    isDark
                      ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60'
                      : 'border-amber-100 hover:bg-amber-50/50',
                  )}>
                    <td className={cn('px-4 py-3 font-mono font-bold',
                      isDark ? 'text-gray-200' : 'text-gray-800')}>
                      {o.billSerial || o.serialNo || o.id.slice(0, 8)}
                    </td>
                    <td className={cn('px-4 py-3',
                      isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {o.customer?.name || t('admin.customersPage.walkIn', 'Walk-in')}
                    </td>
                    <td className={cn('px-4 py-3 font-bold font-mono',
                      isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                      Rs {Number(o.grandTotal || o.totalAmount || 0).toLocaleString()}
                    </td>
                    <td className={cn('px-4 py-3',
                      isDark ? 'text-gray-400' : 'text-gray-500')}>
                      {toDate(o.syncedAt || o.createdAt).toLocaleString('en-PK')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="success" className="flex items-center gap-1 w-fit">
                        <Wifi className="w-3 h-3" /> {t('admin.syncPage.synced', 'Synced')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Failed Items */}
      {failedItems.length > 0 && (
        <div className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-rose-500/20' : 'bg-white border-rose-200',
        )}>
          <h3 className={cn('font-bold mb-4 flex items-center gap-2 text-rose-500')}>
            <AlertCircle className="w-4 h-4" />
            Failed Sync Items ({failedItems.length})
          </h3>
          <div className="space-y-2">
            {failedItems.slice(0, 10).map((item, i) => (
              <div key={item.id || i} className={cn(
                'rounded-xl border p-3 flex items-center justify-between gap-3 text-xs',
                isDark ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100',
              )}>
                <div>
                  <p className={cn('font-semibold',
                    isDark ? 'text-gray-200' : 'text-gray-800')}>
                    {item.billSerial || item.serialNo || `Order #${i + 1}`}
                  </p>
                  <p className="text-gray-500 text-[10px]">
                    Error: {item.error || item.lastError || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetryFailed(item)}
                    disabled={retryingId === (item.queueId || item.id) || !isOnline}
                    leftIcon={retryingId === (item.queueId || item.id)
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <RotateCcw className="w-3.5 h-3.5" />}
                  >
                    {t('admin.syncPage.retry', 'Retry')}
                  </Button>
                  <Badge variant="destructive">{t('admin.syncPage.failed', 'Failed')}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncMonitor;