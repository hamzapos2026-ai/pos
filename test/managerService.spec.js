import { describe, it, expect } from 'vitest';

describe('managerService basic exports', () => {
  it('exports expected methods', async () => {
    const mod = await import('../src/services/managerService');
    const managerService = mod.default || mod;
    expect(typeof managerService.collectPayment).toBe('function');
    expect(typeof managerService.markCommissionPaid).toBe('function');
    expect(typeof managerService.addCashTransaction).toBe('function');
  });
});
