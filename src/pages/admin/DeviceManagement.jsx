// src/pages/admin/DeviceManagement.jsx
// ✅ FIXED — Plus import added, Edit import added, clean version
import { useState, useEffect, useMemo } from 'react';
import {
  Smartphone, Monitor, Wifi, WifiOff, Search, Trash2,
  ShieldAlert, Key, Lock, Unlock, RefreshCw, Database,
  User, MapPin, AppWindow, Plus, Edit,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, setDoc,
  updateDoc, deleteDoc, serverTimestamp,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { logActivity } from '../../services/activityLogger';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';

const MOCK_DEVICES = [
  { id: 'dev_pos_01', billerCode: 'BIL-09', operatorName: 'Kamran Shah',   clientOS: 'Chrome v124 (Windows 11)',      branchCode: 'Clifton Arcade',   tokenExpiry: '2026-12-31', isOnline: true,  isLocked: false },
  { id: 'dev_pos_02', billerCode: 'BIL-12', operatorName: 'Saima Khan',    clientOS: 'Safari v17.2 (macOS)',          branchCode: 'Tariq Road Gold',  tokenExpiry: '2026-10-15', isOnline: false, isLocked: false },
  { id: 'dev_pos_03', billerCode: 'BIL-05', operatorName: 'Bilal Ahmed',   clientOS: 'Firefox v125 (Linux Ubuntu)',   branchCode: 'Saddar Plaza',     tokenExpiry: '2026-08-01', isOnline: true,  isLocked: true  },
  { id: 'dev_pos_04', billerCode: 'BIL-18', operatorName: 'Zaheer Malik',  clientOS: 'Chrome Mobile v123 (Android)', branchCode: 'Clifton Arcade',   tokenExpiry: '2026-11-20', isOnline: false, isLocked: false },
];

const DeviceManagement = () => {
  const { isDark }   = useTheme();
  const { userData } = useAuth();
  const { isOnline } = useNetwork();

  const [devices,      setDevices]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lockFilter,   setLockFilter]   = useState('all');
  const [showSug,      setShowSug]      = useState(false);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [selectedDevice,    setSelectedDevice]    = useState(null);

  const [billerCode,   setBillerCode]   = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [branchCode,   setBranchCode]   = useState('');
  const [clientOS,     setClientOS]     = useState('Chrome v124 (Windows 11)');

  // ── Stream ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseReady() || !db) { setLoading(false); return; }
    setLoading(true);

    const unsub = onSnapshot(collection(db, 'devices'), async snap => {
      if (snap.empty && navigator.onLine) {
        for (const dev of MOCK_DEVICES) {
          await setDoc(doc(db, 'devices', dev.id), {
            ...dev, createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(),
          });
        }
      } else {
        setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    }, err => {
      console.error(err);
      toast.error('Failed to load devices');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const stats = useMemo(() => ({
    total:  devices.length,
    online: devices.filter(d =>  d.isOnline).length,
    offline:devices.filter(d => !d.isOnline).length,
    locked: devices.filter(d =>  d.isLocked).length,
  }), [devices]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    return devices
      .filter(d =>
        d.operatorName.toLowerCase().includes(s) ||
        d.billerCode.toLowerCase().includes(s)   ||
        d.branchCode.toLowerCase().includes(s))
      .map(d => `${d.operatorName} (${d.billerCode})`)
      .slice(0, 5);
  }, [search, devices]);

  const filtered = useMemo(() => devices.filter(d => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      d.operatorName.toLowerCase().includes(s) ||
      d.billerCode.toLowerCase().includes(s)   ||
      d.branchCode.toLowerCase().includes(s)   ||
      d.id.toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'online'  &&  d.isOnline) ||
      (statusFilter === 'offline' && !d.isOnline);
    const matchLock = lockFilter === 'all' ||
      (lockFilter === 'locked'     &&  d.isLocked) ||
      (lockFilter === 'authorized' && !d.isLocked);
    return matchSearch && matchStatus && matchLock;
  }), [devices, search, statusFilter, lockFilter]);

  // ── Register ───────────────────────────────────────────────
  const handleRegister = async () => {
    if (!billerCode.trim() || !operatorName.trim() || !branchCode.trim())
      return toast.error('All fields required');
    setIsSubmitting(true);
    try {
      const id  = `dev_${Date.now()}`;
      const dev = {
        id, billerCode: billerCode.trim().toUpperCase(),
        operatorName: operatorName.trim(),
        branchCode: branchCode.trim(), clientOS,
        tokenExpiry: new Date(Date.now() + 180 * 86400000)
          .toISOString().split('T')[0],
        isOnline: true, isLocked: false,
        createdAt: serverTimestamp(), lastActiveAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'devices', id), dev);
      await logActivity('device:register', userData?.uid, userData?.primaryStore, dev).catch(() => {});
      setBillerCode(''); setOperatorName(''); setBranchCode('');
      setShowRegisterModal(false);
      toast.success('Terminal registered!');
    } catch (e) { toast.error(e.message); }
    finally { setIsSubmitting(false); }
  };

  // ── Toggle lock ────────────────────────────────────────────
  const handleToggleLock = async (dev) => {
    const next = !dev.isLocked;
    if (!confirm(`${next ? 'LOCK' : 'UNLOCK'} terminal ${dev.billerCode}?`)) return;
    try {
      await updateDoc(doc(db, 'devices', dev.id), {
        isLocked: next, lastActiveAt: serverTimestamp(),
      });
      await logActivity(
        next ? 'device:revoke' : 'device:authorize',
        userData?.uid, userData?.primaryStore, { deviceId: dev.id },
      ).catch(() => {});
      toast.success(`Terminal ${next ? 'locked' : 'unlocked'}`);
    } catch (e) { toast.error(e.message); }
  };

  // ── Edit ───────────────────────────────────────────────────
  const openEdit = (dev) => {
    setSelectedDevice(dev);
    setBillerCode(dev.billerCode);
    setOperatorName(dev.operatorName);
    setBranchCode(dev.branchCode);
    setClientOS(dev.clientOS || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!billerCode.trim() || !operatorName.trim() || !branchCode.trim())
      return toast.error('All fields required');
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'devices', selectedDevice.id), {
        billerCode: billerCode.trim().toUpperCase(),
        operatorName: operatorName.trim(),
        branchCode: branchCode.trim(), clientOS,
        lastActiveAt: serverTimestamp(),
      });
      await logActivity('device:update', userData?.uid, userData?.primaryStore,
        { deviceId: selectedDevice.id }).catch(() => {});
      setShowEditModal(false); setSelectedDevice(null);
      toast.success('Terminal updated');
    } catch (e) { toast.error(e.message); }
    finally { setIsSubmitting(false); }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (dev) => {
    if (!confirm(`⚠️ Purge terminal ${dev.billerCode}?`)) return;
    try {
      await deleteDoc(doc(db, 'devices', dev.id));
      await logActivity('device:delete', userData?.uid, userData?.primaryStore,
        { deviceId: dev.id }).catch(() => {});
      toast.success('Terminal purged');
    } catch (e) { toast.error(e.message); }
  };

  // ── Form fields shared ─────────────────────────────────────
  const FormFields = () => (
    <div className="space-y-4 pt-2">
      {[
        { label: 'Biller Code',   val: billerCode,   set: setBillerCode,   ph: 'BIL-20',                  icon: Key     },
        { label: 'Operator Name', val: operatorName, set: setOperatorName, ph: 'e.g. Fahad Khan',          icon: User    },
        { label: 'Branch',        val: branchCode,   set: setBranchCode,   ph: 'e.g. Clifton Arcade',      icon: MapPin  },
        { label: 'Client OS',     val: clientOS,     set: setClientOS,     ph: 'Chrome v124 (Windows 11)', icon: Monitor },
      ].map(f => (
        <Input key={f.label} label={f.label} placeholder={f.ph}
          value={f.val} onChange={e => f.set(e.target.value)}
          leftIcon={<f.icon className="w-4 h-4 text-amber-500" />}
          className="w-full" />
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      <PageHeader
        icon={Smartphone}
        title="Device Security & Terminals"
        description="Monitor PWA checkouts, revoke licenses, manage token expirations"
        actions={
          <Button variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setBillerCode(''); setOperatorName('');
              setBranchCode(''); setClientOS('Chrome v124 (Windows 11)');
              setShowRegisterModal(true);
            }}>
            Authorize Terminal
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Licenses" value={stats.total}   icon={Smartphone}  color="amber" />
        <StatCard label="Online"         value={stats.online}  icon={Wifi}        color="green" />
        <StatCard label="Offline"        value={stats.offline} icon={WifiOff}     color="rose"  />
        <StatCard label="Suspended"      value={stats.locked}  icon={ShieldAlert} color="blue"  />
      </div>

      {/* Search + filters */}
      <div className={cn(
        'rounded-2xl border p-4',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Input
              placeholder="Search operator, biller code, branch..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              leftIcon={<Search className="w-4 h-4 text-amber-500" />}
              className="w-full"
            />
            {showSug && suggestions.length > 0 && (
              <div className={cn(
                'absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border shadow-xl',
                isDark ? 'bg-[#150f08] border-[#3a2c18]' : 'bg-white border-amber-200',
              )}>
                {suggestions.map((s, i) => (
                  <button key={i}
                    onClick={() => { setSearch(s.split(' (')[0]); setShowSug(false); }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-xs hover:bg-amber-500/10',
                      isDark ? 'text-gray-300' : 'text-gray-700',
                    )}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 flex-wrap">
            {[
              { val: statusFilter, set: setStatusFilter,
                opts: [['all','All Status'],['online','Online'],['offline','Offline']] },
              { val: lockFilter,   set: setLockFilter,
                opts: [['all','All Auth'],['authorized','Authorized'],['locked','Locked']] },
            ].map((f, i) => (
              <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs outline-none',
                  isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
                )}>
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <Button variant="ghost" size="sm"
              onClick={() => { setSearch(''); setStatusFilter('all'); setLockFilter('all'); }}
              className="text-xs text-amber-500">
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn(
        'rounded-2xl border overflow-hidden shadow-lg',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
      )}>
        <div className={cn(
          'px-5 py-4 border-b flex items-center justify-between',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
        )}>
          <h3 className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>
            Connected Terminals
          </h3>
          <Badge variant="info">Online: {stats.online}</Badge>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Smartphone} title="No terminals found" description="Register a terminal above" />
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className={cn(
                'sticky top-0 z-10 border-b text-xs font-semibold uppercase tracking-wider',
                isDark ? 'bg-[#0a0805] text-gray-400 border-[#2a1f0d]'
                       : 'bg-amber-50/30 text-gray-600 border-amber-100',
              )}>
                <tr>
                  {['Terminal ID','Code','Operator','Branch','OS','Expiry',
                    'Status','Lock','Sync','Actions'].map(h => (
                    <th key={h} className="px-4 py-3.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn(isDark ? 'text-gray-300' : 'text-gray-700')}>
                {filtered.map(dev => (
                  <tr key={dev.id} className={cn(
                    'border-t transition-colors',
                    isDark
                      ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60'
                      : 'border-amber-100 hover:bg-amber-50/50',
                    dev.isLocked && 'opacity-60 bg-rose-500/[0.02]',
                  )}>
                    <td className="px-4 py-3 font-mono text-gray-500 font-bold">
                      {dev.id.slice(0, 12).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="primary">{dev.billerCode}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-semibold">{dev.operatorName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        {dev.branchCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">
                      <div className="flex items-center gap-1.5">
                        <AppWindow className="w-3.5 h-3.5 shrink-0" />
                        <span title={dev.clientOS}>{dev.clientOS}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 whitespace-nowrap">
                      {dev.tokenExpiry}
                    </td>
                    <td className="px-4 py-3">
                      {dev.isOnline
                        ? <Badge variant="success" className="flex items-center gap-1 w-fit animate-pulse">
                            <Wifi className="w-3 h-3" /> Online
                          </Badge>
                        : <Badge variant="danger" className="flex items-center gap-1 w-fit">
                            <WifiOff className="w-3 h-3" /> Offline
                          </Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={dev.isLocked ? 'danger' : 'success'}>
                        {dev.isLocked ? 'Locked' : 'Auth'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOnline
                        ? <Wifi     className="w-4 h-4 text-emerald-500 inline" />
                        : <Database className="w-4 h-4 text-amber-500 inline animate-pulse" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleToggleLock(dev)}
                          className={cn('p-1.5 rounded-lg transition-colors',
                            dev.isLocked
                              ? 'text-emerald-500 hover:bg-emerald-500/10'
                              : 'text-rose-500 hover:bg-rose-500/10')}>
                          {dev.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openEdit(dev)}
                          className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-500/10 transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(dev)}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Modal */}
      {showRegisterModal && (
        <Modal isOpen onClose={() => setShowRegisterModal(false)}
          title="Authorize PWA Terminal">
          <FormFields />
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#2a1f0d]/30">
            <Button variant="secondary" className="flex-1 rounded-xl"
              disabled={isSubmitting}
              onClick={() => setShowRegisterModal(false)}>Cancel</Button>
            <Button variant="primary" className="flex-1 rounded-xl"
              disabled={isSubmitting} onClick={handleRegister}>
              {isSubmitting ? 'Registering...' : 'Authorize'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <Modal isOpen onClose={() => { setShowEditModal(false); setSelectedDevice(null); }}
          title={`Edit: ${selectedDevice?.billerCode}`}>
          <FormFields />
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#2a1f0d]/30">
            <Button variant="secondary" className="flex-1 rounded-xl"
              disabled={isSubmitting}
              onClick={() => { setShowEditModal(false); setSelectedDevice(null); }}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1 rounded-xl"
              disabled={isSubmitting} onClick={handleSaveEdit}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DeviceManagement;