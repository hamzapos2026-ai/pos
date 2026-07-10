// src/pages/setup/SetupPage.jsx
// ✅ NO CHANGES NEEDED — already correct
// SetupRoute handles all guards
// This page only renders when setup is genuinely needed

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, User, Mail, Lock, Building2,
  Store, MapPin, ChevronRight, ChevronLeft, Check,
} from 'lucide-react';
import { useAuth }        from '../../context/AuthContext';
import { useTheme }       from '../../context/ThemeContext';
import { useLanguage }    from '../../context/LanguageContext';
import Button             from '../../components/ui/Button';
import Input              from '../../components/ui/Input';
import AuthErrorModal     from '../../components/ui/AuthErrorModal';
import {
  validateSetupForm,
  validateBusinessInfoForm,
} from '../../utils/validators';
import { toast } from 'react-hot-toast';

const SetupPage = () => {
  const [step,           setStep]          = useState(1);
  const [isSubmitting,   setIsSubmitting]  = useState(false);
  const [authError,      setAuthError]     = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const { signUp, markSetupComplete } = useAuth();
  const { isDark }   = useTheme();
  const { t }        = useLanguage();
  const navigate     = useNavigate();

  const [formData, setFormData] = useState({
    fullName:      '',
    email:         '',
    password:      '',
    confirmPassword: '',
    businessName:  '',
    storeName:     '',
    storeLocation: '',
  });

  const [errors, setErrors] = useState({});

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validateStep = (stepNumber) => {
    const validation =
      stepNumber === 1
        ? validateSetupForm(formData)
        : validateBusinessInfoForm(formData);
    if (!validation.isValid) { setErrors(validation.errors); return false; }
    return true;
  };

  const handleNext     = () => { if (validateStep(step)) setStep(s => s + 1); };
  const handlePrevious = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    if (!validateStep(2)) return;
    setIsSubmitting(true);
    try {
      const result = await signUp(
        formData.email,
        formData.password,
        formData.fullName,
        ['superAdmin'],
      );

      if (result.success) {
        // Cache for offline login
        const offlineUsers = [{
          uid:         result.user.uid,
          email:       formData.email,
          displayName: formData.fullName,
          role:        'superAdmin',
          createdAt:   new Date().toISOString(),
        }];
        localStorage.setItem('aone-offline-users', JSON.stringify(offlineUsers));

        await markSetupComplete();

        toast.success('✅ Setup complete! Redirecting…');
        setTimeout(() => navigate('/login', { replace: true }), 1500);
      } else {
        setAuthError(result.error || new Error('Setup failed'));
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('[SetupPage] error:', error);
      setAuthError(error);
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (step === 1) handleNext();
    else handleSubmit();
  };

  const slideVariants = {
    enter:  d => ({ x: d > 0 ?  300 : -300, opacity: 0 }),
    center: ()=> ({ x: 0,                    opacity: 1 }),
    exit:   d => ({ x: d < 0 ?  300 : -300, opacity: 0 }),
  };

  const fade = {
    hidden:  { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`min-h-screen flex items-center justify-center p-4 ${
        isDark ? 'bg-[#0a0805]' : 'bg-amber-50'
      }`}
    >
      {/* Background */}
      <div className={`absolute inset-0 ${
        isDark
          ? 'bg-gradient-to-br from-amber-900/20 via-transparent to-amber-900/10'
          : 'bg-gradient-to-br from-amber-100/50 via-transparent to-amber-100/30'
      }`} />

      {/* Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1,    opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
          isDark
            ? 'bg-[#1a1208] border border-[#2a1f0d]'
            : 'bg-white border border-amber-200'
        }`}
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
          <h1 className={`text-2xl font-bold ${
            isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]'
          }`}>
            {t('setup.title', 'Super Admin Setup')}
          </h1>
          <p className={`mt-2 text-sm ${
            isDark ? 'text-[#a8a29e]' : 'text-[#78716c]'
          }`}>
            {t('setup.subtitle', 'Create your account to get started')}
          </p>
        </div>

        {/* Step indicators */}
        <div className="px-8 mb-6">
          <div className="flex items-center justify-between">
            {[1, 2].map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && (
                  <div className="flex-1 mx-4 h-0.5 bg-amber-200/30" />
                )}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step > s
                      ? 'bg-green-500 text-white'
                      : step === s
                        ? 'bg-primary-500 text-dark-bg'
                        : isDark
                          ? 'bg-[#2a1f0d] text-[#a8a29e]'
                          : 'bg-amber-200 text-[#78716c]'
                  }`}>
                    {step > s ? <Check className="w-4 h-4" /> : s}
                  </div>
                  <span className={`mt-1 text-xs ${
                    isDark ? 'text-[#a8a29e]' : 'text-[#78716c]'
                  }`}>
                    {s === 1 ? 'Personal' : 'Business'}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
          <p className={`text-center text-xs mt-3 ${
            isDark ? 'text-[#78716c]' : 'text-[#a8a29e]'
          }`}>
            Step {step} of 2
          </p>
        </div>

        {/* Form area */}
        <div className="px-8 pb-8">
          <AnimatePresence mode="wait" custom={step}>

            {step === 1 && (
              <motion.div
                key="step1"
                custom={step}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-4">
                  <motion.div variants={fade} initial="hidden" animate="visible">
                    <Input
                      label="Full Name"
                      placeholder="Your full name"
                      value={formData.fullName}
                      onChange={e => updateFormData('fullName', e.target.value)}
                      error={errors.fullName}
                      leftIcon={<User className="w-4 h-4" />}
                      required
                    />
                  </motion.div>
                  <motion.div variants={fade} initial="hidden" animate="visible"
                    transition={{ delay: 0.05 }}>
                    <Input
                      label="Email Address"
                      placeholder="you@example.com"
                      type="email"
                      value={formData.email}
                      onChange={e => updateFormData('email', e.target.value)}
                      error={errors.email}
                      leftIcon={<Mail className="w-4 h-4" />}
                      required
                    />
                  </motion.div>
                  <motion.div variants={fade} initial="hidden" animate="visible"
                    transition={{ delay: 0.1 }}>
                    <Input
                      label="Password"
                      placeholder="••••••••"
                      type="password"
                      value={formData.password}
                      onChange={e => updateFormData('password', e.target.value)}
                      error={errors.password}
                      leftIcon={<Lock className="w-4 h-4" />}
                      showPasswordToggle
                      required
                    />
                  </motion.div>
                  <motion.div variants={fade} initial="hidden" animate="visible"
                    transition={{ delay: 0.15 }}>
                    <Input
                      label="Confirm Password"
                      placeholder="••••••••"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={e => updateFormData('confirmPassword', e.target.value)}
                      error={errors.confirmPassword}
                      leftIcon={<Lock className="w-4 h-4" />}
                      showPasswordToggle
                      required
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                custom={step}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-4">
                  <motion.div variants={fade} initial="hidden" animate="visible">
                    <Input
                      label="Business Name"
                      placeholder="Your business name"
                      value={formData.businessName}
                      onChange={e => updateFormData('businessName', e.target.value)}
                      error={errors.businessName}
                      leftIcon={<Building2 className="w-4 h-4" />}
                      required
                    />
                  </motion.div>
                  <motion.div variants={fade} initial="hidden" animate="visible"
                    transition={{ delay: 0.05 }}>
                    <Input
                      label="Store Name"
                      placeholder="Your store name"
                      value={formData.storeName}
                      onChange={e => updateFormData('storeName', e.target.value)}
                      error={errors.storeName}
                      leftIcon={<Store className="w-4 h-4" />}
                      required
                    />
                  </motion.div>
                  <motion.div variants={fade} initial="hidden" animate="visible"
                    transition={{ delay: 0.1 }}>
                    <div className="flex flex-col gap-1.5">
                      <label className={`text-sm font-medium ${
                        isDark ? 'text-[#f5f5f4]' : 'text-[#1c1917]'
                      }`}>
                        Store Location <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <textarea
                          rows={3}
                          className={`w-full rounded-lg px-3 py-2 ps-10 text-sm
                            border focus:outline-none focus:ring-2
                            focus:ring-primary-500 focus:border-transparent resize-none
                            ${isDark
                              ? 'bg-[#0a0805] border-[#2a1f0d] text-[#f5f5f4] placeholder-[#78716c]'
                              : 'bg-white border-amber-200 text-[#1c1917] placeholder-[#a8a29e]'
                            }
                            ${errors.storeLocation
                              ? 'border-red-500 focus:ring-red-500' : ''
                            }`}
                          placeholder="Enter store address…"
                          value={formData.storeLocation}
                          onChange={e => updateFormData('storeLocation', e.target.value)}
                        />
                        <MapPin className="absolute start-3 top-3 w-4 h-4 text-[#78716c]" />
                      </div>
                      {errors.storeLocation && (
                        <p className="text-sm text-red-500">{errors.storeLocation}</p>
                      )}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`px-8 py-4 border-t ${
          isDark ? 'border-[#2a1f0d]' : 'border-amber-200'
        }`}>
          <div className="flex gap-3">
            {step > 1 && (
              <Button
                variant="secondary"
                onClick={handlePrevious}
                disabled={isSubmitting}
                className="flex-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
            )}

            {step < 2 ? (
              <Button
                variant="primary"
                onClick={handleNext}
                disabled={isSubmitting}
                className="flex-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Creating Account…' : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Account
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <AuthErrorModal
        isOpen={showErrorModal}
        onClose={() => { setShowErrorModal(false); setAuthError(null); }}
        error={authError}
        onRetry={() => { setShowErrorModal(false); handleSubmit(); }}
        onResetPassword={() => setShowErrorModal(false)}
        onContactSupport={() => setShowErrorModal(false)}
      />
    </div>
  );
};

export default SetupPage;