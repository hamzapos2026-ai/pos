import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowRight, Archive, CheckCircle2, CloudUpload, Download, Loader2,
  Package, RotateCcw, Shield, AlertTriangle,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { backupRomanT, backupMiniToast } from '../../utils/backupRomanUrdu';
import {
  glassPanel, glassBtnPrimary, glassBtnGhost, glassBtnDanger, glassInput, glassLabel,
} from '../shared/glassUiTheme';
import {
  downloadMigrationPackage,
  saveBackupToCloud,
  buildMigrationExportPayload,
  archiveAfterMigrationConfirmed,
  backupAndArchiveOldData,
  restoreArchivedBatch,
  listArchiveBatches,
  MIGRATION_CONFIRM_PHRASE,
  formatBackupSize,
} from '../../services/backupService';
import { notifyBackupEvent, BACKUP_EVENTS } from '../../services/backupNotificationService';

const STEP_IDS = [1, 2, 3, 4];
const rt = (key, fb = '', vars) => backupRomanT(`migrate.${key}`, fb, vars);
const rtoast = (key, fb = '', vars) => backupRomanT(`toast.${key}`, fb, vars);

const BackupMigratePanel = ({ user, userData, isOnline, isSuperAdmin }) => {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [backupId, setBackupId] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [archiveDays, setArchiveDays] = useState(90);
  const [archiveBatches, setArchiveBatches] = useState([]);
  const [restoreId, setRestoreId] = useState('');

  const steps = useMemo(() => STEP_IDS.map((id) => ({
    id,
    title: rt(`step${id}Title`, `Qadam ${id}`),
    desc: rt(`step${id}Desc`, ''),
  })), []);

  const meta = {
    adminEmail: user?.email || userData?.email || 'Admin',
    adminUid: user?.uid || userData?.uid,
    targetProjectId: '',
  };

  const loadBatches = useCallback(async () => {
    try {
      const rows = await listArchiveBatches();
      setArchiveBatches(rows);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const statusLabel = (status) => {
    if (status === 'restored') return rt('statusRestored', 'restore ho gaya');
    if (status === 'completed' || !status) return rt('statusCompleted', 'mukammal');
    return status;
  };

  const handleExport = async (toCloud = false) => {
    setBusy(true);
    const toastId = backupMiniToast.loading(toCloud
      ? rtoast('migrationUploading', 'Upload…')
      : rtoast('migrationBuilding', 'Ban rahi hai…'));
    try {
      if (toCloud) {
        const payload = await buildMigrationExportPayload(meta);
        const cloud = await saveBackupToCloud(payload, {
          ...meta,
          scope: 'Migration — Business Hub / PostgreSQL',
          scheduleType: 'migration',
        });
        setLastExport({ backupId: cloud.id, sizeBytes: cloud.sizeBytes });
        setBackupId(cloud.id);
        await notifyBackupEvent({
          event: BACKUP_EVENTS.MIGRATION_EXPORT,
          message: 'Migration JSON cloud par save — ab naye server par MANUAL import',
          userId: user?.uid,
          userEmail: user?.email,
        });
        backupMiniToast.success(rtoast('migrationCloudOk', 'Cloud ✓'), toastId);
      } else {
        const result = await downloadMigrationPackage(meta);
        setLastExport({ backupId: result.backupId, sizeBytes: result.sizeBytes });
        setBackupId(result.backupId);
        await notifyBackupEvent({
          event: BACKUP_EVENTS.MIGRATION_EXPORT,
          message: 'Migration JSON download ✓ — Business Hub par MANUAL import karo',
          userId: user?.uid,
          userEmail: user?.email,
        });
        backupMiniToast.success(rtoast('migrationDownloadOk', 'Download ✓'), toastId);
      }
      setStep(2);
    } catch (e) {
      backupMiniToast.error(e.message || rtoast('exportFailed', 'Fail'), toastId);
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveConfirmed = async () => {
    if (!isSuperAdmin) {
      backupMiniToast.error(rtoast('archiveSuperAdmin', 'Sirf Super Admin'));
      return;
    }
    setBusy(true);
    const toastId = backupMiniToast.loading(rtoast('archivingSoft', 'Archive…'));
    try {
      const result = await archiveAfterMigrationConfirmed({
        backupId: backupId.trim(),
        confirmPhrase: confirmPhrase.trim(),
        olderThanDays: Number(archiveDays) || 90,
        archivedBy: meta.adminEmail,
        onProgress: (msg) => backupMiniToast.loading(msg, toastId),
      });
      backupMiniToast.success(
        rtoast('archivedTotal', '{{count}} records archive ✓', {
          count: result.archivedFirestore + result.archivedDexie,
        }),
        toastId,
      );
      await notifyBackupEvent({
        event: BACKUP_EVENTS.MIGRATION_CONFIRM,
        message: 'Migration verify ke baad archive — purana data soft-archive',
        userId: user?.uid,
        userEmail: user?.email,
      });
      setStep(4);
      await loadBatches();
    } catch (e) {
      backupMiniToast.error(e.message || rtoast('archiveMigrateFailed', 'Fail'), toastId);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickArchive = async () => {
    if (!isSuperAdmin) {
      backupMiniToast.error(rtoast('archiveSuperAdmin', 'Sirf Super Admin'));
      return;
    }
    if (!confirm(rtoast('quickArchiveConfirm', '', { days: archiveDays }))) return;
    setBusy(true);
    const toastId = backupMiniToast.loading(rtoast('quickArchiveLoading', 'Chal raha hai…'));
    try {
      const result = await backupAndArchiveOldData({
        olderThanDays: Number(archiveDays) || 90,
        modules: ['orders', 'activity'],
        archivedBy: meta.adminEmail,
        onProgress: (msg) => backupMiniToast.loading(msg, toastId),
      });
      backupMiniToast.success(
        rtoast('quickArchiveOk', '{{cloud}}+{{local}} archive ✓', {
          cloud: result.archivedFirestore,
          local: result.archivedDexie,
        }),
        toastId,
      );
      await loadBatches();
    } catch (e) {
      backupMiniToast.error(e.message || rtoast('quickArchiveFailed', 'Fail'), toastId);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreId.trim()) {
      backupMiniToast.error(rtoast('restoreIdRequired', 'Batch ID likho'));
      return;
    }
    if (!confirm(rtoast('restoreBatchConfirm', '', { id: restoreId }))) return;
    setBusy(true);
    try {
      const { restored } = await restoreArchivedBatch(restoreId.trim());
      backupMiniToast.success(rtoast('restoredCount', '{{count}} restore ✓', { count: restored }));
      await loadBatches();
    } catch (e) {
      backupMiniToast.error(e.message || rtoast('restoreBatchFailed', 'Fail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" dir="ltr">
      <div className={glassPanel('!p-3 !border-amber-500/10')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                'rounded-xl px-3 py-2.5 text-left border transition-all duration-200',
                step === s.id
                  ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/15 to-amber-600/5 shadow-md shadow-amber-500/10'
                  : 'border-white/[0.06] bg-[#080706]/50 hover:border-amber-500/20 hover:bg-white/[0.02]',
              )}
            >
              <p className="text-[10px] font-bold text-amber-400/90">
                {rt('stepLabel', 'Qadam')} {s.id}
              </p>
              <p className="text-xs font-semibold text-white">{s.title}</p>
              <p className="text-[9px] text-stone-500 mt-0.5 leading-snug">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className={glassPanel('!border-emerald-500/10')}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{rt('exportTitle', 'Migration Export')}</h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">{rt('exportDesc', '')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={glassBtnPrimary} disabled={busy} onClick={() => handleExport(false)}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {rt('downloadJson', 'JSON Download')}
            </button>
            <button type="button" className={glassBtnGhost} disabled={busy || !isOnline} onClick={() => handleExport(true)}>
              <CloudUpload className="w-4 h-4" />
              {rt('saveCloud', 'Cloud Mein Save')}
            </button>
          </div>
          {lastExport?.backupId && (
            <p className="text-[10px] text-emerald-400/90 mt-3">
              {rt('savedSize', 'Mehfooz · {{size}}', { size: formatBackupSize(lastExport.sizeBytes) })}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className={glassPanel()}>
          <h3 className="text-sm font-bold text-white mb-3">{rt('importTitle', 'Import')}</h3>
          <ol className="text-xs text-stone-400 space-y-2.5 list-decimal list-inside leading-relaxed">
            <li>{rt('importStep1', '')}</li>
            <li>{rt('importStep2', '')}</li>
            <li>{rt('importStep3', '')}</li>
            <li>{rt('importStep4', '')}</li>
          </ol>
          <button type="button" className={cn(glassBtnPrimary, 'mt-4')} onClick={() => setStep(3)}>
            {rt('verifiedBtn', 'Data verify ho gaya')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {step === 3 && (
        <div className={glassPanel('!border-rose-500/10')}>
          <div className="flex items-start gap-2 mb-3">
            <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-xs text-stone-400 leading-relaxed">{rt('confirmDesc', '')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={glassLabel}>{rt('backupIdLabel', 'Backup ID')}</span>
              <input
                className={cn(glassInput, 'px-3 py-2.5 text-xs font-mono')}
                value={backupId}
                onChange={(e) => setBackupId(e.target.value)}
                placeholder={rt('backupIdPh', 'bup_…')}
              />
            </div>
            <div>
              <span className={glassLabel}>{rt('archiveDaysLabel', 'Purana data (days)')}</span>
              <input
                type="number"
                min={30}
                className={cn(glassInput, 'px-3 py-2.5 text-xs')}
                value={archiveDays}
                onChange={(e) => setArchiveDays(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3">
            <span className={glassLabel}>
              {rt('confirmPhraseLabel', 'Likho: {{phrase}}', { phrase: MIGRATION_CONFIRM_PHRASE })}
            </span>
            <input
              className={cn(glassInput, 'px-3 py-2.5 text-xs uppercase tracking-wide')}
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={MIGRATION_CONFIRM_PHRASE}
            />
          </div>
          <button
            type="button"
            className={cn(glassBtnDanger, 'mt-4')}
            disabled={busy || !isSuperAdmin || !isOnline}
            onClick={handleArchiveConfirmed}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            {rt('archiveMainBtn', 'Archive Karo')}
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={glassPanel()}>
            <h3 className="text-sm font-bold text-white mb-2">{rt('quickArchiveTitle', 'Jaldi Archive')}</h3>
            <p className="text-xs text-stone-500 mb-3 leading-relaxed">{rt('quickArchiveDesc', '')}</p>
            <button type="button" className={glassBtnGhost} disabled={busy || !isSuperAdmin} onClick={handleQuickArchive}>
              <Archive className="w-4 h-4" />
              {rt('quickArchiveBtn', '{{days}} din purana', { days: archiveDays })}
            </button>
          </div>
          <div className={glassPanel()}>
            <h3 className="text-sm font-bold text-white mb-2">{rt('restoreTitle', 'Wapas Lao')}</h3>
            <input
              className={cn(glassInput, 'px-3 py-2 text-xs font-mono mb-2')}
              value={restoreId}
              onChange={(e) => setRestoreId(e.target.value)}
              placeholder={rt('restoreBatchPh', 'arc_…')}
            />
            <button type="button" className={glassBtnPrimary} disabled={busy} onClick={handleRestore}>
              <RotateCcw className="w-4 h-4" /> {rt('restoreBatchBtn', 'Restore karo')}
            </button>
          </div>
        </div>
      )}

      {archiveBatches.length > 0 && (
        <div className={glassPanel('!p-0 overflow-hidden')}>
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">{rt('archiveHistory', 'Archive Tareekh')}</h3>
          </div>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead className="text-stone-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">{rt('colBatch', 'Batch')}</th>
                  <th className="px-3 py-2 text-left">{rt('colType', 'Qism')}</th>
                  <th className="px-3 py-2 text-right">{rt('colRecords', 'Records')}</th>
                  <th className="px-3 py-2 text-left">{rt('colStatus', 'Halat')}</th>
                </tr>
              </thead>
              <tbody className="text-stone-300 divide-y divide-white/[0.04]">
                {archiveBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-2 font-mono text-[10px]">{b.id}</td>
                    <td className="px-3 py-2">{b.type || b.module || rt('typeArchive', 'archive')}</td>
                    <td className="px-3 py-2 text-right">
                      {(b.archivedFirestore || 0) + (b.archivedDexie || 0)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-bold',
                        b.status === 'restored' ? 'bg-sky-500/15 text-sky-400' : 'bg-emerald-500/15 text-emerald-400',
                      )}
                      >
                        {statusLabel(b.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-[10px] text-stone-500 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-3">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500/80 mt-0.5" />
        <span className="leading-relaxed">{rt('footerNote', '')}</span>
      </div>
    </div>
  );
};

export default BackupMigratePanel;
