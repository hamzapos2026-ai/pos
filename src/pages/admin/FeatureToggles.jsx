import { Zap, Save, Users, RefreshCw, CreditCard, Camera, Wallet, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';

const features = [
  { key: 'salesperson', sub: 'enabled', label: 'Salesperson Commission System', desc: 'Enable salesperson assignment and commission tracking', icon: Users, group: 'salesperson' },
  { key: 'salesperson', sub: 'allowMultiplePerBill', label: 'Multiple Salespersons Per Bill', desc: 'Allow assigning more than one salesperson to a bill', icon: Users, group: 'salesperson' },
  { key: 'expenses', sub: null, label: 'Expenses Module', desc: 'Track business expenses', icon: TrendingDown, group: 'featureToggles' },
  { key: 'returns', sub: null, label: 'Returns Module', desc: 'Enable bill returns and refunds', icon: RefreshCw, group: 'featureToggles' },
  { key: 'creditSales', sub: null, label: 'Credit Sales', desc: 'Allow selling on credit', icon: CreditCard, group: 'featureToggles' },
  { key: 'cameraCapture', sub: null, label: 'Camera Capture', desc: 'Enable photo capture for items/customers', icon: Camera, group: 'featureToggles' },
  { key: 'cashDrawer', sub: null, label: 'Cash Drawer Tracking', desc: 'Track cash drawer opening/closing', icon: Wallet, group: 'featureToggles' },
];

const FeatureToggles = () => {
  const { isDark } = useTheme();
  const { settings, setSetting } = useSettings();

  const isEnabled = (f) => {
    const g = settings[f.group] || {};
    if (f.sub) return g[f.sub] === true;
    return g[f.key] === true;
  };

  const toggle = (f) => {
    const g = settings[f.group] || {};
    if (f.sub) {
      setSetting(f.group, { ...g, [f.sub]: !g[f.sub] });
    } else {
      setSetting(f.group, { ...g, [f.key]: !g[f.key] });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader icon={Zap} title="Feature Toggles" description="Enable or disable system modules and features" />

      <div className="space-y-3">
        {features.map((f, i) => {
          const Icon = f.icon;
          const enabled = isEnabled(f);
          return (
            <div key={i} className={cn(
              'rounded-2xl border p-4 sm:p-5 flex items-center justify-between gap-4 transition-all',
              isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
              enabled && 'ring-2 ring-amber-500/30'
            )}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>{f.label}</h3>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                </div>
              </div>
              <button
                onClick={() => toggle(f)}
                className={cn('relative w-12 h-6 rounded-full transition-colors flex-shrink-0', enabled ? 'bg-amber-500' : isDark ? 'bg-[#2a1f0d]' : 'bg-gray-300')}
              >
                <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-0.5')} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="primary" leftIcon={<Save className="w-4 h-4" />} onClick={() => toast.success('Features updated!')}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default FeatureToggles;