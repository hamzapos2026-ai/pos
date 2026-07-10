import { toast } from 'react-hot-toast';
import ur from '../lang/ur.json';

const getNested = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((cur, key) => (cur && typeof cur === 'object' ? cur[key] : undefined), obj);
};

/** Roman Urdu strings for backup/migrate — always from ur.json regardless of UI language. */
export const backupRomanT = (key, fallback = '', vars = null) => {
  const path = key.startsWith('backup.') ? key.slice('backup.'.length) : key;
  let result = getNested(ur.backup, path);
  if (typeof result !== 'string') result = fallback || path;

  if (vars && typeof vars === 'object') {
    Object.entries(vars).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
    });
  }
  return result;
};

/** Short compact toasts for data/backup actions */
export const backupMiniToast = {
  loading: (msg) => toast.loading(msg, { style: { fontSize: '12px', padding: '8px 14px' } }),
  success: (msg, id) => toast.success(msg, {
    id,
    duration: 2200,
    style: { fontSize: '12px', padding: '8px 14px' },
  }),
  error: (msg, id) => toast.error(msg, {
    id,
    duration: 2800,
    style: { fontSize: '12px', padding: '8px 14px' },
  }),
};
