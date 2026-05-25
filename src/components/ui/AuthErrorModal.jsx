// File: aone-jewelry-pos/src/components/ui/AuthErrorModal.jsx
// Modern animated error modal for Firebase authentication errors

import { memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  X,
  RefreshCw,
  Mail,
  Lock,
  Shield,
  Wifi,
  WifiOff,
  CheckCircle,
  Info
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import Button from './Button';

/**
 * Utility function to merge class names
 */
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Get user-friendly error message and guidance for Firebase auth errors
 */
const extractAuthErrorCode = (message) => {
  if (typeof message !== 'string') return null;
  const match = message.match(/(auth\/[a-zA-Z0-9-]+)/);
  return match?.[1] || null;
};

const getAuthErrorDetails = (error, isOnline) => {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || String(error || 'An unexpected error occurred during authentication.');

  const errorCode =
    (typeof error === 'object' && error?.code) ||
    extractAuthErrorCode(message) ||
    'unknown';

  const errors = {
    'auth/invalid-credential': {
      title: 'Invalid Credentials',
      message: 'The email or password you entered is incorrect.',
      guidance: [
        'Double-check your email address',
        'Ensure your password is correct',
        'Make sure you\'re using the right account',
        'Contact your system administrator for password help'
      ],
      icon: Lock,
      severity: 'error',
      action: 'retry'
    },
    'auth/user-not-found': {
      title: 'Account Not Found',
      message: 'No account exists with this email address.',
      guidance: [
        'Verify the email address is correct',
        'Check for typos in your email',
        'Contact your administrator if you believe this is an error',
        'Make sure you\'re using the email associated with your account'
      ],
      icon: Mail,
      severity: 'warning',
      action: 'contact'
    },
    'auth/wrong-password': {
      title: 'Incorrect Password',
      message: 'The password you entered is incorrect.',
      guidance: [
        'Check your password for typos',
        'Contact your system administrator to reset your password',
        'Make sure Caps Lock is not on',
        'Try using a different device if issues persist'
      ],
      icon: Lock,
      severity: 'error',
      action: 'reset'
    },
    'auth/too-many-requests': {
      title: 'Too Many Attempts',
      message: 'Too many failed login attempts. Please try again later.',
      guidance: [
        'Wait a few minutes before trying again',
        'Make sure you\'re entering the correct credentials',
        'Contact support or your super-admin if you\'re locked out',
        'Request a password reset from your administrator'
      ],
      icon: Shield,
      severity: 'warning',
      action: 'wait'
    },
    'auth/network-request-failed': {
      title: 'Connection Problem',
      message: 'Unable to connect to the server. Please check your internet connection.',
      guidance: [
        'Check your internet connection',
        'Try refreshing the page',
        'Wait for your connection to stabilize',
        'Contact IT support if the problem persists'
      ],
      icon: isOnline ? WifiOff : Wifi,
      severity: 'info',
      action: 'retry'
    },
    'auth/user-disabled': {
      title: 'Account Disabled',
      message: 'Your account has been disabled by an administrator.',
      guidance: [
        'Contact your administrator',
        'Check your email for any notifications',
        'Verify your account status',
        'Contact IT or support for assistance'
      ],
      icon: AlertTriangle,
      severity: 'error',
      action: 'contact'
    },
    'auth/operation-not-allowed': {
      title: 'Service Unavailable',
      message: 'This authentication method is currently disabled.',
      guidance: [
        'Try again in a few minutes',
        'Contact technical support',
        'Use an alternative login method if available',
        'Check system status notifications'
      ],
      icon: AlertTriangle,
      severity: 'warning',
      action: 'contact'
    },
    'auth/invalid-email': {
      title: 'Invalid Email Format',
      message: 'Please enter a valid email address.',
      guidance: [
        'Check for typos in your email address',
        'Make sure the email format is correct (user@domain.com)',
        'Remove any extra spaces',
        'Use the email associated with your account'
      ],
      icon: Mail,
      severity: 'warning',
      action: 'fix'
    },
    'auth/email-already-in-use': {
      title: 'Email Already Registered',
      message: 'This email is already in use. Please use a different email or sign in.',
      guidance: [
        'Try signing in instead',
        'Use a different email address',
        'Contact support if you think this is a mistake',
        'Reset your password if needed'
      ],
      icon: Mail,
      severity: 'warning',
      action: 'contact'
    },
    'auth/weak-password': {
      title: 'Weak Password',
      message: 'Your password is too weak. Use at least 8 characters and a mix of letters and numbers.',
      guidance: [
        'Use 8+ characters',
        'Add both letters and numbers',
        'Avoid common words or patterns',
        'Try a stronger password and try again'
      ],
      icon: Lock,
      severity: 'warning',
      action: 'fix'
    }
  };

  const defaultDetails = {
    title: 'Authentication Error',
    message,
    guidance: [
      'Try again in a few moments',
      'Check your internet connection',
      'Confirm your email and password are correct',
      'Contact support if the problem persists'
    ],
    icon: AlertTriangle,
    severity: 'error',
    action: 'retry'
  };

  if (errors[errorCode]) {
    return errors[errorCode];
  }

  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('user account not found')) {
    return {
      title: 'Account Not Found',
      message: 'No account exists with this email address.',
      guidance: [
        'Verify the email address is correct',
        'Check for typos in your email',
        'Contact your administrator if you believe this is an error',
        'Use the email associated with your account'
      ],
      icon: Mail,
      severity: 'warning',
      action: 'contact'
    };
  }

  if (lowerMessage.includes('you do not have')) {
    return {
      title: 'Role Not Assigned',
      message: message,
      guidance: [
        'Check that you selected the correct role',
        'Contact your administrator to verify your access',
        'Try signing in with a different role if available',
        'Request role updates from support'
      ],
      icon: Shield,
      severity: 'warning',
      action: 'contact'
    };
  }

  if (lowerMessage.includes('firebase not configured')) {
    return {
      title: 'Authentication Configuration Error',
      message: 'The authentication service is not configured correctly.',
      guidance: [
        'Check the Firebase setup',
        'Reload the page and try again',
        'Contact your administrator',
        'Verify environment settings'
      ],
      icon: AlertTriangle,
      severity: 'error',
      action: 'contact'
    };
  }

  if (lowerMessage.includes('network')) {
    return {
      title: 'Connection Problem',
      message: 'Unable to connect to the server. Please check your internet connection.',
      guidance: [
        'Check your network connection',
        'Try refreshing the page',
        'Wait for connectivity to return',
        'Try again once you are online'
      ],
      icon: isOnline ? WifiOff : Wifi,
      severity: 'info',
      action: 'retry'
    };
  }

  return defaultDetails;
};

/**
 * AuthErrorModal component for displaying Firebase auth errors
 */
const AuthErrorModal = memo(({
  isOpen,
  onClose,
  error,
  onRetry,
  onResetPassword,
  onContactSupport,
  className,
}) => {
  const { isDark } = useTheme();
  const { isOnline } = useNetwork();

  // Extract error code from Firebase error
  const errorCode = error?.code || error?.message?.split('(')[1]?.split(')')[0] || 'unknown';
  const errorDetails = getAuthErrorDetails(errorCode, isOnline);

  const Icon = errorDetails.icon;

  // Auto-close after 10 seconds for non-critical errors
  useEffect(() => {
    if (isOpen && errorDetails.severity === 'info') {
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, errorDetails.severity, onClose]);

  const getSeverityStyles = (severity) => {
    switch (severity) {
      case 'error':
        return {
          bg: isDark ? 'bg-red-900/20' : 'bg-red-50',
          border: 'border-red-500/20',
          icon: 'text-red-500',
          title: 'text-red-700 dark:text-red-400',
          button: 'bg-red-500 hover:bg-red-600'
        };
      case 'warning':
        return {
          bg: isDark ? 'bg-amber-900/20' : 'bg-amber-50',
          border: 'border-amber-500/20',
          icon: 'text-amber-500',
          title: 'text-amber-700 dark:text-amber-400',
          button: 'bg-amber-500 hover:bg-amber-600'
        };
      case 'info':
        return {
          bg: isDark ? 'bg-blue-900/20' : 'bg-blue-50',
          border: 'border-blue-500/20',
          icon: 'text-blue-500',
          title: 'text-blue-700 dark:text-blue-400',
          button: 'bg-blue-500 hover:bg-blue-600'
        };
      default:
        return {
          bg: isDark ? 'bg-gray-900/20' : 'bg-gray-50',
          border: 'border-gray-500/20',
          icon: 'text-gray-500',
          title: 'text-gray-700 dark:text-gray-400',
          button: 'bg-gray-500 hover:bg-gray-600'
        };
    }
  };

  const styles = getSeverityStyles(errorDetails.severity);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
              duration: 0.3
            }}
            className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className={cn(
                'relative w-full max-w-md pointer-events-auto',
                'rounded-2xl shadow-2xl overflow-hidden',
                styles.bg,
                styles.border,
                'border',
                className
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4">
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-center gap-3"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-full',
                      styles.icon,
                      isDark ? 'bg-white/10' : 'bg-white/20'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </motion.div>
                  <h2 className={cn('text-lg font-semibold', styles.title)}>
                    {errorDetails.title}
                  </h2>
                </motion.div>

                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 }}
                  onClick={onClose}
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full',
                    'hover:bg-black/10 dark:hover:bg-white/10',
                    'transition-colors duration-200'
                  )}
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Content */}
              <div className="px-6 pb-6">
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className={cn(
                    'text-sm mb-4',
                    isDark ? 'text-gray-300' : 'text-gray-600'
                  )}
                >
                  {errorDetails.message}
                </motion.p>

                {/* Guidance */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mb-6"
                >
                  <h3 className={cn(
                    'text-sm font-medium mb-2 flex items-center gap-2',
                    isDark ? 'text-gray-200' : 'text-gray-700'
                  )}>
                    <Info className="w-4 h-4" />
                    What you can do:
                  </h3>
                  <ul className="space-y-1">
                    {errorDetails.guidance.map((item, index) => (
                      <motion.li
                        key={index}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.4 + index * 0.1 }}
                        className={cn(
                          'text-sm flex items-start gap-2',
                          isDark ? 'text-gray-300' : 'text-gray-600'
                        )}
                      >
                        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                {/* Actions */}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-col gap-3"
                >
                  {errorDetails.action === 'retry' && (
                    <Button
                      onClick={() => {
                        onClose();
                        onRetry?.();
                      }}
                      variant="primary"
                      fullWidth
                      className={styles.button}
                      leftIcon={<RefreshCw className="w-4 h-4" />}
                    >
                      Try Again
                    </Button>
                  )}

                  {errorDetails.action === 'reset' && (
                    <Button
                      onClick={() => {
                        onClose();
                        onResetPassword?.();
                      }}
                      variant="primary"
                      fullWidth
                      className={styles.button}
                      leftIcon={<Lock className="w-4 h-4" />}
                    >
                      Reset Password
                    </Button>
                  )}

                  {errorDetails.action === 'contact' && (
                    <Button
                      onClick={() => {
                        onClose();
                        onContactSupport?.();
                      }}
                      variant="primary"
                      fullWidth
                      className={styles.button}
                      leftIcon={<Mail className="w-4 h-4" />}
                    >
                      Contact Support
                    </Button>
                  )}

                  <Button
                    onClick={onClose}
                    variant="ghost"
                    fullWidth
                  >
                    Close
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

AuthErrorModal.displayName = 'AuthErrorModal';

export default AuthErrorModal;