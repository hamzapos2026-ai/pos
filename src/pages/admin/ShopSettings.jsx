// src/pages/admin/ShopSettings.jsx
// ✅ FIXED — Firebase se save/load + NTN + tagline + all fields
import { useState, useEffect } from 'react';
import {
  Building2, Save, Globe, Phone, Receipt, Hash,
  Type, MapPin, Image, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';

const ShopSettings = () => {
  const { isDark } = useTheme();
  const { settings, setSetting } = useSettings();

  // ✅ Read from settings.store (matches BillerDashboard storeInfo)
  const store = settings?.store || settings?.shop || {};

  const [form, setForm] = useState({
    name:          '',
    tagline:       '',
    address:       '',
    phone:         '',
    ntn:           '',
    logo:          '',
    currency:      'PKR',
    timezone:      'Asia/Karachi',
    receiptFooter: '',
  });

  const [saving, setSaving] = useState(false);

  // ── Load from settings ─────────────────────────────────────
  useEffect(() => {
    setForm({
      name:          store.name          || '',
      tagline:       store.tagline       || '',
      address:       store.address       || '',
      phone:         store.phone         || '',
      ntn:           store.ntn           || '',
      logo:          store.logo          || '',
      currency:      store.currency      || 'PKR',
      timezone:      store.timezone      || 'Asia/Karachi',
      receiptFooter: store.receiptFooter || '',
    });
  }, [settings]);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // ── Save to Firebase via SettingsContext ────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Shop name is required');
      return;
    }

    setSaving(true);
    try {
      // ✅ Save to both 'store' and 'shop' keys for compatibility
      await setSetting('store', { ...form });
      await setSetting('shop',  { ...form });
      toast.success('Shop settings saved to cloud! ☁️');
    } catch (e) {
      console.error('[ShopSettings]', e);
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Field config ───────────────────────────────────────────
  const fields = [
    [
      { key: 'name',    label: 'Shop Name',   ph: 'A One Jewelry',     icon: Building2 },
      { key: 'tagline', label: 'Tagline',      ph: '22K Gold Specialist', icon: Type },
    ],
    [
      { key: 'phone',   label: 'Phone',        ph: '0316-2502498',      icon: Phone },
      { key: 'ntn',     label: 'NTN Number',   ph: '1234567-8',         icon: Hash },
    ],
    [
      { key: 'currency', label: 'Currency',    ph: 'PKR',              icon: Globe },
      { key: 'timezone', label: 'Time Zone',   ph: 'Asia/Karachi',     icon: Globe },
    ],
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        icon={Building2}
        title="Shop Settings"
        description="Business identity, contact details & invoice configuration"
      />

      <div className={cn(
        'rounded-2xl border p-6 space-y-5',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>

        {/* Paired fields */}
        {fields.map((row, ri) => (
          <div key={ri} className="grid sm:grid-cols-2 gap-4">
            {row.map(f => (
              <Input
                key={f.key}
                label={f.label}
                value={form[f.key]}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.ph}
                leftIcon={<f.icon className="w-4 h-4" />}
              />
            ))}
          </div>
        ))}

        {/* Address */}
        <div className="space-y-1.5">
          <label className={cn(
            'text-sm font-medium flex items-center gap-2',
            isDark ? 'text-gray-300' : 'text-gray-700',
          )}>
            <MapPin className="w-4 h-4" /> Address
          </label>
          <textarea
            rows={3}
            value={form.address}
            onChange={e => update('address', e.target.value)}
            placeholder="Full business address..."
            className={cn(
              'w-full px-3 py-2 rounded-xl text-sm resize-none outline-none border transition-colors',
              isDark
                ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50'
                : 'bg-white border-amber-200 text-gray-900 focus:border-amber-400',
            )}
          />
        </div>

        {/* Logo URL */}
        <Input
          label="Logo URL"
          value={form.logo}
          onChange={e => update('logo', e.target.value)}
          placeholder="https://example.com/logo.png"
          leftIcon={<Image className="w-4 h-4" />}
        />

        {/* Logo Preview */}
        {form.logo && (
          <div className={cn(
            'rounded-xl border p-4 flex items-center gap-4',
            isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200',
          )}>
            <img
              src={form.logo}
              alt="Logo preview"
              className="w-16 h-16 object-contain rounded-lg"
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div>
              <p className={cn('text-sm font-medium',
                isDark ? 'text-gray-300' : 'text-gray-700')}>
                Logo Preview
              </p>
              <p className="text-xs text-gray-500">
                This appears on invoices & receipts
              </p>
            </div>
          </div>
        )}

        {/* Receipt Footer */}
        <div className="space-y-1.5">
          <label className={cn(
            'text-sm font-medium flex items-center gap-2',
            isDark ? 'text-gray-300' : 'text-gray-700',
          )}>
            <Receipt className="w-4 h-4" /> Receipt Footer
          </label>
          <textarea
            rows={2}
            value={form.receiptFooter}
            onChange={e => update('receiptFooter', e.target.value)}
            placeholder="Thank you for shopping with us! No refund without receipt."
            className={cn(
              'w-full px-3 py-2 rounded-xl text-sm resize-none outline-none border transition-colors',
              isDark
                ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50'
                : 'bg-white border-amber-200 text-gray-900 focus:border-amber-400',
            )}
          />
        </div>

        {/* Invoice Preview */}
        <div className={cn(
          'rounded-xl border p-5 space-y-2',
          isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50 border-amber-200',
        )}>
          <p className={cn('text-[10px] font-bold uppercase tracking-wider',
            isDark ? 'text-gray-500' : 'text-gray-400')}>
            Invoice Header Preview
          </p>
          <div className="text-center font-mono">
            <p className={cn('text-lg font-bold',
              isDark ? 'text-white' : 'text-gray-900')}>
              {form.name || 'Shop Name'}
            </p>
            {form.tagline && (
              <p className={cn('text-xs',
                isDark ? 'text-gray-400' : 'text-gray-600')}>
                {form.tagline}
              </p>
            )}
            {form.address && (
              <p className="text-[10px] text-gray-500 mt-1">{form.address}</p>
            )}
            <p className="text-[10px] text-gray-500">
              {form.phone && `PH: ${form.phone}`}
              {form.ntn && ` | NTN: ${form.ntn}`}
            </p>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            leftIcon={saving
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save to Cloud'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShopSettings;