/** Merge Firestore bills with unsynced Dexie/local rows for admin + manager views. */

const isUnsyncedLocal = (o) => {
  const st = String(o?.syncStatus || '').toLowerCase();
  if (st === 'synced' || o?.synced === true) return false;
  if (o?.firebaseId && st === 'synced') return false;
  return true;
};

export const mapLocalOrderForMerge = (raw) => ({
  ...raw,
  id: raw?.localId || raw?.id,
  localId: raw?.localId || raw?.id,
  isLocalOnly: true,
  synced: false,
});

/** Append unsynced local orders; prepareBillsForDisplay dedupes by serial preferring cloud. */
export const mergeCloudWithLocalOrders = (cloudOrders = [], localOrders = []) => {
  const localMapped = (localOrders || [])
    .filter(isUnsyncedLocal)
    .map(mapLocalOrderForMerge);
  if (!localMapped.length) return cloudOrders || [];
  return [...(cloudOrders || []), ...localMapped];
};
