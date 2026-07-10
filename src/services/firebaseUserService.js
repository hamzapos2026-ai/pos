// Firebase Auth admin operations — Cloud Functions (Blaze plan, optional).



import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from './firebase';



const LS_KEY = 'aone_auth_delete_unavailable';

const LS_REPAIR_KEY = 'aone_profile_repair_unavailable';



const authDeleteDisabledInEnv = () => {

  const flag = import.meta.env.VITE_AUTH_DELETE_ENABLED;

  return flag === 'false' || flag === '0';

};



const markAuthDeleteUnavailable = () => {

  try { sessionStorage.setItem(LS_KEY, '1'); } catch { /* ignore */ }

};



const markRepairUnavailable = () => {

  try { localStorage.setItem(LS_REPAIR_KEY, '1'); } catch { /* ignore */ }

};



export const isAuthDeleteUnavailable = () => {

  if (authDeleteDisabledInEnv()) return true;

  try { return sessionStorage.getItem(LS_KEY) === '1'; } catch { return false; }

};



export const isProfileRepairUnavailable = () => {

  try { return localStorage.getItem(LS_REPAIR_KEY) === '1'; } catch { return false; }

};



export const resetProfileRepairUnavailable = () => {

  try { localStorage.removeItem(LS_REPAIR_KEY); } catch { /* ignore */ }

};



const getCallable = (name) => {

  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

  const functions = getFunctions(app, region);

  return httpsCallable(functions, name);

};



const isFunctionsUnavailable = (err) => {

  const code = err?.code || '';

  const msg = err?.message || '';

  return code === 'functions/not-found'

    || code === 'functions/unavailable'

    || /internal|cors|failed to fetch|blaze|pay-as-you-go|billing|network|preflight|access-control/i.test(msg);

};



/**

 * Delete Firebase Auth user via Cloud Function.

 */

export const deleteUserAccount = async (uid) => {

  if (!uid || authDeleteDisabledInEnv() || isAuthDeleteUnavailable()) {

    return {

      success: false,

      skipped: true,

      reason: 'spark_or_disabled',

      message: 'Auth delete requires Blaze plan + deployed Cloud Function',

    };

  }



  try {

    const result = await getCallable('deleteUserAccount')({ uid });

    return { success: true, ...(result.data || {}) };

  } catch (err) {

    if (isFunctionsUnavailable(err)) {

      markAuthDeleteUnavailable();

      return {

        success: false,

        skipped: true,

        reason: 'functions_not_deployed',

        message:

          'Cloud Function not deployed (Firebase Blaze plan required). '

          + 'User removed from POS — delete login from Firebase Console > Authentication if needed.',

      };

    }



    console.error('[firebaseUserService] deleteUserAccount error:', err);

    const error = new Error(err?.message || 'Failed to delete auth user');

    error.code = err?.code;

    throw error;

  }

};



/** Repair signed-in user's Firestore profile (server-side, optional). */

export const ensureUserProfileCloud = async (profile = {}) => {

  if (isProfileRepairUnavailable()) return { success: false, skipped: true };



  try {

    const result = await getCallable('ensureUserProfile')({ profile });

    return { success: true, ...(result.data || {}) };

  } catch (err) {

    if (isFunctionsUnavailable(err)) {

      markRepairUnavailable();

      return { success: false, skipped: true, reason: 'functions_not_deployed' };

    }

    console.warn('[firebaseUserService] ensureUserProfile:', err?.message);

    return { success: false, error: err?.message };

  }

};



/** Super Admin — repair ALL Auth users → users/{authUid} (optional cloud bonus). */

export const repairAllUserProfilesCloud = async (profiles = []) => {

  if (isProfileRepairUnavailable()) {

    return { success: false, skipped: true, reason: 'functions_not_deployed' };

  }



  try {

    const result = await getCallable('repairAllUserProfiles')({ profiles });

    return { success: true, ...(result.data || {}) };

  } catch (err) {

    if (isFunctionsUnavailable(err)) {

      markRepairUnavailable();

      return { success: false, skipped: true, reason: 'functions_not_deployed' };

    }

    console.warn('[firebaseUserService] repairAllUserProfiles:', err?.message);

    return { success: false, skipped: true, error: err?.message };

  }

};



export default {

  deleteUserAccount,

  ensureUserProfileCloud,

  repairAllUserProfilesCloud,

  isAuthDeleteUnavailable,

  isProfileRepairUnavailable,

  resetProfileRepairUnavailable,

};


