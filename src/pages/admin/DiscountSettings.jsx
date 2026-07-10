import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Percent, Zap, Calculator } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import PageHeader from '../../components/admin/PageHeader';
import { SettingsCard, ToggleRow } from '../../components/admin/SettingsUi';
import { patchSetting } from '../../services/settingsStore';

const PRESETS = [1, 2, 3, 5, 10];

const maxRsFromPct = (price, pct) => {
  const p = Number(pct) || 0;
  if (p <= 0) return null;
  return Math.round((price * p) / 100 * 100) / 100;
};

const DiscountSettings = () => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { settings } = useSettings();
  const d = useMemo(
    () => ({ ...(settings.discount || {}), ...(settings.discounts || {}) }),
    [settings.discount, settings.discounts],
  );

  const itemPct = useMemo(() => {
    const v = d.maxItemDiscountPercent ?? d.maxPercent ?? d.maxDiscountPercent ?? 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, [d]);

  const [draft, setDraft] = useState(() => String(itemPct));
  const debounceRef = useRef(null);

  useEffect(() => {
    setDraft(String(itemPct));
  }, [itemPct]);

  const pushLive = useCallback(async (patch, quiet = false) => {
    const next = {
      ...d,
      ...patch,
      allowItemDiscountPercent: false,
      allowItemDiscountPKR: patch.allowItemDiscountPKR ?? (d.allowItemDiscountPKR !== false),
    };
    try {
      await patchSetting('discounts', next);
      await patchSetting('discount', next);
      if (!quiet) {
        toast.success(t('admin.discountPage.liveOk', 'Live — biller updated'), {
          id: 'disc-live',
          duration: 1600,
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    }
  }, [d, t]);

  const commitPct = useCallback((raw) => {
    const v = Math.min(100, Math.max(0, parseFloat(String(raw).replace(',', '.')) || 0));
    const rounded = Math.round(v * 100) / 100;
    setDraft(String(rounded));
    pushLive({
      maxItemDiscountPercent: rounded,
      maxPercent: rounded,
      maxDiscountPercent: rounded,
    });
  }, [pushLive]);

  const onPctChange = (val) => {
    setDraft(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val === '' || val === '.') return;
      commitPct(val);
    }, 450);
  };

  const onPctBlur = () => {
    clearTimeout(debounceRef.current);
    commitPct(draft === '' ? '0' : draft);
  };

  const examples = useMemo(() => [100, 1000, 100000].map((price) => ({
    price,
    maxRs: maxRsFromPct(price, itemPct),
  })), [itemPct]);

  const discountOn = d.allowItemDiscountPKR !== false;

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <PageHeader
        icon={Percent}
        title={t('admin.discountPage.title', 'Discount')}
        description={t('admin.discountPage.subtitleShort', 'Biller Rs mein discount — % se limit')}
      />

      <div className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold',
        isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
      )}>
        <Zap className="w-3.5 h-3.5 shrink-0" />
        {t('admin.discountPage.liveHint', 'Change = instant on all biller screens')}
      </div>

      <SettingsCard
        title={t('admin.discountPage.itemLimit', 'Item Discount Limit')}
        subtitle={t('admin.discountPage.itemLimitHint', '0 = no limit · decimals OK e.g. 3.5')}
        icon={Percent}
        isDark={isDark}
        accent="amber"
      >
        <div className="space-y-4">
          <div>
            <label className={cn('block text-xs font-bold mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
              {t('admin.discountPage.maxItemPercent', 'Max Item Discount (%)')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={draft}
                onChange={(e) => onPctChange(e.target.value)}
                onBlur={onPctBlur}
                className={cn(
                  'flex-1 rounded-xl border px-4 py-3 text-2xl font-black tabular-nums outline-none focus:ring-2 focus:ring-amber-500/40',
                  isDark ? 'bg-[#070503] border-amber-500/30 text-amber-400' : 'bg-white border-amber-200 text-amber-700',
                )}
              />
              <span className={cn('text-lg font-bold', isDark ? 'text-gray-400' : 'text-gray-500')}>%</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => commitPct(p)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  itemPct === p
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25'
                    : isDark ? 'border-[#2a1f0d] text-gray-400 hover:border-amber-500/40' : 'border-amber-100 text-gray-600 hover:bg-amber-50',
                )}
              >
                {p}%
              </button>
            ))}
          </div>

          <p className={cn('text-[11px] leading-relaxed', isDark ? 'text-gray-500' : 'text-gray-600')}>
            {t('admin.discountPage.ruleLine', 'Rule: Max Rs = Price × % ÷ 100. Biller hamesha Rs enter kare.')}
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('admin.discountPage.preview', 'Live Examples')}
        subtitle={itemPct > 0 ? `${itemPct}% limit` : t('admin.discountPage.noLimit', 'No limit')}
        icon={Calculator}
        isDark={isDark}
        accent="emerald"
      >
        <div className="space-y-2">
          {examples.map(({ price, maxRs }) => (
            <div
              key={price}
              className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm',
                isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-100',
              )}
            >
              <span className={cn('font-mono font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Rs {price.toLocaleString()}
              </span>
              <span className={cn('font-bold tabular-nums', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                {maxRs == null ? '—' : `max Rs ${maxRs.toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
      </SettingsCard>

      <ToggleRow
        badge
        icon={Percent}
        label={t('admin.discountPage.billerDiscountOn', 'Biller Discount Field')}
        hint={t('admin.discountPage.billerDiscountHint', 'OFF = biller discount band')}
        checked={discountOn}
        onChange={(v) => pushLive({ allowItemDiscountPKR: v })}
        isDark={isDark}
      />
    </div>
  );
};

export default DiscountSettings;
