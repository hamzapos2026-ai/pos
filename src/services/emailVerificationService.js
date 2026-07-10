// Email OTP for user-create — Firebase Trigger Email (instant, no Clerk).

import sha256 from 'js-sha256';
import {
  doc, setDoc, getDoc, deleteDoc, addDoc, collection, serverTimestamp,
} from './firebase';
import { db, isFirebaseReady } from './firebase';

const OTP_COLLECTION = 'user_email_otps';
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 10 * 1000;
const VERIFIED_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const OTP_SALT = 'aone_email_otp_v2';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const emailDocId = (email) =>
  normalizeEmail(email).replace(/[@.]/g, '_');

const hashOtp = (email, code) =>
  sha256(`${OTP_SALT}:${normalizeEmail(email)}:${code}`);

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const queueOtpEmail = async (email, otp, userName = '') => {
  if (!isFirebaseReady() || !db) return { queued: false, reason: 'offline' };

  try {
    await addDoc(collection(db, 'mail'), {
      to: normalizeEmail(email),
      message: {
        subject: 'A One Jewelry POS — Verification Code',
        text: [
          `Hello${userName ? ` ${userName}` : ''},`,
          '',
          `Your verification code is: ${otp}`,
          '',
          'Valid for 5 minutes. Do not share this code.',
        ].join('\n'),
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#b45309;margin:0 0 12px">A One Jewelry POS</h2>
            <p>Hello${userName ? ` <strong>${userName}</strong>` : ''},</p>
            <p>Your email verification code:</p>
            <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#111;margin:20px 0">${otp}</p>
            <p style="color:#666;font-size:13px">Expires in 5 minutes.</p>
          </div>
        `.trim(),
      },
      createdAt: serverTimestamp(),
    });
    return { queued: true };
  } catch (err) {
    const reason = /permission|insufficient/i.test(err?.message || '')
      ? 'permission-denied'
      : (err?.message || 'mail_failed');
    console.warn('[emailOtp] mail queue failed:', reason);
    return { queued: false, reason };
  }
};

/** Send 6-digit code via Trigger Email — mail + Firestore in parallel for speed. */
export const sendEmailOtp = async (email, { createdByUid, userName = '' } = {}) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return { success: false, error: 'Email is required' };
  if (!isFirebaseReady() || !db) {
    return { success: false, error: 'Firebase not ready — connect to internet' };
  }
  if (!navigator.onLine) {
    return { success: false, error: 'You must be online to send OTP' };
  }

  const ref = doc(db, OTP_COLLECTION, emailDocId(normalized));

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data();
      const lastSent = data.lastSentAt?.toMillis?.() || data.lastSentAt || 0;
      if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
        return { success: false, error: `Wait ${waitSec}s before resending`, resendInSec: waitSec };
      }
    }
  } catch { /* proceed — cooldown is best-effort */ }

  const otp = generateOtp();
  const now = Date.now();
  const expiresAt = now + OTP_TTL_MS;

  try {
    const [, mail] = await Promise.all([
      setDoc(ref, {
        email: normalized,
        otpHash: hashOtp(normalized, otp),
        expiresAt,
        verified: false,
        verifiedAt: null,
        attempts: 0,
        lastSentAt: now,
        createdBy: createdByUid || '',
        userName: userName || '',
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      queueOtpEmail(normalized, otp, userName),
    ]);

    if (!mail.queued) {
      const isPerm = mail.reason === 'permission-denied';
      if (import.meta.env.DEV) {
        console.info(`[emailOtp DEV] ${normalized} → ${otp}`);
        return {
          success: true,
          expiresAt,
          resendAvailableAt: now + RESEND_COOLDOWN_MS,
          mailQueued: false,
          devOtp: otp,
        };
      }
      return {
        success: false,
        error: isPerm
          ? 'Missing permissions — deploy: firebase deploy --only firestore:rules'
          : `Could not send email${mail.reason ? `: ${mail.reason}` : ''}`,
      };
    }

    return {
      success: true,
      expiresAt,
      resendAvailableAt: now + RESEND_COOLDOWN_MS,
      mailQueued: true,
    };
  } catch (err) {
    const msg = err?.message || String(err);
    if (import.meta.env.DEV) {
      console.info(`[emailOtp DEV fallback] ${normalized} → ${otp}`);
      return { success: true, expiresAt, resendAvailableAt: now + RESEND_COOLDOWN_MS, devOtp: otp };
    }
    return {
      success: false,
      error: /permission|insufficient/i.test(msg)
        ? 'Missing permissions — deploy: firebase deploy --only firestore:rules'
        : msg,
    };
  }
};

/** Verify 6-digit code typed in UserForm. */
export const verifyEmailOtp = async (email, code) => {
  const normalized = normalizeEmail(email);
  const otp = String(code || '').replace(/\D/g, '');

  if (!normalized || otp.length !== 6) {
    return { success: false, error: 'Enter the 6-digit code from email' };
  }
  if (!isFirebaseReady() || !db) {
    return { success: false, error: 'Firebase not ready' };
  }

  const ref = doc(db, OTP_COLLECTION, emailDocId(normalized));
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return { success: false, error: 'No OTP sent — click Send OTP first' };
  }

  const data = snap.data();

  if (data.verified && data.verifiedAt) {
    if (Date.now() - data.verifiedAt < VERIFIED_TTL_MS) {
      return { success: true, alreadyVerified: true };
    }
  }

  if (Date.now() > (data.expiresAt || 0)) {
    return { success: false, error: 'Code expired — click Resend OTP' };
  }

  const attempts = Number(data.attempts || 0) + 1;
  if (attempts > MAX_ATTEMPTS) {
    return { success: false, error: 'Too many wrong attempts — resend OTP' };
  }

  if (hashOtp(normalized, otp) !== data.otpHash) {
    await setDoc(ref, { attempts, updatedAt: serverTimestamp() }, { merge: true });
    return {
      success: false,
      error: `Wrong code — ${MAX_ATTEMPTS - attempts} attempt(s) left`,
      attemptsLeft: MAX_ATTEMPTS - attempts,
    };
  }

  const verifiedAt = Date.now();
  await setDoc(ref, {
    verified: true,
    verifiedAt,
    attempts,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { success: true, verifiedAt };
};

/** Gate before createUser. */
export const assertEmailVerified = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !isFirebaseReady() || !db) {
    return { ok: false, error: 'Email OTP verification required' };
  }

  const ref = doc(db, OTP_COLLECTION, emailDocId(normalized));
  const snap = await getDoc(ref);

  if (!snap.exists() || !snap.data()?.verified) {
    return { ok: false, error: 'Verify email with OTP before creating account' };
  }

  const verifiedAt = snap.data()?.verifiedAt || 0;
  if (Date.now() - verifiedAt > VERIFIED_TTL_MS) {
    return { ok: false, error: 'OTP verification expired — verify again' };
  }

  return { ok: true };
};

export const clearEmailVerification = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !db) return;
  try {
    await deleteDoc(doc(db, OTP_COLLECTION, emailDocId(normalized)));
  } catch { /* ignore */ }
};

export const OTP_CONFIG = {
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  VERIFIED_TTL_MS,
};

export const VERIFY_CONFIG = OTP_CONFIG;
export const assertEmailOtpVerified = assertEmailVerified;
export const clearEmailOtp = clearEmailVerification;
export const sendEmailVerificationLink = sendEmailOtp;

export default {
  sendEmailOtp,
  verifyEmailOtp,
  assertEmailVerified,
  clearEmailVerification,
  OTP_CONFIG,
};
