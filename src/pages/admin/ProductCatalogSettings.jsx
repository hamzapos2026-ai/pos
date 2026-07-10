import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { ProductCatalogCard } from '../../components/admin/ProductCatalogPanel';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useSettings } from '../../context/SettingsContext';
import { patchSetting } from '../../services/settingsStore';
import { SettingsCard } from '../../components/admin/SettingsUi';
import { cn } from '../../utils/cn';

const ProductCatalogSettings = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { isDark } = useTheme();
  const { t } = useLanguage();

  const productCatalog = useMemo(
    () => (Array.isArray(settings?.productCatalog) ? settings.productCatalog : []),
    [settings?.productCatalog],
  );

  const productNameEnabled = (settings?.billerUI?.showProductName ?? true) === true;

  const updateProductCatalog = async (updater) => {
    try {
      await patchSetting('productCatalog', (cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        return typeof updater === 'function' ? updater(arr) : updater;
      });
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    }
  };

  return (
    <div className={cn('min-h-screen pb-10', isDark ? 'bg-[#0a0805]' : 'bg-amber-50/40')}>
      <div className="mx-auto max-w-7xl px-3 pb-6 pt-10 space-y-5">
        <div className={cn('rounded-[32px] border border-white/15 bg-white/10 backdrop-blur-2xl shadow-2xl shadow-black/20 p-6', 'text-white')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white/90 shadow-sm shadow-amber-500/10">
                <Package className="w-4 h-4 text-white" />
                {t('admin.pages.productCatalog.summaryLabel', 'Total Products')}
              </div>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-white">{productCatalog.length.toLocaleString()}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                {t('admin.pages.productCatalog.totalProducts', 'Total shared products available for biller search.')}
              </p>
            </div>
          </div>
        </div>

        <SettingsCard
          title={t('admin.pages.productCatalog.helpTitle', 'Shared biller catalog')}
          subtitle={t('admin.pages.productCatalog.helpSubtitle', 'Use the product list below for fast entry.')}
          icon={Package}
          isDark={isDark}
          accent="purple"
        >
          <div className="text-sm text-gray-400">
            {t('admin.pages.productCatalog.helpText', 'Keep this list lean: each item is a shared product name billers can pick from during checkout.')}
          </div>
          <div className="flex flex-wrap gap-3 pt-3">
            <Button variant="primary" onClick={() => navigate('/admin/settings/biller')}>
              {t('admin.pages.productCatalog.openBillerSettings', 'Open Biller Settings')}
            </Button>
          </div>
        </SettingsCard>

        <ProductCatalogCard
          productCatalog={productCatalog}
          productNameEnabled={productNameEnabled}
          isDark={isDark}
          t={t}
          updateProductCatalog={updateProductCatalog}
        />
      </div>
    </div>
  );
};

export default ProductCatalogSettings;
