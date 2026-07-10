// Backup / export / import / archive — in-app notifications (Roman Urdu messages)

import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from './firebase';
import { db as firestoreDb, isFirebaseReady } from './firebase';
import { backupMiniToast } from '../utils/backupRomanUrdu';

export const BACKUP_NOTIFICATIONS_COL = 'backup_notifications';

export const BACKUP_EVENTS = {
  EXPORT_STARTED: 'export_started',
  EXPORT_DONE: 'export_done',
  EXPORT_FAIL: 'export_fail',
  RESTORE_STARTED: 'restore_started',
  RESTORE_DONE: 'restore_done',
  ARCHIVE_DONE: 'archive_done',
  MIGRATION_EXPORT: 'migration_export',
  MIGRATION_CONFIRM: 'migration_confirm',
};

const EVENT_MESSAGES = {
  export_started: 'Export shuru ho rahi hai…',
  export_done: 'Export mukammal ✓ — file PC par save',
  export_fail: 'Export fail — dubara try karo',
  restore_started: 'Restore shuru…',
  restore_done: 'Restore mukammal ✓',
  archive_done: 'Archive (Dustbin) mein save — wahan Restore karo',
  migration_export: 'Migration JSON tayyar — Business Hub import karo',
  migration_confirm: 'Migration verify ho gaya — ab manual delete/archive',
};

/** Save notification + show toast */
export const notifyBackupEvent = async ({
  event,
  title = '',
  message = '',
  module = '',
  userId = '',
  userEmail = '',
  meta = {},
} = {}) => {
  const body = message || EVENT_MESSAGES[event] || event;
  const heading = title || body;

  backupMiniToast.success(body);

  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) return { ok: true, local: true };

  try {
    await addDoc(collection(firestoreDb, BACKUP_NOTIFICATIONS_COL), {
      event,
      title: heading,
      message: body,
      module: module || null,
      userId: userId || null,
      userEmail: userEmail || null,
      meta,
      read: false,
      createdAt: new Date().toISOString(),
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[backupNotification]', e?.message);
  }

  return { ok: true };
};

export const listBackupNotifications = async (max = 20) => {
  if (!isFirebaseReady() || !firestoreDb || !navigator.onLine) return [];
  try {
    const snap = await getDocs(query(
      collection(firestoreDb, BACKUP_NOTIFICATIONS_COL),
      orderBy('timestamp', 'desc'),
      limit(max),
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(query(collection(firestoreDb, BACKUP_NOTIFICATIONS_COL), limit(max)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
};

export default { notifyBackupEvent, listBackupNotifications, BACKUP_EVENTS };
