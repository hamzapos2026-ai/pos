const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

const PAID_STATUSES = new Set(['paid', 'cashier_paid', 'manager_approved']);
const PAID_PAYMENT_STATUSES = new Set(['paid', 'cashier_paid']);

const isSuperAdmin = (data = {}) => {
  const role = data.role || '';
  const roles = Array.isArray(data.roles) ? data.roles : [role];
  return roles.some((r) => ['superAdmin', 'superadmin', 'super_admin'].includes(r));
};

const isDeletedOrder = (data) => !data || data.isDeleted === true || data.deleted === true;

const isOrderCountedPaid = (data) => {
  if (isDeletedOrder(data)) return false;
  const st = String(data.status || '').toLowerCase();
  const ps = String(data.paymentStatus || '').toLowerCase();
  return PAID_STATUSES.has(st) || PAID_PAYMENT_STATUSES.has(ps);
};

const pkDateKey = (ts) => {
  let ms = Date.now();
  if (ts?.toDate) ms = ts.toDate().getTime();
  else if (typeof ts?.seconds === 'number') ms = ts.seconds * 1000;
  else if (typeof ts === 'number') ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
  else if (typeof ts === 'string') ms = new Date(ts).getTime();
  const pk = new Date(ms + PK_OFFSET_MS);
  return pk.toISOString().slice(0, 10);
};

const orderAmount = (data) => Number(
  data?.totalAmount || data?.grandTotal || data?.total || data?.paidAmount || 0,
);

const orderDateKey = (data) => pkDateKey(
  data?.paidAt || data?.cashierPaidAt || data?.updatedAt || data?.createdAt,
);

const isCashPayment = (data) => {
  const m = String(data?.paymentMethod || data?.paymentType || '').toLowerCase();
  return m.includes('cash');
};

const summaryDocId = (storeId, dateKey) => (
  storeId ? `${storeId}_${dateKey}` : `global_${dateKey}`
);

const buildDelta = (data, sign = 1) => {
  const amount = orderAmount(data) * sign;
  const cash = isCashPayment(data) ? amount : 0;
  const digital = !isCashPayment(data) ? amount : 0;
  const pending = (data?.status === 'pending' || data?.paymentStatus === 'unpaid')
    ? Number(data?.balanceDue || orderAmount(data) || 0) * sign
    : 0;
  const expense = Number(data?.expense || 0) * sign;
  let ret = 0;
  if (data?.returnAmount) ret = Number(data.returnAmount) * sign;
  else if (data?.status === 'returned' || data?.paymentStatus === 'refund') {
    ret = orderAmount(data) * sign;
  }

  return {
    totalSales: amount,
    billCount: sign,
    paidBillCount: sign,
    cashTotal: cash,
    digitalTotal: digital,
    pendingReceivables: pending,
    expenses: expense,
    returns: ret,
  };
};

const applySummaryDelta = async (storeId, dateKey, delta) => {
  const id = summaryDocId(storeId, dateKey);
  const ref = db.collection('dailySummaries').doc(id);
  await ref.set({
    storeId: storeId || 'global',
    dateKey,
    totalSales: FieldValue.increment(delta.totalSales),
    billCount: FieldValue.increment(delta.billCount),
    paidBillCount: FieldValue.increment(delta.paidBillCount),
    cashTotal: FieldValue.increment(delta.cashTotal),
    digitalTotal: FieldValue.increment(delta.digitalTotal),
    pendingReceivables: FieldValue.increment(delta.pendingReceivables),
    expenses: FieldValue.increment(delta.expenses),
    returns: FieldValue.increment(delta.returns),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
};

/**
 * Maintain pre-aggregated daily summaries when order payment state changes.
 * Idempotent on paid transition — avoids client-side double writes.
 */
exports.maintainDailySummary = onDocumentWritten({
  document: 'orders/{orderId}',
  region: 'us-central1',
}, async (event) => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const wasPaid = isOrderCountedPaid(before);
  const nowPaid = isOrderCountedPaid(after);

  if (nowPaid && !wasPaid && after) {
    const dateKey = orderDateKey(after);
    const storeId = String(after.storeId || after.branchId || '').trim();
    const delta = buildDelta(after, 1);
    await applySummaryDelta(null, dateKey, delta);
    if (storeId) await applySummaryDelta(storeId, dateKey, delta);
    return;
  }

  if (wasPaid && !nowPaid && before) {
    const dateKey = orderDateKey(before);
    const storeId = String(before.storeId || before.branchId || '').trim();
    const delta = buildDelta(before, -1);
    await applySummaryDelta(null, dateKey, delta);
    if (storeId) await applySummaryDelta(storeId, dateKey, delta);
  }
});

/**
 * Delete a Firebase Auth user — Super Admin only (callable, CORS handled by Firebase).
 */
exports.deleteUserAccount = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = request.data?.uid;
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'User id (uid) is required.');
  }

  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  }

  const callerSnap = await getFirestore().collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || !isSuperAdmin(callerSnap.data())) {
    throw new HttpsError('permission-denied', 'Only Super Admin can delete auth accounts.');
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', err?.message || 'Auth delete failed');
    }
  }

  return { success: true };
});

/**
 * Repair own Firestore profile at users/{authUid} — merges legacy doc by email.
 * Callable by any signed-in user (fixes biller login without Super Admin edit).
 */
exports.ensureUserProfile = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const uid = request.auth.uid;
  const email = String(request.auth.token.email || '').trim().toLowerCase();
  if (!email) {
    throw new HttpsError('failed-precondition', 'Auth account must have an email.');
  }

  const ref = db.collection('users').doc(uid);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.isDeleted !== true && existing.data()?.roles?.length) {
    return { success: true, source: 'existing', uid };
  }

  const q = await db.collection('users').where('email', '==', email).limit(10).get();
  let legacyData = {};
  q.docs.forEach((d) => {
    legacyData = { ...legacyData, ...d.data() };
  });

  const clientProfile = request.data?.profile && typeof request.data.profile === 'object'
    ? request.data.profile
    : {};

  let authUser = null;
  try {
    authUser = await getAuth().getUser(uid);
  } catch {
    authUser = null;
  }

  const roles = clientProfile.roles || legacyData.roles
    || (legacyData.role ? [legacyData.role] : ['biller']);
  const primaryRole = clientProfile.primaryRole || legacyData.primaryRole
    || legacyData.role || roles[0] || 'biller';

  const profile = {
    ...legacyData,
    ...clientProfile,
    uid,
    email,
    name: clientProfile.name || legacyData.name || authUser?.displayName || email.split('@')[0],
    roles: Array.isArray(roles) ? roles : [roles],
    role: primaryRole,
    primaryRole,
    isActive: clientProfile.isActive !== false && legacyData.isActive !== false,
    isDeleted: false,
    updatedAt: FieldValue.serverTimestamp(),
    _repairedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(profile, { merge: true });
  return { success: true, source: q.empty ? 'bootstrap' : 'repaired', uid };
});

/**
 * Super Admin — sync ALL Firebase Auth users → users/{authUid} in Firestore.
 * Merges local POS profiles (from IDB) + legacy Firestore docs by email.
 */
exports.repairAllUserProfiles = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || !isSuperAdmin(callerSnap.data())) {
    throw new HttpsError('permission-denied', 'Only Super Admin can repair all profiles.');
  }

  const localProfiles = Array.isArray(request.data?.profiles) ? request.data.profiles : [];
  const localByEmail = new Map();
  localProfiles.forEach((p) => {
    const e = String(p?.email || '').trim().toLowerCase();
    if (e) localByEmail.set(e, p);
  });

  const fsSnap = await db.collection('users').get();
  const fsByEmail = new Map();
  fsSnap.docs.forEach((d) => {
    const e = String(d.data()?.email || '').trim().toLowerCase();
    if (!e) return;
    const prev = fsByEmail.get(e) || {};
    fsByEmail.set(e, { ...prev, ...d.data() });
  });

  let repaired = 0;
  let pageToken;

  do {
    const list = await getAuth().listUsers(1000, pageToken);
    for (const authUser of list.users) {
      const email = String(authUser.email || '').trim().toLowerCase();
      if (!email) continue;

      const uid = authUser.uid;
      const legacy = fsByEmail.get(email) || {};
      const local = localByEmail.get(email) || {};

      const roles = local.roles || legacy.roles
        || (legacy.role ? [legacy.role] : ['biller']);
      const primaryRole = local.primaryRole || legacy.primaryRole
        || legacy.role || roles[0] || 'biller';

      const profile = {
        ...legacy,
        ...local,
        uid,
        email,
        name: local.name || legacy.name || authUser.displayName || email.split('@')[0],
        roles: Array.isArray(roles) ? roles : [roles],
        role: primaryRole,
        primaryRole,
        userCode: local.userCode || legacy.userCode || '',
        storeIds: local.storeIds || legacy.storeIds || [],
        storeId: local.storeId || legacy.storeId || local.primaryStore || legacy.primaryStore || '',
        primaryStore: local.primaryStore || legacy.primaryStore || local.storeId || legacy.storeId || '',
        permissions: local.permissions || legacy.permissions || {},
        isActive: local.isActive !== false && legacy.isActive !== false,
        isDeleted: false,
        updatedAt: FieldValue.serverTimestamp(),
        _repairedAt: FieldValue.serverTimestamp(),
      };

      await db.collection('users').doc(uid).set(profile, { merge: true });
      repaired += 1;
    }
    pageToken = list.pageToken;
  } while (pageToken);

  return { success: true, repaired };
});

const PAID_KEYS_MAX = 2500;
const PAID_KEYS_WARN_BYTES = 800_000;

/**
 * Nightly trim of stores/*/meta/cashierPaidKeys — prevents 1MB Firestore doc overflow.
 * Schedule: 12:00 AM PKT (19:00 UTC).
 */
exports.trimCashierPaidKeysNightly = onSchedule({
  schedule: '0 19 * * *',
  timeZone: 'Asia/Karachi',
  region: 'us-central1',
}, async () => {
  const storesSnap = await db.collection('stores').limit(200).get();
  let trimmed = 0;
  for (const storeDoc of storesSnap.docs) {
    const ref = storeDoc.ref.collection('meta').doc('cashierPaidKeys');
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const serials = Array.isArray(data.serials) ? data.serials : [];
    const billIds = Array.isArray(data.billIds) ? data.billIds : [];
    const approxBytes = Buffer.byteLength(JSON.stringify({ serials, billIds }), 'utf8');
    if (approxBytes < PAID_KEYS_WARN_BYTES && serials.length <= PAID_KEYS_MAX && billIds.length <= PAID_KEYS_MAX) {
      continue;
    }
    await ref.set({
      serials: serials.slice(-PAID_KEYS_MAX),
      billIds: billIds.slice(-PAID_KEYS_MAX),
      trimmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    trimmed += 1;
  }
  console.log(`[trimCashierPaidKeysNightly] trimmed ${trimmed} store doc(s)`);
});
