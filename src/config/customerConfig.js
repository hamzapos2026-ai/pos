// src/config/customerConfig.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SINGLE SOURCE OF TRUTH for all customer-related constants.
// To change walk-in customer name app-wide: edit ONLY this file.

export const CUSTOMER_CONFIG = {
  WALK_IN_NAME: 'Walk-in Customer',
  WALK_IN_PHONE: '0000000000',
  WALK_IN_CITY: 'Karachi',
  WALK_IN_TYPE: 'walk_in',
  SERIAL_PREFIX: 'W',
};

export const WALK_IN_TYPE = CUSTOMER_CONFIG.WALK_IN_TYPE;
export const WALK_IN_NAME = CUSTOMER_CONFIG.WALK_IN_NAME;

export const CITY_MARKETS = [
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
];

export default CUSTOMER_CONFIG;
