// File: src/pages/manager/Shifts.jsx
// Purpose: Shift open/close management with cash reconciliation

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Square, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuth } from '../../context/AuthContext';
import { isElevatedRole, resolveUserPrimaryBranch } from '../../utils/branchAccess';
import useStoresMap, { resolveStoreName } from '../../hooks/useStoresMap';
import ConfirmDialog from '../../components/manager/ConfirmDialog';

const Shifts = () => {
  const { t } = useLanguage();
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const managerBranch = useMemo(
    () => resolveUserPrimaryBranch(userData || {}),
    [userData],
  );
  const managerBranchLabel = useMemo(
    () => resolveStoreName(managerBranch, storesMap),
    [managerBranch, storesMap],
  );
  const canPickBranch = isElevatedRole(userData || {});
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [storeId, setStoreId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (managerBranch && !canPickBranch) {
      setStoreId(managerBranch);
    }
  }, [managerBranch, canPickBranch]);

  const shiftLoader = useCallback(() => managerService.getActiveShift(storeId || null), [storeId]);
  const cashLoader = useCallback(() => managerService.getCashSummary(storeId || null), [storeId]);

  const { data: activeShift, refresh: refreshShift } = useManagerData(shiftLoader, [storeId]);
  const { data: cashSummary, refresh: refreshCash } = useManagerData(cashLoader, [storeId]);

  const refresh = () => { refreshShift(); refreshCash(); };

  const handleOpenShift = async () => {
    if (!openingBalance || Number(openingBalance) < 0) {
      toast.error(t('manager.shiftsPage.enterOpening', 'Enter opening balance'));
      return;
    }
    setLoading(true);
    try {
      const res = await managerService.openShift({
        storeId: storeId || undefined,
        openingBalance: Number(openingBalance),
      });
      if (res.success) {
        toast.success(t('manager.shiftsPage.openedSuccess', 'Shift opened with {{amount}}', { amount: formatPKR(Number(openingBalance)) }));
        setOpeningBalance('');
        refresh();
      } else toast.error(res.error);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); setConfirmOpen(false); }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    setLoading(true);
    try {
      const res = await managerService.closeShift(activeShift.shiftId, Number(closingBalance || 0));
      if (res.success) {
        const variance = res.variance || 0;
        if (Math.abs(variance) > 0.01) {
          toast.error(t('manager.shiftsPage.closedVariance', 'Shift closed. Variance: {{amount}} {{type}}', {
            amount: formatPKR(Math.abs(variance)),
            type: variance > 0 ? t('manager.shiftsPage.extra', 'extra') : t('manager.shiftsPage.short', 'short'),
          }));
        } else {
          toast.success(t('manager.shiftsPage.closedPerfect', 'Shift closed perfectly! No variance.'));
        }
        setClosingBalance('');
        refresh();
      } else toast.error(res.error);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); setConfirmClose(false); }
  };

  const expectedClosing = cashSummary?.closingBalance || 0;
  const varianceAmount = Math.abs(Number(closingBalance || 0) - expectedClosing);
  const varianceDiff = Number(closingBalance || 0) - expectedClosing;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" /> {t('manager.shiftsPage.title', 'Shift Management')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('manager.shiftsPage.subtitle', 'Open and close shifts to track cash flow accurately')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          'rounded-2xl border p-5 ' +
          (activeShift
            ? 'border-green-500/30 bg-gradient-to-br from-green-500/10 to-[#1a1208]'
            : 'border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#12100a]')
        }
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={
                'h-2 w-2 rounded-full ' +
                (activeShift ? 'bg-green-400 animate-pulse' : 'bg-gray-600')
              } />
              <span className={'text-[10px] font-bold uppercase tracking-wider ' + (activeShift ? 'text-green-400' : 'text-gray-500')}>
                {activeShift ? t('manager.shiftsPage.shiftActive', 'Shift Active') : t('manager.shiftsPage.noActiveShift', 'No Active Shift')}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-100">
              {activeShift ? (activeShift.shiftId || '').slice(-12) : t('manager.shiftsPage.openNewShift', 'Open a new shift to begin')}
            </h3>
            {activeShift && (
              <p className="text-xs text-gray-500 mt-1">
                {t('manager.shiftsPage.started', 'Started {{time}} • Opening: {{amount}}', {
                  time: getRelativeTime(activeShift.openedAt),
                  amount: formatPKR(activeShift.openingBalance),
                })}
              </p>
            )}
          </div>
          <div className={'h-12 w-12 rounded-xl flex items-center justify-center ' + (activeShift ? 'bg-green-500/20' : 'bg-[#2a1f0d]')}>
            <Clock className={'w-6 h-6 ' + (activeShift ? 'text-green-400' : 'text-gray-500')} />
          </div>
        </div>

        {activeShift && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <div className="rounded-lg bg-[#0a0805] p-2.5 border border-[#2a1f0d]">
              <p className="text-[9px] text-gray-500 uppercase">{t('manager.shiftsPage.opening', 'Opening')}</p>
              <p className="text-sm font-bold text-blue-400">{formatPKR(activeShift.openingBalance)}</p>
            </div>
            <div className="rounded-lg bg-[#0a0805] p-2.5 border border-[#2a1f0d]">
              <p className="text-[9px] text-gray-500 uppercase">{t('manager.shiftsPage.received', 'Received')}</p>
              <p className="text-sm font-bold text-green-400">{formatPKR(cashSummary?.received || 0)}</p>
            </div>
            <div className="rounded-lg bg-[#0a0805] p-2.5 border border-[#2a1f0d]">
              <p className="text-[9px] text-gray-500 uppercase">{t('manager.shiftsPage.spent', 'Spent')}</p>
              <p className="text-sm font-bold text-red-400">
                {formatPKR((cashSummary?.paid || 0) + (cashSummary?.expenses || 0))}
              </p>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2.5 border border-amber-500/30">
              <p className="text-[9px] text-amber-500/70 uppercase">{t('manager.shiftsPage.expectedCash', 'Expected Cash')}</p>
              <p className="text-sm font-bold text-amber-400">{formatPKR(expectedClosing)}</p>
            </div>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {!activeShift ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[#2a1f0d] bg-[#1a1208] p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-green-500/15 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100">{t('manager.shiftsPage.openNewTitle', 'Open New Shift')}</h3>
                <p className="text-[10px] text-gray-500">{t('manager.shiftsPage.openNewSub', 'Start your business day')}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.shiftsPage.branchId', 'Branch')}</label>
                {canPickBranch ? (
                  <input value={storeId} onChange={e => setStoreId(e.target.value)}
                    placeholder={t('manager.shiftsPage.branchPh', 'Defaults to primary branch')}
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                ) : (
                  <p className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-amber-400 font-medium">
                    {managerBranchLabel || t('manager.shiftsPage.noBranch', 'No branch assigned')}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.shiftsPage.openingBalance', 'Opening Cash Balance')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rs</span>
                  <input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-9 pr-3 py-2.5 text-lg font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                </div>
              </div>
              <button onClick={() => setConfirmOpen(true)} disabled={!openingBalance}
                className="w-full rounded-xl bg-gradient-to-r from-green-500 to-green-600 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:from-green-400 hover:to-green-500 disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> {t('manager.shiftsPage.openShift', 'Open Shift')}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-red-500/30 bg-[#1a1208] p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <Square className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100">{t('manager.shiftsPage.closeCurrentTitle', 'Close Current Shift')}</h3>
                <p className="text-[10px] text-gray-500">{t('manager.shiftsPage.closeCurrentSub', 'End of day reconciliation')}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-[10px] text-amber-500/70 uppercase mb-0.5">{t('manager.shiftsPage.expectedClosing', 'Expected Closing')}</p>
                <p className="text-lg font-bold text-amber-400">{formatPKR(expectedClosing)}</p>
                <p className="text-[9px] text-gray-500 mt-1">{t('manager.shiftsPage.expectedClosingHint', 'Based on transactions during this shift')}</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.shiftsPage.actualCash', 'Actual Cash Counted')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rs</span>
                  <input type="number" value={closingBalance} onChange={e => setClosingBalance(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-9 pr-3 py-2.5 text-lg font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                </div>
                {closingBalance && (
                  <p className={
                    'text-[10px] mt-1.5 ' +
                    (Math.abs(varianceDiff) < 0.01 ? 'text-green-400'
                      : varianceDiff > 0 ? 'text-blue-400' : 'text-red-400')
                  }>
                    {t('manager.shiftsPage.variance', 'Variance: {{amount}}', { amount: formatPKR(varianceAmount) })}
                    {varianceDiff > 0 ? ` ${t('manager.shiftsPage.varianceExtra', '(extra)')}` :
                      varianceDiff < 0 ? ` ${t('manager.shiftsPage.varianceShort', '(short)')}` : ` ${t('manager.shiftsPage.variancePerfect', '✓ perfect')}`}
                  </p>
                )}
              </div>

              <button onClick={() => setConfirmClose(true)} disabled={!closingBalance}
                className="w-full rounded-xl bg-gradient-to-r from-red-500 to-red-600 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:from-red-400 hover:to-red-500 disabled:opacity-50"
              >
                <Square className="w-4 h-4" /> {t('manager.shiftsPage.closeShift', 'Close Shift')}
              </button>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-[#2a1f0d] bg-[#1a1208] p-5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-bold text-gray-100">{t('manager.shiftsPage.howShiftsWork', 'How Shifts Work')}</h3>
          </div>
          <ul className="space-y-2 text-xs text-gray-400">
            {['tip1', 'tip2', 'tip3', 'tip4', 'tip5'].map((key) => (
              <li key={key} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                <span>{t(`manager.shiftsPage.${key}`, key)}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleOpenShift}
        title={t('manager.shiftsPage.openConfirmTitle', 'Open Shift?')}
        message={t('manager.shiftsPage.openConfirmMsg', 'Opening balance: {{amount}}', { amount: formatPKR(Number(openingBalance || 0)) })}
        subMessage={t('manager.shiftsPage.openConfirmSub', 'This will start tracking all cash transactions for this branch.')}
        confirmText={t('manager.shiftsPage.openShift', 'Open Shift')}
        confirmIcon={Play}
        confirmColor="green"
        loading={loading}
      />

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={handleCloseShift}
        title={t('manager.shiftsPage.closeConfirmTitle', 'Close Shift?')}
        message={t('manager.shiftsPage.closeConfirmMsg', 'Closing balance: {{amount}}', { amount: formatPKR(Number(closingBalance || 0)) })}
        subMessage={t('manager.shiftsPage.closeConfirmSub', 'Expected: {{expected}} • Variance: {{variance}}', {
          expected: formatPKR(expectedClosing),
          variance: formatPKR(varianceAmount),
        })}
        confirmText={t('manager.shiftsPage.closeShift', 'Close Shift')}
        confirmIcon={Square}
        confirmColor="red"
        loading={loading}
      />
    </div>
  );
};

export default Shifts;
