import PageHeader from '../admin/PageHeader';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

/** Manager pages — same header/card shell as Super Admin admin pages */
const ManagerPageLayout = ({
  title,
  description,
  icon: Icon,
  actions,
  badge,
  children,
  className,
}) => {
  const { isDark } = useTheme();
  return (
    <div className={cn('p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5', className)}>
      <PageHeader
        title={title}
        description={description}
        icon={Icon}
        actions={actions}
        badge={badge}
      />
      <div className={cn(
        'rounded-2xl border p-4 sm:p-5 space-y-4',
        isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-white border-amber-100 shadow-sm',
      )}>
        {children}
      </div>
    </div>
  );
};

export default ManagerPageLayout;
