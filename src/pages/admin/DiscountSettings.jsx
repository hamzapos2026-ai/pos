import { Percent, Save, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';

const DiscountSettings = () => {
  const { isDark } = useTheme();
  const { settings, setSetting } = useSettings();
  const d = settings.discounts || {};

  const update = (field, value) => setSetting('discounts', { ...d, [field]: value });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader icon={Percent} title="Discount Settings" description="Configure maximum discount limits and approval rules" />

      <div className={cn('rounded-2xl border p-6 space-y-5', isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}>
        <Input
          label="Maximum Discount %"
          type="number"
          value={d.maxPercent ?? 5}
          onChange={(e) => update('maxPercent', Number(e.target.value))}
          placeholder="5"
          leftIcon={<Percent className="w-4 h-4" />}
        />

        <Input
          label="Maximum Discount Amount"
          type="number"
          value={d.maxAmount ?? 0}
          onChange={(e) => update('maxAmount', Number(e.target.value))}
          placeholder="0 (no limit)"
        />

        <label className={cn('flex items-start gap-3 rounded-xl border p-4 cursor-pointer', isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-200')}>
          <input
            type="checkbox"
            checked={d.requireApproval === true}
            onChange={(e) => update('requireApproval', e.target.checked)}
            className="w-5 h-5 rounded text-amber-500 mt-0.5"
          />
          <div>
            <p className={cn('font-semibold flex items-center gap-2', isDark ? 'text-white' : 'text-gray-900')}>
              <ShieldCheck className="w-4 h-4 text-amber-500" /> Require Manager Approval
            </p>
            <p className="text-xs text-gray-500 mt-1">When enabled, all discounts above 0 will require manager approval</p>
          </div>
        </label>

        <label className={cn('flex items-start gap-3 rounded-xl border p-4 cursor-pointer', isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-200')}>
          <input
            type="checkbox"
            checked={d.allowOnReturn === true}
            onChange={(e) => update('allowOnReturn', e.target.checked)}
            className="w-5 h-5 rounded text-amber-500 mt-0.5"
          />
          <div>
            <p className={cn('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>Allow Discount on Returns</p>
            <p className="text-xs text-gray-500 mt-1">Apply discount adjustments during returns</p>
          </div>
        </label>

        <div className="flex justify-end pt-2">
          <Button variant="primary" leftIcon={<Save className="w-4 h-4" />} onClick={() => toast.success('Discount settings saved!')}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DiscountSettings;