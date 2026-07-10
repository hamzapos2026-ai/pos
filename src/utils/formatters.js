// File: aone-jewelry-pos/src/utils/formatters.js
// Utility functions for formatting currency, dates, phone numbers, etc.

import { format, parseISO, isValid } from 'date-fns';
import { CURRENCY, DATE_FORMATS } from './constants';

// ============================================
// CURRENCY FORMATTERS
// ============================================

/**
 * Format a number as currency
 * @param {number} amount - The amount to format
 * @param {object} options - Formatting options
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, options = {}) => {
  const {
    currency = CURRENCY.CODE,
    locale = CURRENCY.LOCALE,
    showSymbol = true,
    symbol = CURRENCY.SYMBOL,
    decimals = 0,
  } = options;

  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? `${symbol} 0` : '0';
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);

  return showSymbol ? `${symbol} ${formatted}` : formatted;
};

/**
 * Format currency with PKR symbol (shortcut)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
export const formatPKR = (amount) => {
  return formatCurrency(amount, { showSymbol: true });
};

/**
 * Format currency without symbol (for inputs)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (amount) => {
  return formatCurrency(amount, { showSymbol: false });
};

/**
 * Parse a currency string back to a number
 * @param {string} str - The currency string to parse
 * @returns {number} Parsed number
 */
export const parseCurrency = (str) => {
  if (!str) return 0;
  
  // Remove currency symbol and any non-numeric characters except digits, dots, and commas
  const cleaned = str
    .replace(/[^\d.,]/g, '')
    .replace(/,/g, '');
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// ============================================
// DATE FORMATTERS
// ============================================

/**
 * Format a date string or Date object
 * @param {string|Date} date - The date to format
 * @param {string} formatStr - The format string (default: DISPLAY)
 * @returns {string} Formatted date string
 */
export const formatDate = (date, formatStr = DATE_FORMATS.DISPLAY) => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    if (!isValid(dateObj)) {
      console.warn('Invalid date:', date);
      return '';
    }
    
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Format date with time
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (date) => {
  return formatDate(date, DATE_FORMATS.DISPLAY_WITH_TIME);
};

/**
 * Format date for input fields
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string for input
 */
export const formatDateForInput = (date) => {
  return formatDate(date, DATE_FORMATS.INPUT);
};

/**
 * Format date for bill ID
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string for bill ID
 */
export const formatDateForBillId = (date) => {
  return formatDate(date, DATE_FORMATS.BILL_ID_DATE);
};

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {string|Date} date - The date to compare
 * @param {Date} basePathDate - The base date for comparison (default: now)
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (date, basePathDate = new Date()) => {
  if (!date) return '';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    if (!isValid(dateObj)) return '';
    
    const now = typeof basePathDate === 'string' ? parseISO(basePathDate) : basePathDate;
    const diffMs = now - dateObj;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
  } catch (error) {
    return '';
  }
};

// ============================================
// PHONE NUMBER FORMATTERS
// ============================================

/**
 * Format a phone number for display
 * @param {string} phone - The phone number to format
 * @returns {string} Formatted phone number
 */
export const formatPhone = (phone) => {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Pakistan format: 03XX-XXXXXXX
  if (cleaned.length === 11 && cleaned.startsWith('03')) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  
  // International format
  if (cleaned.length >= 10) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
  }
  
  return phone;
};

/**
 * Format phone number for input (without dashes)
 * @param {string} phone - The phone number to format
 * @returns {string} Cleaned phone number
 */
export const formatPhoneForInput = (phone) => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

/**
 * Mask phone number for privacy
 * @param {string} phone - The phone number to mask
 * @param {number} showLast - Number of digits to show at the end
 * @returns {string} Masked phone number
 */
export const maskPhone = (phone, showLast = 3) => {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  const length = cleaned.length;
  
  if (length <= showLast) return cleaned;
  
  const masked = cleaned.slice(0, -showLast).replace(/\d/g, '*');
  return masked + cleaned.slice(-showLast);
};

// ============================================
// STRING FORMATTERS
// ============================================

/**
 * Capitalize the first letter of each word
 * @param {string} str - The string to capitalize
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Truncate a string to a specified length
 * @param {string} str - The string to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated string
 */
export const truncate = (str, maxLength = 50, suffix = '...') => {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
};

/**
 * Generate initials from a name
 * @param {string} name - The name to generate initials from
 * @param {number} maxInitials - Maximum number of initials
 * @returns {string} Initials
 */
export const getInitials = (name, maxInitials = 2) => {
  if (!name) return '';
  
  const words = name.trim().split(/\s+/);
  const initials = words
    .slice(0, maxInitials)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
  
  return initials;
};

// ============================================
// WEIGHT FORMATTERS (for jewelry)
// ============================================

/**
 * Format weight in grams
 * @param {number} weight - Weight in grams
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted weight string
 */
export const formatWeight = (weight, decimals = 3) => {
  if (weight === null || weight === undefined || isNaN(weight)) {
    return '0.000 g';
  }
  return `${weight.toFixed(decimals)} g`;
};

/**
 * Format weight in tola (1 tola = 11.664 grams)
 * @param {number} weightInGrams - Weight in grams
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted weight in tola
 */
export const formatWeightInTola = (weightInGrams, decimals = 3) => {
  if (weightInGrams === null || weightInGrams === undefined || isNaN(weightInGrams)) {
    return '0.000 tola';
  }
  const tola = weightInGrams / 11.664;
  return `${tola.toFixed(decimals)} tola`;
};

/**
 * Convert tola to grams
 * @param {number} tola - Weight in tola
 * @returns {number} Weight in grams
 */
export const tolaToGrams = (tola) => {
  return tola * 11.664;
};

/**
 * Convert grams to tola
 * @param {number} grams - Weight in grams
 * @returns {number} Weight in tola
 */
export const gramsToTola = (grams) => {
  return grams / 11.664;
};

// ============================================
// PERCENTAGE FORMATTERS
// ============================================

/**
 * Format a number as percentage
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  return `${value.toFixed(decimals)}%`;
};

// ============================================
// BILL ID FORMATTERS
// ============================================

/**
 * Format bill ID for display
 * @param {string} billId - The bill ID to format
 * @returns {string} Formatted bill ID
 */
export const formatBillId = (billId) => {
  if (!billId) return '';
  return billId.replace(/-/g, '-');
};

/**
 * Generate a short bill ID for display
 * @param {string} billId - The full bill ID
 * @returns {string} Short bill ID
 */
export const getShortBillId = (billId) => {
  if (!billId) return '';
  const parts = billId.split('-');
  if (parts.length >= 4) {
    return `${parts[0]}...${parts[parts.length - 1]}`;
  }
  return billId.slice(0, 12) + '...';
};

// ============================================
// EXPORT ALL
// ============================================

export default {
  formatCurrency,
  formatPKR,
  formatNumber,
  parseCurrency,
  formatDate,
  formatDateTime,
  formatDateForInput,
  formatDateForBillId,
  formatRelativeTime,
  formatPhone,
  formatPhoneForInput,
  maskPhone,
  capitalize,
  truncate,
  getInitials,
  formatWeight,
  formatWeightInTola,
  tolaToGrams,
  gramsToTola,
  formatPercentage,
  formatBillId,
  getShortBillId,
};