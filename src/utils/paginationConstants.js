/** Shared pagination defaults — Admin / Manager / Cashier lists */

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
export const BILLS_PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 300, 500];
export const DEFAULT_BILLS_PAGE_SIZE = 100;
export const COMPACT_PAGE_SIZE_OPTIONS = [10, 25, 50];

export const paginateList = (items, page, pageSize) => {
  const total = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    totalItems: total,
    slice: (items || []).slice(start, start + pageSize),
  };
};
