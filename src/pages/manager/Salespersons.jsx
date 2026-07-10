// Manager — Commission Dashboard (same UI as Super Admin + pay/edit/reset actions)

import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import {
  mergeRoleFeatureMatrix,
  resolveManagerCommissionPerms,
} from '../../utils/roleFeaturePermissions';
import CommissionDashboard from '../../components/commission/CommissionDashboard';

const Salespersons = () => {
  const { userData } = useAuth();
  const { settings } = useSettings();
  const agents = settings?.salesperson?.agents || [];

  const roleMatrix = useMemo(
    () => mergeRoleFeatureMatrix(settings?.permissions),
    [settings?.permissions],
  );
  const perms = useMemo(
    () => resolveManagerCommissionPerms(userData, roleMatrix),
    [userData, roleMatrix],
  );

  return (
    <CommissionDashboard
      agents={agents}
      allowed={perms.view}
      moduleOn={settings?.salesperson?.enableCommission !== false}
      managerPerms={perms}
    />
  );
};

export default Salespersons;
