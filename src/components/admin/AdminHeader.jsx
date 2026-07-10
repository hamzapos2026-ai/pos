import { useNavigate } from 'react-router-dom';
import { LogOut, Menu, Bell } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../shared/ThemeToggle';
import LanguageSwitcher from '../shared/LanguageSwitcher';
import { useLanguage } from '../../hooks/useLanguage';
import useShopBrand from '../../hooks/useShopBrand';

const AdminHeader = ({ onMenuClick, title, subtitle }) => {
  const { isDark } = useTheme();
  const { user, signOut } = useAuth();
  const { t, isRTL } = useLanguage();
  const { name: shopName, logo: shopLogo } = useShopBrand();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast.success(t('auth.signedOut', 'Signed out successfully'));
  };

  return (
    <header dir={isRTL ? 'rtl' : 'ltr'} className={cn(
      'sticky top-0 z-30 px-4 sm:px-6 py-3.5 border-b backdrop-blur-xl',
      isDark ? 'bg-[#0f0a05]/80 border-[#2a1f0d]' : 'bg-white/80 border-amber-200'
    )}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onMenuClick}
            className={cn('p-2 rounded-xl lg:hidden flex-shrink-0', isDark ? 'hover:bg-[#2a1f0d] text-gray-300' : 'hover:bg-amber-50 text-gray-700')}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex items-center gap-3">
            {shopLogo && (
              <img
                src={shopLogo}
                alt={shopName}
                className={cn(
                  'h-9 w-9 rounded-xl object-contain border p-0.5 shrink-0 hidden sm:block',
                  isDark ? 'bg-black/30 border-[#2a1f0d]' : 'bg-white border-amber-100',
                )}
              />
            )}
            <div className="min-w-0">
              <h1 className={cn('text-lg sm:text-xl font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>{title}</h1>
              {subtitle && <p className={cn('text-xs hidden sm:block truncate', isDark ? 'text-gray-400' : 'text-gray-500')}>{subtitle}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className={cn('p-2 rounded-xl relative hidden md:flex', isDark ? 'hover:bg-[#2a1f0d] text-gray-300' : 'hover:bg-amber-50 text-gray-700')}>
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <LanguageSwitcher />
          <ThemeToggle />

          <div className={cn('flex items-center gap-3 ps-3 ms-1 border-s', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>
            <div className="text-end hidden sm:block">
              <p className={cn('text-sm font-semibold leading-tight', isDark ? 'text-white' : 'text-gray-900')}>
                {user?.displayName || 'Admin'}
              </p>
              <p className={cn('text-[11px] leading-tight', isDark ? 'text-gray-400' : 'text-gray-500')}>{user?.email}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {(user?.displayName || user?.email || 'A')[0].toUpperCase()}
            </div>
            <button
              onClick={handleSignOut}
              title={t('admin.signOut', 'Sign out')}
              className={cn('p-2 rounded-xl', isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-600')}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;