// ✨ src/services/qrHashService.js
// Purpose: Generate and verify QR hash codes for bill verification
// Rule: Hash must match before payment is accepted without mismatch warning
// Offline: Yes — pure computation, no network needed

const QR_SALT = 'AONE2026';

// ══════════════════════════════════════════════════════════════
// HASH GENERATION — as specified in master prompt
// ══════════════════════════════════════════════════════════════

export const generateQRHash = (billId, amount) => {
  const seed = `${billId}_${amount}_${QR_SALT}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash)
    .toString(36)
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, 'X');
};

// ══════════════════════════════════════════════════════════════
// ENCODE QR DATA
// ══════════════════════════════════════════════════════════════

export const encodeQRData = (billId, amount) => {
  const h = generateQRHash(billId, amount);
  return JSON.stringify({ id: billId, amt: Number(amount), h });
};

// ══════════════════════════════════════════════════════════════
// DECODE & VERIFY QR DATA
// ══════════════════════════════════════════════════════════════

export const decodeAndVerifyQR = (rawQRString) => {
  try {
    const cleaned = String(rawQRString).trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      try {
        data = JSON.parse(decodeURIComponent(cleaned));
      } catch {
        return {
          valid: false,
          error: 'Not JSON format',
          raw: rawQRString,
        };
      }
    }

    if (!data?.id || data?.amt == null || !data?.h) {
      return {
        valid: false,
        error: 'Invalid QR format — missing fields',
        raw: rawQRString,
      };
    }

    const expectedHash = generateQRHash(data.id, data.amt);
    const providedHash = String(data.h).toUpperCase();
    const hashMatch = expectedHash === providedHash;

    return {
      valid: hashMatch,
      mismatch: !hashMatch,
      billId: data.id,
      amount: Number(data.amt),
      hash: providedHash,
      expectedHash,
      raw: rawQRString,
    };
  } catch (err) {
    return {
      valid: false,
      error: `QR parse error: ${err.message}`,
      raw: rawQRString,
    };
  }
};

// ══════════════════════════════════════════════════════════════
// VERIFY AMOUNT MATCH
// ══════════════════════════════════════════════════════════════

export const verifyAmountMatch = (qrAmount, billAmount) => {
  const qr = Number(qrAmount) || 0;
  const bill = Number(billAmount) || 0;
  const difference = Math.abs(qr - bill);
  return {
    match: difference < 1,
    qrAmount: qr,
    billAmount: bill,
    difference,
  };
};

// ══════════════════════════════════════════════════════════════
// ✨ COMPATIBILITY ALIASES — for cashier components
// ══════════════════════════════════════════════════════════════

/**
 * Parse QR code into normalized format
 * Returns: { id, amt, h, isJson, raw }
 */
export const parseQRCode = (qrString) => {
  if (!qrString) return null;
  const trimmed = String(qrString).trim();

  const decoded = decodeAndVerifyQR(trimmed);

  if (decoded.billId) {
    return {
      id: String(decoded.billId).toUpperCase(),
      amt: Number(decoded.amount) || 0,
      h: String(decoded.hash || '').toUpperCase(),
      isJson: true,
      raw: trimmed,
    };
  }

  return {
    id: trimmed.toUpperCase(),
    amt: 0,
    h: '',
    isJson: false,
    raw: trimmed,
  };
};

/**
 * Verify QR hash against bill
 * Returns: { valid, reason, mismatch }
 */
export const verifyHash = (qrData, bill) => {
  if (!qrData || !bill) {
    return { valid: false, reason: 'Missing data', mismatch: null };
  }

  if (!qrData.isJson) {
    return { valid: true, reason: 'Raw serial (no hash)', mismatch: null };
  }

  const billAmount = Number(
    bill.totalAmount || bill.grandTotal || bill.total || 0
  );
  const expectedHash = generateQRHash(qrData.id, qrData.amt);

  if (expectedHash !== qrData.h) {
    return {
      valid: false,
      reason: 'Hash mismatch — possible tampering',
      mismatch: {
        qrAmount: qrData.amt,
        billAmount,
        expectedHash,
        receivedHash: qrData.h,
      },
    };
  }

  if (Number(qrData.amt) !== billAmount) {
    return {
      valid: false,
      reason: 'Amount mismatch',
      mismatch: {
        qrAmount: qrData.amt,
        billAmount,
        expectedHash,
        receivedHash: qrData.h,
      },
    };
  }

  return { valid: true, reason: 'Verified', mismatch: null };
};

export const generateHash = generateQRHash;

// ══════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════

export default {
  generateQRHash,
  generateHash,
  encodeQRData,
  decodeAndVerifyQR,
  verifyAmountMatch,
  parseQRCode,
  verifyHash,
};