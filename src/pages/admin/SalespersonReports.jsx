// src/pages/admin/SalespersonReports.jsx

import { useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { canViewCommissionReports } from '../../utils/rolePermissions';
import { mergeRoleFeatureMatrix } from '../../utils/roleFeaturePermissions';
import CommissionDashboard from '../../components/commission/CommissionDashboard';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

const SalespersonReports = () => {
  const { settings }                         = useSettings();
  const { userData, isLoading: authLoading } = useAuth();
  const { isDark }                           = useTheme();
  const { t, isRTL }                         = useLanguage();

  const agents = settings?.salesperson?.agents || [];

  const roleMatrix = useMemo(
    () => mergeRoleFeatureMatrix(settings?.permissions),
    [settings?.permissions],
  );

  const allowed = useMemo(() => {
    if (authLoading) return true;
    return canViewCommissionReports(userData, roleMatrix);
  }, [authLoading, userData, roleMatrix]);

  if (authLoading) {
    return (
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'flex flex-col items-center justify-center min-h-[300px] gap-4',
          isDark ? 'bg-[#0f0a05]' : 'bg-white',
        )}
      >
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
          {t('admin.spReportsPage.loading', 'Loading Commission Reports…')}
        </p>
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
    <CommissionDashboard
      agents={agents}
      allowed={allowed}
      moduleOn={settings?.salesperson?.enableCommission !== false}
    />
    </div>
  );
};

export default SalespersonReports;