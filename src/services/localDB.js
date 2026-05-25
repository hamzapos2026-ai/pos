import Dexie from 'dexie';

const db = new Dexie('aone_local_db_v1');

db.version(1).stores({
  users: 'uid, email, cachedAt, deviceId',
  bills: 'id, createdAt, status, storeId',
  settings: 'key, updatedAt',
  syncQueue: '++id, opId, type, createdAt, status'
});

export default db;

export const putUser = async (user) => db.users.put(user);
export const getUserByEmail = async (email) => db.users.where('email').equals(email).first();
export const putSetting = async (key, value) => db.settings.put({key, value, updatedAt: Date.now()});
export const getAllSettings = async () => db.settings.toArray();
export const enqueueSync = async (op) => db.syncQueue.add(op);
export const getSyncQueue = async () => db.syncQueue.toArray();
