/**

 * Super Admin — Firestore health scan, Spark quota estimates, alerts.

 */



import {

  collection, getCountFromServer, query, db, isFirebaseReady,

} from './firebase';

import { getUsageStats, getEstimatedReadBreakdown } from '../utils/firebaseUsageTelemetry';

import { HEALTH_SCAN_CACHE_MS } from '../utils/firebaseQuotaConfig';



/** Firebase Spark approximate daily limits (June 2026 reference). */

export const SPARK_LIMITS = {

  readsPerDay: 50_000,

  writesPerDay: 20_000,

  deletesPerDay: 20_000,

  storageBytes: 1 * 1024 * 1024 * 1024,

};



const COLLECTION_EST_BYTES = {

  orders: 4200,

  payments: 1800,

  users: 1200,

  customers: 900,

  activityLogs: 1100,

  stores: 800,

};



const SCAN_COLLECTIONS = [

  'orders', 'payments', 'users', 'customers',

  'activityLogs', 'stores',

];



let _scanCache = { at: 0, data: null };



export const pct = (value, limit) => {

  if (!limit) return 0;

  return Math.min(100, Math.round((value / limit) * 100));

};



export const formatBytes = (bytes) => {

  const n = Number(bytes) || 0;

  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;

  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;

  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;

  return `${n} B`;

};



/** Scan doc counts — getCountFromServer (1 read per collection). Cached 10 min. */

export const scanFirestoreCollections = async ({ force = false } = {}) => {

  if (!force && _scanCache.data && Date.now() - _scanCache.at < HEALTH_SCAN_CACHE_MS) {

    return { ..._scanCache.data, cached: true };

  }



  if (!isFirebaseReady() || !db) {

    return { collections: [], totalDocs: 0, estimatedBytes: 0, scannedAt: null };

  }



  const collections = [];

  let totalDocs = 0;

  let estimatedBytes = 0;



  await Promise.all(

    SCAN_COLLECTIONS.map(async (name) => {

      try {

        const snap = await getCountFromServer(query(collection(db, name)));

        const count = snap.data().count;

        const estBytes = count * (COLLECTION_EST_BYTES[name] || 1000);

        collections.push({ name, count, estBytes });

        totalDocs += count;

        estimatedBytes += estBytes;

      } catch {

        collections.push({ name, count: null, estBytes: 0, error: true });

      }

    }),

  );



  collections.sort((a, b) => (b.estBytes || 0) - (a.estBytes || 0));



  const result = {

    collections,

    totalDocs,

    estimatedBytes,

    scannedAt: new Date().toISOString(),

    readCost: SCAN_COLLECTIONS.length,

  };

  _scanCache = { at: Date.now(), data: result };

  return result;

};



export const buildHealthAlerts = ({ usage, scan, limits = SPARK_LIMITS }) => {

  const alerts = [];

  const todayReads = usage?.today?.reads || 0;

  const todayWrites = (usage?.today?.writes || 0) + (usage?.today?.deletes || 0);

  const storagePct = pct(scan?.estimatedBytes || 0, limits.storageBytes);

  const readsPct = pct(todayReads, limits.readsPerDay);

  const writesPct = pct(todayWrites, limits.writesPerDay);



  if (readsPct >= 90) {

    alerts.push({

      level: 'critical',

      title: 'Daily read quota almost full',

      message: `~${todayReads.toLocaleString()} reads today (${readsPct}% of Spark limit). Close extra admin tabs; avoid backup buttons repeatedly.`,

      action: 'optimize',

    });

  } else if (readsPct >= 70) {

    alerts.push({

      level: 'warning',

      title: 'Read usage elevated',

      message: `${readsPct}% of daily Spark reads used. Bills/Reports tabs band karo jab kaam na ho.`,

      action: 'monitor',

    });

  }



  if (writesPct >= 90) {

    alerts.push({

      level: 'critical',

      title: 'Daily write quota almost full',

      message: `~${todayWrites.toLocaleString()} writes/deletes today. Pause bulk sync until tomorrow.`,

      action: 'pause',

    });

  } else if (writesPct >= 70) {

    alerts.push({

      level: 'warning',

      title: 'Write usage elevated',

      message: `${writesPct}% of daily writes used.`,

      action: 'monitor',

    });

  }



  if (storagePct >= 85) {

    alerts.push({

      level: 'critical',

      title: 'Storage nearly full',

      message: `Estimated ${formatBytes(scan?.estimatedBytes)} (~${storagePct}% of 1 GB Spark). Take full backup, then archive old orders.`,

      action: 'backup_purge',

    });

  } else if (storagePct >= 65) {

    alerts.push({

      level: 'warning',

      title: 'Storage growing',

      message: 'Plan a monthly backup to PC + Google Drive and archive data older than 90 days.',

      action: 'backup',

    });

  }



  const orders = scan?.collections?.find((c) => c.name === 'orders');

  if (orders?.count > 5000) {

    alerts.push({

      level: 'info',

      title: 'Large orders collection',

      message: `${orders.count.toLocaleString()} orders in cloud. POS still works — archive keeps admin fast.`,

      action: 'archive',

    });

  }



  if (!alerts.length) {

    alerts.push({

      level: 'ok',

      title: 'All systems healthy',

      message: 'Firebase usage within safe range. Keep weekly backups to Google Drive.',

      action: null,

    });

  }



  return { alerts, readsPct, writesPct, storagePct };

};



export const getFirebaseHealthSnapshot = async ({ forceScan = false } = {}) => {

  const usage = getUsageStats();

  const readBreakdown = getEstimatedReadBreakdown();

  const scan = await scanFirestoreCollections({ force: forceScan });

  const { alerts, readsPct, writesPct, storagePct } = buildHealthAlerts({ usage, scan });

  return {

    usage,

    readBreakdown,

    scan,

    alerts,

    readsPct,

    writesPct,

    storagePct,

    limits: SPARK_LIMITS,

  };

};



export default {

  SPARK_LIMITS,

  scanFirestoreCollections,

  buildHealthAlerts,

  getFirebaseHealthSnapshot,

  formatBytes,

  pct,

};


