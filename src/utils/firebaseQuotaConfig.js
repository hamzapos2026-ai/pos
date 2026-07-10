/**
 * Central Firebase quota tuning — reads/writes/listeners only.
 * Tuned for ~1000–1500 bills/day jewelry shop (multi-branch).
 * Adjust here without touching UI or business logic.
 *
 * Math: 1500 bills/day ≈ 62/hr avg, peak ~120–180/hr.
 * Pending cashier queue at peak ≈ 30–80 bills (not full day history).
 */

/** Admin/manager hybrid listener — fallback poll only when listener unhealthy. */
export const HYBRID_FALLBACK_POLL_MS = 30 * 60 * 1000;

// ── Cashier pending queue ─────────────────────────────────────
/** Realtime listener cap per store (pending_payment query — ~1500 bills/day per branch). */
export const CASHIER_LISTENER_LIMIT = 400;

/** Fast boot / backup poll row cap. */
export const CASHIER_INITIAL_LIMIT = 200;

/** Background full pending fetch cap. */
export const CASHIER_FULL_LIMIT = 500;

/** Shop LAN server — multi-PC live pending poll (biller → cashier other PC). */
export const CASHIER_SHOP_LIVE_POLL_MS = 50;

/** Skip Firebase backup poll when listener delivered data within this window. */
export const CASHIER_LISTENER_HEALTH_SKIP_MS = 45_000;

/** Firebase backup poll — cross-PC safety net (listener is primary). */
export const CASHIER_FIREBASE_LIVE_POLL_MS = 10_000;

/** Dexie/local merge poll — online. */
export const CASHIER_DEXIE_POLL_ONLINE_MS = 3_000;

/** Dexie/local merge poll — offline. */
export const CASHIER_DEXIE_POLL_OFFLINE_MS = 400;

/** Skip heavy Dexie merge right after same-PC instant broadcast upsert. */
export const CASHIER_INSTANT_GUARD_MS = 900;

/** Max rows kept in cashier React state (newest first). */
export const CASHIER_UI_QUEUE_CAP = 650;

/** Cloud paid-keys refresh — hide paid bills from pending list. */
export const CASHIER_PAID_INDEX_POLL_MS = 12_000;

// ── Biller ────────────────────────────────────────────────────
/** Biller top-5 listener cap. */
export const BILLER_TOP5_LISTENER_LIMIT = 5;

/** Biller top-5 offline poll (online uses listener + broadcast). */
export const BILLER_TOP5_OFFLINE_POLL_MS = 30_000;

// ── paidBillIndex reconcile ───────────────────────────────────
export const RECONCILE_COOLDOWN_MS = 120_000;
export const HEAVY_HEAL_COOLDOWN_MS = 20 * 60 * 1000;

export const PAID_INDEX_PENDING_LIMIT = 350;
export const PAID_INDEX_HEAL_SCAN_LIMIT = 400;
export const PAID_INDEX_DEDUPE_SCAN_LIMIT = 400;
export const PAID_INDEX_ACTIONS_LIMIT = 150;
export const PAID_INDEX_PAYMENTS_LIMIT = 100;

/** Legacy heal paths — capped (was 1000–2000 unbounded). */
export const PAID_INDEX_LEGACY_PAYMENTS_LIMIT = 350;
export const PAID_INDEX_LEGACY_ACTIONS_LIMIT = 350;
export const PAID_INDEX_LEGACY_ACTIONS_GLOBAL_LIMIT = 400;

// ── Settings / admin polls ────────────────────────────────────
export const SETTINGS_PULL_INTERVAL_MS = 180_000;
export const SUPER_APPROVALS_POLL_MS = 60_000;
export const BILLS_CONTROL_POLL_MS = 60_000;
export const REPORTS_CUSTOMER_META_POLL_MS = 10 * 60 * 1000;
export const ACTIVITY_LOGS_POLL_MS = 45_000;

// ── Activity / manager / reports caps ─────────────────────────
export const ACTIVITY_LOGS_DOC_LIMIT = 250;
export const MANAGER_COLLECTION_FETCH_LIMIT = 300;
export const MANAGER_CASH_TX_LIMIT = 250;
export const MANAGER_REPORTS_ORDERS_LIMIT = 400;
export const MANAGER_DATA_REFRESH_DEFAULT_MS = 60_000;

/** Customers browse — first page without search term. */
export const CUSTOMERS_BROWSE_PAGE_SIZE = 80;
export const CUSTOMERS_ORDERS_MAX_BATCHES = 2;

/** Reports customer name map — not full collection scan. */
export const REPORTS_CUSTOMERS_META_LIMIT = 500;

// ── Admin order fetch caps ────────────────────────────────────
export const ADMIN_ORDERS_LIMIT = 300;
export const CASH_FLOW_ORDERS_LIMIT = 350;
export const PAYMENT_STATS_ORDERS_LIMIT = 300;
export const DASHBOARD_RECENT_ORDERS_LIMIT = 200;
export const DASHBOARD_SUMMARY_FALLBACK_ORDER_LIMIT = 120;
export const BILLS_CONTROL_PAGE_SIZE = 80;
export const REPORT_PAGE_SIZE = 80;

/** Tab visibility reconcile throttle. */
export const VISIBILITY_RECONCILE_COOLDOWN_MS = 120_000;

// ── Backup / health ───────────────────────────────────────────
export const MODULE_BACKUP_QUERY_LIMIT = 350;
export const MODULE_PURGE_MAX_BATCHES = 3;
export const HEALTH_SCAN_CACHE_MS = 15 * 60 * 1000;
export const HEALTH_SCAN_READ_COST = 6;
