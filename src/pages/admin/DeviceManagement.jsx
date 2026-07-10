// DeviceManagement — live POS terminals, full metadata, responsive cards + table
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, Monitor, Wifi, WifiOff, Search, Trash2,
  ShieldAlert, Key, Lock, Unlock, RefreshCw,
  User, MapPin, AppWindow, Plus, Edit, Globe, Clock,
  ChevronLeft, ChevronRight, Activity, LayoutGrid, List,
  X, Copy, Check, ExternalLink, Cpu, Store, Fingerprint,
  Calendar, Radio, Zap,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, setDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { logActivity } from '../../services/activityLogger';
import {
  getDeviceLabel,
  isDeviceOnline,
  getLocalDevices,
  mergeDeviceMaps,
  heartbeatSessionDevice,
  formatUserAgentLabel,
  DEVICE_ONLINE_WINDOW_MS,
} from '../../utils/deviceRegistry';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';
import { useLanguage } from '../../hooks/useLanguage';

const PAGE_SIZES = [12, 24, 48, 96];
const LIVE_TICK_MS = 10_000;
const LOCAL_REFRESH_MS = 15_000;

const toDate = (ts) => {
  if (!ts) return null;
  if (ts?.toDate?.()) return ts.toDate();
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtWhen = (ts) => {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const timeAgo = (ts, now = Date.now()) => {
  const d = toDate(ts);
  if (!d) return '—';
  const sec = Math.floor((now - d.getTime()) / 1000);
  if (sec < 15) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtWhen(ts);
};

const getBrowserOs = (dev) => {
  if (dev.deviceBrowser && dev.deviceOS) return `${dev.deviceBrowser} · ${dev.deviceOS}`;
  if (dev.clientOS && !/^Mozilla/i.test(dev.clientOS)) return dev.clientOS;
  const ua = dev.clientOS || dev.deviceInfo || '';
  return formatUserAgentLabel(ua) || dev.deviceName || '—';
};

const getGeoLabel = (dev) => {
  if (dev.geo) return String(dev.geo);
  if (dev.timezone) return dev.timezone;
  return '—';
};

const getCurrentDeviceId = () => {
  try { return localStorage.getItem('aone_device_id') || ''; } catch { return ''; }
};

const OnlinePulse = ({ online, size = 'sm' }) => (
  <span className={cn('relative inline-flex shrink-0', size === 'lg' ? 'w-3 h-3' : 'w-2 h-2')}>
    {online && (
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
    )}
    <span className={cn(
      'relative inline-flex rounded-full h-full w-full',
      online ? 'bg-emerald-500' : 'bg-gray-500',
    )} />
  </span>
);

const CopyBtn = ({ text, isDark }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'p-1 rounded-md transition-colors',
        isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-amber-50 text-gray-500',
      )}
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const DetailRow = ({ label, value, mono, isDark, action }) => (
  <div className={cn(
    'flex items-start justify-between gap-3 py-2.5 border-b last:border-0',
    isDark ? 'border-[#2a1f0d]/80' : 'border-amber-100',
  )}>
    <span className={cn('text-[11px] font-medium shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')}>{label}</span>
    <div className="flex items-center gap-1 min-w-0 justify-end text-right">
      <span className={cn(
        'text-xs break-all',
        mono && 'font-mono text-[10px]',
        isDark ? 'text-gray-200' : 'text-gray-800',
      )}>
        {value || '—'}
      </span>
      {action}
    </div>
  </div>
);

const DeviceManagement = () => {
  const { isDark } = useTheme();
  const { userData } = useAuth();
  const { isOnline: networkOnline } = useNetwork();
  const { t, isRTL } = useLanguage();

  const [firestoreDevices, setFirestoreDevices] = useState({});
  const [localDevicesTick, setLocalDevicesTick] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [lastFirestoreAt, setLastFirestoreAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lockFilter, setLockFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [viewMode, setViewMode] = useState('auto');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [detailDevice, setDetailDevice] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const [billerCode, setBillerCode] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [clientOS, setClientOS] = useState('');

  const currentDeviceId = useMemo(() => getCurrentDeviceId(), [localDevicesTick]);

  useEffect(() => {
    if (!isFirebaseReady() || !db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'devices'),
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setFirestoreDevices(map);
        setLastFirestoreAt(Date.now());
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const tickLocal = () => setLocalDevicesTick((n) => n + 1);
    const tickNow = () => setNowTick(Date.now());
    tickLocal();
    tickNow();
    const localId = setInterval(tickLocal, LOCAL_REFRESH_MS);
    const nowId = setInterval(tickNow, LIVE_TICK_MS);
    const hb = setInterval(() => {
      try {
        const devId = getCurrentDeviceId();
        if (devId && navigator.onLine) heartbeatSessionDevice(devId);
      } catch { /* ignore */ }
    }, 90_000);
    return () => { clearInterval(localId); clearInterval(nowId); clearInterval(hb); };
  }, []);

  const devices = useMemo(() => {
    const merged = mergeDeviceMaps(firestoreDevices, Object.fromEntries(
      getLocalDevices().map((d) => [d.id, d]),
    ));
    return Object.values(merged).map((d) => {
      const online = isDeviceOnline(d.lastActiveAt, d.isOnline);
      const browserOs = getBrowserOs(d);
      return {
        ...d,
        isOnline: online,
        _label: getDeviceLabel(d, d.id),
        _browserOs: browserOs,
        _geo: getGeoLabel(d),
        _isCurrent: d.id === currentDeviceId,
        _isLocal: Boolean(d.source) || !firestoreDevices[d.id],
        _lastAgo: timeAgo(d.lastActiveAt, nowTick),
      };
    }).sort((a, b) => {
      if (a._isCurrent !== b._isCurrent) return a._isCurrent ? -1 : 1;
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      const ta = toDate(a.lastActiveAt)?.getTime() || 0;
      const tb = toDate(b.lastActiveAt)?.getTime() || 0;
      return tb - ta;
    });
  }, [firestoreDevices, localDevicesTick, nowTick, currentDeviceId]);

  const branches = useMemo(() => {
    const set = new Set();
    devices.forEach((d) => {
      const b = d.branchCode || d.storeId;
      if (b) set.add(String(b));
    });
    return [...set].sort();
  }, [devices]);

  const demoDevices = useMemo(
    () => devices.filter((d) => /^dev_pos_/i.test(String(d.id || ''))),
    [devices],
  );

  const purgeDemoDevices = useCallback(async () => {
    if (!demoDevices.length) return;
    if (!confirm(t('admin.devicesPage.purgeDemoConfirm', `Remove ${demoDevices.length} demo terminals?`))) return;
    try {
      await Promise.all(demoDevices.map((d) => deleteDoc(doc(db, 'devices', d.id))));
      toast.success(t('admin.devicesPage.purgeDemoDone', 'Demo terminals removed'));
    } catch (e) {
      toast.error(e.message);
    }
  }, [demoDevices, t]);

  const stats = useMemo(() => ({
    total: devices.length,
    online: devices.filter((d) => d.isOnline).length,
    offline: devices.filter((d) => !d.isOnline).length,
    locked: devices.filter((d) => d.isLocked).length,
  }), [devices]);

  const filtered = useMemo(() => devices.filter((d) => {
    const s = search.toLowerCase();
    const matchSearch = !search
      || (d.operatorName || '').toLowerCase().includes(s)
      || (d.billerCode || '').toLowerCase().includes(s)
      || (d.branchCode || '').toLowerCase().includes(s)
      || (d.storeId || '').toLowerCase().includes(s)
      || (d.id || '').toLowerCase().includes(s)
      || (d.clientOS || '').toLowerCase().includes(s)
      || (d._browserOs || '').toLowerCase().includes(s)
      || (d.userId || '').toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'online' && d.isOnline)
      || (statusFilter === 'offline' && !d.isOnline);
    const matchLock = lockFilter === 'all'
      || (lockFilter === 'locked' && d.isLocked)
      || (lockFilter === 'authorized' && !d.isLocked);
    const matchBranch = branchFilter === 'all'
      || (d.branchCode || d.storeId || '') === branchFilter;
    return matchSearch && matchStatus && matchLock && matchBranch;
  }), [devices, search, statusFilter, lockFilter, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, statusFilter, lockFilter, branchFilter, pageSize]);

  const showCards = viewMode !== 'table';
  const showTable = viewMode !== 'cards';

  const liveSec = lastFirestoreAt ? Math.max(0, Math.floor((nowTick - lastFirestoreAt) / 1000)) : null;

  const handleRegister = async () => {
    if (!billerCode.trim() || !operatorName.trim() || !branchCode.trim()) {
      return toast.error(t('admin.devicesPage.fieldsRequired', 'All fields required'));
    }
    setIsSubmitting(true);
    try {
      const id = `dev_${Date.now()}`;
      const dev = {
        id,
        billerCode: billerCode.trim().toUpperCase(),
        operatorName: operatorName.trim(),
        branchCode: branchCode.trim(),
        clientOS: clientOS.trim() || navigator.userAgent?.slice(0, 80),
        tokenExpiry: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
        isOnline: true,
        isLocked: false,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'devices', id), dev);
      await logActivity('device:register', userData?.uid, userData?.primaryStore, dev).catch(() => {});
      setBillerCode('');
      setOperatorName('');
      setBranchCode('');
      setClientOS('');
      setShowRegisterModal(false);
      toast.success(t('admin.devicesPage.registered', 'Terminal registered!'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleLock = async (dev) => {
    const next = !dev.isLocked;
    const msg = next
      ? t('admin.devicesPage.lockConfirm', 'Lock this terminal?')
      : t('admin.devicesPage.unlockConfirm', 'Unlock this terminal?');
    if (!confirm(msg)) return;
    try {
      await updateDoc(doc(db, 'devices', dev.id), {
        isLocked: next,
        lastActiveAt: serverTimestamp(),
      });
      await logActivity(
        next ? 'device:revoke' : 'device:authorize',
        userData?.uid,
        userData?.primaryStore,
        { deviceId: dev.id },
      ).catch(() => {});
      toast.success(next ? t('admin.devicesPage.lockedMsg') : t('admin.devicesPage.unlockedMsg'));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openEdit = (dev) => {
    setSelectedDevice(dev);
    setBillerCode(dev.billerCode || '');
    setOperatorName(dev.operatorName || '');
    setBranchCode(dev.branchCode || dev.storeId || '');
    setClientOS(dev.clientOS || dev._browserOs || '');
    setShowEditModal(true);
    setDetailDevice(null);
  };

  const handleSaveEdit = async () => {
    if (!billerCode.trim() || !operatorName.trim() || !branchCode.trim()) {
      return toast.error(t('admin.devicesPage.fieldsRequired', 'All fields required'));
    }
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'devices', selectedDevice.id), {
        billerCode: billerCode.trim().toUpperCase(),
        operatorName: operatorName.trim(),
        branchCode: branchCode.trim(),
        clientOS: clientOS.trim(),
        lastActiveAt: serverTimestamp(),
      });
      await logActivity('device:update', userData?.uid, userData?.primaryStore, {
        deviceId: selectedDevice.id,
      }).catch(() => {});
      setShowEditModal(false);
      setSelectedDevice(null);
      toast.success(t('admin.devicesPage.saved'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (dev) => {
    if (!confirm(t('admin.devicesPage.removeConfirm', 'Remove this terminal?'))) return;
    try {
      await deleteDoc(doc(db, 'devices', dev.id));
      await logActivity('device:delete', userData?.uid, userData?.primaryStore, {
        deviceId: dev.id,
      }).catch(() => {});
      if (detailDevice?.id === dev.id) setDetailDevice(null);
      toast.success(t('admin.devicesPage.removed'));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const FormFields = () => (
    <div className="space-y-4 pt-2">
      {[
        { label: t('admin.devicesPage.billerCode'), val: billerCode, set: setBillerCode, ph: 'BIL-20', icon: Key },
        { label: t('admin.devicesPage.operatorName'), val: operatorName, set: setOperatorName, ph: 'e.g. Fahad Khan', icon: User },
        { label: t('admin.devicesPage.branchCode'), val: branchCode, set: setBranchCode, ph: 'e.g. Clifton Arcade', icon: MapPin },
        { label: t('admin.devicesPage.clientOS'), val: clientOS, set: setClientOS, ph: 'Chrome · Windows 11', icon: Monitor },
      ].map((f) => (
        <Input
          key={f.label}
          label={f.label}
          placeholder={f.ph}
          value={f.val}
          onChange={(e) => f.set(e.target.value)}
          leftIcon={<f.icon className="w-4 h-4 text-amber-500" />}
          className="w-full"
        />
      ))}
    </div>
  );

  const card = cn(
    'rounded-2xl border',
    isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
  );

  const chipCls = (active) => cn(
    'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
    active
      ? isDark
        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.12)]'
        : 'bg-amber-100 border-amber-300 text-amber-800'
      : isDark
        ? 'bg-[#0a0805] border-[#2a1f0d] text-gray-400 hover:border-amber-500/25'
        : 'bg-white border-amber-200 text-gray-600 hover:border-amber-300',
  );

  const DeviceActions = ({ dev, compact }) => (
    <div className={cn('flex items-center', compact ? 'gap-0.5' : 'gap-1')}>
      <button
        type="button"
        onClick={() => setDetailDevice(dev)}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          isDark ? 'text-sky-400 hover:bg-sky-500/10' : 'text-sky-600 hover:bg-sky-50',
        )}
        title={t('admin.devicesPage.viewDetails', 'Details')}
      >
        <ExternalLink className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => handleToggleLock(dev)}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          dev.isLocked ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-rose-500 hover:bg-rose-500/10',
        )}
        title={dev.isLocked ? t('admin.devicesPage.unlockDevice') : t('admin.devicesPage.lockDevice')}
      >
        {dev.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={() => openEdit(dev)}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          isDark ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-600 hover:bg-amber-50',
        )}
        title={t('admin.devicesPage.editDevice')}
      >
        <Edit className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDelete(dev)}
        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"
        title={t('admin.devicesPage.removeDevice')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const DeviceCard = ({ dev }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        card,
        'p-4 flex flex-col gap-3 transition-shadow hover:shadow-lg',
        dev._isCurrent && (isDark ? 'ring-1 ring-amber-500/40' : 'ring-2 ring-amber-300'),
        dev.isLocked && 'opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            dev.isOnline
              ? isDark ? 'bg-emerald-500/15' : 'bg-emerald-50'
              : isDark ? 'bg-gray-800' : 'bg-gray-100',
          )}>
            <Smartphone className={cn('w-5 h-5', dev.isOnline ? 'text-emerald-500' : 'text-gray-400')} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-amber-500">{dev.billerCode || '—'}</span>
              {dev._isCurrent && (
                <Badge variant="info" className="text-[9px]">{t('admin.devicesPage.thisDevice', 'This device')}</Badge>
              )}
            </div>
            <p className={cn('font-semibold text-sm truncate', isDark ? 'text-white' : 'text-gray-900')}>
              {dev.operatorName || dev._label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <OnlinePulse online={dev.isOnline} />
          <Badge variant={dev.isOnline ? 'success' : 'error'} className="text-[10px]">
            {dev.isOnline ? t('admin.devicesPage.onlineNow', 'Online') : t('admin.devicesPage.offline')}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {[
          { icon: MapPin, label: t('admin.devicesPage.branchCode'), val: dev.branchCode || dev.storeId },
          { icon: AppWindow, label: t('admin.devicesPage.clientOS'), val: dev._browserOs },
          { icon: Globe, label: t('admin.devicesPage.location', 'Location'), val: dev._geo },
          { icon: Clock, label: t('admin.devicesPage.lastActive', 'Last active'), val: dev._lastAgo },
        ].map((row) => (
          <div key={row.label} className={cn(
            'rounded-lg px-2.5 py-2 border',
            isDark ? 'bg-[#0a0805]/80 border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-100',
          )}>
            <p className={cn('text-[9px] uppercase tracking-wider mb-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {row.label}
            </p>
            <p className={cn('flex items-center gap-1 truncate font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <row.icon className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">{row.val || '—'}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-dashed border-[#2a1f0d]/40">
        <div className="flex items-center gap-2">
          <Badge variant={dev.isLocked ? 'error' : 'success'} className="text-[10px]">
            {dev.isLocked ? t('admin.devicesPage.locked') : t('admin.devicesPage.authorized', 'Authorized')}
          </Badge>
          {dev._isLocal && (
            <Badge variant="warning" className="text-[9px]">{t('admin.devicesPage.localOnly', 'Local')}</Badge>
          )}
        </div>
        <DeviceActions dev={dev} compact />
      </div>
    </motion.div>
  );

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-3 sm:p-5 lg:p-6 max-w-[1920px] mx-auto space-y-4 sm:space-y-5">

      <PageHeader
        icon={Smartphone}
        title={t('admin.devicesPage.title')}
        description={t('admin.devicesPage.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <span className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold border',
              networkOnline
                ? isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-600',
            )}>
              <Radio className={cn('w-3.5 h-3.5', networkOnline && 'animate-pulse')} />
              {networkOnline
                ? t('admin.devicesPage.liveSync', 'Live sync')
                : t('admin.devicesPage.offlineLocal', 'Offline — local devices')}
              {liveSec != null && networkOnline && (
                <span className={cn('opacity-70', isDark ? 'text-emerald-300' : 'text-emerald-500')}>
                  · {liveSec < 3 ? t('admin.devicesPage.justUpdated', 'just now') : `${liveSec}s`}
                </span>
              )}
            </span>
            <Button
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setBillerCode('');
                setOperatorName('');
                setBranchCode('');
                setClientOS(typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 80) : '');
                setShowRegisterModal(true);
              }}
            >
              {t('admin.devicesPage.registerDevice')}
            </Button>
          </div>
        }
      />

      <div className={cn(
        'rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3',
        isDark ? 'bg-gradient-to-r from-[#1a1208] to-[#0f0a05] border-[#2a1f0d]' : 'bg-gradient-to-r from-amber-50 to-white border-amber-200',
      )}>
        <div className="flex items-start gap-2 flex-1">
          <Activity className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className={cn('text-[11px] leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
            {t('admin.devicesPage.hint', 'Devices auto-register on login. Online = active within {{min}} min. Status refreshes every {{sec}}s.', {
              min: Math.round(DEVICE_ONLINE_WINDOW_MS / 60000),
              sec: LIVE_TICK_MS / 1000,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className={isDark ? 'text-gray-500' : 'text-gray-500'}>
            {stats.online} {t('admin.devicesPage.onlineNow', 'online')} · {filtered.length} {t('admin.devicesPage.shown', 'shown')}
          </span>
        </div>
      </div>

      {demoDevices.length > 0 && (
        <div className={cn(
          'rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3',
          isDark ? 'bg-amber-500/5 border-amber-500/25' : 'bg-amber-50 border-amber-200',
        )}>
          <p className={cn('text-xs', isDark ? 'text-amber-200' : 'text-amber-900')}>
            <strong>{demoDevices.length}</strong> {t('admin.devicesPage.demoBanner', 'demo terminals (dev_pos_*) — remove old sample data.')}
          </p>
          <Button variant="secondary" size="sm" onClick={purgeDemoDevices} className="shrink-0">
            {t('admin.devicesPage.purgeDemo', 'Remove demo')}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t('admin.devicesPage.totalDevices')}
          value={stats.total}
          icon={Smartphone}
          color="amber"
          subtitle={t('admin.devicesPage.allTerminals', 'All terminals')}
          onClick={() => { setStatusFilter('all'); setLockFilter('all'); }}
        />
        <StatCard
          label={t('admin.devicesPage.onlineNow')}
          value={stats.online}
          icon={Wifi}
          color="green"
          subtitle={t('admin.devicesPage.activeNow', 'Active now')}
          onClick={() => setStatusFilter('online')}
        />
        <StatCard
          label={t('admin.devicesPage.offline')}
          value={stats.offline}
          icon={WifiOff}
          color="rose"
          onClick={() => setStatusFilter('offline')}
        />
        <StatCard
          label={t('admin.devicesPage.locked')}
          value={stats.locked}
          icon={ShieldAlert}
          color="blue"
          onClick={() => setLockFilter('locked')}
        />
      </div>

      <div className={cn(card, 'overflow-hidden')}>
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Input
                placeholder={t('admin.devicesPage.searchPh')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-amber-500" />}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className={cn(
                'flex rounded-xl border p-0.5',
                isDark ? 'border-[#2a1f0d] bg-[#0a0805]' : 'border-amber-200 bg-amber-50/50',
              )}>
                {[
                  { id: 'auto', icon: Zap, label: 'Auto' },
                  { id: 'cards', icon: LayoutGrid, label: 'Cards' },
                  { id: 'table', icon: List, label: 'Table' },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewMode(v.id)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all',
                      viewMode === v.id
                        ? isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-white text-amber-700 shadow-sm'
                        : isDark ? 'text-gray-500' : 'text-gray-500',
                    )}
                    title={v.label}
                  >
                    <v.icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                ))}
              </div>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className={cn(
                  'rounded-xl border px-2.5 py-2 text-[11px] outline-none',
                  isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
                )}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {[
              ['all', t('admin.devicesPage.filterAll', 'All')],
              ['online', t('admin.devicesPage.onlineNow')],
              ['offline', t('admin.devicesPage.offline')],
            ].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setStatusFilter(val)} className={chipCls(statusFilter === val)}>
                {label}
              </button>
            ))}
            <span className={cn('w-px h-6 self-center shrink-0', isDark ? 'bg-[#2a1f0d]' : 'bg-amber-200')} />
            {[
              ['all', t('admin.devicesPage.filterAuth', 'All auth')],
              ['authorized', t('admin.devicesPage.authorized', 'Authorized')],
              ['locked', t('admin.devicesPage.locked')],
            ].map(([val, label]) => (
              <button key={`lock-${val}`} type="button" onClick={() => setLockFilter(val)} className={chipCls(lockFilter === val)}>
                {label}
              </button>
            ))}
            {branches.length > 1 && (
              <>
                <span className={cn('w-px h-6 self-center shrink-0', isDark ? 'bg-[#2a1f0d]' : 'bg-amber-200')} />
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] outline-none min-w-[100px]',
                    isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
                  )}
                >
                  <option value="all">{t('admin.devicesPage.allBranches', 'All branches')}</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </>
            )}
            {(search || statusFilter !== 'all' || lockFilter !== 'all' || branchFilter !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setLockFilter('all'); setBranchFilter('all'); }}
                className={cn('shrink-0 px-3 py-1.5 text-[11px] font-semibold text-amber-500')}
              >
                {t('admin.devicesPage.reset', 'Reset')}
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className={cn(card, 'py-20 text-center')}>
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className={cn('text-sm', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {t('admin.devicesPage.loading', 'Loading terminals…')}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={t('admin.devicesPage.noDevices')}
          description={t('admin.devicesPage.noDevicesDesc')}
        />
      ) : (
        <>
          {showCards && (
            <div className={cn(
              'grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
              viewMode === 'auto' && 'lg:hidden',
            )}>
              {paginated.map((dev) => <DeviceCard key={dev.id} dev={dev} />)}
            </div>
          )}

          {showTable && (
            <div className={cn(
              card,
              'overflow-hidden shadow-xl',
              viewMode === 'auto' && 'hidden lg:block',
            )}>
              <div className={cn(
                'px-4 py-3 border-b flex items-center justify-between',
                isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
              )}>
                <h3 className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>
                  {t('admin.devicesPage.terminals', 'Connected Terminals')}
                  <span className={cn('ml-2 text-[11px] font-normal', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {filtered.length.toLocaleString()}
                  </span>
                </h3>
                <Badge variant="info">{stats.online} {t('admin.devicesPage.onlineNow', 'online')}</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[1100px]">
                  <thead className={cn(
                    'sticky top-0 z-10 border-b text-[10px] font-semibold uppercase tracking-wider',
                    isDark ? 'bg-[#0a0805] text-gray-400 border-[#2a1f0d]' : 'bg-amber-50/60 text-gray-600 border-amber-100',
                  )}>
                    <tr>
                      {[
                        t('admin.devicesPage.colTerminal', 'Terminal'),
                        t('admin.devicesPage.operatorName'),
                        t('admin.devicesPage.branchCode'),
                        t('admin.devicesPage.clientOS'),
                        t('admin.devicesPage.location', 'Location'),
                        t('admin.devicesPage.lastActive', 'Last Active'),
                        t('admin.devicesPage.colStatus', 'Status'),
                        t('admin.devicesPage.colAuth', 'Auth'),
                        t('admin.devicesPage.colActions', 'Actions'),
                      ].map((h) => (
                        <th key={h} className="px-3 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                    {paginated.map((dev) => (
                      <tr
                        key={dev.id}
                        onClick={() => setDetailDevice(dev)}
                        className={cn(
                          'border-t transition-colors cursor-pointer',
                          isDark ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60' : 'border-amber-100 hover:bg-amber-50/50',
                          dev.isLocked && 'opacity-70',
                          dev._isCurrent && (isDark ? 'bg-amber-500/5' : 'bg-amber-50/80'),
                        )}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <OnlinePulse online={dev.isOnline} />
                            <div>
                              <p className="font-mono text-[11px] font-bold text-amber-500">{dev.billerCode || '—'}</p>
                              <p className="font-mono text-[9px] text-gray-500 truncate max-w-[100px]" title={dev.id}>
                                {dev.id?.slice(0, 14)}…
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-semibold">{dev.operatorName || dev._label}</span>
                            {dev._isCurrent && (
                              <Badge variant="info" className="text-[8px] px-1">{t('admin.devicesPage.you', 'You')}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            {dev.branchCode || dev.storeId || '—'}
                          </div>
                        </td>
                        <td className="px-3 py-3 max-w-[160px]">
                          <div className="flex items-center gap-1.5 truncate" title={dev._browserOs}>
                            <AppWindow className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{dev._browserOs}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-1 text-[10px]">
                            <Globe className="w-3 h-3 text-sky-400" />
                            {dev._geo}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="flex flex-col">
                            <span className="flex items-center gap-1 font-medium text-[11px]">
                              <Clock className="w-3 h-3" />
                              {dev._lastAgo}
                            </span>
                            <span className={cn('text-[9px] pl-4', isDark ? 'text-gray-600' : 'text-gray-400')}>
                              {fmtWhen(dev.lastActiveAt)}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={dev.isOnline ? 'success' : 'error'} className="flex items-center gap-1 w-fit text-[10px]">
                            {dev.isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {dev.isOnline ? t('admin.devicesPage.onlineNow', 'Online') : t('admin.devicesPage.offline')}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={dev.isLocked ? 'error' : 'success'} className="text-[10px]">
                            {dev.isLocked ? t('admin.devicesPage.locked') : t('admin.devicesPage.authorized', 'OK')}
                          </Badge>
                        </td>
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <DeviceActions dev={dev} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={cn(
            card,
            'px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3',
          )}>
            <p className={cn('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('admin.devicesPage.pagination', 'Page {{page}} of {{total}} · {{from}}–{{to}} of {{count}}', {
                page: safePage,
                total: totalPages,
                from: (safePage - 1) * pageSize + 1,
                to: Math.min(safePage * pageSize, filtered.length),
                count: filtered.length,
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={cn(
                  'p-2 rounded-lg border disabled:opacity-30 transition-colors',
                  isDark ? 'border-[#2a1f0d] hover:bg-[#1a1208]' : 'border-amber-200 hover:bg-amber-50',
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={cn('px-3 text-xs font-mono', isDark ? 'text-gray-400' : 'text-gray-600')}>
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={cn(
                  'p-2 rounded-lg border disabled:opacity-30 transition-colors',
                  isDark ? 'border-[#2a1f0d] hover:bg-[#1a1208]' : 'border-amber-200 hover:bg-amber-50',
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {detailDevice && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
              onClick={() => setDetailDevice(null)}
            />
            <motion.aside
              initial={{ x: isRTL ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={cn(
                'fixed top-0 bottom-0 z-50 w-full sm:max-w-md overflow-y-auto shadow-2xl',
                isRTL ? 'left-0' : 'right-0',
                isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
                'border-l',
              )}
            >
              <div className={cn(
                'sticky top-0 z-10 px-4 py-4 border-b flex items-start justify-between gap-3',
                isDark ? 'bg-[#0f0a05]/95 border-[#2a1f0d] backdrop-blur-md' : 'bg-white/95 border-amber-100 backdrop-blur-md',
              )}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <OnlinePulse online={detailDevice.isOnline} size="lg" />
                    <Badge variant={detailDevice.isOnline ? 'success' : 'error'}>
                      {detailDevice.isOnline ? t('admin.devicesPage.onlineNow', 'Online') : t('admin.devicesPage.offline')}
                    </Badge>
                    {detailDevice._isCurrent && (
                      <Badge variant="info">{t('admin.devicesPage.thisDevice', 'This device')}</Badge>
                    )}
                  </div>
                  <h2 className={cn('text-lg font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>
                    {detailDevice.billerCode || detailDevice._label}
                  </h2>
                  <p className={cn('text-sm truncate', isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {detailDevice.operatorName || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailDevice(null)}
                  className={cn(
                    'p-2 rounded-xl border shrink-0',
                    isDark ? 'border-[#2a1f0d] hover:bg-[#1a1208]' : 'border-amber-200 hover:bg-amber-50',
                  )}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-5">
                <section>
                  <h3 className={cn('text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5', isDark ? 'text-amber-500' : 'text-amber-600')}>
                    <Fingerprint className="w-3.5 h-3.5" />
                    {t('admin.devicesPage.sectionIdentity', 'Identity')}
                  </h3>
                  <div className={cn('rounded-xl border px-3', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                    <DetailRow label={t('admin.devicesPage.deviceId', 'Device ID')} value={detailDevice.id} mono isDark={isDark} action={<CopyBtn text={detailDevice.id} isDark={isDark} />} />
                    <DetailRow label={t('admin.devicesPage.billerCode')} value={detailDevice.billerCode} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.operatorName')} value={detailDevice.operatorName || detailDevice._label} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.userId', 'User ID')} value={detailDevice.userId} mono isDark={isDark} />
                  </div>
                </section>

                <section>
                  <h3 className={cn('text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5', isDark ? 'text-amber-500' : 'text-amber-600')}>
                    <Store className="w-3.5 h-3.5" />
                    {t('admin.devicesPage.sectionLocation', 'Location & Branch')}
                  </h3>
                  <div className={cn('rounded-xl border px-3', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                    <DetailRow label={t('admin.devicesPage.branchCode')} value={detailDevice.branchCode} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.storeId', 'Store ID')} value={detailDevice.storeId} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.location', 'Geo')} value={detailDevice.geo} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.timezone', 'Timezone')} value={detailDevice.timezone} isDark={isDark} />
                  </div>
                </section>

                <section>
                  <h3 className={cn('text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5', isDark ? 'text-amber-500' : 'text-amber-600')}>
                    <Cpu className="w-3.5 h-3.5" />
                    {t('admin.devicesPage.sectionSystem', 'System')}
                  </h3>
                  <div className={cn('rounded-xl border px-3', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                    <DetailRow label={t('admin.devicesPage.browser', 'Browser')} value={detailDevice.deviceBrowser} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.os', 'OS')} value={detailDevice.deviceOS} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.platform', 'Platform')} value={detailDevice.platform} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.clientOS')} value={detailDevice._browserOs} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.deviceName', 'Device name')} value={detailDevice.deviceName} isDark={isDark} />
                  </div>
                </section>

                <section>
                  <h3 className={cn('text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5', isDark ? 'text-amber-500' : 'text-amber-600')}>
                    <Calendar className="w-3.5 h-3.5" />
                    {t('admin.devicesPage.sectionSession', 'Session')}
                  </h3>
                  <div className={cn('rounded-xl border px-3', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                    <DetailRow label={t('admin.devicesPage.lastActive', 'Last active')} value={`${detailDevice._lastAgo} · ${fmtWhen(detailDevice.lastActiveAt)}`} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.created', 'Registered')} value={fmtWhen(detailDevice.createdAt)} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.updated', 'Updated')} value={fmtWhen(detailDevice.updatedAt)} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.tokenExpiry', 'Token expiry')} value={detailDevice.tokenExpiry} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.colAuth', 'Auth')} value={detailDevice.isLocked ? t('admin.devicesPage.locked') : t('admin.devicesPage.authorized', 'Authorized')} isDark={isDark} />
                    <DetailRow label={t('admin.devicesPage.source', 'Source')} value={detailDevice._isLocal ? t('admin.devicesPage.localCache', 'Local cache') : t('admin.devicesPage.cloud', 'Cloud')} isDark={isDark} />
                  </div>
                </section>

                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" className="flex-1" onClick={() => openEdit(detailDevice)}>
                    <Edit className="w-4 h-4 mr-1.5" />
                    {t('admin.devicesPage.editDevice')}
                  </Button>
                  <Button
                    variant={detailDevice.isLocked ? 'primary' : 'secondary'}
                    className="flex-1"
                    onClick={() => handleToggleLock(detailDevice)}
                  >
                    {detailDevice.isLocked ? <Unlock className="w-4 h-4 mr-1.5" /> : <Lock className="w-4 h-4 mr-1.5" />}
                    {detailDevice.isLocked ? t('admin.devicesPage.unlockDevice') : t('admin.devicesPage.lockDevice')}
                  </Button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {showRegisterModal && (
        <Modal isOpen onClose={() => setShowRegisterModal(false)} title={t('admin.devicesPage.registerTitle', 'Authorize PWA Terminal')}>
          <FormFields />
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#2a1f0d]/30">
            <Button variant="secondary" className="flex-1 rounded-xl" disabled={isSubmitting} onClick={() => setShowRegisterModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" className="flex-1 rounded-xl" disabled={isSubmitting} onClick={handleRegister}>
              {isSubmitting ? t('admin.devicesPage.registering', 'Registering…') : t('admin.devicesPage.authorize', 'Authorize')}
            </Button>
          </div>
        </Modal>
      )}

      {showEditModal && (
        <Modal isOpen onClose={() => { setShowEditModal(false); setSelectedDevice(null); }} title={`${t('admin.devicesPage.editDevice')}: ${selectedDevice?.billerCode || selectedDevice?.id}`}>
          <FormFields />
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#2a1f0d]/30">
            <Button variant="secondary" className="flex-1 rounded-xl" disabled={isSubmitting} onClick={() => { setShowEditModal(false); setSelectedDevice(null); }}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" className="flex-1 rounded-xl" disabled={isSubmitting} onClick={handleSaveEdit}>
              {isSubmitting ? t('admin.devicesPage.saving', 'Saving…') : t('common.save', 'Save')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DeviceManagement;
