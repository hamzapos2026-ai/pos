/**
 * Customer Repository — UI must use services, not Firebase directly.
 * Merge writes for identity + persona (Firestore primary, Dexie offline queue).
 */

import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, getDocs, query, where, limit,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from '../services/firebase';
import { db as dexieDb } from '../db/index';
import { COLLECTION_NAMES } from '../utils/constants';
import {
  buildCustomerDocId,
  buildCustomerFirestorePayload,
  isWalkIn,
  isAutoCustomerName,
  phoneDigitsKey,
  unionNumberLists,
} from '../utils/customerHelpers';
import { resolveTenantScope } from '../utils/tenantScope';
import { migratePersonaFields } from '../utils/customerPersonaSchema';
import { getHasInternet } from '../utils/networkReachability';

const generateCustomerId = () =>
  `cus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const enqueuePersonaMerge = async (docId, merged) => {
  try {
    await dexieDb.sync_queue.add({
      queueId: `persona_${docId}_${Date.now()}`,
      type: 'customers',
      operation: 'merge',
      data: { docId, merged },
      priority: 2,
      attempts: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[customerRepository] persona queue failed:', err?.message);
  }
};

/** Biller autocomplete cache — branch-scoped customer list. */
export const listCustomersForStore = async (storeId, cap = 1000) => {
  if (!storeId) return [];
  if (getHasInternet() && isFirebaseReady() && firestore) {
    try {
      const snap = await getDocs(query(
        collection(firestore, COLLECTION_NAMES.customers),
        where('storeId', '==', storeId),
        limit(cap),
      ));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch { /* fall through */ }
  }
  try {
    return await dexieDb.customers.filter((c) => c.storeId === storeId).limit(cap).toArray();
  } catch {
    return [];
  }
};

export const resolveCustomerDocId = (storeId, customer = {}) => {
  if (customer.personaDocId) return customer.personaDocId;
  return buildCustomerDocId(storeId, { phone: customer.phone, name: customer.name });
};

/**
 * Resolve the canonical customer doc id.
 * Linking is EXPLICIT: only an explicit `personaDocId` (set by the biller when they
 * pick / look up an existing customer) merges numbers into one profile. Same-name
 * customers are NOT auto-merged, so two different people named "Ali" stay separate.
 */
export const resolveCanonicalDocId = async (storeId, customer = {}) => {
  if (customer.personaDocId) return customer.personaDocId;
  return buildCustomerDocId(storeId, { phone: customer.phone, name: customer.name });
};

/** Read a persona by a resolved doc id (Firestore online, else Dexie cache). */
const readPersonaByDocId = async (docId, storeId, customer = {}) => {
  if (!docId) return null;
  if (getHasInternet() && isFirebaseReady() && firestore) {
    try {
      const snap = await getDoc(doc(firestore, COLLECTION_NAMES.customers, docId));
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    } catch { /* fall through */ }
  }
  try {
    const phoneKey = phoneDigitsKey(customer.phone);
    const local = await dexieDb.customers
      .filter((c) => c.storeId === storeId && (
        c.customerId === docId
        || c.phone === customer.phone
        || c.phoneNormalized === phoneKey
      ))
      .first();
    if (local) return local;
  } catch { /* ignore */ }
  return null;
};

const shouldSkipCustomer = (customer = {}) => {
  const phone = (customer.phone || '').trim();
  const name = (customer.name || '').trim();
  if (!phone && !name) return true;
  if (isWalkIn({ name, phone }) && !phone) return true;
  if (!phone && isAutoCustomerName(name)) return true;
  return false;
};

/** Read customer persona from Firestore (online) or Dexie cache — canonical by name. */
export const getCustomerPersona = async (storeId, customer = {}) => {
  const docId = await resolveCanonicalDocId(storeId, customer);
  return readPersonaByDocId(docId, storeId, customer);
};

/**
 * Merge identity + persona patch into customers collection.
 * @param {object} params
 */
export const mergeCustomerPersona = async ({
  customer = {},
  scope: scopeInput = {},
  personaPatch = null,
  identityExtra = {},
} = {}) => {
  if (shouldSkipCustomer(customer)) return { skipped: true };

  const scope = resolveTenantScope(scopeInput);
  const storeId = scope.storeId || 'default';
  const docId = await resolveCanonicalDocId(storeId, customer);
  if (!docId) return { skipped: true };

  const existing = await readPersonaByDocId(docId, storeId, customer);
  const migrated = migratePersonaFields(existing || {}, scope);
  const customerId = migrated.customerId || existing?.customerId || generateCustomerId();

  const identity = buildCustomerFirestorePayload(customer, {
    storeId,
    billerId: scopeInput.billerId || scope.userId,
  });

  // Multiple mobiles per person: accumulate every number this customer is known
  // by. Keep the first/primary phone stable so the profile doesn't flip-flop; the
  // current bill still stores its own entered number for the invoice.
  const numbers = unionNumberLists(
    unionNumberLists(existing?.numbers, customer.numbers),
    [existing?.phone, identity.phone],
  );
  const primaryPhone = (existing?.phone || identity.phone || '').trim();

  const merged = {
    ...migrated,
    ...identity,
    ...identityExtra,
    customerId,
    tenantId: scope.tenantId,
    storeId,
    branchId: scope.branchId,
    userId: scope.userId || migrated.userId,
    email: customer.email || migrated.email || identityExtra.email || '',
    ...(personaPatch || {}),
    phone: primaryPhone || identity.phone,
    numbers,
    phoneNormalized: phoneDigitsKey(primaryPhone || customer.phone || identity.phone),
  };

  if (getHasInternet() && isFirebaseReady() && firestore) {
    try {
      await setDoc(doc(firestore, COLLECTION_NAMES.customers, docId), {
        ...merged,
        updatedAt: serverTimestamp(),
        createdAt: existing?.createdAt || serverTimestamp(),
      }, { merge: true });
      return { success: true, docId, customerId };
    } catch (err) {
      console.warn('[customerRepository] Firestore merge failed:', err?.message);
    }
  }

  try {
    const localRow = {
      ...merged,
      id: existing?.id,
      synced: 0,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (existing?.id) await dexieDb.customers.put(localRow);
    else await dexieDb.customers.add(localRow);
    await enqueuePersonaMerge(docId, {
      ...merged,
      updatedAt: localRow.updatedAt,
      createdAt: localRow.createdAt,
    });
  } catch (err) {
    console.warn('[customerRepository] Dexie merge failed:', err?.message);
  }

  return { success: true, docId, customerId, offline: true };
};

export default {
  getCustomerPersona,
  mergeCustomerPersona,
  resolveCustomerDocId,
  listCustomersForStore,
};
