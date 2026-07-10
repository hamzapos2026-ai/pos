import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Crown, ShieldAlert, ShieldCheck, Eye, EyeOff, Mail, Lock, User, Phone,
  Building2, CheckCircle2, AlertCircle, UserPlus,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import CenterAlert from '../../components/ui/CenterAlert';
import { createUser, updateUser, checkEmailUnique } from '../../services/userSyncService';
import { validateRoleCombination } from '../../utils/rolePermissions';
import { validateUserEmail, validatePassword, emailCheckToAlert } from '../../utils/validators';
import { toSingleBranchIds } from '../../utils/branchAccess';
import { cn } from '../../utils/cn';

const BASE_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager' },
  { value: 'biller', label: 'Biller' },
  { value: 'cashier', label: 'Cashier' },
];

const SUPER_ADMIN_OPTION = { value: 'superAdmin', label: 'Super Admin' };

const PROGRESS_LABELS = {
  saving: 'Saving user locally…',
  syncing: 'Syncing to cloud…',
};

const INPUT =
  'w-full rounded-xl border bg-[#0a0805] py-2.5 text-sm text-gray-100 placeholder:text-gray-500 transition focus:outline-none focus:ring-2 focus:ring-amber-500/40';

const getStoreName = (store) => {
  if (!store) return '';
  return (store.storeName || store.name || store.id || '')
    .replace('A One Jewelry - ', '')
    .replace('A One Jewellery - ', '')
    .trim();
};

const resolveAlertFromError = (error, fallback = 'Something went wrong') => {
  const msg = String(error || fallback);

  if (/super admin already exists/i.test(msg)) {
    return {
      variant: 'superAdmin',
      title: 'Super Admin Already Exists',
      message: 'Only one Super Admin account is allowed.\nEdit the existing Super Admin or choose a different role.',
    };
  }
  if (/permission denied/i.test(msg)) {
    return { variant: 'warning', title: 'Access Denied', message: 'Only Super Admin can create or update user accounts.' };
  }
  if (/email already|already registered|already in use/i.test(msg)) {
    return {
      variant: 'duplicate',
      title: 'Email Already Registered',
      message: 'This email is already used.\nTry a different Gmail, Outlook, or Hotmail address.',
    };
  }
  if (/branch|biller/i.test(msg)) {
    return { variant: 'warning', title: 'Branch Required', message: msg };
  }
  if (/verify email|verification link/i.test(msg)) {
    return { variant: 'warning', title: 'Validation Required', message: msg };
  }

  return { variant: 'error', title: 'Could Not Save User', message: msg };
};

const formatTimer = (sec) => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const PasswordStrength = ({ password }) => {
  const check = validatePassword(password);
  const levels = [
    { key: 'weak', color: 'bg-red-500', label: 'Weak' },
    { key: 'medium', color: 'bg-amber-500', label: 'Good' },
    { key: 'strong', color: 'bg-emerald-500', label: 'Strong' },
  ];
  const idx = check.strength === 'strong' ? 2 : check.strength === 'medium' ? 1 : 0;

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {levels.map((lv, i) => (
          <div
            key={lv.key}
            className={cn('h-1 flex-1 rounded-full transition-all', i <= idx ? lv.color : 'bg-gray-700')}
          />
        ))}
      </div>
      <p className={cn('text-[11px]', idx === 2 ? 'text-emerald-400' : idx === 1 ? 'text-amber-400' : 'text-red-400')}>
        Password strength: {levels[idx].label}
        {!check.valid && password.length > 0 && ' — min 8 characters required'}
      </p>
    </div>
  );
};

const FieldLabel = ({ children, required }) => (
  <span className="flex items-center gap-1 text-sm font-medium text-gray-200">
    {children}
    {required && <span className="text-amber-400">*</span>}
  </span>
);

const SectionCard = ({ icon: Icon, title, subtitle, accent = 'amber', children }) => {
  const accentMap = {
    amber: 'border-amber-500/20 from-amber-500/[0.07] to-orange-500/[0.03]',
    sky: 'border-sky-500/25 from-sky-500/10 to-violet-500/5',
    violet: 'border-violet-400/25 from-violet-500/10 to-amber-500/5',
    emerald: 'border-emerald-500/25 from-emerald-500/10 to-teal-500/5',
  };
  const iconMap = {
    amber: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    sky: 'text-sky-400 bg-sky-500/15 border-sky-500/30',
    violet: 'text-violet-300 bg-violet-500/15 border-violet-400/30',
    emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  };

  return (
    <section className={cn(
      'rounded-2xl border bg-gradient-to-br p-4 sm:p-5 space-y-4',
      accentMap[accent] || accentMap.amber,
    )}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', iconMap[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
};

const StepPill = ({ n, label, done, active }) => (
  <div className={cn(
    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition',
    done && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    active && !done && 'border-amber-500/50 bg-amber-500/15 text-amber-200',
    !done && !active && 'border-[#2a1f0d] bg-[#0a0805]/80 text-gray-500',
  )}>
    <span className={cn(
      'flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
      done ? 'bg-emerald-500 text-white' : active ? 'bg-amber-500 text-[#0a0805]' : 'bg-gray-800 text-gray-400',
    )}>
      {done ? '✓' : n}
    </span>
    <span className="hidden sm:inline">{label}</span>
  </div>
);

const UserForm = ({
  isOpen,
  onClose,
  onSubmit,
  editUser,
  stores = [],
  currentAdmin,
  isSuperAdmin = false,
}) => {
  const isEditMode = !!(editUser?.uid || editUser?.id);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roles, setRoles] = useState(['biller']);
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const showFeedback = useCallback((payload) => setFeedback(payload), []);

  const roleOptions = useMemo(
    () => (isSuperAdmin ? [SUPER_ADMIN_OPTION, ...BASE_ROLE_OPTIONS] : BASE_ROLE_OPTIONS),
    [isSuperAdmin],
  );

  const isSuperAdminRole = roles.includes('superAdmin');

  const resolveEditBranchId = useCallback((user) => {
    const ids = toSingleBranchIds(
      user?.storeIds || (user?.storeId ? [user.storeId] : []),
      user?.primaryStore || user?.storeId || '',
    );
    return ids[0] || '';
  }, []);

  const closeFeedback = useCallback(() => {
    setFeedback((prev) => {
      if (prev?.onClose) prev.onClose();
      return null;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (!isEditMode) {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setShowPassword(false);
      setRoles(['biller']);
      setBranchId('');
      setIsActive(true);
      setNotes('');
      setFeedback(null);
      setProgressStage(null);
      setEmailStatus(null);
      return;
    }

    setName(editUser.name || '');
    setEmail(editUser.email || '');
    setPhone(editUser.phone || '');
    setPassword('');
    setShowPassword(false);
    const userRoles = (editUser.roles || (editUser.role ? [editUser.role] : ['biller']))
      .filter((r) => r !== 'admin');
    setRoles(userRoles.length ? userRoles : ['biller']);
    setBranchId(resolveEditBranchId(editUser));
    setIsActive(editUser.isActive !== false);
    setNotes(editUser.notes || '');
    setFeedback(null);
    setProgressStage(null);
    setEmailStatus(null);
  }, [isOpen, editUser, isEditMode, resolveEditBranchId]);

  const selectBranch = (storeId) => {
    setBranchId(storeId);
  };

  const validateEmailField = useCallback(async (showPopup = true) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setEmailStatus(null);
      return false;
    }

    const check = validateUserEmail(normalized);
    if (!check.valid) {
      setEmailStatus(check.reason);
      if (showPopup) showFeedback(emailCheckToAlert(check));
      return false;
    }

    setCheckingEmail(true);
    setEmailStatus('checking');
    try {
      const unique = await checkEmailUnique(
        check.normalized,
        isEditMode ? (editUser.uid || editUser.id) : null,
      );
      if (!unique) {
        setEmailStatus('duplicate');
        if (showPopup) showFeedback(emailCheckToAlert(check, { duplicate: true }));
        return false;
      }
      setEmailStatus('ok');
      return true;
    } catch {
      setEmailStatus(null);
      return true;
    } finally {
      setCheckingEmail(false);
    }
  }, [email, isEditMode, editUser, showFeedback]);

  const toggleRole = (role) => {
    if (role === 'superAdmin') {
      setRoles(['superAdmin']);
      return;
    }
    setRoles((prev) => {
      const withoutSuper = prev.filter((item) => item !== 'superAdmin');
      return withoutSuper.includes(role)
        ? withoutSuper.filter((item) => item !== role)
        : [...withoutSuper, role];
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!name.trim()) {
      showFeedback({ variant: 'warning', title: 'Name Required', message: 'Enter the user\'s full name (e.g. Ali Ahmed).' });
      return;
    }

    if (!email.trim()) {
      showFeedback({ variant: 'warning', title: 'Email Required', message: 'Enter a Gmail, Outlook, or Hotmail address.\nExample: ali@gmail.com' });
      return;
    }

    const emailCheck = validateUserEmail(email.trim());
    if (!emailCheck.valid) {
      showFeedback(emailCheckToAlert(emailCheck));
      return;
    }

    const emailOk = await validateEmailField(true);
    if (!emailOk) return;

    if (!isEditMode) {
      if (!password.trim()) {
        showFeedback({
          variant: 'warning',
          title: 'Password Required',
          message: 'Temporary password is mandatory for new users.\nMinimum 8 characters — share it securely with the user.',
        });
        return;
      }
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        showFeedback({
          variant: 'warning',
          title: 'Weak Password',
          message: 'Password must be at least 8 characters.\nUse letters and numbers for better security.',
        });
        return;
      }
    }

    const roleCheck = validateRoleCombination(roles);
    if (!roleCheck.valid) {
      showFeedback({ variant: 'warning', title: 'Invalid Role Mix', message: roleCheck.error });
      return;
    }

    if (!branchId) {
      showFeedback({
        variant: 'warning',
        title: 'Branch Required',
        message: 'Select exactly one branch — Aone or JM-1.\nDual branch assignment is not allowed.',
      });
      return;
    }

    if (!currentAdmin?.uid) {
      showFeedback({ variant: 'error', title: 'Session Expired', message: 'Please log in again and retry.' });
      return;
    }

    const payload = {
      name: name.trim(),
      email: emailCheck.normalized,
      phone: phone.trim(),
      roles,
      storeIds: [branchId],
      primaryStore: branchId,
      isActive,
      notes: notes.trim(),
    };

    if (!isEditMode) payload.password = password;

    setLoading(true);
    setProgressStage('saving');

    try {
      const result = isEditMode
        ? await updateUser(editUser.uid || editUser.id, payload, currentAdmin, { silentToast: true })
        : await createUser(payload, currentAdmin, true, {
            silentToast: true,
            onProgress: setProgressStage,
            trustSuperAdmin: isSuperAdmin,
          });

      setProgressStage(null);

      if (!result?.success) {
        showFeedback(resolveAlertFromError(result?.error));
        return;
      }

      const userLabel = payload.name || payload.email;
      const synced = result.syncedToCloud !== false;

      showFeedback({
        variant: 'success',
        title: isEditMode ? 'User Updated ✓' : 'User Created ✓',
        message: synced
          ? `${userLabel} saved & synced to cloud.${!isEditMode ? '\nVerification email sent to their inbox.' : ''}`
          : `${userLabel} saved locally.${result.offline ? '\nWill sync when online.' : ''}`,
        confirmLabel: 'Done',
        onClose: () => {
          onSubmit?.(result);
          onClose?.();
        },
      });
    } catch (err) {
      setProgressStage(null);
      showFeedback(resolveAlertFromError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  const formStep = useMemo(() => {
    if (isEditMode) return 2;
    if (emailStatus === 'ok' && name.trim()) return 1;
    return 0;
  }, [isEditMode, emailStatus, name]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={(
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-[#0a0805]">
              {isEditMode ? <User className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-base font-bold text-gray-100">{isEditMode ? 'Edit User' : 'Create New User'}</p>
              <p className="text-[11px] font-normal text-gray-500">
                {isEditMode ? 'Update profile, role & branch access' : 'Add staff to your branch'}
              </p>
            </div>
          </div>
        )}
        size="large"
        footer={(
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-5 py-2.5 text-sm text-gray-300 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || checkingEmail}
              className={cn(
                'rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg transition',
                loading || checkingEmail
                  ? 'bg-amber-500/30 text-[#0a0805]/60 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 text-[#0a0805] hover:from-amber-400 hover:to-orange-400 shadow-amber-500/20',
              )}
            >
              {loading
                ? (PROGRESS_LABELS[progressStage] || 'Saving…')
                : (isEditMode ? 'Save Changes' : 'Create User')}
            </button>
          </div>
        )}
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[min(72vh,680px)] overflow-y-auto pr-1 -mr-1">
          {!isEditMode && (
            <div className="flex flex-wrap gap-2 pb-1">
              <StepPill n="1" label="Profile" done={formStep > 0} active={formStep === 0} />
              <StepPill n="2" label="Access & Save" done={false} active={formStep >= 1} />
            </div>
          )}

          <SectionCard
            icon={User}
            title="Profile Details"
            subtitle="Name, email & contact"
            accent="amber"
          >
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <label className="space-y-1.5">
              <FieldLabel required>Full Name</FieldLabel>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cn(INPUT, 'border-[#2a1f0d] pl-10 pr-3')}
                  placeholder="e.g. Ali Ahmed"
                  autoComplete="name"
                />
              </div>
            </label>

            {/* Email */}
            <label className="space-y-1.5">
              <FieldLabel required>Email Address</FieldLabel>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                setEmail(e.target.value);
                setEmailStatus(null);
              }}
                  onBlur={() => { if (email.trim()) validateEmailField(true); }}
                  className={cn(
                    INPUT, 'pl-10 pr-10',
                    emailStatus === 'ok' && 'border-emerald-500/50',
                    emailStatus === 'duplicate' && 'border-orange-500/50',
                    emailStatus && emailStatus !== 'ok' && emailStatus !== 'checking' && emailStatus !== 'duplicate' && 'border-red-500/40',
                    !emailStatus || emailStatus === 'checking' ? 'border-[#2a1f0d]' : '',
                  )}
                  placeholder="e.g. ali@gmail.com"
                  autoComplete="email"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingEmail && <span className="text-[10px] text-amber-400 animate-pulse">…</span>}
                  {!checkingEmail && emailStatus === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  {!checkingEmail && emailStatus === 'duplicate' && <AlertCircle className="h-4 w-4 text-orange-400" />}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">Gmail, Outlook, or Hotmail only</p>
            </label>

            {/* Phone */}
            <label className="space-y-1.5">
              <FieldLabel>Phone Number</FieldLabel>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={cn(INPUT, 'border-[#2a1f0d] pl-10 pr-3')}
                  placeholder="e.g. 0300-1234567 (optional)"
                  autoComplete="tel"
                />
              </div>
            </label>

            {!isEditMode && (
              <label className="space-y-1.5 sm:col-span-2">
                <FieldLabel required>Temporary Password</FieldLabel>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(INPUT, 'border-[#2a1f0d] pl-10 pr-11')}
                    placeholder="Min 8 characters — required"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-amber-400"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </label>
            )}
          </div>
          </SectionCard>

          {isSuperAdminRole && (
            <SectionCard icon={Crown} title="Super Admin" subtitle="Only one allowed system-wide" accent="violet">
              <p className="text-xs text-violet-200/80">
                This account gets full access to all branches, settings, and user management.
              </p>
            </SectionCard>
          )}

          <SectionCard
            icon={ShieldCheck}
            title="Role & Branch Access"
            subtitle="What this user can do and where"
            accent="emerald"
          >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel required>Role</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {roleOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleRole(option.value)}
                    className={cn(
                      'rounded-2xl border px-3 py-2.5 text-sm text-left transition-all',
                      roles.includes(option.value)
                        ? option.value === 'superAdmin'
                          ? 'border-violet-400/60 bg-violet-500/15 text-violet-200 shadow-[0_0_20px_rgba(139,92,246,0.12)]'
                          : 'border-amber-500 bg-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
                        : 'border-[#2a1f0d] bg-[#0a0805] text-gray-400 hover:border-amber-500/40 hover:text-gray-200',
                    )}
                  >
                    {option.value === 'superAdmin' && <Crown className="mb-0.5 inline h-3.5 w-3.5 text-violet-300" />}
                    {' '}{option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel required>
                Branch
                <span className="ml-1 text-[10px] font-normal text-amber-400/80">(one only)</span>
              </FieldLabel>
              <div className="space-y-2 max-h-48 overflow-y-auto rounded-2xl border border-[#2a1f0d] bg-[#0a0805]/50 p-2">
                {stores.length === 0 && (
                  <p className="flex items-center gap-2 px-2 py-3 text-xs text-gray-500">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    No branches — add Aone or JM-1 first.
                  </p>
                )}
                {stores.map((store) => (
                  <label
                    key={store.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                      branchId === store.id
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-100'
                        : 'border-transparent text-gray-300 hover:bg-white/[0.03]',
                    )}
                  >
                    <input
                      type="radio"
                      name="user-branch"
                      checked={branchId === store.id}
                      onChange={() => selectBranch(store.id)}
                      className="h-4 w-4 border-gray-600 bg-[#0a0805] text-amber-500 focus:ring-amber-500"
                    />
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate">{getStoreName(store)}</span>
                  </label>
                ))}
              </div>
              {branchId && (
                <p className="text-[10px] text-emerald-400/90 px-1">
                  Assigned: {getStoreName(stores.find((s) => s.id === branchId))}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#2a1f0d] bg-[#0a0805] px-4 py-3.5 text-sm text-gray-200 transition hover:border-amber-500/30 sm:col-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-[#0a0805] text-amber-500 focus:ring-amber-500"
              />
              <span>
                <span className="font-medium text-gray-100">Active account</span>
                <span className="mt-0.5 block text-[11px] text-gray-500">User can log in immediately</span>
              </span>
            </label>
          </div>

          <label className="space-y-1.5">
            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={cn(INPUT, 'border-[#2a1f0d] px-3 resize-none')}
              placeholder="Optional — shift, department, or other info"
            />
          </label>
          </SectionCard>
        </form>
      </Modal>

      <CenterAlert
        open={loading && Boolean(progressStage)}
        variant="loading"
        title="Please Wait"
        message={PROGRESS_LABELS[progressStage] || 'Processing…'}
        hideClose
        loading
      />

      <CenterAlert
        open={Boolean(feedback)}
        variant={feedback?.variant || 'error'}
        title={feedback?.title}
        message={feedback?.message}
        confirmLabel={feedback?.confirmLabel || 'Got it'}
        onClose={closeFeedback}
      />
    </>
  );
};

export default UserForm;
