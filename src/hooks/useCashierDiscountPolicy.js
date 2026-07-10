import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import {
  resolveCashierDiscountRule,
  computeMaxCashierExtraDiscountPKR,
} from '../utils/cashierDiscountPolicy';

const useCashierDiscountPolicy = (branchId, cashierId) => {
  const { settings } = useSettings();
  const rule = useMemo(
    () => resolveCashierDiscountRule(settings.cashierDiscountPolicy, branchId, cashierId),
    [settings.cashierDiscountPolicy, branchId, cashierId],
  );
  return {
    rule,
    enabled: rule.enabled,
    getMaxExtra: (order) => computeMaxCashierExtraDiscountPKR(order, rule),
  };
};

export default useCashierDiscountPolicy;
