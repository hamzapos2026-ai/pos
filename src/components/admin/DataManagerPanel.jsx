import { useState, useEffect, useMemo } from 'react';
import {
  Database, Download, Trash2, Shield, ShoppingCart,
  FileText, Users, Activity, AlertTriangle, RefreshCw, Cloud, HardDrive,
  FileArchive, Store, Settings, CreditCard, Receipt, RotateCcw,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { useLanguage } from '../../hooks/useLanguage';
import { backupMiniToast } from '../../utils/backupRomanUrdu';
import { logActivity } from '../../services/activityLogger';
import { logSuperAdminActivity } from '../../services/superAdminActivityService';
import {
  DATA_MODULES,
  collectModuleRecords,
  downloadModuleJson,
  downloadModuleCsv,
  downloadModuleZip,
  purgeModuleRecords,
} from '../../services/backupService';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

const MODULE_ICONS = {
  orders: ShoppingCart,
  bills: FileText,
  customers: Users,
  stores: Store,
  settings: Settings,
  payments: CreditCard,
  expenses: Receipt,
  returns: RotateCcw,
  users: Users,
  users_managers: Users,
  users_billers: Users,
  users_cashiers: Users,
  users_admins: Shield,
  activity: Activity,
  superAdminActivity: Shield,
};

const selectClass = (isDark) => cn(
  'w-full px-3 py-2.5 text-sm rounded-xl border outline-none',
  isDark
    ? 'bg-[#0a0805] border-[#2a1f0d] text-white [color-scheme:dark]'
    : 'bg-white border-amber-200 text-gray-900 [color-scheme:light]',
);

const DataManagerPanel = () => {
  const { isDark } = useTheme();
  const { user, userData, isSuperAdmin } = useAuth();
  const { isOnline } = useNetwork();
  const { t, language } = useLanguage();
  const isRomanUrdu = language === 'ur';

  const [selectedModule, setSelectedModule] = useState('orders');
  const [filterMode, setFilterMode] = useState('olderThan');
  const [olderThanDays, setOlderThanDays] = useState('90');
  const [beforeMonth, setBeforeMonth] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [working, setWorking] = useState(false);
  const [deleteAfterBackup, setDeleteAfterBackup] = useState(false);

  const mod = DATA_MODULES[selectedModule];
  const Icon = MODULE_ICONS[selectedModule] || Database;

  const moduleLabel = t(`shop.data.modules.${selectedModule}`, mod.label);
  const moduleDesc = t(`shop.data.moduleDesc.${selectedModule}`, mod.description);

  const filters = useMemo(() => ({
    olderThanDays: filterMode === 'olderThan' ? Number(olderThanDays) || 90 : null,
    beforeMonth: filterMode === 'beforeMonth' ? beforeMonth : null,
  }), [filterMode, olderThanDays, beforeMonth]);

  useEffect(() => {
    setPreview(null);
  }, [selectedModule, filterMode, olderThanDays, beforeMonth]);

  const runPreview = async () => {
    setLoadingPreview(true);
    try {
      const bundle = await collectModuleRecords(selectedModule, filters);
      setPreview(bundle);
      backupMiniToast.success(t('shop.data.toast.found', '{{count}} old records', { count: bundle.counts.total }));
    } catch (e) {
      backupMiniToast.error(e.message || t('shop.data.toast.previewFail', 'Preview failed'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const logAction = async (action, extra = {}) => {
    await logActivity(`shop:data_${action}`, userData?.uid, userData?.primaryStore, {
      module: selectedModule,
      ...extra,
    });
    if (isSuperAdmin) {
      await logSuperAdminActivity(`data:${action}`, {
        module: selectedModule,
        userEmail: user?.email,
        ...extra,
      });
    }
  };

  const handleExport = async (format) => {
    setWorking(true);
    const fmtLabel = format.toUpperCase();
    const toastId = backupMiniToast.loading(t('shop.data.toast.exporting', 'Exporting…'));
    try {
      const bundle = preview || await collectModuleRecords(selectedModule, filters);
      if (!preview) setPreview(bundle);

      if (format === 'json') downloadModuleJson(bundle);
      else if (format === 'csv') downloadModuleCsv(bundle);
      else downloadModuleZip(bundle);

      await logAction('export', { format, count: bundle.counts.total });
      backupMiniToast.success(t('shop.data.toast.exported', '{{format}} ✓', { format: fmtLabel }), toastId);
    } catch (e) {
      backupMiniToast.error(e.message || t('shop.data.toast.exportFail', 'Export failed'), toastId);
    } finally {
      setWorking(false);
    }
  };

  const handlePurge = async () => {
    if (!isSuperAdmin) {
      backupMiniToast.error(t('shop.data.toast.superOnly', 'Super Admin only'));
      return;
    }
    if (!isOnline) {
      backupMiniToast.error(t('shop.data.toast.onlineRequired', 'Must be online'));
      return;
    }

    const bundle = preview || await collectModuleRecords(selectedModule, filters);
    if (!bundle.counts.total) {
      backupMiniToast.error(t('shop.data.toast.noRecords', 'No records'));
      return;
    }

    const msg = deleteAfterBackup
      ? t('shop.data.toast.purgeConfirmBackup', '', {
        count: bundle.counts.total,
        label: moduleLabel,
        cloud: bundle.counts.firestore,
        local: bundle.counts.dexie,
      })
      : t('shop.data.toast.purgeConfirmNoBackup', '', { count: bundle.counts.total });

    if (!confirm(msg)) return;

    setWorking(true);
    const toastId = backupMiniToast.loading(t('shop.data.toast.processing', 'Processing…'));
    try {
      if (deleteAfterBackup) {
        downloadModuleZip(bundle, `aone_${selectedModule}_pre_purge_${Date.now()}.zip`);
      }

      const result = await purgeModuleRecords(selectedModule, bundle, { currentUid: user?.uid });

      await logAction('purge', {
        deletedFirestore: result.deletedFirestore,
        deletedDexie: result.deletedDexie,
        hadBackup: deleteAfterBackup,
      });

      backupMiniToast.success(
        t('shop.data.toast.purged', '', {
          cloud: result.deletedFirestore,
          local: result.deletedDexie,
        }),
        toastId,
      );
      setPreview(null);
    } catch (e) {
      backupMiniToast.error(e.message || t('shop.data.toast.exportFail', 'Failed'), toastId);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRomanUrdu ? 'ltr' : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.keys(DATA_MODULES).map((key) => {
          const ModIcon = MODULE_ICONS[key] || Database;
          const active = selectedModule === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedModule(key)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-all',
                active
                  ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 shadow-md shadow-amber-500/10'
                  : isDark
                    ? 'border-[#2a1f0d] bg-[#0a0805] hover:border-amber-500/30'
                    : 'border-amber-100 bg-white hover:border-amber-300',
              )}
            >
              <ModIcon className={cn('w-5 h-5 mb-2', active ? 'text-amber-500' : 'text-gray-400')} />
              <p className={cn('text-xs font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                {t(`shop.data.modules.${key}`, DATA_MODULES[key].label)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                {t(`shop.data.moduleDesc.${key}`, DATA_MODULES[key].description)}
              </p>
            </button>
          );
        })}
      </div>

      <div className={cn(
        'rounded-2xl border p-5 space-y-4',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
              {moduleLabel} — {t('shop.data.selectiveTitle', 'Selective Backup')}
            </h3>
            <p className="text-xs text-gray-500">{t('shop.data.selectiveDesc', 'JSON, CSV, ZIP only')}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              {t('shop.data.filterType', 'Filter type')}
            </label>
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className={selectClass(isDark)}>
              <option value="olderThan">{t('shop.data.filterOlder', 'Older than X days')}</option>
              <option value="beforeMonth">{t('shop.data.filterBeforeMonth', 'Before month')}</option>
              <option value="all">{t('shop.data.filterAll', 'All records')}</option>
            </select>
          </div>

          {filterMode === 'olderThan' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                {t('shop.data.days', 'Days')}
              </label>
              <select value={olderThanDays} onChange={(e) => setOlderThanDays(e.target.value)} className={selectClass(isDark)}>
                {['30', '60', '90', '180', '365'].map((d) => (
                  <option key={d} value={d}>{t('shop.data.daysUnit', '{{n}} days', { n: d })}</option>
                ))}
              </select>
            </div>
          )}

          {filterMode === 'beforeMonth' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                {t('shop.data.beforeMonth', 'Before month')}
              </label>
              <input type="month" value={beforeMonth} onChange={(e) => setBeforeMonth(e.target.value)} className={selectClass(isDark)} />
            </div>
          )}

          <div className="flex items-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={runPreview}
              disabled={loadingPreview}
              leftIcon={loadingPreview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              className="w-full"
            >
              {loadingPreview ? t('shop.data.previewScanning', 'Scanning…') : t('shop.data.previewScan', 'Preview count')}
            </Button>
          </div>
        </div>

        {preview && (
          <div className={cn(
            'flex flex-wrap items-center gap-3 p-4 rounded-xl border',
            isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-200',
          )}>
            <Badge variant="primary">{preview.counts.total} {t('shop.data.total', 'total')}</Badge>
            <Badge variant="info"><Cloud className="w-3 h-3 inline mr-1" />{preview.counts.firestore} {t('shop.data.cloud', 'cloud')}</Badge>
            <Badge variant="success"><HardDrive className="w-3 h-3 inline mr-1" />{preview.counts.dexie} {t('shop.data.local', 'local')}</Badge>
            {preview.cutoff && (
              <span className="text-[10px] text-gray-500">
                {t('shop.data.cutoff', 'Cutoff')}: {new Date(preview.cutoff).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="primary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => handleExport('json')} disabled={working}>
            {t('shop.data.downloadJson', 'JSON')}
          </Button>
          <Button variant="primary" size="sm" leftIcon={<FileText className="w-4 h-4" />} onClick={() => handleExport('csv')} disabled={working}>
            {t('shop.data.downloadCsv', 'CSV')}
          </Button>
          <Button variant="primary" size="sm" leftIcon={<FileArchive className="w-4 h-4" />} onClick={() => handleExport('zip')} disabled={working}>
            {t('shop.data.downloadZip', 'ZIP')}
          </Button>
        </div>

        {isSuperAdmin && (
          <div className={cn(
            'mt-4 p-4 rounded-xl border border-dashed',
            isDark ? 'border-rose-500/30 bg-rose-500/5' : 'border-rose-300 bg-rose-50/50',
          )}>
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-500">{t('shop.data.purgeTitle', 'Remove old data')}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {t('shop.data.purgeDesc', '')}
                  {selectedModule === 'superAdminActivity' && ` ${t('shop.data.purgeSuperLogs', '')}`}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteAfterBackup}
                onChange={(e) => setDeleteAfterBackup(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                {t('shop.data.autoBackupZip', 'ZIP backup before delete')}
              </span>
            </label>
            <Button
              variant="destructive"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handlePurge}
              disabled={working || !isOnline}
            >
              {working ? t('shop.data.purgeProcessing', 'Processing…') : t('shop.data.purgeBtn', 'Backup & Remove')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataManagerPanel;
