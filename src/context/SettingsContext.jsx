import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  hydrateSettings,
  subscribe as subscribeSettings,
  setSetting as storeSetSetting,
  getCachedSettings,
  startCrossTabSync,
  isHydrated,
} from '../services/settingsStore';

export const SettingsContext = createContext(null);

/**
 * SettingsProvider — local runtime mirror of settingsStore.
 * Network-wide sync (PC1 → PC10) lives in settingsRemoteSync.js (main.jsx).
 */
export const SettingsProvider = ({ children }) => {
  const [settings, setSettingsState] = useState(() => getCachedSettings());
  const [settingsReady, setSettingsReady] = useState(() => isHydrated());

  useEffect(() => {
    let cancelled = false;

    const unsubStore = subscribeSettings((snap) => {
      if (!cancelled) setSettingsState(snap && typeof snap === 'object' ? snap : {});
    });

    hydrateSettings().then(() => {
      if (!cancelled) setSettingsReady(true);
    });

    const stopCrossTab = startCrossTabSync();

    return () => {
      cancelled = true;
      try { unsubStore?.(); } catch { /* ignore */ }
      try { stopCrossTab?.(); } catch { /* ignore */ }
    };
  }, []);

  const setSetting = useCallback((key, value) => storeSetSetting(key, value), []);

  const getSetting = useCallback(
    (key, fallback = null) => (settings[key] !== undefined ? settings[key] : fallback),
    [settings],
  );

  return (
    <SettingsContext.Provider value={{ settings, setSetting, getSetting, settingsReady }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return {
    ...ctx,
    settings: ctx.settings ?? {},
  };
};

export default SettingsContext;
