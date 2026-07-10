import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Archive, RotateCcw, Trash2, Loader2, AlertTriangle, Package,
  User, Users, FileText, RefreshCw, Shield, HardDrive,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { backupRomanT, backupMiniToast } from '../../utils/backupRomanUrdu';
import {
  glassPanel, glassBtnPrimary, glassBtnGhost, glassBtnDanger, glassInput, glassLabel,
} from '../shared/glassUiTheme';
import {
  listArchiveRecords,
  listArchiveBatches,
  restoreArchiveRecord,
  restoreArchivedBatch,
  permanentDeleteArchiveRecord,
  PERMANENT_DELETE_PHRASE,
  ENTITY_TYPES,
} from '../../services/archiveService';
import useStoresMap from '../../hooks/useStoresMap';
import { resolveAdminDataScope } from '../../utils/branchAccess';
import { formatBackupSize } from '../../services/backupService';

const rt = (key, fb = '', vars) => backupRomanT(`archive.${key}`, fb, vars);
const rtoast = (key, fb = '', vars) => backupRomanT(`toast.${key}`, fb, vars);

const TYPE_ICONS = {
  [ENTITY_TYPES.ORDER]: FileText,
  [ENTITY_TYPES.CUSTOMER]: User,
  [ENTITY_TYPES.USER]: Users,
  [ENTITY_TYPES.BACKUP]: HardDrive,
};

const ArchivePanel = ({
  user,
  userData,
  isOnline,
  isSuperAdmin,
  isManager = false,
}) => {
  const { storesMap } = useStoresMap();
  const scope = useMemo(
    () => resolveAdminDataScope(userData || {}, storesMap),
    [userData, storesMap],
  );

  const [subTab, setSubTab] = useState('entities');
  const [entityFilter, setEntityFilter] = useState('all');
  const [records, setRecords] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [permanentTarget, setPermanentTarget] = useState(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [restoreBatchId, setRestoreBatchId] = useState('');

  const actor = useMemo(() => ({
    uid: user?.uid || userData?.uid,
    email: user?.email || userData?.email,
    name: userData?.name || user?.email,
  }), [user, userData]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const typeFilter = entityFilter === 'all' ? null : entityFilter;
      const [recs, batchRows] = await Promise.all([
        listArchiveRecords({
          userDoc: userData || {},
          storesMap,
          entityType: typeFilter,
          includePermanent: isSuperAdmin,
          max: 80,
        }),
        isSuperAdmin || !isManager
          ? listArchiveBatches(30)
          : Promise.resolve([]),
      ]);
      setRecords(recs);
      setBatches(batchRows);
    } catch (e) {
      backupMiniToast.error(rtoast('archiveLoadFail', 'Archive load fail: {{msg}}', { msg: e?.message || '' }));
    } finally {
      setLoading(false);
    }
  }, [userData, storesMap, entityFilter, isSuperAdmin, isManager]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRestore = async (archiveRecordId) => {
    if (!window.confirm(rt('restoreConfirm', 'Wapas lao is record ko?'))) return;
    setBusyId(archiveRecordId);
    const toastId = backupMiniToast.loading(rtoast('restoring', 'Restore ho raha hai…'));
    try {
      await restoreArchiveRecord(archiveRecordId, actor);
      backupMiniToast.success(rtoast('restoreOk', 'Restore mukammal ✓'), toastId);
      await loadAll();
    } catch (e) {
      backupMiniToast.error(e?.message || rtoast('restoreFail', 'Restore fail'), toastId);
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanent = async () => {
    if (!permanentTarget) return;
    setBusyId(permanentTarget.id);
    const toastId = backupMiniToast.loading(rtoast('permanentLoading', 'Permanent delete…'));
    try {
      await permanentDeleteArchiveRecord(permanentTarget.id, {
        confirmPhrase,
        deletedBy: actor,
        isSuperAdmin,
      });
      backupMiniToast.success(rtoast('permanentOk', 'Permanent delete ho gaya'), toastId);
      setPermanentTarget(null);
      setConfirmPhrase('');
      await loadAll();
    } catch (e) {
      backupMiniToast.error(e?.message || rtoast('permanentFail', 'Fail'), toastId);
    } finally {
      setBusyId(null);
    }
  };

  const handleRestoreBatch = async () => {
    if (!restoreBatchId.trim()) {
      backupMiniToast.error(rtoast('restoreIdRequired', 'Batch ID likho'));
      return;
    }
    if (!window.confirm(rt('restoreBatchConfirm', 'Batch {{id}} restore?', { id: restoreBatchId }))) return;
    setBusyId(restoreBatchId);
    const toastId = backupMiniToast.loading(rtoast('restoring', 'Restore…'));
    try {
      const result = await restoreArchivedBatch(restoreBatchId.trim());
      backupMiniToast.success(
        rtoast('restoreBatchOk', '{{count}} records restore', { count: result.restored || 0 }),
        toastId,
      );
      setRestoreBatchId('');
      await loadAll();
    } catch (e) {
      backupMiniToast.error(e?.message || rtoast('restoreFail', 'Fail'), toastId);
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  };

  const branchHint = isManager && scope.storeId
    ? rt('branchScopeHint', 'Sirf apni branch: {{branch}}', { branch: scope.storeId })
    : rt('allBranchesHint', 'Saari branches (Super Admin)');

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className={glassPanel('p-4 border-amber-500/20')}>
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-white">{rt('title', 'Archive — Dustbin')}</h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">{rt('desc', '')}</p>
            <p className="text-[10px] text-amber-500/80 mt-2 font-medium">{branchHint}</p>
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'entities', label: rt('tabEntities', 'Delete ki history'), icon: Archive },
          { id: 'batches', label: rt('tabBatches', 'Bulk archive'), icon: Package },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all',
              subTab === id
                ? 'bg-amber-500 text-[#1a1208]'
                : 'bg-white/5 text-stone-400 hover:text-white',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className={cn(glassBtnGhost, 'ml-auto text-xs')}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          {rt('refresh', 'Refresh')}
        </button>
      </div>

      {subTab === 'entities' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: rt('filterAll', 'Sab') },
              { id: ENTITY_TYPES.BACKUP, label: rt('filterBackups', 'Backups') },
              { id: ENTITY_TYPES.ORDER, label: rt('filterOrders', 'Bills') },
              { id: ENTITY_TYPES.CUSTOMER, label: rt('filterCustomers', 'Customers') },
              { id: ENTITY_TYPES.USER, label: rt('filterUsers', 'Users') },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setEntityFilter(f.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                  entityFilter === f.id
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                    : 'border-stone-700 text-stone-500 hover:border-stone-500',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className={glassPanel('p-8 text-center')}>
              <Archive className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-sm text-stone-400">{rt('empty', 'Koi archive record nahi')}</p>
              <p className="text-[11px] text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
                {rt('emptyHint', 'Yahan tab dikhega jab: Tareekh tab se backup delete karo, Bills archive karo, Customer/User delete karo.')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((rec) => {
                const Icon = TYPE_ICONS[rec.entityType] || FileText;
                const busy = busyId === rec.id;
                const isPermanent = rec.status === 'permanent' || !!rec.permanentAt;
                return (
                  <div key={rec.id} className={glassPanel('p-4 flex flex-col sm:flex-row sm:items-center gap-3')}>
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate flex items-center gap-2">
                          {rec.label || rec.entityId}
                          {isPermanent && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25 whitespace-nowrap">
                              {rt('permanentBadge', 'Permanently Deleted')}
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          {rt(`type_${rec.entityType}`, rec.entityType)}
                          {rec.branchId ? ` · ${rec.branchId}` : ''}
                        </p>
                        <p className="text-[10px] text-stone-600 mt-1">
                          {rt('deletedBy', 'Delete: {{who}} · {{when}}', {
                            who: rec.deletedByEmail || '—',
                            when: formatDate(rec.deletedAt),
                          })}
                        </p>
                        {rec.reason && (
                          <p className="text-[10px] text-stone-500 mt-0.5 italic truncate">{rec.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {isPermanent ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-rose-400/80 px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                          {rt('permanentNoRestore', 'Restore nahi ho sakta')}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy || !isOnline}
                            onClick={() => handleRestore(rec.id)}
                            className={cn(glassBtnPrimary, 'text-xs py-2')}
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            {rt('restoreBtn', 'Restore')}
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              disabled={busy || !isOnline}
                              onClick={() => { setPermanentTarget(rec); setConfirmPhrase(''); }}
                              className={cn(glassBtnDanger, 'text-xs py-2')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {rt('permanentBtn', 'Permanent')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'batches' && (
        <div className="space-y-4">
          <div className={glassPanel('p-4')}>
            <h4 className="text-xs font-bold text-white mb-2">{rt('batchRestoreTitle', 'Bulk batch restore')}</h4>
            <p className="text-[10px] text-stone-500 mb-3">{rt('batchRestoreDesc', '')}</p>
            <div className="flex gap-2">
              <input
                className={cn(glassInput, 'flex-1 px-3 py-2 text-xs font-mono')}
                placeholder="arc_…"
                value={restoreBatchId}
                onChange={(e) => setRestoreBatchId(e.target.value)}
              />
              <button
                type="button"
                className={glassBtnPrimary}
                disabled={!isOnline || busyId}
                onClick={handleRestoreBatch}
              >
                <RotateCcw className="w-4 h-4" />
                {rt('restoreBtn', 'Restore')}
              </button>
            </div>
          </div>

          {batches.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-400">{rt('batchHistory', 'Bulk archive history')}</h4>
              {batches.map((b) => (
                <div key={b.id} className={glassPanel('p-3 flex justify-between items-center gap-2 text-xs')}>
                  <div>
                    <span className="font-mono text-amber-400">{b.id}</span>
                    <span className="text-stone-500 ml-2">
                      {b.module || b.type || 'batch'} · {formatDate(b.createdAt)}
                    </span>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    b.status === 'restored' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-stone-500/15 text-stone-400',
                  )}>
                    {b.status || 'completed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Permanent delete modal */}
      {permanentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className={glassPanel('w-full max-w-md p-5')}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <h3 className="text-sm font-bold text-white">{rt('permanentTitle', 'Permanent Delete')}</h3>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              {rt('permanentDesc', '{{label}} hamesha ke liye delete. Wapas nahi aayega.', {
                label: permanentTarget.label || permanentTarget.entityId,
              })}
            </p>
            <span className={glassLabel}>
              {rt('permanentPhraseLabel', 'Likho: {{phrase}}', { phrase: PERMANENT_DELETE_PHRASE })}
            </span>
            <input
              className={cn(glassInput, 'w-full px-3 py-2.5 text-xs uppercase mt-1 mb-4')}
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={PERMANENT_DELETE_PHRASE}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(glassBtnGhost, 'flex-1')}
                onClick={() => { setPermanentTarget(null); setConfirmPhrase(''); }}
              >
                {rt('cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className={cn(glassBtnDanger, 'flex-1')}
                disabled={confirmPhrase.trim() !== PERMANENT_DELETE_PHRASE || busyId}
                onClick={handlePermanent}
              >
                {rt('permanentConfirm', 'Hamesha Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivePanel;
