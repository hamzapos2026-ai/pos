import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSerialPreview, getInvoiceSerialConfig, setInvoiceSerialConfig } from '../src/services/serialService';

describe('serial service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T12:00:00+05:00'));
    setInvoiceSerialConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds STORE-BIL-DDMMYY-counter preview', () => {
    const preview = buildSerialPreview({ storeCode: 'JMJ' }, 867);
    expect(preview).toBe('JMJ-BIL-020726-000867');
  });

  it('maps JM-2 branch alias to JM2 serial prefix', () => {
    const preview = buildSerialPreview({ storeCode: 'JM-2' }, 104);
    expect(preview).toBe('JM2-BIL-020726-000104');
  });

  it('maps JM-1 branch alias to JM1 serial prefix', () => {
    const preview = buildSerialPreview({ storeCode: 'JM-1' }, 867);
    expect(preview).toMatch(/^JM1-BIL-\d{6}-000867$/);
  });

  it('rejects Firebase doc id style prefix (A3G13)', () => {
    const preview = buildSerialPreview({ storeCode: 'A3G13' }, 1104);
    expect(preview).toBe('JMJ-BIL-020726-001104');
  });

  it('prefers JM-2 branch label over wrong shortCode JMJ', () => {
    const preview = buildSerialPreview({ storeCode: 'JM-2' }, 104);
    expect(preview).toBe('JM2-BIL-020726-000104');
  });
});
