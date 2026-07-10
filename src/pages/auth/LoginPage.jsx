// src/pages/auth/LoginPage.jsx
// ✅ PRODUCTION FINAL - With Offline Login Support
// ✅ No more "Connection Problem" block
// ✅ Auto-detects offline mode
// ✅ Shows offline badge after login

import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff,
  ArrowRight,
  Shield,
  Wifi,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { toast } from '../../utils/toast';
import { resolveRoleHome, ROLE_HOME } from '../../utils/roleHome';
import { getLastLoginEmail, hasOfflineAccess } from '../../services/authService';
import { processQueue } from '../../services/syncService';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState(null);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasOfflineCache, setHasOfflineCache] = useState(false);

  const { signIn, isSetupComplete, isAuthenticated, userData, activeRole, hasPermission } = useAuth();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Network status ──
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Pre-fill last login email ──
  useEffect(() => {
    const lastEmail = getLastLoginEmail();
    if (lastEmail) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(prev => ({ ...prev, email: lastEmail }));
      // Check if user has offline cache
      hasOfflineAccess(lastEmail).then(setHasOfflineCache);
    }
  }, []);

  // ── Already logged in (returning session) — skip during form submit ──
  useEffect(() => {
    if (checkingSetup || !isAuthenticated || isSubmitting) return;
    const from = location.state?.from?.pathname;
    if (from && from !== '/login') {
      navigate(from, { replace: true });
      return;
    }
    if (!userData) return;
    navigate(resolveRoleHome({ userData, activeRole, hasPermission }), { replace: true });
  }, [checkingSetup, isAuthenticated, isSubmitting, userData, activeRole, hasPermission, location.state, navigate]);

  // ── Check setup ──
  useEffect(() => {
    let active = true;
    const checkSetup = async () => {
      const setupComplete = await isSetupComplete();
      if (!active) return;
      if (!setupComplete) {
        navigate('/setup', { replace: true });
      } else {
        setCheckingSetup(false);
      }
    };
    checkSetup();
    return () => { active = false; };
  }, [isSetupComplete, navigate]);

  // ── Check offline cache when email changes ──
  useEffect(() => {
    if (formData.email) {
      hasOfflineAccess(formData.email).then(setHasOfflineCache);
    } else {
      setHasOfflineCache(false);
    }
  }, [formData.email]);

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
    if (loginError) setLoginError(null);
  };

  const validateForm = () => {
    const newErrors = {};
    const identifier = String(formData.email || '').trim();

    if (!identifier) {
      newErrors.email = 'Email or username is required';
    } else if (identifier.includes('@') && !/\S+@\S+\.\S+/.test(identifier)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    if (!formData.role) {
      newErrors.role = 'Role selection is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setLoginError(null);

    try {
      const result = await signIn(formData.email, formData.password, formData.role);

      if (result.success) {
        // Show appropriate toast based on mode
        if (result.mode === 'offline') {
          toast.success('Logged in (Offline Mode)', { icon: '📡' });
        } else {
          toast.success(t('auth.loginSuccess', 'Login successful!'));
        }

        const fromPath = location.state?.from?.pathname;
        if (fromPath && fromPath !== '/login') {
          navigate(fromPath, { replace: true });
        } else {
          navigate(ROLE_HOME[formData.role] || '/biller', { replace: true });
        }
      } else {
        // Show inline error (NOT modal)
        setLoginError(result.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError({
        code: 'unknown',
        message: error.message || 'Login failed. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (checkingSetup) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      isDark ? 'bg-[#0a0805]' : 'bg-amber-50'
    }`}>
      {/* Background gradient */}
      <div className={`absolute inset-0 ${
        isDark 
          ? 'bg-gradient-to-br from-amber-900/20 via-transparent to-amber-900/10' 
          : 'bg-gradient-to-br from-amber-100/50 via-transparent to-amber-100/30'
      }`} />

      {/* Network status badge (top right) */}
      <div className="absolute top-4 right-4 z-10">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-semibold"
            >
              <WifiOff className="w-3.5 h-3.5" />
              Offline Mode
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`relative w-full max-w-md ${
          isDark
            ? 'bg-[#1a1208] border border-[#2a1f0d]'
            : 'bg-white border border-amber-200'
        } rounded-2xl shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/20 mb-4"
          >
            <Sparkles className="w-8 h-8 text-primary-500" />
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`text-2xl font-bold ${
              isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]'
            }`}
          >
            {t('auth.welcome', 'Welcome Back')}
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={`mt-2 text-sm ${
              isDark ? 'text-[#a8a29e]' : 'text-[#78716c]'
            }`}
          >
            {t('auth.signIn', 'Sign in to your account')}
          </motion.p>

          {/* Offline cache indicator */}
          {!isOnline && hasOfflineCache && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs"
            >
              <Shield className="w-3 h-3" />
              Offline login available for this email
            </motion.div>
          )}

          {!isOnline && !hasOfflineCache && formData.email && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs"
            >
              <AlertCircle className="w-3 h-3" />
              No offline cache - please login online first
            </motion.div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-6">
          <div className="space-y-4">
            {/* Role Selection */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="space-y-2">
                <label className={`block text-sm font-medium ${isDark ? 'text-[#e7e5e4]' : 'text-[#374151]'}`}>
                  {t('auth.selectRole', 'Select Role')}
                </label>
                <div className="relative">
                  <select
                    value={formData.role}
                    onChange={(e) => updateFormData('role', e.target.value)}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 ${
                      errors.role
                        ? 'border-red-500 focus:ring-red-500'
                        : isDark
                          ? 'border-[#3a352f] bg-[#2a241e] text-[#e7e5e4] focus:ring-primary-500'
                          : 'border-amber-300 bg-white text-[#374151] focus:ring-primary-500'
                    }`}
                    required
                  >
                    <option value="">{t('auth.selectRole', 'Select your role')}</option>
                    <option value="superAdmin">Super Admin</option>
                    <option value="manager">Manager</option>
                    <option value="biller">Biller</option>
                    <option value="cashier">Cashier</option>
                  </select>
                  <Shield className="absolute end-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                {errors.role && (
                  <p className="text-sm text-red-500">{errors.role}</p>
                )}
              </div>
            </motion.div>

            {/* Username or Email */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Input
                label={t('auth.emailOrUsername', 'Email or Username')}
                placeholder="you@example.com or USER123"
                type="text"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
                required
                autoComplete="username"
              />
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <Input
                label={t('auth.password', 'Password')}
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => updateFormData('password', e.target.value)}
                error={errors.password}
                leftIcon={<Lock className="w-4 h-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-dark-muted" />
                    ) : (
                      <Eye className="w-4 h-4 text-dark-muted" />
                    )}
                  </button>
                }
                required
                autoComplete="current-password"
              />
            </motion.div>

            {/* Inline error message */}
            <AnimatePresence>
              {loginError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{loginError.message}</p>
                    {loginError.code === 'OFFLINE_NO_CACHE' && (
                      <p className="text-xs mt-1 opacity-80">
                        Connect to internet and login once to enable offline access.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Submit Button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-6"
          >
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              disabled={isSubmitting}
              rightIcon={!isSubmitting && <ArrowRight className="w-4 h-4" />}
            >
              {isSubmitting 
                ? t('auth.signingIn', 'Signing in...') 
                : !isOnline
                  ? 'Sign In (Offline)'
                  : t('auth.signIn', 'Sign In')
              }
            </Button>
          </motion.div>

          {/* Links */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-4 text-center"
          >
            <Link
              to="/forgot-password"
              className={`text-sm ${
                isOnline
                  ? isDark 
                    ? 'text-primary-400 hover:text-primary-300' 
                    : 'text-primary-600 hover:text-primary-500'
                  : 'text-gray-500 cursor-not-allowed pointer-events-none'
              }`}
              onClick={(e) => {
                if (!isOnline) {
                  e.preventDefault();
                  toast.error('Internet required to reset password');
                }
              }}
            >
              {t('auth.forgotPassword', 'Forgot password?')}
            </Link>
          </motion.div>
        </form>

        {/* Footer */}
        <div className={`px-8 py-4 border-t ${
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200'
        }`}>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${
              isDark ? 'text-[#78716c]' : 'text-[#a8a29e]'
            }`}>
              {t('auth.copyright', '© 2026 A One Jewelry POS')}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-green-500" />
                  <span className="text-green-500">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-orange-500" />
                  <span className="text-orange-500">Offline</span>
                </>
              )}
              {isOnline && (
                <button
                  type="button"
                  onClick={async () => {
                    toast.loading('🔄 Syncing queue...', { id: 'sync' });
                    try {
                      await processQueue();
                      toast.success('✅ Sync completed', { id: 'sync' });
                    } catch (e) {
                      toast.error('Sync failed', { id: 'sync' });
                    }
                  }}
                  className="ml-3 text-xs px-2 py-0.5 rounded bg-primary-500/10 text-primary-600 hover:bg-primary-500/20"
                >
                  Sync now
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;