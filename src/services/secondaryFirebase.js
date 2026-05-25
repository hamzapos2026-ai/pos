// src/services/secondaryFirebase.js
// ✅ MASTER PROMPT §10: Secondary Firebase app
// ✅ Admin stays logged in when creating new users
// ✅ HMR safe — checks existing apps before init
// ✅ Memory safe — disposes after use
// ✅ Error codes handled properly

import { initializeApp, getApps, deleteApp } from 'firebase/app';
import {
    getAuth,
    createUserWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
    signOut,
} from 'firebase/auth';

// ── Config (same as primary, different instance) ────────────
const FIREBASE_CONFIG = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const SECONDARY_APP_NAME = 'aone-secondary';

// ── Get or create secondary app ──────────────────────────────
const _getSecondaryApp = () => {
    const existing = getApps().find(a => a.name === SECONDARY_APP_NAME);
    return existing || initializeApp(FIREBASE_CONFIG, SECONDARY_APP_NAME);
};

// ── Dispose after use (memory safe) ─────────────────────────
const _disposeSecondary = async () => {
    try {
        const app = getApps().find(a => a.name === SECONDARY_APP_NAME);
        if (app) {
            const auth = getAuth(app);
            await signOut(auth).catch(() => { });
            await deleteApp(app);
        }
    } catch (err) {
        console.warn('[secondary] dispose failed:', err?.message);
    }
};

// ══════════════════════════════════════════════════════════════
// CREATE AUTH USER
// ✅ Admin stays logged in (secondary instance)
// ✅ Sets displayName before signing out
// ✅ Disposes secondary app after use
// ✅ Proper error code handling
// ══════════════════════════════════════════════════════════════
export const createAuthUser = async (email, password, displayName = '') => {
    let secondaryApp = null;

    try {
        secondaryApp = _getSecondaryApp();
        const auth = getAuth(secondaryApp);

        // Create user in Firebase Auth
        const credential = await createUserWithEmailAndPassword(
            auth, email.trim().toLowerCase(), password
        );

        // Set displayName BEFORE signing out
        if (displayName?.trim()) {
            try {
                await updateProfile(credential.user, {
                    displayName: displayName.trim(),
                });
            } catch (profileErr) {
                // Non-fatal — user created, just profile update failed
                console.warn('[secondary] updateProfile failed:', profileErr?.message);
            }
        }

        // Sign out from secondary (admin primary unaffected)
        await signOut(auth);

        return {
            uid: credential.user.uid,
            email: credential.user.email,
            displayName: credential.user.displayName,
        };

    } catch (err) {
        // Map Firebase error codes to user-friendly messages
        const CODE_MAP = {
            'auth/email-already-in-use': 'Email already registered. Use a different email.',
            'auth/invalid-email': 'Invalid email format.',
            'auth/weak-password': 'Password too weak. Use at least 8 characters.',
            'auth/network-request-failed': 'Network error. Check internet connection.',
            'auth/too-many-requests': 'Too many attempts. Wait a moment and retry.',
            'auth/operation-not-allowed': 'Email/password auth is disabled in Firebase.',
        };

        const message = CODE_MAP[err?.code] || err?.message || 'Firebase Auth failed';
        const error = new Error(message);
        error.code = err?.code;
        throw error;

    } finally {
        // Always dispose secondary app (memory safe)
        await _disposeSecondary();
    }
};

// ══════════════════════════════════════════════════════════════
// SEND WELCOME / PASSWORD RESET EMAIL
// ✅ Uses secondary auth — no admin logout risk
// ══════════════════════════════════════════════════════════════
export const sendWelcomeEmail = async (email) => {
    let secondaryApp = null;

    try {
        secondaryApp = _getSecondaryApp();
        const auth = getAuth(secondaryApp);

        await sendPasswordResetEmail(auth, email.trim().toLowerCase());
        return true;

    } catch (err) {
        console.warn('[secondary] sendWelcomeEmail failed:', err?.message);
        return false;

    } finally {
        await _disposeSecondary();
    }
};