import { ShieldCheck, Save, Eye, Plus, Edit, Trash2, CheckCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import Badge from '../../components/ui/Badge';

const roles = ['biller', 'cashier', 'manager'];
const features = ['bills', 'customers', 'reports', 'cashflow', 'returns', 'expenses'];
const permissions = [
  { key: 'view', label: 'View', icon: Eye },
  { key: 'add', label: 'Add', icon: Plus },
  { key: 'edit', label: 'Edit', icon: Edit },
  { key: 'delete', label: 'Delete', icon: Trash2 },
  { key: 'approve', label: 'Approve', icon: CheckCircle },
  { key: 'export', label: 'Export', icon: Download },
];

const RolePermissions = () => {
  const { isDark } = useTheme();
  const { settings, setSetting } = useSettings();
  const perms = settings.permissions || {};

  const isAllowed = (role, feature, perm) => perms?.[role]?.[feature]?.[perm] === true;

  const toggle = (role, feature, perm) => {
    const updated = { ...perms };
    if (!updated[role]) updated[role] = {};
    if (!updated[role][feature]) updated[role][feature] = {};
    updated[role][feature][perm] = !updated[role][feature][perm];
    setSetting('permissions', updated);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PageHeader icon={ShieldCheck} title="Roles & Permissions" description="Configure feature-wise access for each role" />

      <div className="space-y-6">
        {roles.map((role) => (
          <div key={role} className={cn('rounded-2xl border overflow-hidden', isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}>
            <div className={cn('px-5 py-3 border-b flex items-center justify-between', isDark ? 'bg-[#1a1208] border-[#2a1f0d]' : 'bg-amber-50 border-amber-200')}>
              <h3 className={cn('font-bold capitalize', isDark ? 'text-white' : 'text-gray-900')}>{role}</h3>
              <Badge variant={role === 'manager' ? 'purple' : role === 'cashier' ? 'info' : 'success'}>{role}</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn('text-start', isDark ? 'text-gray-400' : 'text-gray-600')}>
                    <th className="text-start px-4 py-3 font-semibold">Feature</th>
                    {permissions.map((p) => (
                      <th key={p.key} className="px-2 py-3 font-semibold text-center min-w-[80px]">{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f} className={cn('border-t', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                      <td className={cn('px-4 py-3 capitalize font-medium', isDark ? 'text-white' : 'text-gray-900')}>{f}</td>
                      {permissions.map((p) => (
                        <td key={p.key} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isAllowed(role, f, p.key)}
                            onChange={() => toggle(role, f, p.key)}
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="primary" leftIcon={<Save className="w-4 h-4" />} onClick={() => toast.success('Permissions saved!')}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default RolePermissions;