import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { Receipt, Tag, DollarSign, Percent, Zap, Calculator } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import PageHeader from '../../components/admin/PageHeader';
import { SettingsCard, ToggleRow, FontSlider } from '../../components/admin/SettingsUi';
import { patchSetting } from '../../services/settingsStore';
import { cn } from '../../utils/cn';

const PRESETS = [1, 2, 3, 5, 10, 15, 20];

const BillerSummaryDiscountSettings = () => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { settings } = useSettings();

  const d = useMemo(
    () => ({ ...(settings.discount || {}), ...(settings.discounts || {}) }),
    [settings.discount, settings.discounts],
  );

  const summaryPct = useMemo(() => {
    const v = d.maxBillSummaryDiscountPercent ?? d.maxSummaryDiscountPercent ?? d.maxBillDiscountPercent ?? 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, [d]);

  const summaryPkr = useMemo(() => Number(
    d.maxBillSummaryDiscountPKR ?? d.maxSummaryDiscountPKR ?? d.maxAmount ?? d.maxDiscountPKR ?? 0,
  ), [d]);

  const [pctDraft, setPctDraft] = useState(() => String(summaryPct));
  const debounceRef = useRef(null);

  useEffect(() => {
    setPctDraft(String(summaryPct));
  }, [summaryPct]);

  const pushLive = useCallback(async (patch, quiet = false) => {
    const next = { ...d, ...patch };
    try {
      await patchSetting('discounts', next);
      await patchSetting('discount', next);
      if (!quiet) {
        toast.success(t('admin.discountPage.liveOk', 'Live — biller updated'), {
          id: 'summary-disc-live',
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
    setPctDraft(String(rounded));
    pushLive({
      maxBillSummaryDiscountPercent: rounded,
      maxSummaryDiscountPercent: rounded,
    });
  }, [pushLive]);

  const onPctChange = (val) => {
    setPctDraft(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val === '' || val === '.') return;
      commitPct(val);
    }, 450);
  };

  const onPctBlur = () => {
    clearTimeout(debounceRef.current);
    commitPct(pctDraft === '' ? '0' : pctDraft);
  };

  const examples = useMemo(() => [1000, 5000, 50000].map((price) => ({
    price,
    maxRs: summaryPct > 0 ? Math.round((price * summaryPct) / 100) : null,
    capRs: summaryPkr > 0 ? summaryPkr : null,
  })), [summaryPct, summaryPkr]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-lg mx-auto space-y-4">
      <PageHeader
        icon={Receipt}
        title={t('admin.summaryDiscountPage.title', 'Bill Summary Discount (F8)')}
        description={t('admin.summaryDiscountPage.subtitle', 'F8 checkout summary — separate from main biller screen')}
      />

      <div className={cn(
        'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold',
        isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
      )}>
        <Zap className="w-3.5 h-3.5 shrink-0" />
        {t('admin.discountPage.liveHint', 'Change = instant on all biller screens')}
      </div>

      <SettingsCard
        title={t('admin.discountPage.summarySection', 'Bill Summary (F8)')}
        subtitle={t('admin.discountPage.summaryHint', 'Separate from main biller screen discount')}
        icon={Tag}
        isDark={isDark}
        accent="amber"
      >
        <div className="space-y-2 mb-4">
          <ToggleRow
            badge
            icon={Tag}
            label={t('admin.discountPage.summaryBillDiscount', 'Bill discount in Summary')}
            hint={t('admin.summaryDiscountPage.masterHint', 'Show bill discount field on F8 summary popup')}
            checked={d.allowBillDiscountInSummary !== false}
            onChange={(v) => pushLive({ allowBillDiscountInSummary: v })}
            isDark={isDark}
          />
          <ToggleRow
            badge
            icon={DollarSign}
            label={t('admin.discountPage.summaryBillPKR', 'Summary — PKR')}
            checked={d.allowBillDiscountSummaryPKR !== false}
            onChange={(v) => pushLive({ allowBillDiscountSummaryPKR: v })}
            isDark={isDark}
          />
          <ToggleRow
            badge
            icon={Percent}
            label={t('admin.discountPage.summaryBillPercent', 'Summary — %')}
            checked={d.allowBillDiscountSummaryPercent !== false}
            onChange={(v) => pushLive({ allowBillDiscountSummaryPercent: v })}
            isDark={isDark}
          />
          <ToggleRow
            badge
            icon={DollarSign}
            label={t('admin.summaryDiscountPage.defaultPKR', 'Default summary discount: PKR (not %)')}
            hint={t('admin.summaryDiscountPage.defaultPKRHint', 'F8 summary opens with Rs selected')}
            checked={d.defaultBillSummaryDiscountType !== 'percent'}
            onChange={(v) => pushLive({ defaultBillSummaryDiscountType: v ? 'fixed' : 'percent' })}
            isDark={isDark}
          />
        </div>

        <div className={cn('rounded-xl border p-3 space-y-3', isDark ? 'border-[#2a1f0d] bg-[#070503]' : 'border-amber-100 bg-amber-50/40')}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t('admin.summaryDiscountPage.limits', 'Summary discount limits')}
          </p>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            {t('admin.summaryDiscountPage.limitsHint', '0 = no limit · live update on all biller F8 screens')}
          </p>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-gray-400">
              {t('admin.summaryDiscountPage.maxPercent', 'Max Summary Discount (%)')}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={pctDraft}
                onChange={(e) => onPctChange(e.target.value)}
                onBlur={onPctBlur}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-lg font-black tabular-nums outline-none focus:ring-2 focus:ring-amber-500/40',
                  isDark ? 'bg-[#0f0d09] border-amber-500/30 text-amber-400' : 'bg-white border-amber-200 text-amber-700',
                )}
              />
              <span className={cn('text-sm font-bold', isDark ? 'text-gray-400' : 'text-gray-500')}>%</span>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => commitPct(p)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  summaryPct === p
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25'
                    : isDark ? 'border-[#2a1f0d] text-gray-400 hover:border-amber-500/40' : 'border-amber-100 text-gray-600 hover:bg-amber-50',
                )}
              >
                {p}%
              </button>
            ))}
          </div>

          <FontSlider
            label={t('admin.summaryDiscountPage.maxPKR', 'Max Summary Discount (PKR)')}
            hint={t('admin.summaryDiscountPage.maxPKRHint', 'Fixed Rs cap on F8 summary bill discount')}
            value={summaryPkr}
            min={0}
            max={50000}
            onChange={(v) => pushLive({
              maxBillSummaryDiscountPKR: v,
              maxSummaryDiscountPKR: v,
            })}
            isDark={isDark}
            preview={`Rs ${Number(summaryPkr || 0).toLocaleString()}`}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('admin.summaryDiscountPage.preview', 'Live Examples (F8)')}
        subtitle={summaryPct > 0 || summaryPkr > 0
          ? t('admin.summaryDiscountPage.previewSub', 'Applied cap on summary popup')
          : t('admin.discountPage.noLimit', 'No limit')}
        icon={Calculator}
        isDark={isDark}
        accent="emerald"
      >
        <div className="space-y-2">
          {examples.map(({ price, maxRs, capRs }) => {
            let effective = '—';
            if (maxRs != null && capRs > 0) effective = `max Rs ${Math.min(maxRs, capRs).toLocaleString()}`;
            else if (maxRs != null) effective = `max Rs ${maxRs.toLocaleString()} (% cap)`;
            else if (capRs > 0) effective = `max Rs ${capRs.toLocaleString()} (PKR cap)`;
            return (
              <div
                key={price}
                className={cn(
                  'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm',
                  isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/50 border-amber-100',
                )}
              >
                <span className={cn('font-mono font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
                  Bill Rs {price.toLocaleString()}
                </span>
                <span className={cn('font-bold tabular-nums text-xs', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                  {effective}
                </span>
              </div>
            );
          })}
        </div>
      </SettingsCard>
    </div>
  );
};

export default BillerSummaryDiscountSettings;
