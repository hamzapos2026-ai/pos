import { useState, useEffect, useMemo } from 'react';
import { 
  Store, Plus, Building2, MapPin, Mail, Phone, Search, 
  Trash2, Edit, Wifi, Database, Clock, RefreshCw, X, AlertTriangle, Eye 
} from 'lucide-react';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, onSnapshot 
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import { toast } from 'react-hot-toast';
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
import { useLanguage } from '../../hooks/useLanguage';

const BranchForm = ({ formData, setFormData, onSubmit, onCancel, submitLabel, isSubmitting }) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <Input 
        label={t('admin.branchesPage.branchName', 'Branch Name')}
        placeholder={t('admin.branchesPage.branchNamePh', 'E.g., Clifton Gold Arcade')} 
        value={formData.name} 
        onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} 
        leftIcon={<Building2 className="w-4 h-4 text-amber-500" />} 
      />
      <div className="space-y-1.5">
        <label className={cn('text-xs font-semibold uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('admin.branchesPage.location', 'Location / Address')}</label>
        <textarea
          rows={3}
          value={formData.location}
          onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
          placeholder={t('admin.branchesPage.locationPh', 'E.g., Shop 42, Gold Bazar, Tariq Road, Karachi')}
          className={cn(
            'w-full px-3 py-2 rounded-xl text-xs resize-none outline-none transition-all',
            isDark 
              ? 'bg-[#0a0805] border border-[#2a1f0d] text-white focus:border-amber-500/50' 
              : 'bg-white border border-amber-200 text-gray-900 focus:border-amber-500'
          )}
        />
      </div>
      <Input 
        label={t('admin.branchesPage.phone', 'Phone Number')}
        placeholder={t('admin.branchesPage.phonePh', 'E.g., 0316-2502498')} 
        value={formData.phone} 
        onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} 
        leftIcon={<Phone className="w-4 h-4 text-amber-500" />} 
      />
      <Input 
        label={t('admin.branchesPage.email', 'Email Address')}
        type="email" 
        placeholder={t('admin.branchesPage.emailPh', 'E.g., branch@aonejewelry.com')} 
        value={formData.email} 
        onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} 
        leftIcon={<Mail className="w-4 h-4 text-amber-500" />} 
      />
      
      <label className="flex items-center gap-2.5 cursor-pointer py-1 select-none">
        <input 
          type="checkbox" 
          checked={formData.isActive} 
          onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} 
          className="w-4 h-4 rounded text-amber-500 bg-[#0a0805] border-[#2a1f0d] focus:ring-amber-500 focus:ring-offset-0 focus:ring-1" 
        />
        <span className={cn('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>{t('admin.branchesPage.markActive', 'Mark Branch Active')}</span>
      </label>

      <div className="flex gap-2 pt-3 border-t border-[#2a1f0d]/50">
        <Button variant="secondary" onClick={onCancel} className="flex-1 rounded-xl" disabled={isSubmitting}>{t('common.cancel', 'Cancel')}</Button>
        <Button variant="primary" onClick={onSubmit} className="flex-1 rounded-xl font-semibold" disabled={isSubmitting}>
          {isSubmitting ? t('admin.branchesPage.processing', 'Processing...') : submitLabel}
        </Button>
      </div>
    </div>
  );
};

const BranchManagement = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { t, isRTL } = useLanguage();
  
  // Data States
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Modals & Panels
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', location: '', phone: '', email: '', isActive: true });

  // Real-Time Subscriptions for stores & users
  useEffect(() => {
    if (!isFirebaseReady() || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribeBranches = () => {};
    let unsubscribeUsers = () => {};

    try {
      // Stream branches
      unsubscribeBranches = onSnapshot(collection(db, 'stores'), (snap) => {
        const branchData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBranches(branchData);
        setLoading(false);
      }, (err) => {
        console.error('[BranchManagement] Store stream error:', err);
        toast.error(t('admin.branchesPage.feedFailed', 'Failed to bind real-time stores feed'));
        setLoading(false);
      });

      // Stream users for assignment counts
      unsubscribeUsers = onSnapshot(collection(db, 'users'), (snap) => {
        const userData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(userData);
      }, (err) => {
        console.error('[BranchManagement] User stream error:', err);
      });

    } catch (e) {
      console.error('[BranchManagement] Subscription failed:', e);
      setLoading(false);
    }

    return () => {
      unsubscribeBranches();
      unsubscribeUsers();
    };
  }, []);

  // Compute live branch statistics
  const stats = useMemo(() => {
    return {
      total: branches.length,
      active: branches.filter(b => b.isActive).length,
      inactive: branches.filter(b => !b.isActive).length,
      totalStaff: users.filter(u => u.storeId || u.storeIds?.length).length
    };
  }, [branches, users]);

  // Autocomplete Suggestions
  const searchSuggestions = useMemo(() => {
    if (!search.trim()) return [];
    return branches
      .filter(b => b.name?.toLowerCase().includes(search.toLowerCase()))
      .map(b => b.name)
      .slice(0, 5);
  }, [branches, search]);

  // Handle Create Branch
  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error(t('admin.branchesPage.nameRequired', 'Branch name required'));
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        isActive: form.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'stores'), payload);

      // Log Security Audit
      await logActivity(
        'BRANCH_CREATED', 
        user?.uid || 'system', 
        docRef.id, 
        { branchName: form.name.trim(), initiator: user?.email || 'admin' }
      ).catch(e => console.warn('Activity logger fail:', e));

      toast.success(t('admin.branchesPage.created', 'Branch created', { name: form.name }));
      setShowCreate(false);
      setForm({ name: '', location: '', phone: '', email: '', isActive: true });
    } catch (e) {
      console.error('[BranchManagement] Create failed:', e);
      toast.error(t('admin.branchesPage.createFailed', 'Create failed: {{msg}}', { msg: e.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Update Branch
  const handleUpdate = async () => {
    if (!selected) return;
    if (!form.name.trim()) return toast.error(t('admin.branchesPage.nameRequired', 'Branch name required'));
    setIsSubmitting(true);

    try {
      const branchRef = doc(db, 'stores', selected.id);
      await updateDoc(branchRef, {
        name: form.name.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        isActive: form.isActive,
        updatedAt: serverTimestamp()
      });

      // Log Security Audit
      await logActivity(
        'BRANCH_UPDATED', 
        user?.uid || 'system', 
        selected.id, 
        { branchName: form.name.trim(), initiator: user?.email || 'admin' }
      ).catch(e => console.warn('Activity logger fail:', e));

      toast.success(t('admin.branchesPage.updated', 'Branch details updated'));
      setShowEdit(false);
      setSelected(null);
    } catch (e) {
      console.error('[BranchManagement] Update failed:', e);
      toast.error(t('admin.branchesPage.updateFailed', 'Update failed: {{msg}}', { msg: e.message }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Branch with Safety Lock
  const handleDelete = async (b) => {
    const assignedStaff = users.filter(
      u => u.storeId === b.id || (u.storeIds || []).includes(b.id)
    );
    
    if (assignedStaff.length > 0) {
      toast.error(t('admin.branchesPage.safetyLock', 'Cannot delete branch. {{count}} user(s) remain assigned!', { count: assignedStaff.length }));
      return;
    }

    if (!confirm(`Are you absolutely sure you want to permanently erase the "${b.name}" branch?`)) return;

    try {
      await deleteDoc(doc(db, 'stores', b.id));

      // Log Security Audit
      await logActivity(
        'BRANCH_DELETED', 
        user?.uid || 'system', 
        b.id, 
        { branchName: b.name, initiator: user?.email || 'admin' }
      ).catch(e => console.warn('Activity logger fail:', e));

      toast.success(t('admin.branchesPage.erased', 'Branch erased', { name: b.name }));
    } catch (e) {
      console.error('[BranchManagement] Erase failed:', e);
      toast.error(t('admin.branchesPage.eraseFailed', 'Erase failed: {{msg}}', { msg: e.message }));
    }
  };

  const openEdit = (b) => {
    setSelected(b);
    setForm({ 
      name: b.name || '', 
      location: b.location || '', 
      phone: b.phone || '', 
      email: b.email || '', 
      isActive: b.isActive ?? true 
    });
    setShowEdit(true);
  };

  const getBranchStaffCount = (id) => {
    return users.filter(u => u.storeId === id || (u.storeIds || []).includes(id)).length;
  };

  // Filter branches
  const filteredBranches = useMemo(() => {
    return branches.filter(b => {
      const matchSearch = !search || 
        b.name?.toLowerCase().includes(search.toLowerCase()) || 
        b.location?.toLowerCase().includes(search.toLowerCase()) ||
        b.phone?.toLowerCase().includes(search.toLowerCase());
      
      const matchStatus = statusFilter === 'all' || 
        (statusFilter === 'active' ? b.isActive === true : b.isActive === false);

      return matchSearch && matchStatus;
    });
  }, [branches, search, statusFilter]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-[1600px] mx-auto min-h-screen">
      
      {/* Page Header */}
      <PageHeader 
        icon={Store} 
        title={t('admin.branchesPage.title', 'Branch Control Center')}
        description={t('admin.branchesPage.subtitle', 'Verify active store locations, manage branch terminals, and evaluate operator assignments')}
        actions={
          <Button 
            variant="primary" 
            leftIcon={<Plus className="w-4 h-4" />} 
            onClick={() => {
              setForm({ name: '', location: '', phone: '', email: '', isActive: true });
              setShowCreate(true);
            }}
            className="rounded-xl font-bold"
          >
            {t('admin.branchesPage.addBranch', 'Add Branch')}
          </Button>
        } 
      />

      {/* Dynamic Gold Gradient Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label={t('admin.branchesPage.totalBranches', 'Total Branches')} value={stats.total} icon={Store} color="amber" />
        <StatCard label={t('admin.branchesPage.activeStores', 'Active Stores')} value={stats.active} icon={Building2} color="green" />
        <StatCard label={t('admin.branchesPage.closedSuspended', 'Closed / Suspended')} value={stats.inactive} icon={AlertTriangle} color="rose" />
        <StatCard label={t('admin.branchesPage.registeredStaff', 'Registered Staff')} value={stats.totalStaff} icon={Plus} color="blue" />
      </div>

      {/* Advanced Filters Panel */}
      <div className={cn(
        'rounded-2xl border p-4 mb-6 flex flex-col md:flex-row gap-3 relative z-30',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
      )}>
        <div className="flex-1 relative">
          <Input 
            value={search} 
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }} 
            onFocus={() => setShowSuggestions(true)}
            placeholder={t('admin.branchesPage.searchPh', 'Search by branch name, location, or contact details...')} 
            leftIcon={<Search className="w-4 h-4 text-gray-500" />} 
            className="w-full" 
          />
          {/* Autocomplete suggestions popup */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div className={cn(
              'absolute left-0 right-0 mt-1.5 rounded-xl border p-1 shadow-2xl z-40',
              isDark ? 'bg-[#0c0804] border-[#2a1f0d] text-white' : 'bg-white border-amber-100 text-gray-900'
            )}>
              {searchSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSearch(suggestion);
                    setShowSuggestions(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs rounded-lg transition-colors font-medium',
                    isDark ? 'hover:bg-amber-500/10 hover:text-amber-400' : 'hover:bg-amber-50 text-gray-700'
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {showSuggestions && search && (
            <div className="fixed inset-0 z-20" onClick={() => setShowSuggestions(false)} />
          )}
        </div>
        
        <div className="flex gap-2 shrink-0">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)} 
            className={cn(
              'rounded-xl border px-4 py-2 text-xs outline-none cursor-pointer font-semibold',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50' : 'bg-white border-amber-200 text-gray-900'
            )}
          >
            <option value="all">{t('admin.usersPage.allBranches', 'All Branches')}</option>
            <option value="active">{t('common.active', 'Active')}</option>
            <option value="inactive">{t('common.inactive', 'Inactive')}</option>
          </select>
          <Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter('all'); }} className="rounded-xl px-4 py-2 text-xs">
            {t('common.clear', 'Clear')}
          </Button>
        </div>
      </div>

      {/* Main Database Table Grid */}
      {loading ? (
        <div className="text-center py-16 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">{t('common.loading', 'Loading...')}</p>
        </div>
      ) : filteredBranches.length === 0 ? (
        <EmptyState 
          icon={Store} 
          title={t('admin.branchesPage.noBranches', 'No branch registries found')}
          description={t('admin.branchesPage.noBranchesDesc', 'Adjust query criteria or register a new store branch.')}
          action={
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
              {t('admin.branchesPage.registerModal', 'Register Store Branch')}
            </Button>
          }
        />
      ) : (
        <div className={cn(
          'rounded-2xl border overflow-hidden shadow-2xl transition-all relative z-10',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200'
        )}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className={cn(isDark ? 'bg-[#1a1208]' : 'bg-amber-50')}>
                <tr className={cn('text-gray-400 border-b', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                  <th className="text-start px-4 py-3.5 font-bold">Branch ID / Code</th>
                  <th className="text-start px-4 py-3.5 font-bold">Branch Name</th>
                  <th className="text-start px-4 py-3.5 font-bold">Address / Location</th>
                  <th className="text-start px-4 py-3.5 font-bold">Contact Details</th>
                  <th className="text-start px-4 py-3.5 font-bold text-center">Assigned Users</th>
                  <th className="text-start px-4 py-3.5 font-bold">Active Status</th>
                  <th className="text-start px-4 py-3.5 font-bold text-center w-16">Sync</th>
                  <th className="text-end px-4 py-3.5 font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a1f0d]/40">
                {filteredBranches.map((b) => {
                  const hasAssigned = getBranchStaffCount(b.id);
                  return (
                    <tr 
                      key={b.id} 
                      className={cn(
                        'hover:bg-[#150e05]/40 transition-colors border-b border-[#2a1f0d]/30',
                        !b.isActive && 'bg-red-500/5 opacity-70'
                      )}
                    >
                      {/* Branch ID */}
                      <td className="px-4 py-3.5 font-mono font-bold text-gray-400">
                        {b.id.slice(0, 10).toUpperCase()}...
                      </td>

                      {/* Branch Name */}
                      <td className="px-4 py-3.5 text-gray-200 font-bold">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <span>{b.name}</span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5 text-gray-300">
                        <div className="flex items-start gap-1 max-w-[280px]">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                          <span className="truncate" title={b.location || t('admin.branchesPage.noAddress', 'No address specified')}>
                            {b.location || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* Contact Details */}
                      <td className="px-4 py-3.5 text-gray-400">
                        {b.phone && <div className="font-mono text-[10px]">{b.phone}</div>}
                        {b.email && <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{b.email}</div>}
                        {!b.phone && !b.email && <span className="text-gray-600">N/A</span>}
                      </td>

                      {/* Assigned Users */}
                      <td className="px-4 py-3.5 text-center font-bold text-gray-200 font-mono">
                        {hasAssigned > 0 ? (
                          <span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-lg border border-amber-500/25">
                            {hasAssigned} staff
                          </span>
                        ) : (
                          <span className="text-gray-600">0 staff</span>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="px-4 py-3.5">
                        <Badge variant={b.isActive ? 'success' : 'secondary'}>
                          {b.isActive ? t('common.active', 'Active').toUpperCase() : t('common.inactive', 'Inactive').toUpperCase()}
                        </Badge>
                      </td>

                      {/* Cloud Sync Status */}
                      <td className="px-4 py-3.5 text-center">
                        {isOnline ? (
                          <span title={t('admin.branchesPage.syncedFirebase', 'Branch registry synced with Firebase')} className="inline-flex text-emerald-500">
                            <Wifi className="w-4 h-4" />
                          </span>
                        ) : (
                          <span title={t('admin.branchesPage.savedLocal', 'Saved locally in Dexie database cache')} className="inline-flex text-amber-500 animate-pulse">
                            <Database className="w-4 h-4" />
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-end">
                        <div className="inline-flex gap-1.5 justify-end">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => openEdit(b)} 
                            title={t('admin.branchesPage.editDetails', 'Edit details')}
                            className="p-1.5"
                          >
                            <Edit className="w-4 h-4 text-amber-500" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDelete(b)} 
                            title={t('admin.branchesPage.eraseBranch', 'Erase Branch')}
                            className="p-1.5"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500/80 hover:text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={t('admin.branchesPage.registerModal', 'Register Store Branch')} size="medium">
        <BranchForm 
          formData={form} 
          setFormData={setForm} 
          onSubmit={handleCreate} 
          onCancel={() => setShowCreate(false)} 
          submitLabel={t('admin.branchesPage.createBranch', 'Create Branch')}
          isSubmitting={isSubmitting}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title={t('admin.branchesPage.editModal', 'Edit Branch Registry')} size="medium">
        <BranchForm 
          formData={form} 
          setFormData={setForm} 
          onSubmit={handleUpdate} 
          onCancel={() => setShowEdit(false)} 
          submitLabel={t('admin.branchesPage.saveSettings', 'Save Settings')}
          isSubmitting={isSubmitting}
        />
      </Modal>

    </div>
  );
};

export default BranchManagement;