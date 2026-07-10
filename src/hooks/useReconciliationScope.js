import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import useStoresMap, { buildStoreIdAliases, resolveStoreName } from './useStoresMap';
import {
  isElevatedRole,
  resolveUserBranchIds,
  resolveUserPrimaryBranch,
} from '../utils/branchAccess';

/** Super Admin / Admin — sab branches; Manager — sirf apna branch */
export const useReconciliationScope = () => {
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const elevated = isElevatedRole(userData);

  const { storeIds, storeAliases } = useMemo(() => {
    if (elevated) {
      return { storeIds: null, storeAliases: [] };
    }
    const primary = resolveUserPrimaryBranch(userData);
    const ids = resolveUserBranchIds(userData);
    const merged = [...new Set([
      primary,
      ...ids,
      ...buildStoreIdAliases(primary, storesMap, ids),
    ].filter(Boolean))].slice(0, 10);

    const aliasSet = new Set();
    merged.forEach((id) => {
      buildStoreIdAliases(id, storesMap, merged).forEach((a) => aliasSet.add(a));
    });

    return {
      storeIds: merged.length ? merged : null,
      storeAliases: [...aliasSet],
    };
  }, [userData, storesMap, elevated]);

  const branchName = useMemo(() => {
    if (elevated) return '';
    return resolveStoreName(storeIds?.[0], storesMap) || '';
  }, [elevated, storeIds, storesMap]);

  const scopeLabel = useMemo(() => {
    if (elevated) return 'Sab branches — Super Admin view';
    return branchName ? `Branch: ${branchName}` : 'Aapka branch';
  }, [elevated, branchName]);

  return {
    storeIds,
    storeAliases,
    elevated,
    scopeLabel,
    branchName,
    userData,
  };
};

export default useReconciliationScope;
