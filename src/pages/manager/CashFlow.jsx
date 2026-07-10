import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import useStoresMap from '../../hooks/useStoresMap';
import { resolveManagerDataScope } from '../../utils/branchAccess';
import CashFlowMonitor from '../admin/CashFlowMonitor';

export default function ManagerCashFlow() {
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const scope = useMemo(
    () => resolveManagerDataScope(userData, storesMap),
    [userData, storesMap],
  );

  return <CashFlowMonitor scopeOverride={scope} managerMode />;
}
