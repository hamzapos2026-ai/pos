// src/utils/customerHelpers.js
// ✅ Master Prompt §2: Calculator-speed customer handling
// ✅ Sequential Walk-in numbering (Customer 1, 2, 3...)
// ✅ Resets daily
// ✅ Phone-only customer support
// ✅ Backward compatible with existing customer objects

const COUNTER_KEY = 'aone_walkin_counter';
const DATE_KEY = 'aone_walkin_date';

// ── Internal helpers ────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const _getCounter = () => {
    try {
        const savedDate = localStorage.getItem(DATE_KEY);
        const today = todayStr();

        if (savedDate !== today) {
            // New day — reset
            localStorage.setItem(DATE_KEY, today);
            localStorage.setItem(COUNTER_KEY, '0');
            return 0;
        }

        return parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
    } catch {
        return 0;
    }
};

const _setCounter = (n) => {
    try {
        localStorage.setItem(COUNTER_KEY, String(n));
        localStorage.setItem(DATE_KEY, todayStr());
    } catch { }
};

// ── Public API ──────────────────────────────────────────────

/**
 * Get next walk-in customer name
 * Returns: "Customer 1", "Customer 2", etc. (resets daily)
 */
export const getNextWalkInName = () => {
    const next = _getCounter() + 1;
    _setCounter(next);
    return `Customer ${next}`;
};

/**
 * Peek next number without incrementing
 */
export const peekNextWalkInNumber = () => _getCounter() + 1;

/**
 * Reset counter (on new shift or manual reset)
 */
export const resetWalkInCounter = () => {
    try {
        localStorage.removeItem(COUNTER_KEY);
        localStorage.removeItem(DATE_KEY);
    } catch { }
};

/**
 * Check if customer is a walk-in / anonymous
 */
export const isWalkIn = (customer) => {
    if (!customer) return true;
    const name = (customer.name || '').trim();
    const phone = (customer.phone || '').trim();

    if (!name && !phone) return true;

    const WALK_IN_PATTERNS = [
        /^walking\s*customer$/i,
        /^walk-?in$/i,
        /^customer\s*\d*$/i,
        /^anonymous$/i,
        /^guest$/i,
    ];

    return WALK_IN_PATTERNS.some((p) => p.test(name));
};

/**
 * Normalize customer before saving bill
 *
 * Rules:
 * - No name + No phone  → "Customer N" (sequential)
 * - No name + Has phone → "Customer (03xx-xxxxxxx)"
 * - Has name + No phone → use name as-is
 * - Has name + Has phone → use both as-is
 */
export const normalizeCustomerForBill = (customer) => {
    const name = (customer?.name || '').trim();
    const phone = (customer?.phone || '').trim();
    const city = customer?.city || 'Karachi';
    const market = customer?.market || '';

    // Pure walk-in — no name, no phone
    if ((!name || isWalkIn({ name })) && !phone) {
        return {
            name: 'Walk-in Customer',
            phone: '',
            city,
            market,
            isWalkIn: true,
            type: 'walkin',
        };
    }

    // Has phone but no real name
    if ((!name || isWalkIn({ name })) && phone) {
        const finalName = (name && /^Customer\s*\d+$/i.test(name)) ? name : getNextWalkInName();
        return {
            name: finalName,
            phone,
            city,
            market,
            isWalkIn: false,
            type: 'phone-only',
        };
    }

    // Has proper name
    return {
        name,
        phone,
        city,
        market,
        isWalkIn: false,
        type: 'named',
    };
};

/**
 * Display name for order list / receipts
 * Returns clean name without "Walking Customer" garbage
 */
export const getCustomerDisplayName = (customer) => {
    if (!customer) return 'Walk-in';

    const name = (customer.name || '').trim();
    const phone = (customer.phone || '').trim();

    if (!name || isWalkIn({ name })) {
        return phone || 'Walk-in';
    }

    return name;
};