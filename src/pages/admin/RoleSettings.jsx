import { useMemo, useState } from 'react';

import { useNavigate, useParams } from 'react-router-dom';

import {

  Settings, Save, Type, Layout, Table2, Monitor,

  Percent, Merge, Eye, Stamp, Hash, Wallet, WifiOff, Zap, CreditCard, DollarSign, User, Phone, Package,

} from 'lucide-react';

import { BILLER_STALL_DEFAULTS } from '../../services/billerStallService';

import { BillerStallSettingsCard, BillerStallAlertsFeed } from '../../components/admin/BillerStallPanel';

import { toast } from 'react-hot-toast';

import PageHeader from '../../components/admin/PageHeader';

import Button from '../../components/ui/Button';

import { useTheme } from '../../context/ThemeContext';

import { useLanguage } from '../../hooks/useLanguage';

import { useSettings } from '../../context/SettingsContext';

import { patchSetting } from '../../services/settingsStore';

import { cn } from '../../utils/cn';

import {

  SettingsCard, ToggleRow, FontSlider, FilterTabs,

} from '../../components/admin/SettingsUi';

import { ROLE_SETTINGS_HINTS as H } from '../../utils/roleSettingsHints';



export const FONT_DEFAULTS = {

  billerFontSize: 18,

  billerEntryFontSize: 24,

  billerTableFontSize: 19,

  totalFontSize: 32,

  invoiceFontSize: 15,

  cashierFontSize: 20,

  cashierRowHeight: 46,

  managerFontSize: 16,

  managerTableFontSize: 15,

};



const OfflinePaymentToggles = ({ billFlow, cashierUI, isDark, t, updateBillFlow, updateCashierUI, showBiller = true, showCashier = true }) => (

  <>

    {showCashier && (

      <ToggleRow

        icon={WifiOff}

        badge

        label={t('admin.roleSettings.enableOfflinePayment', 'Offline Payment (Cashier)')}

        hint={H.offlineCashier}

        checked={cashierUI.enableOfflinePayment !== false && cashierUI.enableManualBill !== false}

        onChange={(v) => updateCashierUI({ enableOfflinePayment: v, enableManualBill: v })}

        isDark={isDark}

      />

    )}

    {showBiller && (

      <>

        <ToggleRow

          icon={CreditCard}

          badge

          label={t('admin.roleSettings.billerOfflinePayment', 'Offline Payment (Biller)')}

          hint={H.offlineBiller}

          checked={billFlow.enableOfflinePayment !== false}

          onChange={(v) => updateBillFlow({ enableOfflinePayment: v })}

          isDark={isDark}

        />

        <ToggleRow

          icon={Zap}

          badge

          label={t('admin.roleSettings.offlineAutoCollect', 'Auto Amount (No Typing)')}

          hint={H.offlineAutoCollect}

          checked={billFlow.offlineAutoCollect !== false}

          onChange={(v) => updateBillFlow({ offlineAutoCollect: v })}

          isDark={isDark}

          disabled={billFlow.enableOfflinePayment === false}

        />

      </>

    )}

  </>

);

const DiscountSettingsBlock = ({ discounts, isDark, t, updateDiscount }) => {
  const d = discounts || {};
  return (
  <>
    <SettingsCard title={t('admin.discountPage.modes', 'Discount Modes')} subtitle={t('admin.discountPage.limitsHint', '0 = no limit · item cap = price × %')} icon={Percent} isDark={isDark} accent="emerald">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className={cn('block rounded-xl border p-3 space-y-1', isDark ? 'border-[#2a1f0d] bg-[#070503]' : 'border-amber-100 bg-amber-50/40')}>
          <span className="text-xs font-semibold text-gray-400">{t('admin.discountPage.maxItemPercent', 'Max Item Discount %')}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={d.maxItemDiscountPercent ?? d.maxPercent ?? d.maxDiscountPercent ?? 0}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              updateDiscount({ maxItemDiscountPercent: v, maxPercent: v, maxDiscountPercent: v });
            }}
            className={cn('w-full rounded-lg border px-2 py-1.5 text-sm font-bold', isDark ? 'bg-[#0f0d09] border-amber-500/30 text-amber-400' : 'bg-white border-amber-200')}
          />
        </label>
        <label className={cn('block rounded-xl border p-3 space-y-1', isDark ? 'border-[#2a1f0d] bg-[#070503]' : 'border-amber-100 bg-amber-50/40')}>
          <span className="text-xs font-semibold text-gray-400">{t('admin.discountPage.maxBillPercent', 'Max Bill Discount %')}</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={d.maxBillDiscountPercent ?? d.maxPercent ?? d.maxDiscountPercent ?? 0}
            onChange={(e) => updateDiscount({ maxBillDiscountPercent: parseFloat(e.target.value) || 0 })}
            className={cn('w-full rounded-lg border px-2 py-1.5 text-sm font-bold', isDark ? 'bg-[#0f0d09] border-amber-500/30 text-amber-400' : 'bg-white border-amber-200')}
          />
        </label>
        <FontSlider label={t('admin.discountPage.maxDiscount', 'Max Bill PKR')} value={Number(d.maxAmount ?? d.maxDiscountPKR ?? 0)} min={0} max={50000} onChange={(v) => updateDiscount({ maxAmount: v, maxDiscountPKR: v })} isDark={isDark} preview={`Rs ${Number(d.maxAmount || 0).toLocaleString()}`} />
      </div>
      <div className="space-y-2">
        <ToggleRow badge icon={DollarSign} label={t('admin.discountPage.itemPKR', 'Item — PKR')} hint={H.discountItemPKR} checked={d.allowItemDiscountPKR !== false} onChange={(v) => updateDiscount({ allowItemDiscountPKR: v })} isDark={isDark} />
        <ToggleRow badge icon={Percent} label={t('admin.discountPage.itemPercent', 'Item — %')} hint={H.discountItemPercent} checked={d.allowItemDiscountPercent !== false} onChange={(v) => updateDiscount({ allowItemDiscountPercent: v })} isDark={isDark} />
        <ToggleRow badge icon={DollarSign} label={t('admin.discountPage.billPKR', 'Bill — PKR (main screen)')} hint={H.discountBillPKR} checked={d.allowBillDiscountPKR !== false} onChange={(v) => updateDiscount({ allowBillDiscountPKR: v, allowBillDiscount: v || d.allowBillDiscountPercent !== false })} isDark={isDark} />
        <ToggleRow badge icon={Percent} label={t('admin.discountPage.billPercent', 'Bill — % (main screen)')} hint={H.discountBillPercent} checked={d.allowBillDiscountPercent !== false} onChange={(v) => updateDiscount({ allowBillDiscountPercent: v, allowBillDiscount: v || d.allowBillDiscountPKR !== false })} isDark={isDark} />
      </div>
    </SettingsCard>
  </>
  );
};

const BillerSettingsPanel = ({ fonts, billerUI, mergeItems, invoice, billFlow, cashierUI, discounts, customer, billerStall, productCatalog, productNameEnabled, isDark, t, updateFonts, updateBillerUI, updateMerge, updateInvoice, updateBillFlow, updateCashierUI, updateDiscount, updateCustomer, updateBillerStall, updateProductCatalog, navigate }) => (

  <div className="space-y-5">

    <SettingsCard title={t('admin.roleSettings.fonts', 'Font Sizes')} subtitle={t('admin.roleSettings.liveUpdate', 'live update')} icon={Type} isDark={isDark}>

      <div className="grid sm:grid-cols-2 gap-3">

        <FontSlider label={t('admin.roleSettings.billerBase', 'Base UI')} hint={H.billerBaseFont} value={fonts.billerFontSize} min={12} max={26} onChange={(v) => updateFonts({ billerFontSize: v })} isDark={isDark} />

        <FontSlider label={t('admin.roleSettings.billerEntry', 'Entry Form')} hint={H.billerEntryFont} value={fonts.billerEntryFontSize} min={14} max={36} onChange={(v) => updateFonts({ billerEntryFontSize: v })} isDark={isDark} preview="Rs 12,500 × 3" />

        <FontSlider label={t('admin.roleSettings.billerTable', 'Items Table')} hint={H.billerTableFont} value={fonts.billerTableFontSize} min={12} max={30} onChange={(v) => updateFonts({ billerTableFontSize: v })} isDark={isDark} preview="#1 Rs 5,000 ×2" />

        <FontSlider label={t('admin.roleSettings.totalFont', 'Grand Total')} hint={H.totalFont} value={fonts.totalFontSize} min={18} max={52} onChange={(v) => updateFonts({ totalFontSize: v })} isDark={isDark} preview="Rs 24,800" />

        <FontSlider label={t('admin.roleSettings.invoiceFont', 'Invoice / Print')} hint={H.invoiceFont} value={fonts.invoiceFontSize} min={10} max={22} onChange={(v) => updateFonts({ invoiceFontSize: v })} isDark={isDark} />

      </div>

    </SettingsCard>



    <SettingsCard title={t('admin.roleSettings.billerUI', 'Biller Options')} icon={Layout} isDark={isDark} accent="amber">

      <div className="space-y-2">

        <ToggleRow icon={Percent} badge label={t('admin.roleSettings.showDiscount', 'Discount Field')} hint={H.showDiscountField} checked={billerUI.showDiscountField !== false} onChange={(v) => updateBillerUI({ showDiscountField: v })} isDark={isDark} />

        <ToggleRow icon={Merge} badge label={t('admin.roleSettings.mergeItems', 'Merge Same Price')} hint={H.mergeItems} checked={mergeItems !== false} onChange={updateMerge} isDark={isDark} />

        <ToggleRow icon={Eye} badge label={t('admin.roleSettings.showProductName', 'Product Name')} hint={H.showProductName} checked={billerUI.showProductName === true} onChange={(v) => updateBillerUI({ showProductName: v })} isDark={isDark} />

        <ToggleRow icon={Hash} badge label={t('admin.roleSettings.qtyEditable', 'Qty Editable')} hint={H.qtyEditable} checked={billerUI.qtyEditable !== false} onChange={(v) => updateBillerUI({ qtyEditable: v })} isDark={isDark} />

        <ToggleRow icon={Stamp} badge label={t('admin.roleSettings.reprintWatermark', 'Reprint Watermark')} hint={H.reprintWatermark} checked={invoice.reprintWatermark !== false} onChange={(v) => updateInvoice({ reprintWatermark: v })} isDark={isDark} />

      </div>

    </SettingsCard>

    <SettingsCard
      title={t('admin.roleSettings.productCatalog', 'Product Catalog')}
      subtitle={t('admin.roleSettings.productCatalogMovedHint', 'Large product data is now managed on a separate catalog page for faster biller search.')}
      icon={Package}
      isDark={isDark}
      accent="purple"
    >
      <div className="space-y-4">
        <div className={cn('rounded-2xl border px-4 py-4', isDark ? 'border-[#2a1f0d] bg-[#090703]' : 'border-amber-100 bg-amber-50')}>
          <p className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
            {productCatalog.length.toLocaleString()} {t('admin.roleSettings.productsInCatalog', 'products in shared biller catalog')}
          </p>
          <p className={cn('mt-2 text-sm text-gray-400')}>
            {productNameEnabled
              ? t('admin.roleSettings.productNameEnabled', 'Product Name suggestions are ON for biller entry.')
              : t('admin.roleSettings.productNameDisabled', 'Enable Product Name to show catalog suggestions in billing entry.')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => navigate('/admin/settings/product-catalog')}>
            {t('admin.roleSettings.openProductCatalog', 'Open Product Catalog')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/admin/settings/biller')}>
            {t('admin.roleSettings.returnToBillerSettings', 'Back to Biller Settings')}
          </Button>
        </div>
      </div>
    </SettingsCard>



    <DiscountSettingsBlock discounts={discounts} isDark={isDark} t={t} updateDiscount={updateDiscount} />

    <SettingsCard title={t('admin.roleSettings.customerF8', 'F8 Customer Dialog')} subtitle={t('admin.roleSettings.customerF8Hint', 'Name & phone required on checkout')} icon={User} isDark={isDark} accent="blue">
      <div className="space-y-2">
        <ToggleRow
          badge
          icon={User}
          label={t('admin.roleSettings.requireCustomerName', 'Customer name required')}
          hint={H.requireCustomerName}
          checked={customer.requireName === true}
          onChange={(v) => updateCustomer({ requireName: v })}
          isDark={isDark}
        />
        <ToggleRow
          badge
          icon={Phone}
          label={t('admin.roleSettings.requireCustomerPhone', 'Customer phone required')}
          hint={H.requireCustomerPhone}
          checked={customer.requirePhone === true}
          onChange={(v) => updateCustomer({ requirePhone: v })}
          isDark={isDark}
        />
      </div>
    </SettingsCard>

    <SettingsCard title={t('admin.roleSettings.offlinePaymentSection', 'Offline Payment')} subtitle={t('admin.roleSettings.offlinePaymentSectionHint', 'Biller & Cashier when internet is down')} icon={WifiOff} isDark={isDark} accent="blue">

      <OfflinePaymentToggles billFlow={billFlow} cashierUI={cashierUI} isDark={isDark} t={t} updateBillFlow={updateBillFlow} updateCashierUI={updateCashierUI} showBiller showCashier={false} />

    </SettingsCard>

    <BillerStallSettingsCard billerStall={billerStall} isDark={isDark} t={t} updateBillerStall={updateBillerStall} />

    <BillerStallAlertsFeed isDark={isDark} t={t} />

  </div>

);



const CashierSettingsPanel = ({ fonts, cashierUI, billFlow, isDark, t, updateFonts, updateCashierUI, updateBillFlow }) => (

  <div className="space-y-5">

    <SettingsCard title={t('admin.roleSettings.cashierDisplay', 'Display & Spacing')} icon={Type} isDark={isDark} accent="emerald">

      <div className="grid sm:grid-cols-2 gap-3">

        <FontSlider label={t('admin.roleSettings.cashierFont', 'List Font Size')} hint={H.cashierFont} value={fonts.cashierFontSize} min={14} max={28} onChange={(v) => updateFonts({ cashierFontSize: v })} isDark={isDark} preview="#000047 · Rs 2,600" />

        <FontSlider label={t('admin.roleSettings.cashierRowHeight', 'Row Height (Gap)')} hint={H.cashierRowHeight} value={fonts.cashierRowHeight} min={38} max={72} onChange={(v) => updateFonts({ cashierRowHeight: v })} isDark={isDark} preview={`${fonts.cashierRowHeight}px`} />

      </div>

      <div className={cn('rounded-xl border p-3 mt-2', isDark ? 'border-[#2a1f0d] bg-black/20' : 'border-amber-100 bg-white')}>

        <p className="text-[10px] uppercase text-gray-500 mb-2">{t('admin.roleSettings.preview', 'Preview')}</p>

        <p style={{ fontSize: `${fonts.cashierFontSize}px` }} className={cn('font-black', isDark ? 'text-amber-400' : 'text-amber-700')}>#AON-BIL-060626-000047</p>

        <p style={{ fontSize: `${Math.max(12, fonts.cashierFontSize - 3)}px` }} className="text-gray-500">Walk-in · Rs 2,600 · 4 items</p>

      </div>

    </SettingsCard>



    <SettingsCard title={t('admin.roleSettings.offlinePaymentSection', 'Offline Payment')} subtitle={t('admin.roleSettings.cashierOfflineHint', 'PAY OFFLINE button & payment modal')} icon={WifiOff} isDark={isDark} accent="blue">

      <OfflinePaymentToggles billFlow={billFlow} cashierUI={cashierUI} isDark={isDark} t={t} updateBillFlow={updateBillFlow} updateCashierUI={updateCashierUI} showBiller={false} showCashier />

    </SettingsCard>

  </div>

);



const ManagerSection = ({ fonts, isDark, t, updateFonts }) => (

  <SettingsCard title={t('admin.roleSettings.managerSection', 'Manager')} subtitle={t('admin.roleSettings.managerSectionHint', 'Reports, bills table aur dashboard font')} icon={Monitor} isDark={isDark} accent="purple">

    <div className="grid sm:grid-cols-2 gap-3">

      <FontSlider label={t('admin.roleSettings.managerFont', 'UI Font')} hint={H.managerFont} value={fonts.managerFontSize} min={11} max={22} onChange={(v) => updateFonts({ managerFontSize: v })} isDark={isDark} preview="Dashboard · Menu" />

      <FontSlider label={t('admin.roleSettings.managerTable', 'Tables & Reports')} hint={H.managerTable} value={fonts.managerTableFontSize} min={10} max={20} onChange={(v) => updateFonts({ managerTableFontSize: v })} isDark={isDark} preview="Bills · Reports" />

    </div>

  </SettingsCard>

);



const PermissionsNoteCard = ({ isDark }) => (

  <div className={cn('rounded-xl border px-4 py-3', isDark ? 'border-purple-500/20 bg-purple-500/5' : 'border-purple-200 bg-purple-50')}>

    <p className={cn('text-sm font-bold', isDark ? 'text-purple-300' : 'text-purple-900')}>Reports & Role Permissions</p>

    <p className={cn('text-[11px] mt-1 leading-relaxed', isDark ? 'text-purple-200/80' : 'text-purple-800/90')}>

      Reports, commission, expenses waghera ke liye Admin → Permissions page use karein. Wahan har role (biller/cashier/manager) ki access ON/OFF hoti hai — yahan font aur UI settings hain.

    </p>

  </div>

);



const SuperAdminSettingsPanel = (props) => {

  const { isDark, t } = props;

  const [filter, setFilter] = useState('all');

  const tabs = [

    { id: 'all', label: t('admin.roleSettings.filterAll', 'All') },

    { id: 'biller', label: t('admin.roleSettings.billerSection', 'Biller') },

    { id: 'cashier', label: t('admin.roleSettings.cashierSection', 'Cashier') },

    { id: 'manager', label: t('admin.roleSettings.managerSection', 'Manager') },

  ];

  const show = (id) => filter === 'all' || filter === id;

  return (

    <div className="space-y-5">

      <FilterTabs tabs={tabs} active={filter} onChange={setFilter} isDark={isDark} />

      {show('biller') && <BillerSettingsPanel {...props} />}

      {show('cashier') && <CashierSettingsPanel {...props} />}

      {show('manager') && <ManagerSection fonts={props.fonts} isDark={isDark} t={t} updateFonts={props.updateFonts} />}

      {filter === 'all' && <PermissionsNoteCard isDark={isDark} />}

    </div>

  );

};



const ManagerSettingsPanel = (props) => {

  const { isDark, t } = props;

  const tabs = [{ id: 'manager', label: t('admin.roleSettings.managerSection', 'Manager') }];

  return (

    <div className="space-y-5">

      <FilterTabs tabs={tabs} active="manager" onChange={() => {}} isDark={isDark} />

      <ManagerSection fonts={props.fonts} isDark={isDark} t={t} updateFonts={props.updateFonts} />

      <PermissionsNoteCard isDark={isDark} />

    </div>

  );

};



const RoleSettings = () => {

  const { role } = useParams();

  const { isDark } = useTheme();

  const { t, isRTL } = useLanguage();

  const { settings } = useSettings();



  const roleKey = role === 'superAdmin' ? 'superAdmin' : (role || '');

  const roleLabel = role ? t(`admin.roleNames.${roleKey}`, t(`roles.${roleKey}`, role)) : t('admin.roleSettingsPage.role', 'Role');
  const navigate = useNavigate();



  const fonts = useMemo(() => ({ ...FONT_DEFAULTS, ...(settings?.fonts || {}) }), [settings?.fonts]);

  const billerUI = settings?.billerUI || {};

  const billFlow = settings?.billFlow || {};

  const cashierUI = settings?.cashierUI || {};

  const mergeItems = settings?.mergeItems;

  const invoice = settings?.invoice || {};
  const customer = settings?.customer || {};
  const billerStall = { ...BILLER_STALL_DEFAULTS, ...(settings?.billerStall || {}) };
  const discounts = { ...(settings?.discount || {}), ...(settings?.discounts || {}) };
  const productCatalog = Array.isArray(settings?.productCatalog) ? settings.productCatalog : [];
  const productNameEnabled = (settings?.billerUI?.showProductName ?? true) === true;

  const updateDiscount = async (patch) => {
    const next = { ...discounts, ...patch };
    try {
      await patchSetting('discounts', next);
      await patchSetting('discount', next);
    } catch (e) { toast.error(e?.message || 'Save failed'); }
  };

  const updateFonts = async (patch) => {

    try { await patchSetting('fonts', (cur) => ({ ...FONT_DEFAULTS, ...(cur || {}), ...patch })); }

    catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateBillerUI = async (patch) => {

    try {
      await patchSetting('billerUI', (cur) => ({ ...(cur || {}), ...patch }));
      const key = Object.keys(patch)[0];
      toast.success(`${key} ${patch[key] ? 'ON' : 'OFF'} — live sync`, { duration: 1800 });
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateMerge = async (enabled) => {

    try {

      await patchSetting('mergeItems', enabled);

      toast.success(enabled ? t('admin.roleSettings.mergeOn', 'Merge ON') : t('admin.roleSettings.mergeOff', 'Merge OFF'), { duration: 2000 });

    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateInvoice = async (patch) => {

    try {
      await patchSetting('invoice', (cur) => ({ ...(cur || {}), ...patch }));
      if ('reprintWatermark' in patch) {
        toast.success(patch.reprintWatermark ? 'Reprint watermark ON' : 'Reprint watermark OFF', { duration: 1800 });
      }
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateBillFlow = async (patch) => {

    try {
      await patchSetting('billFlow', (cur) => ({ ...(cur || {}), ...patch }));
      const key = Object.keys(patch)[0];
      toast.success(`Biller ${key} ${patch[key] !== false ? 'ON' : 'OFF'}`, { duration: 1800 });
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateCashierUI = async (patch) => {

    try {
      await patchSetting('cashierUI', (cur) => ({ ...(cur || {}), ...patch }));
      toast.success(`Cashier offline ${patch.enableOfflinePayment !== false ? 'ON' : 'OFF'}`, { duration: 1800 });
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateCustomer = async (patch) => {

    try {
      await patchSetting('customer', (cur) => ({ ...(cur || {}), ...patch }));
      const key = Object.keys(patch)[0];
      toast.success(`Customer ${key} ${patch[key] ? 'ON' : 'OFF'}`, { duration: 1800 });
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateBillerStall = async (patch) => {

    try {
      await patchSetting('billerStall', (cur) => ({ ...BILLER_STALL_DEFAULTS, ...(cur || {}), ...patch }));
      toast.success(t('admin.roleSettings.billerStallSaved', 'Stall alert settings saved — live sync'), { duration: 1800 });
    } catch (e) { toast.error(e?.message || 'Save failed'); }

  };

  const updateProductCatalog = async (updater) => {
    try {
      await patchSetting('productCatalog', (cur) => {
        const arr = Array.isArray(cur) ? cur : [];
        return typeof updater === 'function' ? updater(arr) : updater;
      });
    } catch (e) { toast.error(e?.message || 'Save failed'); }
  };



  const panelProps = { fonts, billerUI, mergeItems, invoice, billFlow, cashierUI, discounts, customer, billerStall, productCatalog, productNameEnabled, isDark, t, updateFonts, updateBillerUI, updateMerge, updateInvoice, updateBillFlow, updateCashierUI, updateDiscount, updateCustomer, updateBillerStall, updateProductCatalog, navigate };



  const renderPanel = () => {

    switch (roleKey) {

      case 'biller': return <BillerSettingsPanel {...panelProps} />;

      case 'superAdmin': return <SuperAdminSettingsPanel {...panelProps} />;

      case 'cashier': return <CashierSettingsPanel {...panelProps} />;

      case 'manager': return <ManagerSettingsPanel {...panelProps} />;

      default:

        return (

          <div className={cn('rounded-xl border p-8 text-center', isDark ? 'border-[#2a1f0d]' : 'border-amber-200')}>

            <Monitor className="w-10 h-10 text-gray-500 mx-auto mb-3" />

            <p className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>

              {t('admin.roleSettingsPage.placeholder', 'Settings for {{role}}', { role: roleLabel })}

            </p>

          </div>

        );

    }

  };



  const hasRolePanel = ['biller', 'cashier', 'manager', 'superAdmin'].includes(roleKey);



  return (

    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      <PageHeader

        icon={Settings}

        title={t('admin.roleSettingsPage.title', `${roleLabel} Settings`, { role: roleLabel })}

        description={t('admin.roleSettings.subtitle', 'Toggle ON/OFF · font size · offline payment — live on all PCs')}

        actions={hasRolePanel ? (

          <Button leftIcon={<Save className="w-4 h-4" />} onClick={() => toast.success(t('admin.roleSettings.saved', 'Saved — live sync'))}>

            {t('admin.roleSettingsPage.saveSettings', 'Save Settings')}

          </Button>

        ) : null}

      />



      {hasRolePanel && (

        <div className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs', isDark ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}>

          <Table2 className="w-4 h-4 shrink-0" />

          {t('admin.roleSettings.autoSync', H.liveSync)}

        </div>

      )}



      {renderPanel()}

    </div>

  );

};



export default RoleSettings;


