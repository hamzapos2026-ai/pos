// File: src/hooks/useManagerData.js
// Purpose: Reusable hook for loading manager data with loading/error states
// Features: Auto-refresh on network restore, pauses when tab hidden

import { useState, useEffect, useCallback, useRef } from 'react';
import { VISIBILITY_RECONCILE_COOLDOWN_MS, MANAGER_DATA_REFRESH_DEFAULT_MS } from '../utils/firebaseQuotaConfig';

const useManagerData = (loader, deps = [], options = {}) => {
    const {
        autoRefresh = false,
        refreshInterval = MANAGER_DATA_REFRESH_DEFAULT_MS,
        refreshOnOnline = true,
    } = options;

    const [data, setData] = useState(options.initialData || null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);
    const lastOnlineRefreshRef = useRef(0);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const result = await loader();
            if (mountedRef.current) setData(result);
        } catch (err) {
            if (mountedRef.current) setError(err?.message || 'Failed to load');
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, deps);

    useEffect(() => {
        mountedRef.current = true;
        load();

        if (autoRefresh) {
            timerRef.current = setInterval(() => {
                if (!document.hidden) load(true);
            }, refreshInterval);
        }

        const onVisible = () => {
            if (document.visibilityState === 'visible' && autoRefresh) load(true);
        };
        document.addEventListener('visibilitychange', onVisible);

        const handleOnline = () => {
            setIsOffline(false);
            if (!refreshOnOnline) return;
            const now = Date.now();
            if (now - lastOnlineRefreshRef.current < VISIBILITY_RECONCILE_COOLDOWN_MS) return;
            lastOnlineRefreshRef.current = now;
            load(true);
        };
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            mountedRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [load, autoRefresh, refreshInterval, refreshOnOnline]);

    return { data, loading, error, refreshing, isOffline, refresh: () => load(true), reload: () => load(false) };
};

export default useManagerData;
