// Multi-tenant / branch scope — safe defaults for single-shop deployments.

export const DEFAULT_TENANT_ID = 'aone';

/** Resolve tenant + store + branch + actor from user/settings context. */
export const resolveTenantScope = (context = {}) => {
  const userData = context.userData || context;
  const settings = context.settings || {};
  const storeId = context.storeId
    || userData?.primaryStore
    || userData?.storeId
    || userData?.storeIds?.[0]
    || 'default';
  const branchId = context.branchId || storeId;
  return {
    tenantId: settings?.shop?.tenantId
      || settings?.tenantId
      || userData?.tenantId
      || DEFAULT_TENANT_ID,
    storeId,
    branchId,
    userId: context.userId
      || context.billerId
      || context.cashierId
      || userData?.uid
      || '',
  };
};
