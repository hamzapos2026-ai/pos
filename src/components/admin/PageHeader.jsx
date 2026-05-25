import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';

const PageHeader = ({ title, description, icon: Icon, actions, badge }) => {
  const { isDark } = useTheme();
  return (
    <div className={cn(
      'rounded-3xl border p-5 sm:p-6 mb-6 relative overflow-hidden',
      isDark ? 'bg-gradient-to-br from-[#1a1208] to-[#0f0a05] border-[#2a1f0d]' : 'bg-gradient-to-br from-white to-amber-50 border-amber-200'
    )}>
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 flex-shrink-0">
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className={cn('text-xl sm:text-2xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>{title}</h2>
              {badge}
            </div>
            {description && <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHeader;