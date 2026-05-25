// src/utils/dateHelpers.js
// ✅ Master Prompt §1: Offline-first safe date handling
// ✅ Handles: Firebase Timestamp | JS Date | ISO string | number | null
// ✅ Zero crash guarantee — always returns safe value
// ✅ Used by: BillerDashboard, serialService, sync engine

/**
 * Convert ANY date format → JS Date
 * Safe: never throws, returns null if unparseable
 */
export const toSafeDate = (value) => {
    if (!value) return null;

    try {
        // ── Firebase Timestamp object (.toDate method) ──────
        if (typeof value?.toDate === 'function') {
            const d = value.toDate();
            return isNaN(d?.getTime()) ? null : d;
        }

        // ── Firebase Timestamp raw {seconds, nanoseconds} ───
        if (
            typeof value === 'object' &&
            typeof value.seconds === 'number'
        ) {
            return new Date(value.seconds * 1000);
        }

        // ── Already JS Date ──────────────────────────────────
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        // ── ISO string or date string ────────────────────────
        if (typeof value === 'string' && value.trim().length > 0) {
            const d = new Date(value.trim());
            return isNaN(d.getTime()) ? null : d;
        }

        // ── Unix timestamp number ────────────────────────────
        if (typeof value === 'number' && value > 0) {
            // Auto-detect seconds vs milliseconds
            const ms = value > 1_000_000_000_000 ? value : value * 1000;
            return new Date(ms);
        }

        return null;
    } catch {
        return null;
    }
};

/**
 * Convert ANY date → ISO string
 * Safe: never throws, returns null if unparseable
 *
 * REPLACES: value?.toISOString() — which crashes on Timestamp
 */
export const toSafeISOString = (value) => {
    const d = toSafeDate(value);
    return d ? d.toISOString() : null;
};

/**
 * Convert ANY date → ISO string with fallback
 * Returns current time string if value is null/invalid
 */
export const toISOStringOrNow = (value) => {
    return toSafeISOString(value) ?? new Date().toISOString();
};

/**
 * Convert ANY date → Firebase Timestamp
 * Safe for Firestore writes
 */
export const toFirestoreTimestamp = (value) => {
    // Dynamic import to avoid circular deps
    const { Timestamp } = require('firebase/firestore');
    const d = toSafeDate(value);
    return d ? Timestamp.fromDate(d) : Timestamp.now();
};

/**
 * Today's date string YYYYMMDD (Pakistan UTC+5)
 * Used by serial generation
 */
export const todayPK = () => {
    const now = new Date();
    // Pakistan is UTC+5 — add offset
    const pkOffset = 5 * 60; // minutes
    const localOffset = now.getTimezoneOffset(); // minutes (negative for ahead)
    const pkTime = new Date(
        now.getTime() + (pkOffset + localOffset) * 60000
    );
    return (
        String(pkTime.getFullYear()) +
        String(pkTime.getMonth() + 1).padStart(2, '0') +
        String(pkTime.getDate()).padStart(2, '0')
    );
};

/**
 * Format date for Pakistan display
 */
export const formatPKDisplay = (value, opts = {}) => {
    const d = toSafeDate(value);
    if (!d) return '--';

    const defaults = {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    };

    try {
        return d.toLocaleString('en-PK', { ...defaults, ...opts });
    } catch {
        return d.toISOString();
    }
};

/**
 * Relative time (e.g. "5m ago", "2h ago")
 */
export const relativeTime = (value) => {
    const d = toSafeDate(value);
    if (!d) return '--';

    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60_000);
    const hr = Math.floor(diff / 3_600_000);
    const day = Math.floor(diff / 86_400_000);

    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;

    return d.toLocaleDateString('en-PK', {
        day: '2-digit', month: 'short',
    });
};