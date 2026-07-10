import { useCallback, useMemo } from 'react';
import useEmailVerification from './useEmailVerification';

export default function useEmailOtpVerification() {
  const { sendOtp, verifyOtp, OTP_CONFIG } = useEmailVerification();

  return useMemo(() => ({
    sendOtp,
    verifyOtp,
    OTP_CONFIG,
    provider: 'firebase-mail',
    clerkEnabled: false,
    clerkReady: true,
  }), [sendOtp, verifyOtp, OTP_CONFIG]);
}
