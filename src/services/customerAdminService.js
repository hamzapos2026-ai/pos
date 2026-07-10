/**
 * Customer admin/manager service — UI must use this, not Firebase directly.
 */

import {
  collection, doc, getDocs, deleteDoc, updateDoc, writeBatch,
  setDoc, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db as firestore, isFirebaseReady } from './firebase';
import {
  mergeCustomerPersona,
  resolveCustomerDocId,
} from '../repositories/customerRepository';
import { searchCustomers, browseCustomers, loadCustomerOrders, loadOrdersForCustomerMetrics, CUSTOMER_SEARCH_PAGE_SIZE } from './customerQueryService';
import { COLLECTION_NAMES } from '../utils/constants';
import { resolveTenantScope } from '../utils/tenantScope';
import { buildCustomerFirestorePayload, phoneDigitsKey } from '../utils/customerHelpers';
import { buildEmptyPersona } from '../utils/customerPersonaSchema';
import { db as dexieDb } from '../db/index';
import { getHasInternet } from '../utils/networkReachability';

const BACKFILL_BATCH = 40;

/** Write merged visit/VIP metrics back to customers collection (old + new data). */
export const backfillCustomerPersonaBatch = async (rows = []) => {
  if (!getHasInternet() || !isFirebaseReady() || !firestore || !rows.length) {
    return { updated: 0, offline: true };
  }

  const eligible = rows.filter((row) =>
    row?.id
    && !row.isWalkin
    && row.id !== 'virtual-walkin'
    && !String(row.id).startsWith('order-only')
  ).slice(0, BACKFILL_BATCH);

  if (!eligible.length) return { updated: 0 };

  const batch = writeBatch(firestore);
  eligible.forEach((row) => {
    batch.set(doc(firestore, COLLECTION_NAMES.customers, row.id), {
      visitCount: row.visitCount ?? row.purchaseCount ?? 0,
      visitFrequency: row.visitCount ?? row.purchaseCount ?? 0,
      totalBills: row.totalBills ?? row.purchaseCount ?? 0,
      purchaseCount: row.purchaseCount ?? row.totalBills ?? 0,
      totalSales: row.totalSales ?? row.totalSpent ?? 0,
      totalSpent: row.totalSpent ?? row.totalSales ?? 0,
      lastVisit: row.lastVisit || row.lastOrderDate || null,
      lastOrderDate: row.lastVisit || row.lastOrderDate || null,
      lastPurchaseDate: row.lastPurchaseDate || row.lastVisit || row.lastOrderDate || null,
      firstVisit: row.firstVisit || row.createdAt || null,
      vipStatus: row.vipStatus === true,
      isVip: row.vipStatus === true,
      updatedAt: serverTimestamp(),
      _legacyMergedAt: serverTimestamp(),
    }, { merge: true });
  });

  await batch.commit();
  return { updated: eligible.length };
};

const enqueueCustomerOp = async ({ docId, operation, data, priority = 2 }) => {
  try {
    await dexieDb.sync_queue.add({
      queueId: `cust_${docId}_${Date.now()}`,
      type: 'customers',
      operation,
      data: { docId, ...data },
      priority,
      attempts: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[customerAdminService] queue enqueue failed:', err?.message);
  }
};

/** Create or update customer from admin/manager form. */
export const saveCustomer = async ({
  customer = null,
  form = {},
  storeId,
  scope: scopeInput = {},
} = {}) => {
  const scope = resolveTenantScope({ ...scopeInput, storeId });
  const sid = scope.storeId || storeId || 'default';
  const payload = {
    name: String(form.name || '').trim(),
    phone: String(form.phone || '').trim(),
    email: String(form.email || '').trim(),
    city: String(form.city || '').trim(),
    address: String(form.address || '').trim(),
    market: String(form.market || form.city || '').trim(),
    creditLimit: Number(form.creditLimit) || 0,
    nameLower: String(form.name || '').trim().toLowerCase(),
    phoneNormalized: phoneDigitsKey(form.phone),
    storeId: sid,
    tenantId: scope.tenantId,
    branchId: scope.branchId || sid,
    updatedAt: new Date().toISOString(),
  };

  if (customer?.id && !String(customer.id).startsWith('order-only') && customer.id !== 'virtual-walkin') {
    return updateCustomerFields(customer.id, payload, scope);
  }

  const docId = resolveCustomerDocId(sid, payload);
  const personaSeed = buildEmptyPersona(scope);
  const result = await mergeCustomerPersona({
    customer: payload,
    scope,
    personaPatch: {
      ...personaSeed,
      email: payload.email,
      creditLimit: payload.creditLimit,
      address: payload.address,
    },
    identityExtra: {
      isWalking: false,
      isAutoNamed: false,
      isAutoSerial: false,
      billerId: scope.userId || '',
      createdAt: new Date().toISOString(),
    },
  });

  return { success: true, docId: result?.docId || docId, customerId: result?.customerId, offline: result?.offline };
};

/** Update customer fields by Firestore doc id. */
export const updateCustomerFields = async (id, updates = {}, scopeInput = {}) => {
  if (!id || id === 'virtual-walkin' || String(id).startsWith('order-only')) {
    throw new Error('Cannot update this customer profile');
  }

  const scope = resolveTenantScope(scopeInput);
  const patch = {
    ...updates,
    tenantId: scope.tenantId,
    updatedAt: serverTimestamp(),
  };
  if (updates.name) patch.nameLower = updates.name.trim().toLowerCase();
  if (updates.phone) patch.phoneNormalized = phoneDigitsKey(updates.phone);

  if (getHasInternet() && isFirebaseReady() && firestore) {
    try {
      await updateDoc(doc(firestore, COLLECTION_NAMES.customers, id), patch);
      return { success: true };
    } catch (err) {
      console.warn('[customerAdminService] Firestore update failed:', err?.message);
    }
  }

  await enqueueCustomerOp({ docId: id, operation: 'merge', data: { merged: { ...patch, updatedAt: new Date().toISOString() } } });
  try {
    const local = await dexieDb.customers.where('customerId').equals(id).first()
      || await dexieDb.customers.filter((c) => c.id === id).first();
    if (local) {
      await dexieDb.customers.put({ ...local, ...updates, synced: 0, updatedAt: new Date().toISOString() });
    }
  } catch { /* ignore */ }

  return { success: true, offline: true };
};

/** Archive customer (soft delete — restore from Admin → Backup → Archive). */
export const deleteCustomerById = async (id, { deletedBy = {}, reason = '' } = {}) => {
  if (!id || id === 'virtual-walkin') throw new Error('Cannot delete walk-in profile');

  const { softArchiveCustomer } = await import('./archiveService');

  if (getHasInternet() && isFirebaseReady() && firestore) {
    return softArchiveCustomer(id, { deletedBy, reason: reason || 'deleted_from_customers' });
  }

  await enqueueCustomerOp({
    docId: id,
    operation: 'merge',
    data: {
      merged: {
        isArchived: true,
        isDeleted: true,
        archivedAt: new Date().toISOString(),
        archiveReason: reason || 'offline_archive',
      },
    },
  });
  return { success: true, offline: true };
};

/** Fetch customers for auto-name fix (branch-scoped when possible). */
export const fetchCustomersForRename = async ({ storeId = null, storeIds = null } = {}) => {
  if (!getHasInternet() || !isFirebaseReady() || !firestore) return [];

  const ids = storeIds?.length ? storeIds.slice(0, 10) : (storeId ? [storeId] : null);
  let q;
  if (ids?.length === 1) {
    q = query(collection(firestore, COLLECTION_NAMES.customers), where('storeId', '==', ids[0]));
  } else {
    q = collection(firestore, COLLECTION_NAMES.customers);
  }
  const snap = await getDocs(q);
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (ids?.length > 1) {
    docs = docs.filter((c) => ids.includes(String(c.storeId || c.branchId || '')));
  }
  return docs;
};

/** Batch rename auto-numbered customers. */
export const batchRenameAutoCustomers = async (updates = []) => {
  if (!updates.length) return { success: true, count: 0 };

  if (getHasInternet() && isFirebaseReady() && firestore) {
    const batch = writeBatch(firestore);
    updates.forEach(({ id, name }) => {
      batch.update(doc(firestore, COLLECTION_NAMES.customers, id), {
        name,
        nameLower: name.toLowerCase(),
        isAutoNamed: true,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return { success: true, count: updates.length };
  }

  for (const { id, name } of updates) {
    await enqueueCustomerOp({
      docId: id,
      operation: 'merge',
      data: {
        merged: {
          name,
          nameLower: name.toLowerCase(),
          isAutoNamed: true,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
  return { success: true, count: updates.length, offline: true };
};

export {
  searchCustomers,
  browseCustomers,
  loadCustomerOrders,
  loadOrdersForCustomerMetrics,
  CUSTOMER_SEARCH_PAGE_SIZE,
};

export default {
  saveCustomer,
  updateCustomerFields,
  deleteCustomerById,
  fetchCustomersForRename,
  batchRenameAutoCustomers,
  backfillCustomerPersonaBatch,
  searchCustomers,
  browseCustomers,
  loadCustomerOrders,
  loadOrdersForCustomerMetrics,
};
