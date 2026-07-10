import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../hooks/useLanguage';
import useStoresMap from '../../hooks/useStoresMap';
import ActivityLogsDashboard from '../../components/activity/ActivityLogsDashboard';
import {
  mergeRoleFeatureMatrix,
  resolveActivityLogsPerms,
} from '../../utils/roleFeaturePermissions';
import { resolveManagerDataScope } from '../../utils/branchAccess';

export default function ManagerActivityLogs() {
  const { userData } = useAuth();
  const { settings } = useSettings();
  const { isRTL } = useLanguage();
  const storesMap = useStoresMap();

  const roleMatrix = useMemo(
    () => mergeRoleFeatureMatrix(settings?.permissions),
    [settings?.permissions],
  );
  const perms = useMemo(
    () => resolveActivityLogsPerms(userData, roleMatrix),
    [userData, roleMatrix],
  );
  const scope = useMemo(
    () => resolveManagerDataScope(userData, storesMap),
    [userData, storesMap],
  );
  const branchIds = scope.storeIds?.length ? scope.storeIds : null;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <ActivityLogsDashboard
        canExport={perms.export}
        branchIds={branchIds}
        accessDenied={!perms.view}
        embedded
      />
    </div>
  );
}
