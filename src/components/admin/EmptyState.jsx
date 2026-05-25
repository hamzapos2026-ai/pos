import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { Inbox } from 'lucide-react';

const EmptyState = ({ icon: Icon = Inbox, title = 'No data', description, action }) => {
  const { isDark } = useTheme();
  return (
    <div className={cn(
      'rounded-2xl border p-10 text-center',
      isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
    )}>
      <div className={cn(
        'w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center',
        isDark ? 'bg-[#1a1208] text-gray-500' : 'bg-amber-50 text-amber-400'
      )}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className={cn('text-base font-bold mb-2', isDark ? 'text-white' : 'text-gray-900')}>{title}</h3>
      {description && <p className={cn('text-sm mb-4', isDark ? 'text-gray-400' : 'text-gray-500')}>{description}</p>}
      {action}
    </div>
  );
};

export default EmptyState;