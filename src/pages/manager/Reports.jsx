import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import useStoresMap from '../../hooks/useStoresMap';
import { resolveManagerDataScope } from '../../utils/branchAccess';
import ReportsAnalytics from '../admin/ReportsAnalytics';

export default function ManagerReports() {
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const scope = useMemo(
    () => resolveManagerDataScope(userData, storesMap),
    [userData, storesMap],
  );

  return <ReportsAnalytics scopeOverride={scope} managerMode />;
}
