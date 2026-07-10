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

/** Normalize phone to comparable digits (PK: 923XXXXXXXXX). */
export const phoneDigitsKey = (phone = '') => {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0092')) d = d.slice(2);
    if (d.startsWith('92') && d.length === 12) return d;
    if (d.startsWith('0') && d.length === 11) return `92${d.slice(1)}`;
    if (d.length === 10 && d.startsWith('3')) return `92${d}`;
    return d;
};

/** Read the phone string out of a numbers-list entry (string or { phone }). */
export const numberEntryPhone = (entry) =>
    (typeof entry === 'string' ? entry : entry?.phone || '').trim();

/**
 * Add a phone to a numbers list, de-duplicated by digits key.
 * Numbers are stored as plain display strings; first number stays first.
 * @returns {string[]} new array (never mutates input)
 */
export const mergeNumberIntoList = (list = [], phone = '') => {
    const out = (Array.isArray(list) ? list : [])
        .map(numberEntryPhone)
        .filter(Boolean);
    const p = (phone || '').trim();
    if (!p) return [...new Set(out)];
    const key = phoneDigitsKey(p);
    const exists = out.some((n) => phoneDigitsKey(n) === key);
    if (!exists) out.push(p);
    // De-dupe while preserving order
    const seen = new Set();
    return out.filter((n) => {
        const k = phoneDigitsKey(n) || n;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

/** Union two numbers lists (dedupe by digits key, order preserved). */
export const unionNumberLists = (a = [], b = []) => {
    let out = [];
    (Array.isArray(a) ? a : []).forEach((n) => { out = mergeNumberIntoList(out, numberEntryPhone(n)); });
    (Array.isArray(b) ? b : []).forEach((n) => { out = mergeNumberIntoList(out, numberEntryPhone(n)); });
    return out;
};

export const parseAutoCustomerNumber = (name) => {
    const m = /^customer\s*(\d+)$/i.exec((name || '').trim());
    return m ? parseInt(m[1], 10) : null;
};

export const isAutoNumberName = (name) => parseAutoCustomerNumber(name) != null;

const _counterKeys = (storeId) => {
    const sid = storeId || 'default';
    return {
        counter: `${COUNTER_KEY}_${sid}`,
        date: `${DATE_KEY}_${sid}`,
    };
};

const _getCounter = (storeId) => {
    try {
        const { counter } = _counterKeys(storeId);
        return parseInt(localStorage.getItem(counter) || '0', 10);
    } catch {
        return 0;
    }
};

const _setCounter = (n, storeId) => {
    try {
        const { counter, date } = _counterKeys(storeId);
        localStorage.setItem(counter, String(n));
        localStorage.setItem(date, todayStr());
    } catch { }
};

/** Sync local counter from existing Customer N names (never go backwards). */
export const syncAutoCustomerCounter = (customerDocs, storeId) => {
    let max = _getCounter(storeId);
    (customerDocs || []).forEach((c) => {
        const n = parseAutoCustomerNumber(c?.name);
        if (n != null && n > max) max = n;
    });
    if (max > _getCounter(storeId)) _setCounter(max, storeId);
    return max;
};

// ── Public API ──────────────────────────────────────────────

/** Default bill customer when name + phone are both empty. */
export const WALKING_CUSTOMER_NAME = 'Walking Customer';

/**
 * Get next unique auto customer name — never resets daily; skips taken names.
 */
export const getNextWalkInName = (storeId, { isNameTaken } = {}) => {
    let n = _getCounter(storeId);
    let candidate;
    do {
        n += 1;
        candidate = `Customer ${n}`;
    } while (isNameTaken?.(candidate));
    _setCounter(n, storeId);
    return candidate;
};

/**
 * Peek next number without incrementing
 */
export const peekNextWalkInNumber = (storeId) => _getCounter(storeId) + 1;

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
        /^walk-?in(\s*customer)?$/i,
        /^anonymous$/i,
        /^guest$/i,
    ];

    return WALK_IN_PATTERNS.some((p) => p.test(name));
};

/** Blank or walk-in / Customer N placeholder — no real customer typed. */
export const isEmptyCheckoutCustomerInput = (name = '', phone = '') => {
    const ph = (phone || '').trim();
    const nm = (name || '').trim();
    if (ph) return false;
    if (!nm) return true;
    if (isWalkIn({ name: nm })) return true;
    return /^customer\s*\d+$/i.test(nm);
};

/** Walk-in / default placeholder — one backspace or type replaces entire value. */
export const isEditablePlaceholderName = (name) => isWalkIn({ name: (name || '').trim() });

export const sanitizeNameForInput = (name) => (
  isEditablePlaceholderName(name) ? '' : (name || '').trim()
);

/** Auto-generated / placeholder names (Customer 1, walk-in, empty). */
export const isAutoCustomerName = (name) => {
    const n = (name || '').trim();
    if (!n) return true;
    if (isWalkIn({ name: n })) return true;
    return /^customer\s*\d+$/i.test(n);
};

/** User typed a real name (not walk-in / not auto Customer N). Min 2 chars — avoids "W" partial saves. */
export const hasRealCustomerName = (name) => {
    const n = (name || '').trim();
    if (n.length < 2) return false;
    if (isWalkIn({ name: n })) return false;
    if (/^customer\s*\d+$/i.test(n)) return false;
    return true;
};

/**
 * Assign or reuse Customer N for phone-only — one unique number per phone, never duplicate names.
 */
export const resolveAutoCustomerNameForPhone = (phone, { inputName = '', findByPhone, storeId, isNameTaken } = {}) => {
    const phoneTrim = (phone || '').trim();
    if (!phoneTrim) return (inputName || '').trim();

    if (hasRealCustomerName(inputName)) return inputName.trim();

    const existing = findByPhone?.(phoneTrim);
    const existingName = (existing?.name || '').trim();
    if (existingName && !isWalkIn({ name: existingName })) {
        if (isAutoCustomerName(existingName)) return existingName;
        if (hasRealCustomerName(existingName)) return existingName;
    }

    const trimmed = (inputName || '').trim();
    const myKey = phoneDigitsKey(phoneTrim);
    if (/^customer\s*\d+$/i.test(trimmed)) {
        const exKey = phoneDigitsKey(existing?.phone || '');
        // Only reuse Customer N label when it belongs to this same phone
        if (existing && exKey === myKey) return trimmed;
    }

    return getNextWalkInName(storeId, { isNameTaken });
};

/**
 * Plan renames so each unique phone gets Customer 1, 2, 3… per branch (no duplicates within a store).
 * Returns { updates: [{ id, name, oldName, phone, storeId }], nextCounter }.
 */
export const planUniqueAutoCustomerRenames = (customerDocs, { storeId: onlyStoreId, normalizeStoreId } = {}) => {
    const docTs = (c) => {
        try {
            const v = c?.createdAt;
            return v?.toDate ? v.toDate().getTime() : new Date(v || 0).getTime() || 0;
        } catch {
            return 0;
        }
    };

    const normSid = (c) => {
        const raw = String(c?.storeId || 'default').trim() || 'default';
        return normalizeStoreId ? normalizeStoreId(raw) : raw;
    };

    const storeGroups = new Map();

    (customerDocs || []).forEach((c) => {
        if (!c?.id) return;
        if (isWalkIn({ name: c.name, phone: c.phone })) return;

        const phoneKey = phoneDigitsKey(c.phone || c.phoneNormalized);
        if (phoneKey.length < 10) return;

        const sid = normSid(c);
        if (onlyStoreId && sid !== onlyStoreId) return;

        if (!storeGroups.has(sid)) storeGroups.set(sid, new Map());
        const groups = storeGroups.get(sid);
        if (!groups.has(phoneKey)) groups.set(phoneKey, []);
        groups.get(phoneKey).push(c);
    });

    const updates = [];
    let maxCounter = 0;

    storeGroups.forEach((groups, sid) => {
        const sorted = [...groups.entries()].sort((a, b) => {
            const ta = Math.min(...a[1].map(docTs));
            const tb = Math.min(...b[1].map(docTs));
            return ta - tb;
        });

        let num = 0;
        sorted.forEach(([, docs]) => {
            num += 1;
            const newName = `Customer ${num}`;
            docs.forEach((docRow) => {
                if ((docRow.name || '').trim() !== newName) {
                    updates.push({
                        id: docRow.id,
                        name: newName,
                        oldName: docRow.name || '',
                        phone: docRow.phone || docRow.phoneNormalized || '',
                        storeId: sid,
                    });
                }
            });
        });

        if (num > maxCounter) maxCounter = num;
    });

    return { updates, nextCounter: maxCounter };
};

/**
 * Block saving when phone already belongs to a different real customer name.
 * Skips when user is editing the same phone in checkout (runtime name change).
 * @returns {string|null} Error message or null if OK
 */
export const checkPhoneNameConflict = (inputName, existingCustomer, { allowCheckoutUpdate = false } = {}) => {
    if (allowCheckoutUpdate) return null;

    const existingName = (existingCustomer?.name || '').trim();
    const input = (inputName || '').trim();
    if (!existingName) return null;

    const hasRealExisting = !isAutoCustomerName(existingName);
    const hasRealInput = input && !isAutoCustomerName(input);

    if (hasRealExisting && hasRealInput && existingName.toLowerCase() !== input.toLowerCase()) {
        return `This phone number is already registered to "${existingName}". Use that customer or enter a different number.`;
    }
    return null;
};

/**
 * Merge user input with an existing phone record (reuse name/city when appropriate).
 */
export const mergeCustomerWithPhoneRecord = (input, existingCustomer) => {
    const name = (input?.name || '').trim();
    const phone = (input?.phone || '').trim();
    const existingName = (existingCustomer?.name || '').trim();

    let mergedName = name;
    if (existingName && (!name || isAutoCustomerName(name))) {
        mergedName = existingName;
    }

    return {
        ...input,
        name: mergedName,
        phone,
        city: input?.city || existingCustomer?.city || 'Karachi',
        market: input?.market || existingCustomer?.market || '',
        country: input?.country || existingCustomer?.country,
    };
};

/**
 * Normalize customer before saving bill
 *
 * Rules:
 * - No name + No phone  → Walking Customer
 * - No name + Has phone → Customer 1, 2, 3… (unique, reused per phone)
 * - Has name + No phone → use name as-is
 * - Has name + Has phone → use both as-is
 */
export const normalizeCustomerForBill = (customer, options = {}) => {
    const { findByPhone, storeId, isNameTaken } = options;
    const name = (customer?.name || '').trim();
    const phone = (customer?.phone || '').trim();
    const city = customer?.city || 'Karachi';
    const market = customer?.market || '';
    // Preserve the explicit profile link (set by the biller when they pick/look up an
    // existing customer) so bill + payment persona updates target the SAME profile.
    const linkExtra = customer?.personaDocId ? { personaDocId: customer.personaDocId } : {};

    if (!phone) {
        if (!hasRealCustomerName(name)) {
            return {
                name: WALKING_CUSTOMER_NAME,
                phone: '',
                city,
                market,
                isWalkIn: true,
                type: 'walkin',
                ...linkExtra,
            };
        }
        return {
            name,
            phone: '',
            city,
            market,
            isWalkIn: false,
            type: 'named',
            ...linkExtra,
        };
    }

    const finalName = resolveAutoCustomerNameForPhone(phone, { inputName: name, findByPhone, storeId, isNameTaken });
    return {
        name: finalName,
        phone,
        city,
        market,
        isWalkIn: false,
        type: hasRealCustomerName(name) ? 'named' : 'phone-only',
        ...linkExtra,
    };
};

/** Stable Firestore doc id per store + phone (or name-only). */
export const buildCustomerDocId = (storeId, { phone, name } = {}) => {
    const sid = storeId || 'default';
    const phoneTrim = (phone || '').trim();
    if (phoneTrim) return `${sid}_phone_${phoneDigitsKey(phoneTrim)}`;
    const n = (name || '').trim();
    if (!n) return null;
    return `${sid}_name_${n.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40).toLowerCase()}`;
};

/** Final customer for bill + save — form real name always wins. */
export const finalizeCustomerForCheckout = (input, { storeId, findByPhone, isNameTaken } = {}) => {
    const nameTrim = (input?.name || '').trim();
    const phoneTrim = (input?.phone || '').trim();
    const normalized = normalizeCustomerForBill(
        { ...input, name: nameTrim, phone: phoneTrim },
        { storeId, findByPhone, isNameTaken },
    );
    if (hasRealCustomerName(nameTrim)) {
        return { ...normalized, name: nameTrim };
    }
    return normalized;
};

/** Firestore customer document fields (merge write). */
export const buildCustomerFirestorePayload = (customer, { storeId, billerId } = {}) => {
    const name = (customer?.name || '').trim();
    const phone = (customer?.phone || '').trim();
    // Numbers this customer is known by (multiple mobiles per person). The current
    // phone is always included; repository unions this with any already-saved numbers.
    const numbers = mergeNumberIntoList(customer?.numbers || [], phone);
    return {
        name,
        nameLower: name.toLowerCase(),
        phone,
        phoneNormalized: phoneDigitsKey(phone),
        numbers,
        city: customer?.city || '',
        market: customer?.market || '',
        country: customer?.country || 'PK',
        countryName: customer?.countryName || '',
        storeId: storeId || 'default',
        billerId: billerId || null,
        isWalking: false,
        isAutoNamed: isAutoCustomerName(name),
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

    // Phone-only checkout: internal label is "Customer N" — show phone in lists
    if (isAutoCustomerName(name)) {
        return phone || name;
    }

    return name;
};