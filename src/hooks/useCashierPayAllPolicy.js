import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { isCashierPayAllEnabled } from '../utils/cashierPayAllPolicy';

const useCashierPayAllPolicy = (branchId, cashierId) => {
  const { settings } = useSettings();
  const enabled = useMemo(
    () => isCashierPayAllEnabled(settings?.cashierPayAllPolicy, branchId, cashierId),
    [settings?.cashierPayAllPolicy, branchId, cashierId],
  );
  return { enabled };
};

export default useCashierPayAllPolicy;
