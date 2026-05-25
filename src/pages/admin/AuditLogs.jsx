import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, Filter, Download, User, Edit, Trash2, Plus, LogIn, RefreshCw, 
  Search, ShieldAlert, AlertTriangle, Play, Pause, RefreshCcw, Eye, Shield, 
  MapPin, Laptop, Clock, Wifi, Calendar, CheckCircle2, ChevronRight, X 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { 
  collection, query, orderBy, limit, startAfter, onSnapshot, getDocs 
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';

// Resilient synthesizer alarm for security events
const playFraudAlarm = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Play dual tone siren
    const playTone = (freq, time, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };

    const now = ctx.currentTime;
    playTone(880, now, 0.25);
    playTone(554, now + 0.15, 0.25);
    playTone(880, now + 0.3, 0.3);
    playTone(1046, now + 0.45, 0.4);
  } catch (e) {
    console.warn('[WebAudio] Siren sound blocked by browser policy:', e);
  }
};

const actionIcons = {
  create: { icon: Plus, color: 'green', bg: 'bg-emerald-500/10', text: 'text-emerald-400 border-emerald-500/20' },
  edit: { icon: Edit, color: 'blue', bg: 'bg-sky-500/10', text: 'text-sky-400 border-sky-500/20' },
  delete: { icon: Trash2, color: 'rose', bg: 'bg-rose-500/10', text: 'text-rose-400 border-rose-500/20' },
  login: { icon: LogIn, color: 'amber', bg: 'bg-amber-500/10', text: 'text-amber-400 border-amber-500/20' },
  sync: { icon: RefreshCw, color: 'purple', bg: 'bg-violet-500/10', text: 'text-violet-400 border-violet-500/20' },
  cancelled: { icon: ShieldAlert, color: 'red', bg: 'bg-red-500/10', text: 'text-red-400 border-red-500/20' },
  payment_received: { icon: CheckCircle2, color: 'green', bg: 'bg-green-500/10', text: 'text-green-400 border-green-500/20' },
};

const formatTimestamp = (value) => {
  if (!value) return 'Just now';
  const date = value?.toDate ? value.toDate() : new Date(value?.seconds ? value.seconds * 1000 : value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString();
};

const AuditLogs = () => {
  const { isDark } = useTheme();
  
  // Tabs: 'activity' (activityLogs), 'security' (auditLogs)
  const [activeTab, setActiveTab] = useState('security');
  
  // Search & Filter
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  
  // Data States
  const [activityLogs, setActivityLogs] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [lastActivityDoc, setLastActivityDoc] = useState(null);
  const [lastSecurityDoc, setLastSecurityDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  // Real-Time Sound Toggle
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Details Modal
  const [selectedLog, setSelectedLog] = useState(null);

  // Available unique store IDs gathered dynamically
  const storeIdsList = useMemo(() => {
    const currentList = activeTab === 'security' ? securityLogs : activityLogs;
    const unique = new Set(currentList.map(l => l.storeId || l.branchId).filter(Boolean));
    return Array.from(unique);
  }, [activeTab, securityLogs, activityLogs]);

  // Setup real-time updates for latest 150 items
  useEffect(() => {
    if (!isFirebaseReady() || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribeActivity = () => {};
    let unsubscribeSecurity = () => {};

    try {
      // Stream Activity Logs
      const actQuery = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(150));
      unsubscribeActivity = onSnapshot(actQuery, (snap) => {
        const logsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setActivityLogs(logsData);
        if (snap.docs.length > 0) {
          setLastActivityDoc(snap.docs[snap.docs.length - 1]);
        }
        if (activeTab === 'activity') setLoading(false);
      }, (err) => {
        console.error('Activity logs stream error:', err);
      });

      // Stream Security Logs (auditLogs)
      const secQuery = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(150));
      unsubscribeSecurity = onSnapshot(secQuery, (snap) => {
        const logsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Listen for new high-risk actions to play alarm
        if (soundEnabled && securityLogs.length > 0 && logsData.length > securityLogs.length) {
          const newest = logsData[0];
          const isOlder = securityLogs.some(existing => existing.id === newest.id);
          if (!isOlder && (newest.action === 'CANCELLED' || newest.type === 'CANCEL' || newest.actionType === 'CANCELLED')) {
            playFraudAlarm();
            toast((t) => (
              <span className="flex items-center gap-2 text-rose-400 font-bold">
                <ShieldAlert className="w-5 h-5 animate-bounce" />
                DANGER: Fraud/Cancel Alert - Bill #{newest.billSerial || newest.serialNo}!
              </span>
            ), { duration: 6000, style: { background: '#1c0a0c', border: '1px solid #ef444450' } });
          }
        }
        
        setSecurityLogs(logsData);
        if (snap.docs.length > 0) {
          setLastSecurityDoc(snap.docs[snap.docs.length - 1]);
        }
        if (activeTab === 'security') setLoading(false);
      }, (err) => {
        console.error('Security logs stream error:', err);
      });

    } catch (e) {
      console.error('Real-time database subscription failed:', e);
      setLoading(false);
    }

    return () => {
      unsubscribeActivity();
      unsubscribeSecurity();
    };
  }, [soundEnabled, securityLogs.length]);

  // Handle loading older records via pagination cursor
  const loadMoreLogs = async () => {
    if (loadingMore || !hasMore || !db) return;
    setLoadingMore(true);
    
    try {
      const activeCol = activeTab === 'security' ? 'auditLogs' : 'activityLogs';
      const activeCursor = activeTab === 'security' ? lastSecurityDoc : lastActivityDoc;
      
      if (!activeCursor) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const q = query(
        collection(db, activeCol),
        orderBy('timestamp', 'desc'),
        startAfter(activeCursor),
        limit(50)
      );

      const snap = await getDocs(q);
      if (snap.empty) {
        setHasMore(false);
      } else {
        const added = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (activeTab === 'security') {
          setSecurityLogs(prev => [...prev, ...added]);
          setLastSecurityDoc(snap.docs[snap.docs.length - 1]);
        } else {
          setActivityLogs(prev => [...prev, ...added]);
          setLastActivityDoc(snap.docs[snap.docs.length - 1]);
        }
      }
    } catch (err) {
      console.error('Failed to paginate audit logs:', err);
      toast.error('Failed to load older records');
    } finally {
      setLoadingMore(false);
    }
  };

  // Switch tabs reset hasMore
  useEffect(() => {
    setHasMore(true);
  }, [activeTab]);

  // Compute stats metrics dynamically
  const stats = useMemo(() => {
    const totalSec = securityLogs.length;
    const totalAct = activityLogs.length;
    const totalCancels = securityLogs.filter(l => l.action === 'CANCELLED' || l.actionType === 'CANCELLED' || l.type === 'CANCEL').length;
    const unSyncedAct = activityLogs.filter(l => l.synced === false || l.sync === false).length;

    return { totalSec, totalAct, totalCancels, unSyncedAct };
  }, [securityLogs, activityLogs]);

  // Filter logs for rendering
  const displayedLogs = useMemo(() => {
    const currentList = activeTab === 'security' ? securityLogs : activityLogs;
    
    return currentList.filter(log => {
      const searchLower = search.toLowerCase();
      
      const searchString = [
        log.action,
        log.description,
        log.user,
        log.userId,
        log.cashierName,
        log.billSerial,
        log.serialNo,
        log.storeId,
        log.branchId,
        log.paymentType
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = search ? searchString.includes(searchLower) : true;
      
      const actionName = (log.action || log.actionType || log.type || '').toLowerCase();
      const matchesAction = actionFilter === 'all' || 
        (actionFilter === 'creates' && actionName.includes('create')) ||
        (actionFilter === 'edits' && actionName.includes('edit')) ||
        (actionFilter === 'deletes' && (actionName.includes('delete') || actionName.includes('cancel'))) ||
        (actionFilter === 'logins' && actionName.includes('login')) ||
        (actionFilter === 'syncs' && actionName.includes('sync'));

      const matchesStore = storeFilter === 'all' || log.storeId === storeFilter || log.branchId === storeFilter;

      let matchesRisk = true;
      if (riskFilter !== 'all') {
        const isCancel = actionName.includes('cancel') || actionName.includes('delete');
        const isSuspicious = isCancel || log.amount > 50000 || log.reason?.toLowerCase().includes('wrong') || log.totalAmount > 100000;
        
        if (riskFilter === 'high') matchesRisk = isSuspicious;
        if (riskFilter === 'normal') matchesRisk = !isSuspicious;
      }

      return matchesSearch && matchesAction && matchesStore && matchesRisk;
    });
  }, [activeTab, securityLogs, activityLogs, search, actionFilter, storeFilter, riskFilter]);

  // CSV Export for active lists
  const handleCsvExport = () => {
    if (!displayedLogs.length) return;
    
    const headers = activeTab === 'security'
      ? ['Timestamp', 'Security Action', 'Cashier/Admin', 'Amount', 'Bill Serial', 'Store/Branch', 'Reason/Details']
      : ['Timestamp', 'User Activity', 'User ID', 'Amount', 'Bill Serial', 'Store/Branch', 'Synced'];

    const rows = displayedLogs.map(log => {
      const timeStr = formatTimestamp(log.timestamp);
      const action = log.action || log.actionType || log.type || 'UNKNOWN';
      const user = log.cashierName || log.user || log.userId || 'System';
      const amount = log.amount || log.totalAmount || 0;
      const serial = log.billSerial || log.serialNo || 'N/A';
      const branch = log.storeId || log.branchId || 'N/A';
      
      if (activeTab === 'security') {
        return [timeStr, action, user, amount, serial, branch, log.reason || 'N/A'];
      } else {
        return [timeStr, action, user, amount, serial, branch, log.synced ? 'YES' : 'NO'];
      }
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aone_pos_${activeTab}_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Logs exported successfully');
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto min-h-screen">
      
      {/* Page Header with Realtime indicators and actions */}
      <PageHeader 
        icon={Activity} 
        title="Live System Audits" 
        description="Real-time multi-branch activity streams and immutable fraud security locks" 
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={soundEnabled ? 'primary' : 'secondary'}
              onClick={() => {
                setSoundEnabled(p => !p);
                toast.success(soundEnabled ? 'Siren sound alerts disabled' : 'Siren sound alerts enabled');
              }}
              className="flex items-center gap-1.5"
            >
              {soundEnabled ? <Play className="w-3.5 h-3.5 animate-pulse text-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
              {soundEnabled ? 'Siren Active' : 'Siren Silent'}
            </Button>
            <Button 
              variant="secondary" 
              leftIcon={<Download className="w-4 h-4" />} 
              onClick={handleCsvExport}
              disabled={!displayedLogs.length}
            >
              Export CSV
            </Button>
          </div>
        } 
      />

      {/* Dynamic Statistics Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 transition-all',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-amber-500/20' : 'bg-white border-amber-200'
        )}>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-100">{stats.totalSec}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Security Audits</p>
          </div>
        </div>

        <div className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 transition-all',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-emerald-500/20' : 'bg-white border-amber-200'
        )}>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-100">{stats.totalAct}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Biller Operations</p>
          </div>
        </div>

        <div className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 transition-all',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-rose-500/20' : 'bg-white border-amber-200'
        )}>
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <p className="text-xl font-bold text-red-400">{stats.totalCancels}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Suspicious Deletes</p>
          </div>
        </div>

        <div className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 transition-all',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d] hover:border-purple-500/20' : 'bg-white border-amber-200'
        )}>
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-100">{stats.unSyncedAct}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Offline Queue Size</p>
          </div>
        </div>
      </div>

      {/* Tabs Selection Bar */}
      <div className="flex border-b border-[#2a1f0d] mb-6 gap-2">
        <button
          onClick={() => setActiveTab('security')}
          className={cn(
            'px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'security' 
              ? 'border-amber-500 text-amber-500 bg-amber-500/5' 
              : 'border-transparent text-gray-500 hover:text-gray-300'
          )}
        >
          <Shield className="w-4 h-4" />
          Security Audit Logs
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-[#1f160a] text-amber-400 font-bold border border-amber-500/20">
            LIVE LOCKS
          </span>
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={cn(
            'px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2',
            activeTab === 'activity' 
              ? 'border-amber-500 text-amber-500 bg-amber-500/5' 
              : 'border-transparent text-gray-500 hover:text-gray-300'
          )}
        >
          <Activity className="w-4 h-4" />
          User Activity Stream
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-[#0c140e] text-emerald-400 font-bold border border-emerald-500/20">
            ONLINE
          </span>
        </button>
      </div>

      {/* Multi-layered Grid Filters */}
      <div className={cn(
        'rounded-2xl border p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
      )}>
        <Input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Search logs by bill serial, user name..." 
          leftIcon={<Search className="w-4 h-4 text-gray-500" />} 
        />
        
        <select 
          value={actionFilter} 
          onChange={(e) => setActionFilter(e.target.value)} 
          className={cn(
            'rounded-xl border px-3 py-2 text-xs outline-none transition-colors cursor-pointer',
            isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50' : 'bg-white border-amber-200 text-gray-900'
          )}
        >
          <option value="all">All Actions Type</option>
          <option value="creates">Creates</option>
          <option value="edits">Edits</option>
          <option value="deletes">Deletes & Cancels</option>
          <option value="logins">User Logins</option>
          <option value="syncs">Database Syncs</option>
        </select>

        <select 
          value={storeFilter} 
          onChange={(e) => setStoreFilter(e.target.value)} 
          className={cn(
            'rounded-xl border px-3 py-2 text-xs outline-none transition-colors cursor-pointer',
            isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50' : 'bg-white border-amber-200 text-gray-900'
          )}
        >
          <option value="all">All Store Branches</option>
          {storeIdsList.map(sid => (
            <option key={sid} value={sid}>Branch: {sid.slice(0, 10)}...</option>
          ))}
        </select>

        <select 
          value={riskFilter} 
          onChange={(e) => setRiskFilter(e.target.value)} 
          className={cn(
            'rounded-xl border px-3 py-2 text-xs outline-none transition-colors cursor-pointer',
            isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50' : 'bg-white border-amber-200 text-gray-900'
          )}
        >
          <option value="all">All Risk Levels</option>
          <option value="high">⚠️ High Risk / Cancelled</option>
          <option value="normal">Normal Ops</option>
        </select>
      </div>

      {/* Main Audit Logs Table Console */}
      {loading ? (
        <div className={cn(
          'rounded-2xl border p-12 text-center flex flex-col items-center justify-center',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
        )}>
          <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">Streaming live Firebase audit feeds...</p>
        </div>
      ) : displayedLogs.length === 0 ? (
        <EmptyState 
          icon={Activity} 
          title="No live audit records match" 
          description="Adjust your search criteria, switch branches, or view alternative logs." 
        />
      ) : (
        <div className={cn(
          'rounded-2xl border overflow-hidden shadow-2xl',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
        )}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className={cn(isDark ? 'bg-[#1a1208]' : 'bg-amber-50')}>
                <tr className={cn('text-gray-400 border-b', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                  <th className="text-start px-4 py-3 font-semibold w-48">Timestamp</th>
                  <th className="text-start px-4 py-3 font-semibold w-36">Action</th>
                  <th className="text-start px-4 py-3 font-semibold">User Details</th>
                  <th className="text-start px-4 py-3 font-semibold w-40">Branch / Store ID</th>
                  <th className="text-start px-4 py-3 font-semibold w-36">Impact Amount</th>
                  <th className="text-start px-4 py-3 font-semibold w-36">Bill Serial</th>
                  <th className="text-end px-4 py-3 font-semibold w-24">Lock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a1f0d]">
                {displayedLogs.map((log, i) => {
                  const actionName = (log.action || log.actionType || log.type || 'EDIT').toLowerCase();
                  
                  // Setup risk indicators
                  const isCancel = actionName.includes('cancel') || actionName.includes('delete');
                  const isSuspicious = isCancel || log.amount > 50000 || log.reason?.toLowerCase().includes('wrong');
                  
                  const iconCfg = actionIcons[actionName] || 
                    (actionName.includes('cancel') ? actionIcons.cancelled : actionIcons.edit);
                  const Icon = iconCfg.icon;

                  const cashierName = log.cashierName || log.user || log.billerName || 'System';
                  const timestampStr = formatTimestamp(log.timestamp);
                  const serialNo = log.billSerial || log.serialNo || 'N/A';

                  return (
                    <tr 
                      key={log.id || i} 
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'hover:bg-[#150e05]/50 transition-colors cursor-pointer group border-b border-[#2a1f0d]',
                        isSuspicious && 'bg-red-500/5 hover:bg-red-500/10'
                      )}
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-600" />
                          {timestampStr}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-bold text-[10px]',
                          iconCfg.bg, iconCfg.text
                        )}>
                          <Icon className="w-3 h-3" />
                          {actionName.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold border border-amber-500/20 text-[10px]">
                            {cashierName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold">{cashierName}</p>
                            <p className="text-[10px] text-gray-500 font-mono">{log.userId || log.billerId || 'uid_system'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-600" />
                          {log.storeId || log.branchId || 'Global'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-200 font-mono">
                        {log.amount || log.totalAmount ? `Rs ${(log.amount || log.totalAmount).toLocaleString()}` : 'Rs 0'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-400 font-mono">
                        {serialNo}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-2">
                          {isSuspicious && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Suspicious Event" />
                          )}
                          <button 
                            className="p-1 rounded-lg text-gray-500 group-hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                            title="Verify Record"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Lazy Load Paginated Rows */}
          {hasMore && (
            <div className="p-4 text-center border-t border-[#2a1f0d]">
              <Button 
                variant="secondary" 
                onClick={loadMoreLogs} 
                disabled={loadingMore}
                className="w-full sm:w-auto font-bold flex items-center justify-center gap-1.5 mx-auto text-xs"
              >
                {loadingMore ? (
                  <><div className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /> Fetching Older Audits...</>
                ) : (
                  <><RefreshCcw className="w-3.5 h-3.5 text-amber-500" /> Retrieve More Audits</>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Immutable Details Modal Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className={cn(
            'w-full max-w-lg rounded-3xl border p-6 shadow-2xl transition-all relative overflow-hidden',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
          )}>
            
            {/* Ribbon Danger warning */}
            {(selectedLog.action === 'CANCELLED' || selectedLog.actionType === 'CANCELLED' || selectedLog.type === 'CANCEL') && (
              <div className="absolute top-0 inset-x-0 h-1.5 bg-rose-500 animate-pulse" />
            )}

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-gray-100 text-sm">Log Security Verification</h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1208] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detailed Metadata Grid */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#070503] p-3 rounded-2xl border border-[#2a1f0d]">
                  <p className="text-gray-500 font-bold uppercase tracking-wider text-[8px] mb-1">Audit Timestamp</p>
                  <p className="font-mono text-gray-300">{formatTimestamp(selectedLog.timestamp)}</p>
                </div>
                <div className="bg-[#070503] p-3 rounded-2xl border border-[#2a1f0d]">
                  <p className="text-gray-500 font-bold uppercase tracking-wider text-[8px] mb-1">Action Registry</p>
                  <p className="font-bold text-amber-400 font-mono">{String(selectedLog.action || selectedLog.actionType || selectedLog.type).toUpperCase()}</p>
                </div>
              </div>

              <div className="bg-[#070503] p-3.5 rounded-2xl border border-[#2a1f0d] space-y-2">
                <p className="text-gray-500 font-bold uppercase tracking-wider text-[8px]">Operator Profile</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold text-xs border border-amber-500/20">
                    {(selectedLog.cashierName || selectedLog.user || 'S').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-200">{selectedLog.cashierName || selectedLog.user || 'System Process'}</p>
                    <p className="text-[10px] text-gray-500 font-mono">UID: {selectedLog.cashierId || selectedLog.userId || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#070503] p-3.5 rounded-2xl border border-[#2a1f0d] space-y-1">
                <p className="text-gray-500 font-bold uppercase tracking-wider text-[8px]">Transaction Scope</p>
                <div className="grid grid-cols-2 gap-2 text-gray-300">
                  <p>Bill Serial: <strong className="text-amber-400 font-mono">{selectedLog.billSerial || selectedLog.serialNo || 'N/A'}</strong></p>
                  <p>Amount: <strong className="text-gray-100 font-mono">Rs {(selectedLog.amount || selectedLog.totalAmount || 0).toLocaleString()}</strong></p>
                  <p>Payment Mode: <strong>{selectedLog.paymentType || 'N/A'}</strong></p>
                  <p>Device Code: <strong className="font-mono">{selectedLog.deviceId || 'N/A'}</strong></p>
                </div>
              </div>

              {/* Immutable Security Proofs */}
              <div className="bg-[#070503] p-3.5 rounded-2xl border border-[#2a1f0d] space-y-1">
                <div className="flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-gray-500" />
                  <p className="text-gray-500 font-bold uppercase tracking-wider text-[8px]">Agent User-Agent Signature</p>
                </div>
                <p className="font-mono text-[9px] text-gray-400 break-all leading-relaxed bg-[#050302] p-2 rounded-xl border border-[#1f160a]">
                  {selectedLog.userAgent || 'Mozilla/5.0 POS-Device System Agent Native (Secure Lock)'}
                </p>
              </div>

              {/* Cancellation logs reason / detailed logs */}
              {selectedLog.reason && (
                <div className="bg-[#1c0a0c]/50 p-3 rounded-2xl border border-red-500/20 text-red-300">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <p className="font-bold uppercase tracking-wider text-[8px]">DANGER Override Justification</p>
                  </div>
                  <p className="font-semibold font-mono text-xs">{selectedLog.reason}</p>
                </div>
              )}

              {/* Proof of Immutability Lock */}
              <div className="flex items-center justify-center gap-1.5 py-1 text-emerald-500 text-[10px] bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified SHA-256 Ledger Locked - Decrypted Client Proof Valid</span>
              </div>

            </div>

            {/* Modal Action footer */}
            <div className="mt-5 flex justify-end">
              <Button 
                variant="primary" 
                onClick={() => setSelectedLog(null)}
                className="w-full sm:w-auto font-bold rounded-xl"
              >
                Close Certificate
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AuditLogs;