import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getEnabledPaymentMethods, getEnabledPaymentLabels } from '../utils/paymentMethodsUtils';

const useEnabledPaymentMethods = () => {
  const { settings } = useSettings();
  return useMemo(() => ({
    methods: getEnabledPaymentMethods(settings),
    labels: getEnabledPaymentLabels(settings),
  }), [settings?.paymentMethods]);
};

export default useEnabledPaymentMethods;
