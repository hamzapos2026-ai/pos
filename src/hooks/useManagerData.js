// File: src/hooks/useManagerData.js
// Purpose: Reusable hook for loading manager data with loading/error states
// Features: Auto-refresh on network restore, BroadcastChannel listener

import { useState, useEffect, useCallback, useRef } from 'react';

const useManagerData = (loader, deps = [], options = {}) => {
    const {
        autoRefresh = false,
        refreshInterval = 30000,
        refreshOnOnline = true,
    } = options;

    const [data, setData] = useState(options.initialData || null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);

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
            timerRef.current = setInterval(() => load(true), refreshInterval);
        }

        const handleOnline = () => {
            if (refreshOnOnline) load(true);
        };
        window.addEventListener('online', handleOnline);

        return () => {
            mountedRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
            window.removeEventListener('online', handleOnline);
        };
    }, [load, autoRefresh, refreshInterval, refreshOnOnline]);

    return { data, loading, error, refreshing, refresh: () => load(true), reload: () => load(false) };
};

export default useManagerData;