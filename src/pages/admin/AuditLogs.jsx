// Admin Activity Logs — uses shared dashboard (same UI/filters as Manager)

import ActivityLogsDashboard from '../../components/activity/ActivityLogsDashboard';
import { useLanguage } from '../../hooks/useLanguage';

const AuditLogs = () => {
  const { isRTL } = useLanguage();
  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <ActivityLogsDashboard canExport showDevicesLink embedded />
    </div>
  );
};

export default AuditLogs;
