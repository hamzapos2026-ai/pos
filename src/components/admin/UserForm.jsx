import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { createUser, updateUser } from '../../services/userSyncService';
import { cn } from '../../utils/cn';

const ROLE_OPTIONS = [
  { value: 'superAdmin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'biller', label: 'Biller' },
  { value: 'cashier', label: 'Cashier' },
];

const getStoreName = (store) => {
  if (!store) return '';
  return (store.storeName || store.name || store.id || '')
    .replace('A One Jewelry - ', '')
    .replace('A One Jewellery - ', '')
    .trim();
};

const UserForm = ({
  isOpen,
  onClose,
  onSubmit,
  editUser,
  stores = [],
  currentAdmin,
}) => {
  const isEditMode = !!(editUser?.uid || editUser?.id);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState(['biller']);
  const [storeIds, setStoreIds] = useState([]);
  const [primaryStore, setPrimaryStore] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (!isEditMode) {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRoles(['biller']);
      setStoreIds([]);
      setPrimaryStore('');
      setIsActive(true);
      setNotes('');
      return;
    }

    setName(editUser.name || '');
    setEmail(editUser.email || '');
    setPhone(editUser.phone || '');
    setPassword('');
    setRoles(editUser.roles || (editUser.role ? [editUser.role] : ['biller']));
    setStoreIds(editUser.storeIds || (editUser.storeId ? [editUser.storeId] : []));
    setPrimaryStore(editUser.primaryStore || editUser.storeId || (editUser.storeIds?.[0] ?? '') || '');
    setIsActive(editUser.isActive !== false);
    setNotes(editUser.notes || '');
  }, [isOpen, editUser, isEditMode]);

  const toggleRole = (role) => {
    setRoles((prev) =>
      prev.includes(role)
        ? prev.filter((item) => item !== role)
        : [...prev, role]
    );
  };

  const toggleStore = (storeId) => {
    setStoreIds((prev) =>
      prev.includes(storeId)
        ? prev.filter((item) => item !== storeId)
        : [...prev, storeId]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!isEditMode && !password.trim()) {
      toast.error('Password is required for new users');
      return;
    }
    if (!roles.length) {
      toast.error('Select at least one role');
      return;
    }
    if (!storeIds.length) {
      toast.error('Select at least one branch');
      return;
    }
    if (!currentAdmin) {
      toast.error('Current admin context is missing');
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      roles,
      storeIds,
      primaryStore: primaryStore || storeIds[0],
      isActive,
      notes: notes.trim(),
    };

    if (!isEditMode) {
      payload.password = password.trim();
    }

    setLoading(true);
    try {
      const result = isEditMode
        ? await updateUser(editUser.uid || editUser.id, payload, currentAdmin)
        : await createUser(payload, currentAdmin);

      if (!result?.success) {
        toast.error(result?.error || 'Failed to save user');
        return;
      }

      onSubmit?.(result);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit User' : 'Add User'}
      size="large"
      footer={(
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-4 py-2 text-sm text-gray-300 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition',
              loading
                ? 'bg-amber-500/40 text-[#0a0805] cursor-not-allowed'
                : 'bg-amber-500 text-[#0a0805] hover:bg-amber-400'
            )}
          >
            {loading ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-200">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Full name"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="user@example.com"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-200">
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="Optional phone"
            />
          </label>
          {!isEditMode && (
            <label className="space-y-1 text-sm text-gray-200">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="Temporary password"
              />
            </label>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-200">Roles</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleRole(option.value)}
                  className={cn(
                    'rounded-2xl border px-3 py-2 text-sm text-left transition',
                    roles.includes(option.value)
                      ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                      : 'border-[#2a1f0d] bg-[#0a0805] text-gray-300 hover:border-amber-500/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-200">Branches</p>
            <div className="space-y-2">
              {stores.length === 0 && (
                <p className="text-xs text-gray-500">No branches available yet.</p>
              )}
              {stores.map((store) => (
                <label key={store.id} className="flex items-center gap-2 rounded-2xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={storeIds.includes(store.id)}
                    onChange={() => toggleStore(store.id)}
                    className="h-4 w-4 rounded border-gray-600 bg-[#0a0805] text-amber-500 focus:ring-amber-500"
                  />
                  <span>{getStoreName(store)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-200">
            Primary Branch
            <select
              value={primaryStore}
              onChange={(e) => setPrimaryStore(e.target.value)}
              className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="">Select primary branch</option>
              {storeIds.map((id) => {
                const store = stores.find((s) => s.id === id);
                return (
                  <option key={id} value={id}>
                    {getStoreName(store)}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-[#2a1f0d] bg-[#0a0805] px-4 py-3 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-[#0a0805] text-amber-500 focus:ring-amber-500"
            />
            Active account
          </label>
        </div>

        <label className="space-y-1 text-sm text-gray-200">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="Optional notes"
          />
        </label>
      </form>
    </Modal>
  );
};

export default UserForm;
