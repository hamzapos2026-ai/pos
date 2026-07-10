import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, User, FileText, Radio } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SettingsCard, ToggleRow } from './SettingsUi';
import { watchBillerStallAlerts } from '../../services/billerStallService';
import { ROLE_SETTINGS_HINTS as H } from '../../utils/roleSettingsHints';

const fmtDisplay = (row) => {
  if (row.displayTime instanceof Date && !Number.isNaN(row.displayTime.getTime())) {
    return row.displayTime.toLocaleString([], {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  if (row.localDate && row.localTime) return `${row.localDate} ${row.localTime}`;
  return row.localIso?.replace('T', ' ').slice(0, 16) || '—';
};

const MinuteField = ({ label, hint, value, min, max, onChange, isDark, allowOff = false }) => {
  const isOff = allowOff && Number(value) <= 0;
  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-2',
      isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/40 border-amber-100',
    )}>
      <div>
        <div className="flex items-center gap-2">
          <p className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>{label}</p>
          {isOff && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-gray-500/15 text-gray-500">
              Off
            </span>
          )}
        </div>
        {hint && <p className="text-[10px] text-gray-500 mt-0.5">{hint}</p>}
        {allowOff && <p className="text-[10px] text-amber-500/80 mt-0.5 font-medium">0 = alert band</p>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            'w-24 rounded-lg border px-3 py-2 text-sm font-bold tabular-nums',
            isDark ? 'bg-black/30 border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
          )}
        />
        <span className="text-xs text-gray-500 font-medium">{isOff ? 'off' : 'minutes'}</span>
      </div>
    </div>
  );
};

export const BillerStallSettingsCard = ({
  billerStall,
  isDark,
  t,
  updateBillerStall,
}) => {
  const stall = billerStall || {};

  return (
    <SettingsCard
      title={t('admin.roleSettings.billerStallTitle', 'Biller Idle / Stall Alerts')}
      subtitle={t('admin.roleSettings.billerStallSubtitle', 'Biller ruk jaye ya invoice open chhor de — alert + super admin log')}
      icon={AlertTriangle}
      isDark={isDark}
      accent="rose"
    >
      <div className="space-y-3">
        <ToggleRow
          badge
          icon={AlertTriangle}
          label={t('admin.roleSettings.billerStallEnabled', 'Stall alerts ON')}
          hint={H.billerStallEnabled}
          checked={stall.enabled !== false}
          onChange={(v) => updateBillerStall({ enabled: v })}
          isDark={isDark}
        />

        <div className="grid sm:grid-cols-2 gap-3">
          <MinuteField
            label={t('admin.roleSettings.billIdleMin', 'No activity on bill')}
            hint={H.billerStallBillIdle}
            value={stall.billIdleMinutes ?? 10}
            min={0}
            max={120}
            allowOff
            onChange={(v) => updateBillerStall({ billIdleMinutes: v })}
            isDark={isDark}
          />
          <MinuteField
            label={t('admin.roleSettings.invoiceOpenMin', 'Invoice open too long')}
            hint={H.billerStallInvoice}
            value={stall.invoiceOpenMinutes ?? 5}
            min={0}
            max={60}
            allowOff
            onChange={(v) => updateBillerStall({ invoiceOpenMinutes: v })}
            isDark={isDark}
          />
          <MinuteField
            label={t('admin.roleSettings.maxBillMin', 'Max bill duration')}
            hint={H.billerStallMaxBill}
            value={stall.maxBillMinutes ?? 45}
            min={0}
            max={240}
            allowOff
            onChange={(v) => updateBillerStall({ maxBillMinutes: v })}
            isDark={isDark}
          />
          <MinuteField
            label={t('admin.roleSettings.stallCooldown', 'Alert repeat gap')}
            hint={H.billerStallCooldown}
            value={stall.alertCooldownMinutes ?? 3}
            min={1}
            max={30}
            onChange={(v) => updateBillerStall({ alertCooldownMinutes: v })}
            isDark={isDark}
          />
        </div>
      </div>
    </SettingsCard>
  );
};

export const BillerStallAlertsFeed = ({ isDark, t }) => {
  const [alerts, setAlerts] = useState([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const unsub = watchBillerStallAlerts((rows) => {
      setAlerts(rows);
      setLive(true);
    });
    return unsub;
  }, []);

  return (
    <SettingsCard
      title={t('admin.roleSettings.billerStallFeed', 'Live Biller Stall Log')}
      subtitle={t('admin.roleSettings.billerStallFeedHint', 'Biller name · bill · kitna time · date')}
      icon={Clock}
      isDark={isDark}
      accent="amber"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide',
          live
            ? 'bg-emerald-500/15 text-emerald-500'
            : isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-500',
        )}>
          <Radio className="w-3 h-3" />
          {live ? 'Live sync' : 'Connecting…'}
        </span>
        <span className="text-[10px] text-gray-500">
          {alerts.length} recent alert{alerts.length === 1 ? '' : 's'}
        </span>
      </div>

      {alerts.length === 0 ? (
        <p className={cn('text-sm py-6 text-center rounded-xl border', isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-amber-100 text-gray-500')}>
          {t('admin.roleSettings.noStallAlerts', 'Abhi koi stall alert nahi — biller idle hone par yahan dikhega.')}
        </p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {alerts.map((row) => (
            <div
              key={row.id}
              className={cn(
                'rounded-xl border p-3.5 transition-colors',
                isDark ? 'border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10' : 'border-rose-100 bg-rose-50/50 hover:bg-rose-50',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    isDark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-600',
                  )}>
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn('text-sm font-bold truncate', isDark ? 'text-white' : 'text-gray-900')}>
                      {row.billerName || row.billerId || 'Biller'}
                    </p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate font-mono">{row.billSerial || '----'}</span>
                      {row.tabLabel ? <span className="text-gray-400">· {row.tabLabel}</span> : null}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-sm font-black tabular-nums', isDark ? 'text-amber-400' : 'text-amber-700')}>
                    {row.durationLabel || `${row.durationMinutes || '?'} min`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{fmtDisplay(row)}</p>
                </div>
              </div>
              <p className={cn('text-[11px] mt-2 leading-snug', isDark ? 'text-rose-200/80' : 'text-rose-800/90')}>
                {row.stallLabel || row.stallType}
              </p>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
};

export default BillerStallAlertsFeed;
