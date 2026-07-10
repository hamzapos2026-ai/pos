// src/config/channelConfig.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All BroadcastChannel names in ONE place.
// Never use string literals for channel names — always use these constants.

export const BROADCAST_CHANNELS = {
  ORDERS: 'aone_pos_orders',
  SERIAL: 'aone_serial_sync',
  REFRESH: 'aone_pos_refresh',
  BILLS: 'aone_pos_bills',
  DELETED_BILLS: 'aone_pos_deleted_bills',
};

export default BROADCAST_CHANNELS;
