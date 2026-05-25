// src/services/firebaseUserService.js
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

/**
 * Calls the Firebase Cloud Function to delete a user from Firebase Authentication
 * 
 * NOTE: The Cloud Function 'deleteUserAccount' MUST be deployed for this to work.
 * Example implementation in functions/index.js:
 * 
 * exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
 *   if (!context.auth) throw new functions.https.HttpsError('unauthenticated');
 *   await admin.auth().deleteUser(data.uid);
 *   return { success: true };
 * });
 */
export const deleteUserAccount = async (uid) => {
    try {
        const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION;
        const functions = region ? getFunctions(app, region) : getFunctions(app);
        const deleteFn = httpsCallable(functions, 'deleteUserAccount');
        const result = await deleteFn({ uid });
        return result.data;
    } catch (err) {
        console.error('[firebaseUserService] deleteUserAccount error:', err);
        const message = err?.message || 'Failed to delete auth user';
        const error = new Error(message);
        error.code = err?.code;
        throw error;
    }
};
