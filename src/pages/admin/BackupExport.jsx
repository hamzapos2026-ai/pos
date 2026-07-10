import { useState, useEffect, useMemo, useRef } from 'react';
import {
  HardDrive, Download, Upload, AlertTriangle, Trash2, Search, Wifi, Database,
  Clock, Server, RefreshCw, FileCode, Activity, Archive, Cloud, Shield, RotateCcw,
  Calendar, Lock, BookOpen, Sparkles, FileArchive, Package,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, db,
  isFirebaseReady, query, where, getDocs, writeBatch,
} from '../../services/firebase';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { logActivity } from '../../services/activityLogger';
import { clearAllCaches, getCacheStats } from '../../utils/cacheUtils';
import localDB from '../../services/localDB';
import {
  collectBackupPayload,
  downloadBackupFile,
  saveBackupToCloud,
  loadBackupFromCloud,
  deleteCloudBackup,
  restoreBackupPayload,
  parseBackupFile,
  getBackupSchedule,
  saveBackupSchedule,
  runScheduledBackupIfDue,
  exportOrdersCsv,
  formatBackupSize,
  downloadFullBackupZip,
  downloadBlob,
  SCHEDULE_OPTIONS,
  computePayloadChecksum,
} from '../../services/backupService';
import BackupMigratePanel from '../../components/admin/BackupMigratePanel';
import ArchivePanel from '../../components/admin/ArchivePanel';
import BackupModulesPanel from '../../components/admin/BackupModulesPanel';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';
import { useLanguage } from '../../hooks/useLanguage';
import { backupMiniToast } from '../../utils/backupRomanUrdu';
import { softArchiveBackup } from '../../services/archiveService';
import { notifyBackupEvent, BACKUP_EVENTS } from '../../services/backupNotificationService';

const TAB_IDS = ['overview', 'schedule', 'migrate', 'archive', 'history', 'maintenance'];

const TAB_ICONS = {
  overview: Database,
  schedule: Calendar,
  migrate: Archive,
  archive: Package,
  history: Clock,
  maintenance: Shield,
};

const selectFieldClass = (isDark, extra = '') => cn(
  'px-3 py-2 text-sm rounded-xl border outline-none cursor-pointer appearance-none',
  isDark
    ? 'bg-[#0a0805] border-[#2a1f0d] text-white [color-scheme:dark]'
    : 'bg-white border-amber-200 text-gray-900 [color-scheme:light]',
  extra,
);

const BackupExport = () => {
  const { isDark } = useTheme();
  const { user, userData, isSuperAdmin, resetSetupState } = useAuth();
  const { isOnline } = useNetwork();
  const { t, isRTL, language } = useLanguage();
  const fileInputRef = useRef(null);
  const isRomanUrdu = language === 'ur';

  const scheduleLabels = useMemo(() => ({
    off: t('backup.scheduleOff', 'Off'),
    daily: t('backup.scheduleDaily', 'Daily'),
    weekly: t('backup.scheduleWeekly', 'Weekly'),
    monthly: t('backup.scheduleMonthly', 'Monthly'),
  }), [t]);

  const guideSteps = useMemo(() => ([
    t('backup.guideStep1', ''),
    t('backup.guideStep2', ''),
    t('backup.guideStep3', ''),
    t('backup.guideStep4', ''),
    t('backup.guideStep5', ''),
  ]), [t]);

  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [cacheStats, setCacheStats] = useState(null);
  const [archivingMonth, setArchivingMonth] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [search, setSearch] = useState('');
  const [targetFilter, setTargetFilter] = useState('all');
  const [schedule, setSchedule] = useState({
    frequency: 'off',
    localDownload: true,
    cloudSave: true,
    lastRunAt: null,
    nextRunAt: null,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [factoryConfirm, setFactoryConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchLocalMetrics = async () => {
    try {
      if (localDB?.syncQueue) {
        const count = await localDB.syncQueue.count();
        setSyncQueueCount(count);
      }
      setCacheStats(await getCacheStats());
    } catch (e) {
      console.warn('[BackupExport] metrics failed:', e);
    }
  };

  useEffect(() => {
    fetchLocalMetrics();
    const interval = setInterval(fetchLocalMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    getBackupSchedule().then(setSchedule).catch(() => {});
    runScheduledBackupIfDue({ email: user?.email, uid: user?.uid }).catch(() => {});
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!isFirebaseReady() || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'backups'),
      (snap) => {
        const backupData = snap.docs.map((d) => {
          const data = d.data();
          const createdAt = data.timestamp?.toDate
            ? data.timestamp.toDate().toISOString()
            : data.createdAt;
          return { id: d.id, ...data, createdAt };
        });
        backupData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setBackups(backupData);
        setLoading(false);
      },
      (err) => {
        console.error('[BackupExport] backups stream:', err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const totalCachedItems = useMemo(() => {
    if (!cacheStats?.dexieTables) return 0;
    return Object.values(cacheStats.dexieTables).reduce((sum, c) => sum + c, 0);
  }, [cacheStats]);

  const estimatedDatabaseSize = useMemo(() => {
    const baseBytes = 15360;
    const estimated = baseBytes + totalCachedItems * 450;
    return formatBackupSize(estimated);
  }, [totalCachedItems]);

  const stats = useMemo(() => ({
    cacheSize: estimatedDatabaseSize,
    syncQueue: syncQueueCount,
    totalBackups: backups.length,
    lastBackup: backups.length > 0
      ? new Date(backups[0].createdAt).toLocaleDateString()
      : t('backup.stats.na', 'N/A'),
  }), [estimatedDatabaseSize, syncQueueCount, backups, t]);

  const filteredBackups = useMemo(() => backups.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || (b.adminEmail || '').toLowerCase().includes(q)
      || (b.scope || '').toLowerCase().includes(q)
      || b.id.toLowerCase().includes(q);
    const matchesTarget = targetFilter === 'all'
      || (targetFilter === 'cloud' && (b.target || '').toLowerCase().includes('cloud'))
      || (targetFilter === 'local' && (b.target || '').toLowerCase().includes('local'));
    return matchesSearch && matchesTarget;
  }), [backups, search, targetFilter]);

  const runBackup = async ({ cloud = false, label = 'Full Database Backup' }) => {
    setExporting(true);
    const toastId = toast.loading(cloud
      ? t('backup.toast.uploadingCloud', 'Uploading backup to cloud…')
      : t('backup.toast.creatingLocal', 'Creating local backup…'));
    try {
      const meta = {
        adminEmail: user?.email || userData?.email || 'Admin',
        adminUid: user?.uid || userData?.uid,
        scope: label,
        scheduleType: label.toLowerCase().includes('scheduled') ? schedule.frequency : 'manual',
      };
      const payload = await collectBackupPayload(meta);
      const json = JSON.stringify(payload);
      payload.checksum = computePayloadChecksum(json);
      const sizeBytes = cloud
        ? (await saveBackupToCloud(payload, meta)).sizeBytes
        : downloadBackupFile(payload);

      if (!cloud && isFirebaseReady() && db) {
        const bupId = `bup_${Date.now()}`;
        await setDoc(doc(db, 'backups', bupId), {
          id: bupId,
          createdAt: new Date().toISOString(),
          timestamp: serverTimestamp(),
          adminEmail: meta.adminEmail,
          scope: label,
          checksum: payload.checksum,
          scheduleType: meta.scheduleType,
          sizeBytes,
          target: 'Local PC',
          hasPayload: false,
          isSynced: false,
        });
      }

      await logActivity('database:backup', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        backupScope: label,
        target: cloud ? 'cloud' : 'local',
        size: formatBackupSize(sizeBytes),
      });

      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_DONE,
        message: cloud ? 'Cloud backup save ✓' : 'Local JSON backup ✓',
        userId: user?.uid,
        userEmail: user?.email,
      });

      toast.success(
        cloud
          ? t('backup.toast.backupCloudOk', 'Backup saved to cloud!')
          : t('backup.toast.backupLocalOk', 'Backup downloaded to your PC!'),
        { id: toastId },
      );
    } catch (e) {
      console.error(e);
      toast.error(e.message || t('backup.toast.backupFailed', 'Backup failed'), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreFile = async (file) => {
    if (!file) return;
    if (!confirm(t('backup.toast.restoreConfirm', 'Restore will replace current local database. Continue?'))) return;

    setRestoring(true);
    const toastId = toast.loading(t('backup.toast.restoring', 'Restoring backup…'));
    try {
      const payload = await parseBackupFile(file);
      const result = await restoreBackupPayload(payload);

      await logActivity('database:restore', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        source: 'local_file',
        restoredTables: result.restoredTables,
        totalRecords: result.totalRecords,
      });

      await notifyBackupEvent({
        event: BACKUP_EVENTS.RESTORE_DONE,
        message: `Restore mukammal — ${result.totalRecords} records`,
        userId: user?.uid,
        userEmail: user?.email,
      });

      toast.success(
        t('backup.toast.restored', 'Restored {{count}} records. Reloading…', { count: result.totalRecords }),
        { id: toastId },
      );
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      toast.error(e.message || t('backup.toast.restoreFailed', 'Restore failed'), { id: toastId });
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCloudRestore = async (backup) => {
    if (!backup?.hasPayload) {
      toast.error(t('backup.toast.logOnly', 'This entry is log only — no cloud payload stored.'));
      return;
    }
    if (!isOnline) {
      toast.error(t('backup.toast.onlineRequired', 'You must be online to restore from cloud.'));
      return;
    }
    if (!confirm(t('backup.toast.cloudRestoreConfirm', 'Restore cloud backup {{id}}? This replaces local data.', { id: backup.id }))) return;

    setRestoring(true);
    const toastId = toast.loading(t('backup.toast.cloudRestoring', 'Downloading & restoring from cloud…'));
    try {
      const payload = await loadBackupFromCloud(backup.id);
      const result = await restoreBackupPayload(payload);

      await logActivity('database:restore', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        source: 'cloud',
        backupId: backup.id,
        restoredTables: result.restoredTables,
      });

      toast.success(t('backup.toast.cloudRestoreOk', 'Cloud restore complete. Reloading…'), { id: toastId });
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      toast.error(e.message || t('backup.toast.cloudRestoreFailed', 'Cloud restore failed'), { id: toastId });
    } finally {
      setRestoring(false);
    }
  };

  const handleCloudDownload = async (backup) => {
    if (!backup?.hasPayload) {
      toast.error(t('backup.toast.noPayload', 'No cloud payload for this entry.'));
      return;
    }
    setExporting(true);
    try {
      const payload = await loadBackupFromCloud(backup.id);
      downloadBackupFile(payload, `aone_cloud_${backup.id}.json`);
      toast.success(t('backup.toast.cloudDownloadOk', 'Cloud backup downloaded to PC'));
    } catch (e) {
      toast.error(e.message || t('backup.toast.downloadFailed', 'Download failed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (!confirm(
      t('backup.toast.deleteConfirm', 'Delete backup record {{id}}?', { id: backup.id })
      + '\n\n'
      + t('backup.toast.deleteArchiveNote', 'Yeh Archive (Dustbin) mein jayega — wahan se Restore kar sakte ho.'),
    )) return;
    try {
      await softArchiveBackup(backup.id, {
        deletedBy: { uid: user?.uid, email: user?.email },
        reason: 'deleted_from_backup_history',
        backupRow: backup,
      });
      await notifyBackupEvent({
        event: BACKUP_EVENTS.ARCHIVE_DONE,
        message: `Backup ${backup.id} Archive mein — Restore wahan se`,
        userId: user?.uid,
        userEmail: user?.email,
      });
      await logActivity('database:backup_archive', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        backupId: backup.id,
      });
      toast.success(t('backup.toast.archivedToDustbin', 'Backup Archive mein chala gaya — Restore tab Archive se karo'));
    } catch (e) {
      toast.error(e.message || t('backup.toast.deleteFailed', 'Delete failed'));
    }
  };

  const handleExportOrdersCsv = async () => {
    setExporting(true);
    const toastId = backupMiniToast.loading(t('backup.toast.csvLoading', 'CSV ban rahi hai…'));
    try {
      const csv = await exportOrdersCsv();
      const blob = new Blob([csv], { type: 'text/csv' });
      downloadBlob(blob, `aone_orders_${new Date().toISOString().split('T')[0]}.csv`);
      backupMiniToast.success(t('backup.toast.csvOk', 'CSV download ho gayi'), toastId);
    } catch (e) {
      backupMiniToast.error(t('backup.toast.csvFailed', 'CSV fail'), toastId);
    } finally {
      setExporting(false);
    }
  };

  const handleExportZip = async () => {
    setExporting(true);
    const toastId = backupMiniToast.loading(t('backup.toast.zipLoading', 'ZIP ban rahi hai…'));
    try {
      const meta = {
        adminEmail: user?.email || userData?.email || 'Admin',
        adminUid: user?.uid || userData?.uid,
      };
      await downloadFullBackupZip(meta);
      backupMiniToast.success(t('backup.toast.zipOk', 'ZIP download ho gayi'), toastId);
    } catch (e) {
      backupMiniToast.error(e.message || t('backup.toast.zipFailed', 'ZIP fail'), toastId);
    } finally {
      setExporting(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const saved = await saveBackupSchedule(schedule, { uid: user?.uid, email: user?.email });
      setSchedule(saved);
      await logActivity('database:backup_schedule', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        frequency: saved.frequency,
        localDownload: saved.localDownload,
        cloudSave: saved.cloudSave,
      });
      toast.success(t('backup.toast.scheduleSaved', 'Backup schedule saved'));
    } catch (e) {
      toast.error(e.message || t('backup.toast.scheduleFailed', 'Failed to save schedule'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleRunScheduleNow = async () => {
    setExporting(true);
    const toastId = toast.loading(t('backup.toast.scheduleRunning', 'Running scheduled backup…'));
    try {
      const result = await runScheduledBackupIfDue({ uid: user?.uid, email: user?.email }, { force: true });
      if (result.ran) {
        toast.success(t('backup.toast.scheduleOk', 'Scheduled backup completed'), { id: toastId });
        const fresh = await getBackupSchedule();
        setSchedule(fresh);
      } else {
        toast(t('backup.toast.scheduleSkipped', 'Use manual backup from Overview tab.'), { id: toastId });
      }
    } catch (e) {
      toast.error(e.message || t('backup.toast.scheduleRunFailed', 'Scheduled backup failed'), { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm(t('backup.toast.cacheConfirm', 'Clear offline drafts and sync queue? Setup lock preserved. Continue?'))) return;

    setClearing(true);
    try {
      await logActivity('security:cache_clear_override', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        severity: 'HIGH',
        reason: 'Administrative cache purge',
      });
      const r = await clearAllCaches();
      if (r.success) {
        toast.success(t('backup.toast.cacheOk', 'Cache cleared. Reloading…'));
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!isSuperAdmin) {
      toast.error(t('backup.toast.superAdminOnly', 'Only Super Admin can factory reset setup'));
      return;
    }
    if (factoryConfirm !== 'FACTORY RESET') {
      toast.error(t('backup.toast.factoryPhrase', 'Type FACTORY RESET to confirm'));
      return;
    }
    if (!confirm(t('backup.toast.factoryConfirm', 'FINAL WARNING: Setup lock removed. Setup wizard again. Continue?'))) return;

    setResetting(true);
    try {
      await logActivity('security:factory_reset', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        severity: 'CRITICAL',
      });
      const ok = await resetSetupState();
      if (ok) {
        toast.success(t('backup.toast.factoryOk', 'Factory reset complete. Redirecting to setup…'));
        setTimeout(() => { window.location.href = '/setup'; }, 1500);
      } else {
        toast.error(t('backup.toast.factoryFailed', 'Factory reset failed — Super Admin only'));
      }
    } catch (e) {
      toast.error(e.message || t('backup.toast.factoryFailed', 'Factory reset failed'));
    } finally {
      setResetting(false);
    }
  };

  const handleArchiveAndClear = async () => {
    if (!archivingMonth) {
      toast.error(t('backup.toast.selectMonth', 'Select a month'));
      return;
    }
    if (!isOnline) {
      toast.error(t('backup.toast.onlineArchive', 'You must be online to archive cloud data.'));
      return;
    }
    if (!confirm(t('backup.toast.archiveMonthConfirm', 'Archive & hide active dashboard bills for {{month}}?', { month: archivingMonth }))) return;

    setIsArchiving(true);
    const toastId = toast.loading(t('backup.toast.archivingMonth', 'Archiving {{month}}…', { month: archivingMonth }));
    try {
      const q = query(collection(db, 'orders'), where('isActiveOrder', '==', true));
      const snap = await getDocs(q);
      const ordersToArchive = snap.docs.filter((d) => {
        const order = d.data();
        const savedAt = order.savedAt || order.createdAt || '';
        return savedAt.startsWith(archivingMonth);
      });

      if (!ordersToArchive.length) {
        toast.success(t('backup.toast.noOrdersMonth', 'No active orders for that month'), { id: toastId });
        return;
      }

      const batch = writeBatch(db);
      for (const d of ordersToArchive) {
        batch.update(d.ref, {
          isActiveOrder: false,
          isArchived: true,
          archivedAt: new Date().toISOString(),
          archivedBy: user?.email || 'Admin',
        });
      }
      await batch.commit();

      if (localDB?.orders) {
        try {
          const localArr = await localDB.orders.toArray();
          for (const lo of localArr) {
            const savedAt = lo.savedAt || lo.createdAt || '';
            if (savedAt.startsWith(archivingMonth)) {
              await localDB.orders.update(lo.localId || lo.id, {
                isActiveOrder: false,
                isArchived: true,
              });
            }
          }
        } catch { /* ignore */ }
      }

      await logActivity('database:archive_and_clear', userData?.uid || 'unknown', userData?.primaryStore || 'default', {
        month: archivingMonth,
        count: ordersToArchive.length,
      });

      toast.success(
        t('backup.toast.archivedCount', 'Archived {{count}} bills', { count: ordersToArchive.length }),
        { id: toastId },
      );
      setArchivingMonth('');
    } catch (e) {
      toast.error(e.message || t('backup.toast.archiveFailed', 'Archive failed'), { id: toastId });
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      dir={isRomanUrdu ? 'ltr' : (isRTL ? 'rtl' : 'ltr')}
      className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6"
    >
      <PageHeader
        icon={HardDrive}
        title={t('backup.title', 'Backup & Restore')}
        description={t('backup.subtitle', 'Full database backup to PC or cloud, scheduled backups, restore old data')}
      />

      {/* Roman Urdu / bilingual quick guide */}
      <div className={cn(
        'relative overflow-hidden rounded-2xl border p-5 sm:p-6',
        isDark
          ? 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] via-[#0f0a05] to-sky-500/[0.06]'
          : 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50',
      )}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-3 relative">
          <div className={cn(
            'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
            isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700',
          )}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className={cn('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                {t('backup.guideTitle', 'How to use backup')}
              </h2>
              {isRomanUrdu && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/25">
                  <Sparkles className="w-3 h-3" /> Roman Urdu
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">{t('backup.guideIntro', '')}</p>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 text-xs text-gray-400">
              {guideSteps.map((step, i) => step ? (
                <li key={i} className="flex gap-2 items-start">
                  <span className={cn(
                    'shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold',
                    isDark ? 'bg-white/5 text-amber-400' : 'bg-amber-100 text-amber-800',
                  )}>
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{step}</span>
                </li>
              ) : null)}
            </ol>
          </div>
        </div>
      </div>

      {/* Security banner */}
      <div className={cn(
        'flex items-start gap-3 p-4 rounded-2xl border',
        isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200',
      )}>
        <Shield className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className={cn('text-sm font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-700')}>
            {t('backup.setupProtection', 'Setup protection active')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {t('backup.setupProtectionHint', 'Clearing browser cache will NOT show setup again. Only Super Admin factory reset unlocks setup wizard.')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className={cn(
        'flex flex-wrap gap-1.5 p-1.5 rounded-2xl border backdrop-blur-sm',
        isDark ? 'bg-[#0a0805]/80 border-[#2a1f0d]' : 'bg-white/80 border-amber-100 shadow-sm',
      )}>
        {TAB_IDS.map((tabId) => {
          const TabIcon = TAB_ICONS[tabId];
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all',
                activeTab === tabId
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-[#1a1208] shadow-lg shadow-amber-500/25'
                  : isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:bg-amber-50',
              )}
            >
              {TabIcon && <TabIcon className="w-3.5 h-3.5" />}
              {t(`backup.tabs.${tabId}`, tabId)}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('backup.stats.dbSize', 'Local DB Size (est.)')} value={stats.cacheSize} icon={Server} color="amber" />
        <StatCard label={t('backup.stats.syncQueue', 'Sync Queue')} value={stats.syncQueue} icon={Activity} color={stats.syncQueue > 0 ? 'rose' : 'green'} />
        <StatCard label={t('backup.stats.cloudBackups', 'Cloud Backups')} value={stats.totalBackups} icon={Cloud} color="blue" />
        <StatCard label={t('backup.stats.lastBackup', 'Last Backup')} value={stats.lastBackup} icon={Clock} color="emerald" />
      </div>

      {/* Per-module export — alag alag files */}
      <BackupModulesPanel />

      {/* Cloud + restore */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActionCard
          isDark={isDark}
          icon={Cloud}
          iconColor="sky"
          title={t('backup.backupCloud', 'Backup to Cloud')}
          desc={t('backup.backupCloudDesc', 'Poora local data cloud par — Tareekh tab mein dikhega')}
          buttonLabel={exporting ? t('backup.uploading', 'Uploading…') : t('backup.saveToCloud', 'Save to Cloud')}
          onClick={() => runBackup({ cloud: true })}
          disabled={exporting || !isOnline}
        />
        <ActionCard
          isDark={isDark}
          icon={Upload}
          iconColor="amber"
          title={t('backup.restoreFile', 'Restore from File')}
          desc={t('backup.restoreFileDesc', 'Download ki hui JSON file se local data wapas')}
          buttonLabel={restoring ? t('backup.restoring', 'Restoring…') : t('backup.chooseFile', 'Choose File')}
          onClick={() => fileInputRef.current?.click()}
          disabled={restoring}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => handleRestoreFile(e.target.files?.[0])}
      />
      </>
      )}

      {activeTab === 'schedule' && (
      <div className={cn(
        'p-6 rounded-2xl border',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-5 h-5 text-amber-500" />
          <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>{t('backup.schedule', 'Automatic Backup Schedule')}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">{t('backup.frequency', 'Frequency')}</label>
            <select
              value={schedule.frequency}
              onChange={(e) => setSchedule((s) => ({ ...s, frequency: e.target.value }))}
              className={selectFieldClass(isDark, 'w-full')}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option
                  key={opt}
                  value={opt}
                  className={isDark ? 'bg-[#0a0805] text-white' : 'bg-white text-gray-900'}
                >
                  {scheduleLabels[opt] || opt}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-6">
            <input
              type="checkbox"
              checked={schedule.cloudSave !== false}
              onChange={(e) => setSchedule((s) => ({ ...s, cloudSave: e.target.checked }))}
              className="rounded accent-amber-500"
            />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{t('backup.saveCloud', 'Save to cloud')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-6">
            <input
              type="checkbox"
              checked={schedule.localDownload !== false}
              onChange={(e) => setSchedule((s) => ({ ...s, localDownload: e.target.checked }))}
              className="rounded accent-amber-500"
            />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{t('backup.downloadPc', 'Also download to PC')}</span>
          </label>
          <div className="flex gap-2 pt-5">
            <Button variant="primary" size="sm" onClick={handleSaveSchedule} disabled={savingSchedule} className="flex-1">
              {savingSchedule ? t('backup.saving', 'Saving…') : t('backup.saveSchedule', 'Save Schedule')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRunScheduleNow} disabled={exporting || schedule.frequency === 'off'}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {schedule.frequency !== 'off' && (
          <p className="text-xs text-gray-500 mt-3">
            {schedule.lastRunAt && <>{t('backup.lastRun', 'Last run')}: {new Date(schedule.lastRunAt).toLocaleString()} · </>}
            {schedule.nextRunAt && <>{t('backup.nextRun', 'Next run')}: {new Date(schedule.nextRunAt).toLocaleString()}</>}
          </p>
        )}
      </div>
      )}

      {activeTab === 'migrate' && (
        <BackupMigratePanel
          user={user}
          userData={userData}
          isOnline={isOnline}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {activeTab === 'archive' && (
        <ArchivePanel
          user={user}
          userData={userData}
          isOnline={isOnline}
          isSuperAdmin={isSuperAdmin}
          isManager={userData?.role === 'manager' || (Array.isArray(userData?.roles) && userData.roles.includes('manager'))}
        />
      )}

      {activeTab === 'history' && (
      <>
      {/* Search */}
      <div className={cn(
        'p-4 rounded-2xl border flex flex-col sm:flex-row gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <Input
          placeholder={t('backup.searchPh', 'Search by email, scope, ID…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4 text-amber-500" />}
          className="flex-1"
        />
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className={selectFieldClass(isDark, 'sm:w-40')}
        >
          <option value="all" className={isDark ? 'bg-[#0a0805] text-white' : 'bg-white text-gray-900'}>{t('backup.filterAll', 'All targets')}</option>
          <option value="cloud" className={isDark ? 'bg-[#0a0805] text-white' : 'bg-white text-gray-900'}>{t('backup.filterCloud', 'Cloud')}</option>
          <option value="local" className={isDark ? 'bg-[#0a0805] text-white' : 'bg-white text-gray-900'}>{t('backup.filterLocal', 'Local PC')}</option>
        </select>
      </div>

      {/* Backup history */}
      <div className={cn(
        'rounded-2xl border overflow-hidden',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="px-6 py-4 border-b border-[#2a1f0d]/30 flex items-center justify-between">
          <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>{t('backup.history', 'Backup History')}</h3>
          <Badge variant="primary">{filteredBackups.length} {t('backup.entries', 'entries')}</Badge>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('backup.loading', 'Loading backups…')}</div>
        ) : filteredBackups.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title={t('backup.noBackups', 'No backups yet')}
            description={t('backup.noBackupsDesc', '')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={cn(
                  'border-b uppercase tracking-wider font-semibold',
                  isDark ? 'bg-[#0a0805] text-gray-400' : 'bg-amber-50/30 text-gray-600',
                )}>
                  <th className="px-4 py-3">{t('backup.colId', 'ID')}</th>
                  <th className="px-4 py-3">{t('backup.colDate', 'Date')}</th>
                  <th className="px-4 py-3">{t('backup.colAdmin', 'Admin')}</th>
                  <th className="px-4 py-3">{t('backup.colScope', 'Scope')}</th>
                  <th className="px-4 py-3">{t('backup.colTarget', 'Target')}</th>
                  <th className="px-4 py-3 text-right">{t('backup.colSize', 'Size')}</th>
                  <th className="px-4 py-3 text-center">{t('backup.colStatus', 'Status')}</th>
                  <th className="px-4 py-3 text-right">{t('backup.colActions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-[#2a1f0d]/20', isDark ? 'text-gray-300' : 'text-gray-700')}>
                {filteredBackups.map((bup) => (
                  <tr key={bup.id} className={isDark ? 'hover:bg-[#1a1208]' : 'hover:bg-amber-50/50'}>
                    <td className="px-4 py-3 font-mono text-gray-500">{bup.id}</td>
                    <td className="px-4 py-3">{new Date(bup.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{bup.adminEmail || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={bup.scheduleType && bup.scheduleType !== 'manual' ? 'success' : 'info'}>
                        {bup.scope || 'Backup'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{bup.target || 'Cloud'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-500">
                      {formatBackupSize(bup.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {bup.hasPayload ? (
                        <Wifi className="w-4 h-4 text-emerald-500 inline" title={t('backup.restorable', 'Restorable')} />
                      ) : (
                        <Database className="w-4 h-4 text-gray-500 inline" title={t('backup.logOnly', 'Log only')} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {bup.hasPayload && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCloudRestore(bup)}
                              disabled={restoring}
                              className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-500"
                              title={t('backup.restore', 'Restore')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloudDownload(bup)}
                              disabled={exporting}
                              className="p-1.5 rounded-lg hover:bg-sky-500/10 text-sky-500"
                              title={t('backup.download', 'Download to PC')}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteBackup(bup)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-500"
                          title={t('backup.delete', 'Delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'maintenance' && (
      <>
      {/* Archive month — dashboard hide */}
      <div className={cn(
        'p-6 rounded-2xl border',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Archive className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>{t('backup.archiveMonth', 'Archive Dashboard Month')}</h3>
              <p className="text-xs text-gray-500 max-w-xl mt-1">
                {t('backup.archiveMonthDesc', '')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <input
              type="month"
              value={archivingMonth}
              onChange={(e) => setArchivingMonth(e.target.value)}
              className={cn(
                'px-3 py-2 text-sm rounded-xl border bg-transparent',
                isDark ? 'border-[#2a1f0d] text-white' : 'border-amber-200',
              )}
            />
            <Button variant="primary" size="sm" onClick={handleArchiveAndClear} disabled={isArchiving || !archivingMonth}>
              {isArchiving ? t('backup.archiving', 'Archiving…') : t('backup.archiveBtn', 'Archive')}
            </Button>
          </div>
        </div>
      </div>

      {/* Danger zones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cn(
          'rounded-2xl border-2 border-dashed p-6',
          isDark ? 'border-rose-500/20 bg-rose-500/5' : 'border-rose-300 bg-rose-50/50',
        )}>
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-rose-500 text-sm">{t('backup.clearCache', 'Clear Local Cache')}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {t('backup.clearCacheDesc', '')}
              </p>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={handleClearCache} disabled={clearing} leftIcon={<Trash2 className="w-4 h-4" />}>
            {clearing ? t('backup.clearing', 'Clearing…') : t('backup.flushCache', 'Flush Cache')}
          </Button>
        </div>

        {isSuperAdmin && (
          <div className={cn(
            'rounded-2xl border-2 border-dashed p-6',
            isDark ? 'border-red-500/30 bg-red-500/5' : 'border-red-400 bg-red-50/50',
          )}>
            <div className="flex items-start gap-3 mb-4">
              <Lock className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-red-600 text-sm">{t('backup.factoryReset', 'Factory Reset Setup (Super Admin)')}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {t('backup.factoryResetDesc', '')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="FACTORY RESET"
                value={factoryConfirm}
                onChange={(e) => setFactoryConfirm(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button variant="destructive" size="sm" onClick={handleFactoryReset} disabled={resetting}>
                {resetting ? t('backup.resetting', 'Resetting…') : t('backup.resetSetup', 'Reset Setup')}
              </Button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};

const ActionCard = ({ isDark, icon: Icon, iconColor, title, desc, buttonLabel, onClick, disabled }) => {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-500',
    sky: 'bg-sky-500/10 text-sky-500',
    amber: 'bg-amber-500/10 text-amber-500',
    rose: 'bg-rose-500/10 text-rose-500',
  };

  return (
    <div className={cn(
      'rounded-2xl border p-5 flex flex-col justify-between transition-all duration-200 group',
      isDark
        ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/5'
        : 'bg-white border-amber-100 hover:border-amber-300 hover:shadow-md',
    )}>
      <div>
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105',
          colors[iconColor],
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className={cn('font-bold text-sm mb-1', isDark ? 'text-white' : 'text-gray-900')}>{title}</h3>
        <p className="text-[11px] text-gray-500 mb-4">{desc}</p>
      </div>
      <Button variant="primary" size="sm" onClick={onClick} disabled={disabled} className="w-full font-semibold">
        {buttonLabel}
      </Button>
    </div>
  );
};

export default BackupExport;
