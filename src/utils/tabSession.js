// Tab-scoped session helpers — each browser tab keeps its own active role
// so Super Admin + Biller can run simultaneously with the SAME account.

const TAB_ROLE_KEY = 'aone_tab_active_role';
const TAB_ID_KEY = 'aone_tab_id';

/** Stable id for this tab (sessionStorage — not shared across tabs). */
export const getTabId = () => {
  try {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    return `tab_${Date.now()}`;
  }
};

/** Active role for THIS tab only. */
export const getTabActiveRole = () => {
  try {
    return sessionStorage.getItem(TAB_ROLE_KEY) || null;
  } catch {
    return null;
  }
};

export const setTabActiveRole = (role) => {
  try {
    if (role) sessionStorage.setItem(TAB_ROLE_KEY, String(role));
    else sessionStorage.removeItem(TAB_ROLE_KEY);
  } catch {
    /* ignore */
  }
};

export const clearTabActiveRole = () => setTabActiveRole(null);

/**
 * Read optional ?role=biller from URL (used when opening a new tab directly).
 * Consumes the param so refresh does not keep forcing the role.
 */
export const consumeRoleFromUrl = () => {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    if (!role) return null;
    params.delete('role');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
    return role;
  } catch {
    return null;
  }
};

export default {
  getTabId,
  getTabActiveRole,
  setTabActiveRole,
  clearTabActiveRole,
  consumeRoleFromUrl,
};
