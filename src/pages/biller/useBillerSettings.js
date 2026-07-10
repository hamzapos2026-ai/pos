import { useEffect, useState } from 'react';
import {
  subscribe,
  hydrateSettings,
  getCachedSettings,
} from '../../services/settingsStore';

/** Keys the biller module reads from Super Admin settings */
const BILLER_KEYS = [
  'salesperson',
  'discount',
  'discounts',
  'billerUI',
  'mergeItems',
  'commission',
  'fonts',
  'billFlow',
  'cashierUI',
  'invoice',
  'store',
  'customer',
  'billerStall',
  'productCatalog',
];

const pickBillerSettings = (all = {}) => {
  const map = {};
  BILLER_KEYS.forEach((k) => {
    if (all[k] !== undefined) map[k] = all[k];
  });
  return map;
};

/**
 * Biller-scoped settings — offline-first via settingsStore (same SSoT as admin).
 * Updates instantly at runtime when Super Admin toggles commission, discount, etc.
 *
 * Re-syncs from IndexedDB on:
 *   • settingsStore subscriber (BroadcastChannel / localStorage cross-tab change)
 *   • tab becoming visible (user switches to biller tab)
 *   • periodic 10s poll (belt-and-suspenders for same-PC offline scenario)
 */
export default function useBillerSettings() {
  const [state, setState] = useState(() => pickBillerSettings(getCachedSettings()));

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      hydrateSettings().then(() => {
        if (mounted) setState(pickBillerSettings(getCachedSettings()));
      });
    };

    // Initial load
    refresh();

    // React to any settings change pushed by settingsStore (BroadcastChannel / remote sync)
    const unsub = subscribe((all) => {
      if (mounted) setState(pickBillerSettings(all));
    });

    // Re-read when biller tab regains focus (catches admin changes made while tab was backgrounded)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Periodic poll — safety net for same-PC offline scenario where cross-tab events may miss
    const pollId = setInterval(refresh, 10_000);

    return () => {
      mounted = false;
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(pollId);
    };
  }, []);

  return state;
};
