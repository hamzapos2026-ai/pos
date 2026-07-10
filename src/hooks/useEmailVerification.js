import { useCallback, useMemo } from 'react';
import {
  sendEmailOtp,
  verifyEmailOtp,
  OTP_CONFIG,
} from '../services/emailVerificationService';

/** Firebase Trigger Email OTP — instant 6-digit code, no Clerk. */
export default function useEmailVerification() {
  const sendOtp = useCallback(
    (email, options = {}) => sendEmailOtp(email, options),
    [],
  );

  const verifyOtp = useCallback(
    (email, code) => verifyEmailOtp(email, code),
    [],
  );

  return useMemo(() => ({
    sendOtp,
    verifyOtp,
    OTP_CONFIG,
  }), [sendOtp, verifyOtp]);
}
