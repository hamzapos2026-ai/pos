// File: aone-jewelry-pos/src/components/shared/LanguageSwitcher.jsx
// Language switcher component for switching between English and Urdu

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * LanguageSwitcher component
 * Toggle button for switching between English and Urdu languages
 */
const LanguageSwitcher = memo(({ className }) => {
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { isDark } = useTheme();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ur' : 'en');
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleLanguage}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
        isDark
          ? 'bg-[#2a1f0d] text-[#f5f5f4] hover:bg-[#3a2f1d]'
          : 'bg-amber-100 text-[#1c1917] hover:bg-amber-200',
        className
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
      aria-label={language === 'en' ? t('language.urdu', 'Urdu') : t('language.english', 'English')}
    >
      <Globe className="w-4 h-4" />
      <span className="text-sm font-medium">
        {language === 'en' ? t('language.switchToUr', 'اردو') : t('language.switchToEn', 'EN')}
      </span>
    </motion.button>
  );
});

LanguageSwitcher.displayName = 'LanguageSwitcher';

export default LanguageSwitcher;