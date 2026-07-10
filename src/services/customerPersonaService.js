/**
 * Customer Persona Service — lightweight incremental updates after transactions.
 * Never blocks billing UI; failures are logged only.
 */

import { mergeCustomerPersona, getCustomerPersona } from '../repositories/customerRepository';
import { resolveTenantScope } from '../utils/tenantScope';
import {
  buildBillPersonaPatch,
  buildPaymentPersonaPatch,
  buildReturnPersonaPatch,
} from '../utils/customerPersonaSchema';
import { isWalkIn } from '../utils/customerHelpers';

const safeRun = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    console.warn('[customerPersonaService]', err?.message || err);
    return null;
  }
};

/** Identity-only sync (F8 customer step) — no visit/sales increment. */
export const syncCustomerIdentity = (params = {}) => safeRun(async () => {
  const scope = resolveTenantScope(params);
  return mergeCustomerPersona({
    customer: params.customer || {},
    scope: { ...scope, billerId: params.billerId },
    identityExtra: {
      email: params.customer?.email || '',
    },
  });
});

/** After bill submit — increment visits, sales, favorites. */
export const applyBillTransaction = (params = {}) => safeRun(async () => {
  const customer = params.customer || {};
  if (isWalkIn(customer) && !(customer.phone || '').trim()) return null;

  const scope = resolveTenantScope(params);
  const existing = await getCustomerPersona(scope.storeId, customer);
  const personaPatch = buildBillPersonaPatch(existing, {
    billAmount: params.billAmount ?? params.amount ?? 0,
    items: params.items || [],
    scope: {
      ...scope,
      balanceDue: params.balanceDue ?? params.outstandingAfter,
      paymentMethod: params.paymentMethod,
      billId: params.billId || params.orderId,
    },
    salespersonId: params.salespersonId || params.salesperson?.id || '',
  });

  return mergeCustomerPersona({
    customer,
    scope: { ...scope, billerId: params.billerId || scope.userId },
    personaPatch,
  });
});

/** After payment collected (cashier / manager / credit). */
export const applyPaymentTransaction = (params = {}) => safeRun(async () => {
  const customer = params.customer || params.bill?.customer || {
    name: params.bill?.customerName,
    phone: params.bill?.customerPhone,
  };
  if (!customer?.name && !customer?.phone) return null;
  if (isWalkIn(customer) && !(customer.phone || '').trim()) return null;

  const scope = resolveTenantScope({
    ...params,
    storeId: params.storeId || params.bill?.storeId,
    branchId: params.branchId || params.bill?.branchId,
    userId: params.userId || params.cashierId || params.collectedBy,
  });

  const existing = await getCustomerPersona(scope.storeId, customer);
  const personaPatch = buildPaymentPersonaPatch(existing, {
    paidAmount: params.paidAmount ?? params.amount ?? 0,
    outstandingAfter: params.outstandingAfter,
    scope,
    isCredit: params.isCredit,
    paymentMethod: params.paymentMethod || params.bill?.paymentMethod,
    billId: params.billId || params.bill?.id || params.bill?.billId,
  });

  return mergeCustomerPersona({ customer, scope, personaPatch });
});

/** After return / refund processed. */
export const applyReturnTransaction = (params = {}) => safeRun(async () => {
  const customer = params.customer || {};
  if (!customer?.name && !customer?.phone) return null;
  if (isWalkIn(customer) && !(customer.phone || '').trim()) return null;

  const scope = resolveTenantScope(params);
  const existing = await getCustomerPersona(scope.storeId, customer);
  const personaPatch = buildReturnPersonaPatch(existing, {
    refundAmount: params.refundAmount ?? 0,
    scope,
  });

  return mergeCustomerPersona({ customer, scope, personaPatch });
});

export default {
  syncCustomerIdentity,
  applyBillTransaction,
  applyPaymentTransaction,
  applyReturnTransaction,
};
