import { Info } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { getAdminPageGuide } from '../../utils/adminPageGuides';

const AdminPageGuide = ({ pathname, className }) => {
  const { isDark } = useTheme();
  const text = getAdminPageGuide(pathname);
  if (!text) return null;

  return (
    <div
      className={cn(
        'mx-4 sm:mx-6 mt-3 mb-1 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed',
        isDark ? 'bg-blue-500/10 border-blue-500/25 text-blue-200/90' : 'bg-blue-50 border-blue-200 text-blue-900/85',
        className,
      )}
    >
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <p><span className="font-bold text-blue-400">Kya kaam hai: </span>{text}</p>
    </div>
  );
};

export default AdminPageGuide;
