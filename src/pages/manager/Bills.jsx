import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import useStoresMap from '../../hooks/useStoresMap';
import { resolveManagerDataScope } from '../../utils/branchAccess';
import BillsControl from '../admin/BillsControl';

export default function ManagerBills() {
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const scope = useMemo(
    () => resolveManagerDataScope(userData, storesMap),
    [userData, storesMap],
  );

  return <BillsControl scopeOverride={scope} managerMode />;
}
