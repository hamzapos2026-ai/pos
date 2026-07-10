import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';

/** Global shop name + logo from saved settings (header / sidebar). */
export const useShopBrand = () => {
  const { settings, settingsReady } = useSettings();

  return useMemo(() => {
    const store = settings?.store || settings?.shop || {};
    const logo = String(store.logo || store.logoUrl || '').trim();
    return {
      name: store.name || 'A One Jewelry',
      tagline: store.tagline || '',
      logo,
      hasLogo: Boolean(logo),
      ready: settingsReady,
    };
  }, [settings, settingsReady]);
};

export default useShopBrand;
