// File: aone-jewelry-pos/src/utils/validators.js
// Central validation helpers for A One Jewelry POS authentication and setup forms.

/**
 * Safely converts any input to a trimmed string for validation.
 */
const toTrimmedString = (value) => String(value || '').trim();

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