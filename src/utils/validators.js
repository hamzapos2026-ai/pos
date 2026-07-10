// File: aone-jewelry-pos/src/utils/validators.js
// Central validation helpers for A One Jewelry POS authentication and setup forms.

/**
 * Safely converts any input to a trimmed string for validation.
 */
const toTrimmedString = (value) => String(value || '').trim();

/** Biller product name — English letters, spaces, hyphen, apostrophe only (no digits). */
export const sanitizeProductNameInput = (raw = '') => (
  String(raw).replace(/[^a-zA-Z\s\-'.]/g, '')
);

/**
 * Validates required text values.
 */
export const validateRequired = (value, fieldName = 'Field') => {
  const text = toTrimmedString(value);

  if (!text) {
    return { valid: false, error: `${fieldName} required` };
  }

  return { valid: true, error: '' };
};

/**
 * Validates minimum character length.
 */
export const validateMinLength = (value, min, field = 'Field') => {
  const text = toTrimmedString(value);

  if (text.length < min) {
    return { valid: false, error: `${field} must be at least ${min} characters` };
  }

  return { valid: true, error: '' };
};

/**
 * Validates maximum character length.
 */
export const validateMaxLength = (value, max, field = 'Field') => {
  const text = toTrimmedString(value);

  if (text.length > max) {
    return { valid: false, error: `${field} must be ${max} characters or less` };
  }

  return { valid: true, error: '' };
};

const USER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'hotmail.co.uk',
  'outlook.co.uk',
]);

const FAKE_EMAIL_PATTERNS = [
  /^test@/i,
  /^fake@/i,
  /^dummy@/i,
  /^temp@/i,
  /^asdf@/i,
  /^abc@/i,
  /^123@/i,
  /^user@/i,
  /^noreply@/i,
  /^admin@/i,
  /^sample@/i,
  /^demo@/i,
  /^qwerty@/i,
  /^xyz@/i,
  /^aaa+@/i,
  /^xxx+@/i,
  /^[0-9]+@/,
  /@example\./i,
  /@test\./i,
  /@mailinator\./i,
  /@tempmail\./i,
  /@yopmail\./i,
  /@guerrillamail\./i,
  /@(gmail|googlemail)\.co$/i,
  /@gmial\./i,
  /@gmal\./i,
  /\.{2,}/,
];

const FAKE_LOCAL_PART_PATTERNS = [
  /^(fake|dummy|test|temp|demo|sample|asdf|qwerty|abcd|xyz|notreal|throwaway|tempmail)([._0-9-]*)$/i,
  /^user([0-9._-]*)$/i,
  /^admin([0-9._-]*)$/i,
  /\+(fake|dummy|test|temp)\b/i,
  /(fake|dummy|notreal|throwaway|tempmail)/i,
  /^[0-9]+$/,
  /^[a-z]{1,2}$/i,
];

const ALLOWED_EMAIL_HINT = 'Gmail, Outlook, or Hotmail only — e.g. ali@gmail.com';

/**
 * Validates email addresses with required, no-space, and standard format checks.
 */
export const validateEmail = (email) => {
  const text = toTrimmedString(email).toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!text || /\s/.test(String(email || '')) || !emailRegex.test(text)) {
    return { valid: false, error: 'Valid email required' };
  }

  return { valid: true, error: '', normalized: text };
};

/**
 * Validates staff account emails — Gmail, Outlook, Hotmail only.
 * Returns reason codes for user-friendly center alerts.
 */
export const validateUserEmail = (email) => {
  const raw = toTrimmedString(email);

  if (!raw) {
    return {
      valid: false,
      reason: 'empty',
      title: 'Email Required',
      error: 'Please enter the user\'s email address to continue.',
    };
  }

  if (/\s/.test(String(email || ''))) {
    return {
      valid: false,
      reason: 'format',
      title: 'Wrong Email Format',
      error: 'Email cannot contain spaces.\nExample: ali@gmail.com',
    };
  }

  if (!raw.includes('@')) {
    return {
      valid: false,
      reason: 'format',
      title: 'Wrong Email Format',
      error: 'Email must include @ symbol.\nExample: ali@gmail.com',
    };
  }

  const text = raw.toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!emailRegex.test(text)) {
    return {
      valid: false,
      reason: 'format',
      title: 'Wrong Email Format',
      error: 'Enter a complete valid email.\nExamples:\n• ali@gmail.com\n• ali@outlook.com\n• ali@hotmail.com',
    };
  }

  const [localPart, domain] = text.split('@');

  if (!localPart || localPart.length < 2) {
    return {
      valid: false,
      reason: 'format',
      title: 'Wrong Email Format',
      error: 'The name before @ is too short.\nExample: ali@gmail.com',
    };
  }

  if (FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      valid: false,
      reason: 'fake',
      title: 'Fake Email Not Allowed',
      error: 'This looks like a test or fake email.\nUse a real personal Gmail, Outlook, or Hotmail address.',
    };
  }

  if (!/[a-zA-Z]/.test(localPart)) {
    return {
      valid: false,
      reason: 'fake',
      title: 'Fake Email Not Allowed',
      error: 'Email name must include letters — numbers-only addresses are not allowed.',
    };
  }

  if (FAKE_LOCAL_PART_PATTERNS.some((pattern) => pattern.test(localPart))) {
    return {
      valid: false,
      reason: 'fake',
      title: 'Fake Email Not Allowed',
      error: 'This looks like a dummy or test email.\nUse a real Gmail, Outlook, or Hotmail address (e.g. ali.ahmed@gmail.com).',
    };
  }

  if (!USER_EMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: 'domain',
      title: 'Email Provider Not Allowed',
      error: `Only Gmail, Outlook & Hotmail are allowed.\nYou entered: @${domain}\nTry: name@gmail.com`,
    };
  }

  return {
    valid: true,
    reason: 'ok',
    title: '',
    error: '',
    normalized: text,
    hint: ALLOWED_EMAIL_HINT,
  };
};

/** Map validateUserEmail result to center-alert payload */
export const emailCheckToAlert = (check, { duplicate = false } = {}) => {
  if (duplicate) {
    return {
      variant: 'duplicate',
      title: 'Email Already Registered',
      message: 'This email is already used by another account.\nPlease use a different Gmail, Outlook, or Hotmail address.',
    };
  }
  if (check?.valid) return null;
  const variantMap = {
    fake: 'warning',
    domain: 'warning',
    format: 'warning',
    empty: 'warning',
  };
  return {
    variant: variantMap[check?.reason] || 'error',
    title: check?.title || 'Invalid Email',
    message: check?.error || 'Please enter a valid email.',
  };
};

/**
 * Validates password length and returns strength metadata for UI indicators.
 */
export const validatePassword = (password) => {
  const text = String(password || '');
  const hasNumber = /\d/.test(text);
  const hasSpecial = /[^A-Za-z0-9]/.test(text);
  const hasLetter = /[A-Za-z]/.test(text);
  let strength = 'weak';

  if (text.length >= 8 && hasNumber) {
    strength = 'medium';
  }

  if (text.length >= 8 && hasNumber && hasSpecial && hasLetter) {
    strength = 'strong';
  }

  if (text.length < 8) {
    return { valid: false, error: 'Minimum 8 characters required', strength };
  }

  return { valid: true, error: '', strength };
};

/**
 * Validates exact password confirmation match.
 */
export const validatePasswordMatch = (password, confirmPassword) => {
  if (String(password || '') !== String(confirmPassword || '')) {
    return { valid: false, error: 'Passwords do not match' };
  }

  return { valid: true, error: '' };
};

/**
 * Validates names with only letters and spaces, 3-50 characters.
 */
export const validateName = (name) => {
  const text = toTrimmedString(name);
  const nameRegex = /^[A-Za-z\s]+$/;

  if (text.length < 3) {
    return { valid: false, error: 'Name must be at least 3 characters' };
  }

  if (text.length > 50) {
    return { valid: false, error: 'Name must be 50 characters or less' };
  }

  if (!nameRegex.test(text)) {
    return { valid: false, error: 'No special characters allowed' };
  }

  return { valid: true, error: '', normalized: text.replace(/\s+/g, ' ') };
};

/**
 * Validates Pakistani mobile phone numbers and normalizes to 03XX-XXXXXXX.
 */
export const validatePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!/^03\d{9}$/.test(digits)) {
    return { valid: false, error: 'Phone must be 11 digits in 03XX-XXXXXXX format', normalized: phone || '' };
  }

  return { valid: true, error: '', normalized: `${digits.slice(0, 4)}-${digits.slice(4)}` };
};

/**
 * Validates the first setup step fields for backward compatibility with existing pages.
 */
export const validateSetupForm = (data = {}) => {
  const errors = {};
  const name = validateName(data.fullName);
  const email = validateEmail(data.email);
  const password = validatePassword(data.password);
  const confirmPassword = validatePasswordMatch(data.password, data.confirmPassword);

  if (!name.valid) errors.fullName = name.error;
  if (!email.valid) errors.email = email.error;
  if (!password.valid) errors.password = password.error;
  if (!confirmPassword.valid) errors.confirmPassword = confirmPassword.error;

  return { isValid: Object.keys(errors).length === 0, errors };
};

/**
 * Validates the business setup step for backward compatibility with existing pages.
 */
export const validateBusinessInfoForm = (data = {}) => {
  const errors = {};

  if (toTrimmedString(data.businessName).length < 3) {
    errors.businessName = 'Business name required';
  }

  if (toTrimmedString(data.storeName).length < 3) {
    errors.storeName = 'Store name required';
  }

  if (toTrimmedString(data.storeLocation).length < 10) {
    errors.storeLocation = 'Please enter complete address';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

/**
 * Exports grouped validators for convenient imports.
 */
export default {
  validateEmail,
  validateUserEmail,
  emailCheckToAlert,
  validatePassword,
  validatePasswordMatch,
  validateName,
  validatePhone,
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validateSetupForm,
  validateBusinessInfoForm,
};