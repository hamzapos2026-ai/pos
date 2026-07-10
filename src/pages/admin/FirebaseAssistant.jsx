// Super Admin — Firebase quota assistant, backups, Google Drive guide
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, Database, Download, Upload, RefreshCw, AlertTriangle,
  CheckCircle2, HardDrive, Trash2, TrendingUp, Activity, Shield,
  ChevronDown, ChevronUp, ExternalLink, Loader2, Info, Zap,
  Calendar, FolderOpen, FileJson,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useLanguage } from '../../hooks/useLanguage';
import PageHeader from '../../components/admin/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import {
  getFirebaseHealthSnapshot, formatBytes, pct, SPARK_LIMITS,
} from '../../services/firebaseHealthService';
import { HEALTH_SCAN_READ_COST } from '../../utils/firebaseQuotaConfig';
import {
  buildScopedBackupPayload,
  downloadScopedBackup,
  saveBackupToCloud,
  backupAndPurgeOldData,
  parseBackupFile,
  restoreBackupPayload,
  formatBackupSize,
} from '../../services/backupService';
import { logActivity } from '../../services/activityLogger';

const PERIODS = [
  { id: 'today', label: 'Today', labelUr: 'Aaj' },
  { id: 'week', label: 'This Week', labelUr: 'Is Hafte' },
  { id: 'month', label: 'This Month', labelUr: 'Is Mahine' },
];

const ICON_BG = {
  cyan: 'bg-cyan-500/10',
  blue: 'bg-sky-500/10',
  purple: 'bg-violet-500/10',
  amber: 'bg-amber-500/10',
  green: 'bg-emerald-500/10',
};

const BACKUP_ACTIONS = [
  { scope: 'today', title: "Today's Backup", desc: 'Aaj ki orders, bills & logs', icon: Calendar, color: 'cyan' },
  { scope: 'week', title: 'This Week', desc: 'Last 7 days — PC download', icon: TrendingUp, color: 'blue' },
  { scope: 'month', title: 'This Month', desc: 'Last 30 days snapshot', icon: Activity, color: 'purple' },
  { scope: '3months', title: '3 Months', desc: 'Quarter archive for Google Drive', icon: FolderOpen, color: 'amber' },
  { scope: 'full', title: 'Full Backup', desc: 'Complete DB — PC + optional cloud', icon: Database, color: 'green' },
];

const ALERT_STYLES = {
  critical: { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400', icon: AlertTriangle },
  warning: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: AlertTriangle },
  info: { border: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-400', icon: Info },
  ok: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
};

const UsageMeter = ({ label, value, limit, pctVal, isDark, loading }) => {
  const color = pctVal >= 90 ? 'bg-rose-500' : pctVal >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className={cn(
      'rounded-2xl border p-4',
      isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
    )}>
      <div className="flex justify-between items-center mb-2">
        <span className={cn('text-xs font-semibold uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-500')}>{label}</span>
        <span className={cn('text-sm font-bold tabular-nums', isDark ? 'text-white' : 'text-gray-900')}>
          {loading ? '…' : `${pctVal}%`}
        </span>
      </div>
      <div className={cn('h-2.5 rounded-full overflow-hidden', isDark ? 'bg-[#1a1208]' : 'bg-amber-100')}>
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: loading ? '0%' : `${Math.min(100, pctVal)}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <p className={cn('text-[11px] mt-2 tabular-nums', isDark ? 'text-gray-500' : 'text-gray-400')}>
        {loading ? 'Scanning…' : `${Number(value).toLocaleString()} / ${Number(limit).toLocaleString()}`}
      </p>
    </div>
  );
};

const MiniBarChart = ({ history, isDark, metric = 'reads' }) => {
  const max = Math.max(1, ...history.map((h) => h[metric] || 0));
  return (
    <div className={cn(
      'rounded-2xl border p-4',
      isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
    )}>
      <p className={cn('text-xs font-semibold uppercase tracking-wider mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
        Last 14 days — {metric}
      </p>
      <div className="flex items-end gap-1 h-24">
        {history.map((h) => {
          const v = h[metric] || 0;
          const hPct = Math.max(4, (v / max) * 100);
          return (
            <div key={h.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn('w-full rounded-t-md', metric === 'reads' ? 'bg-amber-500/80' : 'bg-sky-500/80')}
                style={{ height: `${hPct}%` }}
                title={`${h.date}: ${v.toLocaleString()}`}
              />
              <span className={cn('text-[8px] truncate w-full text-center', isDark ? 'text-gray-600' : 'text-gray-400')}>
                {h.date.slice(8)}
              </span>
            </div>
          );
        })}
        {history.length === 0 && (
          <p className={cn('text-sm m-auto', isDark ? 'text-gray-500' : 'text-gray-400')}>No history yet — use POS to track</p>
        )}
      </div>
    </div>
  );
};

const FirebaseAssistant = () => {
  const { isDark } = useTheme();
  const { user, userData, isSuperAdmin } = useAuth();
  const { isOnline } = useNetwork();
  const { t, isRTL } = useLanguage();
  const fileInputRef = useRef(null);

  const [period, setPeriod] = useState('today');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyScope, setBusyScope] = useState(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeStep, setPurgeStep] = useState('');
  const [guideOpen, setGuideOpen] = useState(true);
  const [saveCloudToo, setSaveCloudToo] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(async (silent = false, forceScan = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const snap = await getFirebaseHealthSnapshot({ forceScan });
      setHealth(snap);
    } catch (e) {
      toast.error(e.message || 'Health scan failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh(false, false);
  }, [refresh]);

  const periodUsage = useMemo(() => {
    if (!health?.usage) return { reads: 0, writes: 0 };
    if (period === 'week') return health.usage.week;
    if (period === 'month') return health.usage.month;
    return health.usage.today;
  }, [health, period]);

  const periodReadsPct = useMemo(() => {
    const days = period === 'month' ? 30 : period === 'week' ? 7 : 1;
    return pct(periodUsage.reads || 0, SPARK_LIMITS.readsPerDay * days);
  }, [period, periodUsage]);

  const handleBackup = async (scope) => {
    if (!isOnline) {
      toast.error('Online hona zaroori hai backup ke liye');
      return;
    }
    setBusyScope(scope);
    const tid = toast.loading(`Backup: ${scope}…`);
    try {
      const meta = { adminEmail: user?.email, adminUid: user?.uid, scope };
      const payload = await buildScopedBackupPayload(scope, meta);
      const bytes = downloadScopedBackup(payload, scope);
      if (saveCloudToo && scope === 'full') {
        await saveBackupToCloud(payload, { scope: `Assistant ${scope}`, adminEmail: user?.email, adminUid: user?.uid });
      }
      await logActivity('firebase_assistant:backup', userData?.uid, userData?.primaryStore || 'default', { scope, bytes });
      toast.success(`Downloaded ${formatBackupSize(bytes)}`, { id: tid });
    } catch (e) {
      toast.error(e.message || 'Backup failed', { id: tid });
    } finally {
      setBusyScope(null);
    }
  };

  const handlePurge = async () => {
    if (!isOnline) {
      toast.error('Online required');
      return;
    }
    const ok = window.confirm(
      'Pehle 90+ din purana data JSON backup download hoga, phir Firebase se delete.\n\n'
      + 'Active bills (recent 90 days) safe rahengi.\n\nContinue?',
    );
    if (!ok) return;

    setPurgeBusy(true);
    const tid = toast.loading('Backup + cleanup…');
    try {
      const result = await backupAndPurgeOldData({
        olderThanDays: 90,
        modules: ['orders', 'activity'],
        currentUid: user?.uid,
        onProgress: setPurgeStep,
      });
      if (!result.totalRecords) {
        toast.success('Koi 90+ din purana data nahi mila', { id: tid });
      } else {
        await logActivity('firebase_assistant:purge', userData?.uid, userData?.primaryStore || 'default', result);
        toast.success(
          `Backup saved + ${result.deletedFirestore} cloud records removed`,
          { id: tid, duration: 5000 },
        );
        refresh(true);
      }
    } catch (e) {
      toast.error(e.message || 'Cleanup failed', { id: tid });
    } finally {
      setPurgeBusy(false);
      setPurgeStep('');
    }
  };

  const handleRestoreUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    const tid = toast.loading('Restoring backup…');
    try {
      const payload = await parseBackupFile(file);
      await restoreBackupPayload(payload);
      toast.success('Local data restored from backup file', { id: tid });
    } catch (err) {
      toast.error(err.message || 'Restore failed', { id: tid });
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const writesTotal = (periodUsage.writes || 0) + (periodUsage.deletes || 0);
  const writeLimit = SPARK_LIMITS.writesPerDay * (period === 'month' ? 30 : period === 'week' ? 7 : 1);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      <PageHeader
        icon={Cloud}
        title={t('firebaseAssistant.title', 'Firebase Assistant')}
        description={t('firebaseAssistant.subtitle', 'Quota monitor, smart backups & storage guide — Super Admin only')}
        actions={(
          <Button variant="secondary" size="sm" onClick={() => refresh(true, true)} disabled={refreshing}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        )}
      />

      {/* Assistant banner */}
      <div className={cn(
        'rounded-2xl border p-4 flex gap-3',
        isDark ? 'bg-gradient-to-r from-amber-500/10 to-violet-500/10 border-amber-500/25' : 'bg-amber-50 border-amber-200',
      )}>
        <Zap className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className={cn('font-bold text-sm', isDark ? 'text-amber-300' : 'text-amber-800')}>
            Senior Assistant — Roman Urdu Guide
          </p>
          <p className={cn('text-sm mt-1', isDark ? 'text-gray-400' : 'text-gray-600')}>
            Biller/Cashier par koi asar nahi. Yahan se quota dekho, backup lo (PC + Google Drive), storage full ho to pehle backup phir purge.
            App usage estimate hai — exact numbers Firebase Console se verify karein.
            {' '}Refresh scan = ~{HEALTH_SCAN_READ_COST} reads (10 min cache). Backup pehle poori collection padhta tha — ab max 400 docs/collection.
          </p>
        </div>
      </div>

      {/* Where reads go */}
      <div className={cn(
        'rounded-2xl border p-4',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <p className={cn('text-xs font-semibold uppercase tracking-wider mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Aaj reads kahan ja sakti hain (~{health?.usage?.today?.reads?.toLocaleString() || 0} tracked)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(health?.readBreakdown || []).map((row) => (
            <div
              key={row.key}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs',
                row.severity === 'high'
                  ? isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-300 bg-amber-50'
                  : isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
              )}
            >
              <p className={cn('font-semibold', isDark ? 'text-gray-200' : 'text-gray-800')}>{row.label}</p>
              <p className={cn('mt-0.5', isDark ? 'text-gray-500' : 'text-gray-500')}>{row.hint}</p>
            </div>
          ))}
        </div>
        {health?.scan?.cached && (
          <p className={cn('text-[11px] mt-3', isDark ? 'text-gray-600' : 'text-gray-400')}>
            Collection scan cached — Refresh button dabao to naya scan (~{HEALTH_SCAN_READ_COST} reads)
          </p>
        )}
      </div>

      {/* Alerts */}
      <AnimatePresence mode="popLayout">
        {(health?.alerts || []).map((alert, i) => {
          const st = ALERT_STYLES[alert.level] || ALERT_STYLES.info;
          const Icon = st.icon;
          return (
            <motion.div
              key={`${alert.title}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('rounded-2xl border p-4 flex gap-3', st.border, st.bg)}
            >
              <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', st.text)} />
              <div>
                <p className={cn('font-semibold text-sm', st.text)}>{alert.title}</p>
                <p className={cn('text-sm mt-0.5', isDark ? 'text-gray-400' : 'text-gray-600')}>{alert.message}</p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Period tabs + meters */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                period === p.id
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/25'
                  : isDark ? 'bg-[#1a1208] text-gray-400 hover:text-white' : 'bg-white text-gray-600 border border-amber-200',
              )}
            >
              {p.label}
              <span className="opacity-60 text-xs ms-1">({p.labelUr})</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UsageMeter
            label={`Reads (${period})`}
            value={periodUsage.reads}
            limit={SPARK_LIMITS.readsPerDay * (period === 'month' ? 30 : period === 'week' ? 7 : 1)}
            pctVal={periodReadsPct}
            isDark={isDark}
            loading={loading}
          />
          <UsageMeter
            label={`Writes (${period})`}
            value={writesTotal}
            limit={writeLimit}
            pctVal={pct(writesTotal, writeLimit)}
            isDark={isDark}
            loading={loading}
          />
          <UsageMeter
            label="Storage (estimate)"
            value={health?.scan?.estimatedBytes}
            limit={SPARK_LIMITS.storageBytes}
            pctVal={health?.storagePct || 0}
            isDark={isDark}
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MiniBarChart history={health?.usage?.history || []} isDark={isDark} metric="reads" />
          <MiniBarChart history={health?.usage?.history || []} isDark={isDark} metric="writes" />
        </div>
      </div>

      {/* Collection table */}
      <div className={cn('rounded-2xl border overflow-hidden', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>
        <div className={cn('px-4 py-3 border-b flex items-center justify-between', isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-amber-50 border-amber-200')}>
          <h3 className={cn('font-bold text-sm flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
            <Database className="w-4 h-4 text-amber-500" />
            Cloud Collections
          </h3>
          {health?.scan?.scannedAt && (
            <span className={cn('text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
              Scanned {new Date(health.scan.scannedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={isDark ? 'text-gray-500 bg-[#0a0805]' : 'text-gray-500 bg-gray-50'}>
                <th className="text-start px-4 py-2 font-medium">Collection</th>
                <th className="text-end px-4 py-2 font-medium">Documents</th>
                <th className="text-end px-4 py-2 font-medium">Est. Size</th>
              </tr>
            </thead>
            <tbody>
              {(health?.scan?.collections || []).map((c) => (
                <tr key={c.name} className={cn('border-t', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                  <td className={cn('px-4 py-2 font-mono text-xs', isDark ? 'text-gray-300' : 'text-gray-700')}>{c.name}</td>
                  <td className={cn('px-4 py-2 text-end tabular-nums', isDark ? 'text-white' : 'text-gray-900')}>
                    {c.count != null ? c.count.toLocaleString() : '—'}
                  </td>
                  <td className={cn('px-4 py-2 text-end tabular-nums', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {formatBytes(c.estBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={cn('px-4 py-2 border-t text-xs flex justify-between', isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-amber-100 text-gray-400')}>
          <span>{health?.scan?.totalDocs?.toLocaleString() || 0} total docs</span>
          <span>~{formatBytes(health?.scan?.estimatedBytes)} estimated</span>
        </div>
      </div>

      {/* Backup actions */}
      <div>
        <h3 className={cn('font-bold text-base mb-3 flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
          <Download className="w-5 h-5 text-amber-500" />
          Smart Backups — PC Download
        </h3>
        <label className={cn('flex items-center gap-2 text-sm mb-3 cursor-pointer', isDark ? 'text-gray-400' : 'text-gray-600')}>
          <input type="checkbox" checked={saveCloudToo} onChange={(e) => setSaveCloudToo(e.target.checked)} className="rounded" />
          Full backup par cloud copy bhi save karo
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {BACKUP_ACTIONS.map((action) => {
            const Icon = action.icon;
            const busy = busyScope === action.scope;
            return (
              <button
                key={action.scope}
                type="button"
                disabled={!!busyScope || !isOnline}
                onClick={() => handleBackup(action.scope)}
                className={cn(
                  'rounded-2xl border p-4 text-start transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50',
                  isDark ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/40' : 'bg-white border-amber-200 hover:border-amber-400',
                )}
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', ICON_BG[action.color] || ICON_BG.amber)}>
                  {busy ? <Loader2 className="w-5 h-5 animate-spin text-amber-500" /> : <Icon className="w-5 h-5 text-amber-500" />}
                </div>
                <p className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>{action.title}</p>
                <p className={cn('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>{action.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Google Drive guide */}
      <div className={cn('rounded-2xl border', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>
        <button
          type="button"
          onClick={() => setGuideOpen((o) => !o)}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3',
            isDark ? 'bg-[#0f0a05]' : 'bg-amber-50',
          )}
        >
          <span className={cn('font-bold text-sm flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
            <HardDrive className="w-4 h-4 text-emerald-500" />
            Google Drive + PC — Step by Step
          </span>
          {guideOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {guideOpen && (
          <div className={cn('p-4 space-y-3 text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
            <ol className="list-decimal list-inside space-y-2">
              <li>Upar se <strong>Full Backup</strong> ya <strong>3 Months</strong> download karo (.json file).</li>
              <li>
                <a href="https://www.google.com/drive/download/" target="_blank" rel="noreferrer" className="text-amber-500 inline-flex items-center gap-1">
                  Google Drive for Desktop install karo <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Folder banao: <code className="px-1 rounded bg-black/20">AOne-POS-Backups/2026/</code></li>
              <li>Download ki hui .json file us folder mein copy karo — auto cloud sync ho jayega.</li>
              <li>Har month end par <strong>3 Months</strong> backup repeat karo.</li>
              <li>Storage full warning aaye → pehle Full Backup, phir neeche &quot;Backup &amp; Clean&quot; use karo.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Upload restore + purge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cn(
          'rounded-2xl border p-4',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <h4 className={cn('font-bold text-sm flex items-center gap-2 mb-3', isDark ? 'text-white' : 'text-gray-900')}>
            <Upload className="w-4 h-4 text-sky-500" />
            Upload Backup (Restore Local)
          </h4>
          <p className={cn('text-xs mb-3', isDark ? 'text-gray-500' : 'text-gray-400')}>
            PC ya Google Drive se .json file select karo — local IndexedDB restore hogi.
          </p>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleRestoreUpload} />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={restoring}>
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            Choose backup file
          </Button>
        </div>

        <div className={cn(
          'rounded-2xl border p-4',
          isDark ? 'bg-rose-500/5 border-rose-500/30' : 'bg-rose-50 border-rose-200',
        )}>
          <h4 className={cn('font-bold text-sm flex items-center gap-2 mb-3', isDark ? 'text-rose-300' : 'text-rose-800')}>
            <Trash2 className="w-4 h-4" />
            Storage Full? — Backup then Delete
          </h4>
          <p className={cn('text-xs mb-3', isDark ? 'text-gray-400' : 'text-gray-600')}>
            90+ din purana orders + activity logs pehle JSON download, phir Firebase se delete. Recent 90 din safe.
          </p>
          {purgeStep && <p className="text-xs text-amber-500 mb-2">{purgeStep}</p>}
          <Button variant="danger" size="sm" onClick={handlePurge} disabled={purgeBusy || !isOnline}>
            {purgeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Backup &amp; Clean Old Data (90d+)
          </Button>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 text-amber-500 text-sm">
          <AlertTriangle className="w-4 h-4" />
          Offline — backup/scan ke liye internet chahiye. Biller/Cashier local chal rahe hain.
        </div>
      )}

      <p className={cn('text-center text-xs pb-4', isDark ? 'text-gray-600' : 'text-gray-400')}>
        <Badge variant="default" className="me-2">Spark limits</Badge>
        Reads 50K/day · Writes 20K/day · Storage ~1 GB ·
        <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-amber-500 ms-1 inline-flex items-center gap-0.5">
          Firebase Console <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  );
};

export default FirebaseAssistant;
