import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  isBillFraudFlagged,
  getBillFraudReason,
} from '../utils/billsFilterUtils';
import { getBillSerialDisplay } from '../utils/billsListHelpers';
import { billRowId } from '../utils/billRowStyles';

/**
 * Alerts only for bills with real fraud flags — not every new bill.
 * Skips initial snapshot toast; existing fraud rows show in banner only.
 */
export default function useBillRowAlerts(bills, { enabled = true } = {}) {
  const seenRef = useRef(new Set());
  const initializedRef = useRef(false);
  const [fraudBillIds, setFraudBillIds] = useState(() => new Set());
  const [fraudReasons, setFraudReasons] = useState(() => new Map());

  const upsertFraud = useCallback((row, { toastIt = false } = {}) => {
    const id = billRowId(row);
    const reason = getBillFraudReason(row);
    if (!id || !reason) return;

    setFraudBillIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setFraudReasons((prev) => {
      const next = new Map(prev);
      next.set(id, reason);
      return next;
    });

    if (toastIt) {
      const serial = getBillSerialDisplay(row);
      toast(
        `Fraud alert — #${serial}: ${reason}`,
        {
          id: `fraud-alert-${id}`,
          duration: 7000,
          icon: '🚨',
          style: {
            background: '#1a1208',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            color: '#f3f4f6',
          },
        },
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled || !Array.isArray(bills)) return;

    const ids = bills.map(billRowId).filter(Boolean);

    if (!initializedRef.current) {
      ids.forEach((id) => seenRef.current.add(id));
      bills.forEach((b) => {
        if (isBillFraudFlagged(b)) upsertFraud(b, { toastIt: false });
      });
      initializedRef.current = true;
      return;
    }

    for (const b of bills) {
      const id = billRowId(b);
      if (!id || seenRef.current.has(id)) continue;
      seenRef.current.add(id);
      if (isBillFraudFlagged(b)) {
        upsertFraud(b, { toastIt: true });
      }
    }

    setFraudBillIds((prev) => {
      let changed = false;
      const next = new Set();
      for (const id of prev) {
        const row = bills.find((b) => billRowId(b) === id);
        if (row && isBillFraudFlagged(row)) next.add(id);
        else changed = true;
      }
      return changed || next.size !== prev.size ? next : prev;
    });
  }, [bills, enabled, upsertFraud]);

  const dismissBill = useCallback((row) => {
    const id = billRowId(row);
    if (!id) return;
    setFraudBillIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setFraudReasons((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    toast.dismiss(`fraud-alert-${id}`);
  }, []);

  const dismissAll = useCallback(() => {
    setFraudBillIds(new Set());
    setFraudReasons(new Map());
    toast.dismiss();
  }, []);

  const fraudSummary = useMemo(() => {
    const reasons = [...fraudReasons.values()];
    const unique = [...new Set(reasons)];
    if (unique.length === 1) return unique[0];
    if (unique.length > 1) return unique.slice(0, 2).join(' · ');
    return '';
  }, [fraudReasons]);

  return {
    newBillIds: fraudBillIds,
    newBillCount: fraudBillIds.size,
    fraudBillIds,
    fraudBillCount: fraudBillIds.size,
    fraudReasons,
    fraudSummary,
    alertCount: fraudBillIds.size,
    dismissBill,
    dismissAll,
    isNewBill: (row) => fraudBillIds.has(billRowId(row)),
    isFraudBill: (row) => fraudBillIds.has(billRowId(row)),
  };
}
