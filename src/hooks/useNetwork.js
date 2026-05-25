import { useEffect, useState, useRef } from 'react';

const defaultHeartbeatUrl = () => window.location.origin + '/favicon.ico';

export default function useNetwork({ heartbeatUrl = defaultHeartbeatUrl(), intervalMs = 15000 } = {}) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : false);
  const [lastOk, setLastOk] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let id = null;
    const heartbeat = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        await fetch(heartbeatUrl, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeout);
        if (isMounted.current) {
          setOnline(true);
          setLastOk(Date.now());
        }
      } catch (e) {
        if (isMounted.current) setOnline(false);
      }
    };

    // initial heartbeat
    heartbeat();
    id = setInterval(heartbeat, intervalMs);

    return () => {
      isMounted.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (id) clearInterval(id);
    };
  }, [heartbeatUrl, intervalMs]);

  return { online, lastOk };
}
