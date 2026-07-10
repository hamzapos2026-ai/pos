import { useState, useCallback } from 'react';
import {
  Database, Download, FileArchive, FileCode, ShoppingCart, Users,
  Settings, Store, CreditCard, Receipt, RotateCcw, Shield, Activity,
  Bell, Loader2, HardDrive,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { backupRomanT, backupMiniToast } from '../../utils/backupRomanUrdu';
import {
  EXPORT_MODULE_KEYS,
  DATA_MODULES,
  collectModuleRecordsFull,
  downloadModuleJson,
  downloadModuleCsv,
  downloadModuleZip,
  downloadAllModulesSeparatedZip,
  collectBackupPayload,
  downloadBackupFile,
} from '../../services/backupService';
import { notifyBackupEvent, listBackupNotifications, BACKUP_EVENTS } from '../../services/backupNotificationService';
import Button from '../ui/Button';

const rt = (key, fb, vars) => backupRomanT(`modules.${key}`, fb, vars);

const MODULE_ICONS = {
  orders: ShoppingCart,
  customers: Users,
  stores: Store,
  settings: Settings,
  payments: CreditCard,
  expenses: Receipt,
  returns: RotateCcw,
  users_admins: Shield,
  users_managers: Users,
  users_billers: Users,
  users_cashiers: Users,
  activity: Activity,
  superAdminActivity: Shield,
};

const BackupModulesPanel = () => {
  const { isDark } = useTheme();
  const { user, userData } = useAuth();
  const { isOnline } = useNetwork();
  const [working, setWorking] = useState(null);
  const [counts, setCounts] = useState({});
  const [notifications, setNotifications] = useState([]);

  const actor = {
    userId: user?.uid || userData?.uid,
    userEmail: user?.email || userData?.email,
  };

  const loadNotifications = useCallback(async () => {
    const rows = await listBackupNotifications(8);
    setNotifications(rows);
  }, []);

  const runExport = async (moduleKey, format) => {
    if (!isOnline) {
      backupMiniToast.error(rt('offline', 'Internet zaroori hai'));
      return;
    }
    const workId = `${moduleKey}-${format}`;
    setWorking(workId);
    const toastId = backupMiniToast.loading(rt('exporting', 'Export ho rahi hai…'));
    try {
      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_STARTED,
        module: moduleKey,
        ...actor,
      });
      const bundle = await collectModuleRecordsFull(moduleKey);
      setCounts((c) => ({ ...c, [moduleKey]: bundle.counts.total }));
      const d = new Date().toISOString().split('T')[0];
      const base = moduleKey.replace(/_/g, '-');
      if (format === 'json') downloadModuleJson(bundle, `aone_${base}_${d}.json`);
      else if (format === 'csv') downloadModuleCsv(bundle, `aone_${base}_${d}.csv`);
      else downloadModuleZip(bundle, `aone_${base}_${d}.zip`);

      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_DONE,
        module: moduleKey,
        message: rt('exportDone', '{{label}} {{format}} download ✓', {
          label: DATA_MODULES[moduleKey]?.label || moduleKey,
          format: format.toUpperCase(),
        }),
        meta: { format, count: bundle.counts.total },
        ...actor,
      });
      backupMiniToast.success(rt('exportDoneShort', 'Download ✓'), toastId);
      await loadNotifications();
    } catch (e) {
      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_FAIL,
        module: moduleKey,
        message: e?.message,
        ...actor,
      });
      backupMiniToast.error(e?.message || rt('exportFail', 'Export fail'), toastId);
    } finally {
      setWorking(null);
    }
  };

  const runFullZip = async () => {
    if (!isOnline) {
      backupMiniToast.error(rt('offline', 'Internet zaroori hai'));
      return;
    }
    setWorking('full-zip');
    const toastId = backupMiniToast.loading(rt('zipAll', 'Saare modules ZIP mein…'));
    try {
      await notifyBackupEvent({ event: BACKUP_EVENTS.EXPORT_STARTED, module: 'all', ...actor });
      await downloadAllModulesSeparatedZip({
        adminEmail: actor.userEmail,
        adminUid: actor.userId,
      });
      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_DONE,
        module: 'all',
        message: rt('zipAllDone', 'Poora ZIP download — har module alag folder'),
        ...actor,
      });
      backupMiniToast.success(rt('zipAllDoneShort', 'ZIP ✓'), toastId);
      await loadNotifications();
    } catch (e) {
      backupMiniToast.error(e?.message, toastId);
    } finally {
      setWorking(null);
    }
  };

  const runFullJson = async () => {
    setWorking('full-json');
    const toastId = backupMiniToast.loading(rt('jsonAll', 'Poora JSON…'));
    try {
      const payload = await collectBackupPayload({
        adminEmail: actor.userEmail,
        adminUid: actor.userId,
      });
      const d = new Date().toISOString().split('T')[0];
      downloadBackupFile(payload, `aone_full_local_${d}.json`);
      await notifyBackupEvent({
        event: BACKUP_EVENTS.EXPORT_DONE,
        module: 'full_json',
        message: rt('jsonAllDone', 'Poora local JSON download'),
        ...actor,
      });
      backupMiniToast.success(rt('jsonAllDoneShort', 'JSON ✓'), toastId);
      await loadNotifications();
    } catch (e) {
      backupMiniToast.error(e?.message, toastId);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Flow guide */}
      <div className={cn(
        'rounded-2xl border p-4',
        isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200',
      )}>
        <h3 className={cn('text-sm font-bold mb-2', isDark ? 'text-amber-400' : 'text-amber-800')}>
          {rt('guideTitle', 'Backup samjhao — 4 qadam (sab MANUAL)')}
        </h3>
        <ol className="text-[11px] text-stone-500 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>{rt('guide1', 'Neeche se module choose karo → JSON / CSV / ZIP (har module ALG file)')}</li>
          <li>{rt('guide2', 'Ya "Poora ZIP" — andar har cheez alag folder (orders, customers, settings…)')}</li>
          <li>{rt('guide3', 'Business Hub: Migrate tab → JSON export → naye server import → VERIFY')}</li>
          <li>{rt('guide4', 'Jab confirm ho jaye tab Tareekh → Archive ya Migrate archive — pehle delete mat karo')}</li>
        </ol>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!!working || !isOnline}
          onClick={runFullZip}
          leftIcon={working === 'full-zip' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
        >
          {rt('btnFullZip', 'Poora ZIP (alag alag files)')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!!working}
          onClick={runFullJson}
          leftIcon={<FileCode className="w-4 h-4" />}
        >
          {rt('btnFullJson', 'Poora Local JSON')}
        </Button>
        <Button variant="ghost" size="sm" onClick={loadNotifications} leftIcon={<Bell className="w-4 h-4" />}>
          {rt('btnNotif', 'Notifications')}
        </Button>
      </div>

      {/* Per-module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {EXPORT_MODULE_KEYS.map((key) => {
          const mod = DATA_MODULES[key];
          const Icon = MODULE_ICONS[key] || Database;
          const count = counts[key];
          return (
            <div
              key={key}
              className={cn(
                'rounded-2xl border p-4',
                isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>
                    {rt(`labels.${key}`, mod?.label || key)}
                  </p>
                  <p className="text-[10px] text-stone-500 line-clamp-2">{rt(`desc.${key}`, mod?.description || '')}</p>
                  {count != null && (
                    <p className="text-[10px] text-amber-500 mt-1">{count} {rt('records', 'records')}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['json', 'csv', 'zip'].map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    disabled={!!working || !isOnline}
                    onClick={() => runExport(key, fmt)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all',
                      working === `${key}-${fmt}`
                        ? 'bg-amber-500 text-[#1a1208]'
                        : isDark
                          ? 'bg-white/5 text-stone-400 hover:bg-amber-500/20 hover:text-amber-400'
                          : 'bg-amber-50 text-amber-800 hover:bg-amber-100',
                    )}
                  >
                    {working === `${key}-${fmt}` ? '…' : fmt}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent notifications */}
      {notifications.length > 0 && (
        <div className={cn('rounded-2xl border p-4', isDark ? 'border-[#2a1f0d] bg-[#0a0805]' : 'border-amber-100')}>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h4 className={cn('text-xs font-bold', isDark ? 'text-white' : 'text-gray-900')}>
              {rt('recentNotif', 'Aakhri notifications')}
            </h4>
          </div>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id} className="text-[10px] text-stone-500 flex gap-2">
                <HardDrive className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                <span>{n.message || n.title} · {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BackupModulesPanel;
