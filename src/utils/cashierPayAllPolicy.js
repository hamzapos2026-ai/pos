export const DEFAULT_CASHIER_PAY_ALL_POLICY = {
  enabled: true,
};

export const normalizeCashierPayAllRule = (raw = {}) => ({
  enabled: raw.enabled !== false,
});

export const normalizeCashierPayAllPolicyDoc = (raw) => {
  const doc = raw?.value ?? raw ?? {};
  return {
    default: normalizeCashierPayAllRule({ ...DEFAULT_CASHIER_PAY_ALL_POLICY, ...(doc.default || doc.global || {}) }),
    branches: Object.fromEntries(
      Object.entries(doc.branches || {}).map(([k, v]) => [k, normalizeCashierPayAllRule(v)]),
    ),
    cashiers: Object.fromEntries(
      Object.entries(doc.cashiers || {}).map(([k, v]) => [k, normalizeCashierPayAllRule(v)]),
    ),
  };
};

/** cashier user → branch → global default */
export const resolveCashierPayAllRule = (policyDoc, branchId, cashierId) => {
  const doc = normalizeCashierPayAllPolicyDoc(policyDoc);
  let rule = { ...doc.default };
  if (branchId && doc.branches[branchId]) {
    rule = { ...rule, ...doc.branches[branchId] };
  }
  if (cashierId && doc.cashiers[cashierId]) {
    rule = { ...rule, ...doc.cashiers[cashierId] };
  }
  return rule;
};

export const isCashierPayAllEnabled = (policyDoc, branchId, cashierId) =>
  resolveCashierPayAllRule(policyDoc, branchId, cashierId).enabled !== false;
