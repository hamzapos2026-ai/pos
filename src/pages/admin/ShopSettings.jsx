// Shop Settings — business profile + data management

import { useState, useEffect, useMemo } from 'react';
import {
  Building2, Save, Globe, Phone, Receipt, Hash, Type, MapPin,
  RefreshCw, Mail, MessageCircle, Link2, FileText, Database, Settings2,
  Languages, Clock, Percent, Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import { logActivity } from '../../services/activityLogger';
import { logSuperAdminActivity } from '../../services/superAdminActivityService';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import DataManagerPanel from '../../components/admin/DataManagerPanel';
import ShopLogoUpload from '../../components/admin/ShopLogoUpload';
import Badge from '../../components/ui/Badge';
import { SettingsCard } from '../../components/admin/SettingsUi';

const TABS = [
  { id: 'business', labelKey: 'shop.tabBusiness', icon: Building2 },
  { id: 'data', labelKey: 'shop.tabData', icon: Database },
];

const DEFAULT_FORM = {
  name: '',
  tagline: '',
  address: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  ntn: '',
  logo: '',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  receiptFooter: '',
  invoicePrefix: 'INV',
  defaultLanguage: 'en',
  taxLabel: 'Tax',
  showTaxOnReceipt: false,
  businessHours: '10:00 AM – 8:00 PM',
};

const fieldClass = (isDark) => cn(
  'w-full px-3 py-2 rounded-xl text-sm resize-none outline-none border transition-colors',
  isDark
    ? 'bg-[#0a0805] border-[#2a1f0d] text-white focus:border-amber-500/50'
    : 'bg-white border-amber-200 focus:border-amber-400',
);

const ShopSettings = () => {
  const { isDark } = useTheme();
  const { t, isRTL, setLanguage } = useLanguage();
  const { settings, setSetting } = useSettings();
  const { user, userData, isSuperAdmin } = useAuth();

  const store = settings?.store || settings?.shop || {};
  const [activeTab, setActiveTab] = useState('business');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm({
      ...DEFAULT_FORM,
      name: store.name || '',
      tagline: store.tagline || '',
      address: store.address || '',
      phone: store.phone || '',
      whatsapp: store.whatsapp || '',
      email: store.email || '',
      website: store.website || '',
      ntn: store.ntn || '',
      logo: store.logo || store.logoUrl || '',
      currency: store.currency || 'PKR',
      timezone: store.timezone || 'Asia/Karachi',
      receiptFooter: store.receiptFooter || '',
      invoicePrefix: store.invoicePrefix || 'INV',
      defaultLanguage: store.defaultLanguage || 'en',
      taxLabel: store.taxLabel || 'Tax',
      showTaxOnReceipt: store.showTaxOnReceipt === true,
      businessHours: store.businessHours || '10:00 AM – 8:00 PM',
    });
    setDirty(false);
  }, [settings]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('shop.nameRequired', 'Shop name is required'));
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, logoUrl: form.logo || '' };
      await setSetting('store', payload);
      await setSetting('shop', payload);
      if (payload.defaultLanguage === 'en' || payload.defaultLanguage === 'ur') {
        setLanguage(payload.defaultLanguage);
      }

      await logActivity('SETTINGS_CHANGE', userData?.uid, userData?.primaryStore, {
        section: 'shop_settings',
        userName: userData?.name || user?.email,
        fields: Object.keys(payload),
      });

      if (isSuperAdmin) {
        await logSuperAdminActivity('shop:settings_saved', {
          userEmail: user?.email,
          shopName: payload.name,
          changedFields: Object.keys(payload),
        });
      }

      setDirty(false);
      toast.success(t('shop.saved', 'Shop settings saved — header me logo update'));
    } catch (e) {
      console.error('[ShopSettings]', e);
      toast.error(`${t('common.error', 'Error')}: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const previewMeta = useMemo(() => [
    form.phone && `PH: ${form.phone}`,
    form.whatsapp && `WA: ${form.whatsapp}`,
    form.ntn && `NTN: ${form.ntn}`,
  ].filter(Boolean).join(' · '), [form.phone, form.whatsapp, form.ntn]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6 pb-24">
      <PageHeader
        icon={Building2}
        title={t('shop.title', 'Shop Settings')}
        description={t('shop.subtitle', 'Logo, business info, receipts — Save par header update')}
        actions={
          dirty ? (
            <Badge variant="warning" className="text-[10px]">{t('shop.unsaved', 'Unsaved changes')}</Badge>
          ) : null
        }
      />

      <div className={cn(
        'flex gap-1 p-1 rounded-2xl border w-fit',
        isDark ? 'bg-[#0a0805] border-[#2a1f0d]' : 'bg-amber-50/80 border-amber-200',
      )}>
        {TABS.map(({ id, labelKey, icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
              activeTab === id
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-[#1a1208]'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white',
            )}
          >
            <TabIcon className="w-4 h-4" />
            {t(labelKey, labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'business' && (
        <div className="space-y-5">
          <SettingsCard
            title={t('shop.logoSection', 'Shop Logo')}
            subtitle={t('shop.logoSectionHint', 'Upload → Save — admin header & receipts par dikhega')}
            icon={Sparkles}
            isDark={isDark}
            accent="amber"
          >
            <ShopLogoUpload
              value={form.logo}
              onChange={(v) => update('logo', v)}
              isDark={isDark}
              t={t}
            />
          </SettingsCard>

          <SettingsCard
            title={t('shop.brandIdentity', 'Brand Identity')}
            subtitle={t('shop.brandHint', 'Shown on invoices & receipts')}
            icon={Building2}
            isDark={isDark}
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label={`${t('shop.shopName', 'Shop Name')} *`}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="A One Jewelry"
                leftIcon={<Building2 className="w-4 h-4" />}
              />
              <Input
                label={t('shop.tagline', 'Tagline')}
                value={form.tagline}
                onChange={(e) => update('tagline', e.target.value)}
                placeholder="22K Gold Specialist"
                leftIcon={<Type className="w-4 h-4" />}
              />
              <Input
                label={t('shop.invoicePrefix', 'Invoice Prefix')}
                value={form.invoicePrefix}
                onChange={(e) => update('invoicePrefix', e.target.value)}
                placeholder="INV"
                leftIcon={<FileText className="w-4 h-4" />}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t('shop.contactLocation', 'Contact & Location')}
            icon={MapPin}
            isDark={isDark}
            accent="blue"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label={t('shop.phone', 'Phone')} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0316-2502498" leftIcon={<Phone className="w-4 h-4" />} />
              <Input label={t('shop.whatsapp', 'WhatsApp')} value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} placeholder="03162502498" leftIcon={<MessageCircle className="w-4 h-4" />} />
              <Input label={t('shop.email', 'Email')} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="shop@example.com" leftIcon={<Mail className="w-4 h-4" />} />
              <Input label={t('shop.website', 'Website')} value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://aonejewelry.com" leftIcon={<Link2 className="w-4 h-4" />} />
              <Input label={t('shop.ntn', 'NTN Number')} value={form.ntn} onChange={(e) => update('ntn', e.target.value)} placeholder="1234567-8" leftIcon={<Hash className="w-4 h-4" />} />
              <Input label={t('shop.businessHours', 'Business Hours')} value={form.businessHours} onChange={(e) => update('businessHours', e.target.value)} placeholder="10 AM – 8 PM" leftIcon={<Clock className="w-4 h-4" />} />
            </div>
            <div className="mt-4 space-y-1.5">
              <label className={cn('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <MapPin className="w-4 h-4" /> {t('shop.address', 'Address')}
              </label>
              <textarea
                rows={3}
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Full business address…"
                className={fieldClass(isDark)}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t('shop.regionalReceipt', 'Regional & Receipt')}
            icon={Receipt}
            isDark={isDark}
            accent="purple"
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input label={t('shop.currency', 'Currency')} value={form.currency} onChange={(e) => update('currency', e.target.value)} placeholder="PKR" leftIcon={<Globe className="w-4 h-4" />} />
              <Input label={t('shop.timezone', 'Time Zone')} value={form.timezone} onChange={(e) => update('timezone', e.target.value)} placeholder="Asia/Karachi" leftIcon={<Globe className="w-4 h-4" />} />
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1.5 flex items-center gap-2">
                  <Languages className="w-4 h-4" /> {t('shop.defaultLanguage', 'Default Language')}
                </label>
                <select
                  value={form.defaultLanguage}
                  onChange={(e) => update('defaultLanguage', e.target.value)}
                  className={fieldClass(isDark)}
                >
                  <option value="en">{t('language.english', 'English')}</option>
                  <option value="ur">{t('language.urdu', 'Urdu')}</option>
                </select>
              </div>
              <Input label={t('shop.taxLabel', 'Tax Label')} value={form.taxLabel} onChange={(e) => update('taxLabel', e.target.value)} placeholder="Tax" leftIcon={<Percent className="w-4 h-4" />} />
              <label className="flex items-center gap-2 text-sm cursor-pointer pt-6">
                <input type="checkbox" checked={form.showTaxOnReceipt} onChange={(e) => update('showTaxOnReceipt', e.target.checked)} className="rounded border-amber-300" />
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{t('shop.showTaxOnReceipt', 'Show tax line on receipt')}</span>
              </label>
            </div>
            <div className="mt-4 space-y-1.5">
              <label className={cn('text-sm font-medium flex items-center gap-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <Receipt className="w-4 h-4" /> {t('shop.receiptFooter', 'Receipt Footer')}
              </label>
              <textarea
                rows={2}
                value={form.receiptFooter}
                onChange={(e) => update('receiptFooter', e.target.value)}
                placeholder="Thank you for shopping with us!"
                className={fieldClass(isDark)}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t('shop.invoicePreview', 'Live Preview')}
            subtitle={t('shop.previewHint', 'Receipt / invoice header jaisa dikhega')}
            icon={FileText}
            isDark={isDark}
            accent="emerald"
          >
            <div className={cn(
              'rounded-xl p-6 text-center border',
              isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/80 border-amber-200',
            )}>
              {form.logo && (
                <img src={form.logo} alt="" className="h-12 max-w-[180px] mx-auto mb-3 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              <p className={cn('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>{form.name || 'Shop Name'}</p>
              {form.tagline && <p className="text-xs text-gray-500 mt-0.5">{form.tagline}</p>}
              {form.address && <p className="text-[10px] text-gray-500 mt-2 max-w-md mx-auto">{form.address}</p>}
              {previewMeta && <p className="text-[10px] text-gray-500 mt-1">{previewMeta}</p>}
              {form.businessHours && <p className="text-[10px] text-amber-600/80 mt-1">{form.businessHours}</p>}
              <div className="mt-3 pt-3 border-t border-dashed border-gray-600/30 text-[10px] text-gray-500">
                {form.receiptFooter || 'Receipt footer text…'}
              </div>
            </div>
          </SettingsCard>
        </div>
      )}

      {activeTab === 'data' && (
        <div className="space-y-4">
          <div className={cn(
            'flex flex-wrap items-center gap-2 p-4 rounded-2xl border',
            isDark ? 'bg-sky-500/5 border-sky-500/20' : 'bg-sky-50 border-sky-200',
          )}>
            <Settings2 className="w-5 h-5 text-sky-500" />
            <p className="text-xs text-gray-500 flex-1">
              {t('shop.dataHint', 'Backup specific data as JSON or Excel. Super Admin can remove old cloud records.')}
            </p>
            {isSuperAdmin && <Badge variant="success">{t('shop.superAdminLogs', 'Super Admin logs saved separately')}</Badge>}
          </div>
          <DataManagerPanel />
        </div>
      )}

      {activeTab === 'business' && (
        <div className={cn(
          'fixed bottom-0 left-0 right-0 lg:left-72 z-40 border-t px-4 sm:px-6 py-3 flex items-center justify-between gap-3 backdrop-blur-xl',
          isDark ? 'bg-[#0f0a05]/95 border-[#2a1f0d]' : 'bg-white/95 border-amber-200',
        )}>
          <p className={cn('text-xs truncate', isDark ? 'text-gray-500' : 'text-gray-500')}>
            {dirty
              ? t('shop.saveReminder', 'Save dabao — logo header me update hoga')
              : t('shop.allSaved', 'Sab saved — cloud sync')}
          </p>
          <Button
            variant="primary"
            leftIcon={saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={saving}
            className="px-6 shrink-0"
          >
            {saving ? t('shop.saving', 'Saving…') : t('shop.saveCloud', 'Save to Cloud')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ShopSettings;
