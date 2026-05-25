import React, { createContext, useEffect, useState } from 'react';
import localDB, { getAllSettings, putSetting } from '../services/localDB';
import { enqueue } from '../services/syncService';
import { db, auth, isFirebaseReady, collection, getDocs, getDoc, doc, setDoc, serverTimestamp, onSnapshot } from '../services/firebase';

export const SettingsContext = createContext({});

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    let unsubDual = null;
    let cleanupDualHandler = null;
    (async () => {
      try {
        const all = await getAllSettings();
        const map = {};
        all.forEach(s => {
          map[s.key] = s.value;
        });
        setSettings(map);
      } catch (e) {
        console.warn('[Settings] load failed', e);
      }

      if (isFirebaseReady() && navigator.onLine) {
        try {
          // Avoid listing entire collection when unauthenticated — Firestore
          // will return PERMISSION_DENIED if some documents are not readable.
          // Read the public 'setup' doc for unauthenticated clients, and
          // only fetch the full collection for authenticated users.
          const user = auth?.currentUser;
          const remoteMap = {};

          if (!user) {
            try {
              const single = await getDoc(doc(db, 'settings', 'setup'));
              if (single && single.exists()) {
                const dd = single.data();
                remoteMap['setup'] = dd?.value !== undefined ? dd.value : dd;
              }
            } catch (e) {
              console.warn('[Settings] remote setup fetch failed', e);
            }
          } else {
            // Authenticated clients can read the full collection if permitted
            try {
              const snap = await getDocs(collection(db, 'settings'));
              snap.forEach(d => {
                const dd = d.data();
                remoteMap[d.id] = dd?.value !== undefined ? dd.value : dd;
              });
            } catch (e) {
              console.warn('[Settings] remote collection fetch failed', e);
            }
          }

          if (Object.keys(remoteMap).length > 0) {
            setSettings((prev) => ({ ...prev, ...remoteMap }));
          }

          // Real-time listen specifically for dualMode setting to keep UI in sync
          if (user) {
            try {
              const dualRef = doc(db, 'settings', 'dualMode');
              unsubDual = onSnapshot(dualRef, (snap) => {
                if (snap && snap.exists()) {
                  const dd = snap.data();
                  const val = dd?.value !== undefined ? dd.value : dd;
                  setSettings((prev) => ({ ...prev, dualMode: val }));
                  try { putSetting('dualMode', val); } catch {}
                }
              }, (err) => { console.warn('[Settings] dualMode snapshot failed', err); });
              // also expose a cleanup event in case other modules want to trigger it
              cleanupDualHandler = () => unsubDual && unsubDual();
              window.addEventListener('__cleanup_dual_unsub__', cleanupDualHandler);
            } catch (e) {
              console.warn('[Settings] dualMode realtime init failed', e.message || e);
            }
          } else {
            // Unauthenticated clients may not have permission for realtime listeners;
            // attempt a single read and fall back silently if permissions deny.
            try {
              const snap = await getDoc(doc(db, 'settings', 'dualMode'));
              if (snap && snap.exists()) {
                const dd = snap.data();
                const val = dd?.value !== undefined ? dd.value : dd;
                setSettings((prev) => ({ ...prev, dualMode: val }));
                try { putSetting('dualMode', val); } catch {}
              }
            } catch (e) {
              // Permission-denied is expected for unauthenticated clients; keep noise low.
              if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
                try { console.debug && console.debug('[Settings] dualMode fetch denied (unauthenticated)'); } catch {}
              } else {
                console.warn('[Settings] dualMode fetch failed (unauthenticated)', e.message || e);
              }
            }
          }
        } catch (remoteError) {
          console.warn('[Settings] remote load failed', remoteError);
        }
      }
    })();

    return () => {
      try { unsubDual && unsubDual(); } catch {}
      try { if (cleanupDualHandler) window.removeEventListener('__cleanup_dual_unsub__', cleanupDualHandler); } catch {}
    };
  }, []);

  const setSetting = async (key, value) => {
    try {
      await putSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
      enqueue('setting:update', { key, value });

      // Restrict certain global settings to Super Admin only (server-side enforced)
      if (key === 'dualMode') {
        // Verify current user is Super Admin before applying remote change
        try {
          const current = auth?.currentUser;
          if (!current) throw new Error('Not authenticated');
          const uref = doc(db, 'users', current.uid);
          const usnap = await getDoc(uref);
          const udata = usnap.exists() ? usnap.data() : {};
          const isSA = (udata.roles || []).some(r => ['superAdmin', 'superadmin', 'super_admin'].includes(r));
          if (!isSA) {
            console.warn('[Settings] dualMode change blocked: requires Super Admin');
            return;
          }
        } catch (e) {
          console.warn('[Settings] dualMode permission check failed', e?.message || e);
          return;
        }
      }

      if (isFirebaseReady() && navigator.onLine) {
        try {
          const ref = doc(db, 'settings', key);
          await setDoc(
            ref,
            {
              value,
              updatedAt: serverTimestamp(),
              updatedBy: auth?.currentUser?.uid || 'system',
            },
            { merge: true }
          );
        } catch (remoteError) {
          console.warn('[Settings] remote save failed', remoteError);
        }
      }
    } catch (err) {
      console.warn('[Settings] save failed', err);
    }
  };

  const getSetting = (key, fallback = null) => settings[key] ?? fallback;

  return (
    <SettingsContext.Provider value={{ settings, setSetting, getSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

export default SettingsContext;
