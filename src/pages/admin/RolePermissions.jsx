// src/pages/admin/RolePermissions.jsx
// Sirf working permissions + modern UI (Settings jaisa)

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Eye,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Download,
  Receipt,
  CreditCard,
  Briefcase,
  DollarSign,
  Activity,
  Layers,
  Zap,
  Wifi,
  WifiOff,
  Settings,
  ExternalLink,
  Info,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSettings } from '../../context/SettingsContext';
import { useNetwork } from '../../context/NetworkContext';
import { patchSetting, getCachedSettings, isDualModeEnabled } from '../../services/settingsStore';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/admin/PageHeader';
import Badge from '../../components/ui/Badge';
import { SettingsCard, ToggleRow, FilterTabs } from '../../components/admin/SettingsUi';
import {
  ROLE_FEATURES,
  PERM_ACTIONS,
  mergeRoleFeatureMatrix,
  isRoleFeatureAllowed,
} from '../../utils/roleFeaturePermissions';
import {
  PERM_HINTS,
  FEATURES_BY_ROLE,
  FEATURE_HINTS,
  ACTION_HINTS,
} from '../../utils/permissionsHints';

const ACTION_ICONS = {
  view: Eye,
  add: Plus,
  edit: Edit,
  delete: Trash2,
  approve: CheckCircle,
  export: Download,
};

const FEATURE_ICONS = {
  commission: DollarSign,
  activityLogs: Activity,
};

const ROLE_META = {
  biller: { label: 'Biller', desc: 'Billing counter', icon: Receipt, badge: 'success' },
  cashier: { label: 'Cashier', desc: 'Payments & cash', icon: CreditCard, badge: 'info' },
  manager: { label: 'Manager', desc: 'Reports & oversight', icon: Briefcase, badge: 'purple' },
};

const MAIN_TABS = [
  { id: 'system', label: 'System' },
  { id: 'manager', label: 'Manager' },
  { id: 'cashier', label: 'Cashier' },
  { id: 'biller', label: 'Biller' },
];

const PermToggle = ({ active, disabled, onClick, label, Icon, isDark }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={label}
    className={cn(
      'inline-flex flex-col items-center justify-center gap-0.5 min-w-[52px] py-2 px-1.5 rounded-xl border text-[10px] font-semibold transition-all',
      disabled && 'opacity-25 cursor-not-allowed',
      !disabled && active
        ? 'border-amber-500/50 bg-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/10'
        : isDark
          ? 'border-[#2a1f0d] bg-[#0a0805] text-gray-500 hover:border-amber-500/30 hover:text-gray-300'
          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-amber-300',
    )}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    <span>{label}</span>
  </button>
);

const PermissionSummary = ({ matrix, role, features, isDark }) => {
  const counts = useMemo(() => {
    let enabled = 0;
    let total = 0;
    features.forEach((feat) => {
      feat.actions.forEach((action) => {
        total++;
        if (isRoleFeatureAllowed(matrix, role, feat.key, action)) enabled++;
      });
    });
    return { enabled, total };
  }, [matrix, role, features]);

  const pct = counts.total > 0 ? Math.round((counts.enabled / counts.total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className={cn('h-1.5 rounded-full flex-1 min-w-[60px] max-w-[100px]', isDark ? 'bg-[#1a1208]' : 'bg-gray-200')}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', pct > 70 ? 'bg-emerald-500' : pct > 30 ? 'bg-amber-500' : 'bg-rose-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-[10px] font-semibold', isDark ? 'text-gray-500' : 'text-gray-400')}>
        {counts.enabled}/{counts.total}
      </span>
    </div>
  );
};

const RolePermissions = () => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { settings, setSetting } = useSettings();
  const isOnline = useNetwork()?.isOnline ?? navigator.onLine;
  const [activeTab, setActiveTab] = useState('system');
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  useEffect(() => { setLastUpdated(Date.now()); }, [settings]);

  const dualModeOn = isDualModeEnabled(settings);

  const toggleDualMode = useCallback(async () => {
    const next = !dualModeOn;
    await setSetting('dualMode', next);
    toast.success(next ? 'Dual Mode ON — biller khud payment le sakta hai' : 'Dual Mode OFF — sirf cashier ko bhejega', { duration: 2200 });
  }, [dualModeOn, setSetting]);

  const wiredFeatures = useMemo(() => {
    const keys = new Set(Object.values(FEATURES_BY_ROLE).flat());
    return ROLE_FEATURES.filter((f) => keys.has(f.key));
  }, []);

  const roleFeatures = useMemo(() => {
    const keys = FEATURES_BY_ROLE[activeTab] || [];
    return wiredFeatures.filter((f) => keys.includes(f.key));
  }, [wiredFeatures, activeTab]);

  const matrix = useMemo(() => mergeRoleFeatureMatrix(settings.permissions), [settings.permissions]);

  const toggle = useCallback((role, feature, action) => {
    const feat = wiredFeatures.find((f) => f.key === feature);
    if (!feat?.actions.includes(action)) return;

    const currentMatrix = mergeRoleFeatureMatrix(getCachedSettings().permissions);
    const updated = JSON.parse(JSON.stringify(currentMatrix));
    if (!updated[role]) updated[role] = {};
    if (!updated[role][feature]) updated[role][feature] = {};
    const next = !updated[role][feature][action];
    updated[role][feature][action] = next;
    patchSetting('permissions', updated);

    const actionLabel = PERM_ACTIONS.find((a) => a.key === action)?.label || action;
    toast(next ? `✅ ${feat.label} → ${actionLabel} ON` : `❌ ${feat.label} → ${actionLabel} OFF`, { duration: 1400 });
  }, [wiredFeatures]);

  const setRow = useCallback((role, feature, on) => {
    const feat = wiredFeatures.find((f) => f.key === feature);
    if (!feat) return;
    const currentMatrix = mergeRoleFeatureMatrix(getCachedSettings().permissions);
    const updated = JSON.parse(JSON.stringify(currentMatrix));
    if (!updated[role]) updated[role] = {};
    updated[role][feature] = {};
    feat.actions.forEach((a) => { updated[role][feature][a] = on; });
    patchSetting('permissions', updated);
    toast(on ? `✅ ${feat.label} — sab ON` : `❌ ${feat.label} — sab OFF`, { duration: 1400 });
  }, [wiredFeatures]);

  const setAllForRole = useCallback((role, on) => {
    const feats = wiredFeatures.filter((f) => (FEATURES_BY_ROLE[role] || []).includes(f.key));
    const currentMatrix = mergeRoleFeatureMatrix(getCachedSettings().permissions);
    const updated = JSON.parse(JSON.stringify(currentMatrix));
    if (!updated[role]) updated[role] = {};
    feats.forEach((feat) => {
      if (!updated[role][feat.key]) updated[role][feat.key] = {};
      feat.actions.forEach((a) => { updated[role][feat.key][a] = on; });
    });
    patchSetting('permissions', updated);
    toast(on ? `✅ ${ROLE_META[role]?.label} — sab ON` : `❌ ${ROLE_META[role]?.label} — sab OFF`, { duration: 1800 });
  }, [wiredFeatures]);

  const roleMeta = ROLE_META[activeTab];
  const RoleIcon = roleMeta?.icon || ShieldCheck;
  const isRoleTab = ['manager', 'cashier', 'biller'].includes(activeTab);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        icon={ShieldCheck}
        title={t('admin.rolesPermissions', 'Roles & Permissions')}
        description="Sirf working controls — turant sab PCs par apply"
      />

      {/* Live status */}
      <div className={cn(
        'rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border',
            isOnline
              ? isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
              : isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-600',
          )}>
            {isOnline
              ? <><Wifi className="w-3.5 h-3.5" /><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live sync</>
              : <><WifiOff className="w-3.5 h-3.5" />Offline — baad me sync</>}
          </span>
          <span className={cn('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {new Date(lastUpdated).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </span>
        </div>
        <FilterTabs tabs={MAIN_TABS} active={activeTab} onChange={setActiveTab} isDark={isDark} />
      </div>

      {/* ── SYSTEM TAB ── */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <SettingsCard
            title="System Controls"
            subtitle={PERM_HINTS.liveSync}
            icon={Layers}
            isDark={isDark}
            accent="purple"
          >
            <ToggleRow
              label="Dual Role Mode (Biller + Cashier)"
              hint={PERM_HINTS.dualMode}
              checked={dualModeOn}
              onChange={toggleDualMode}
              isDark={isDark}
              icon={Layers}
              badge
            />
          </SettingsCard>

          <SettingsCard title="Commission System" subtitle={PERM_HINTS.commissionLink} icon={DollarSign} isDark={isDark} accent="amber">
            <div className={cn(
              'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3',
              isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/30 border-amber-100',
            )}>
              <p className="text-[11px] text-gray-500 leading-snug">
                Commission ON/OFF, agents, rates — yahan duplicate nahi. Sirf Finance page se control karein.
              </p>
              <Link
                to="/admin/commission"
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors',
                  isDark ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-white text-amber-800 hover:bg-amber-100 border border-amber-200',
                )}
              >
                Commission Settings
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </SettingsCard>

          <SettingsCard title="Biller / Cashier UI" subtitle={PERM_HINTS.settingsLink} icon={Settings} isDark={isDark} accent="blue">
            <div className={cn(
              'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border px-4 py-3',
              isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-amber-50/30 border-amber-100',
            )}>
              <p className="text-[11px] text-gray-500 leading-snug">
                Font size, Product Name, Discount, Offline Payment — Admin → Settings → Super Admin se set karein.
              </p>
              <Link
                to="/admin/settings/superAdmin"
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors',
                  isDark ? 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25' : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200',
                )}
              >
                Open Settings
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </SettingsCard>

          <p className={cn(
            'text-[11px] rounded-xl border px-4 py-3 flex items-start gap-2',
            isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-gray-200 text-gray-600',
          )}>
            <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            {PERM_HINTS.liveSync}
          </p>
        </div>
      )}

      {/* ── ROLE TABS (Manager / Cashier / Biller) ── */}
      {isRoleTab && (
        <>
          {roleFeatures.length === 0 ? (
            <SettingsCard title={roleMeta.label} subtitle={PERM_HINTS.billerNote} icon={RoleIcon} isDark={isDark} accent="blue">
              <div className={cn(
                'rounded-xl border px-4 py-4 flex items-start gap-3',
                isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-blue-50/50 border-blue-100',
              )}>
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-2 text-[11px] text-gray-500">
                  <p>Biller ki permissions yahan nahi — font, product name, discount sab <strong>Settings</strong> se control hota hai.</p>
                  <Link
                    to="/admin/settings/superAdmin"
                    className="inline-flex items-center gap-1 text-amber-500 font-semibold hover:underline"
                  >
                    Super Admin Settings <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </SettingsCard>
          ) : (
            <SettingsCard
              title={`${roleMeta.label} Permissions`}
              subtitle={`Sirf working features — ${roleMeta.desc}`}
              icon={RoleIcon}
              isDark={isDark}
              accent={activeTab === 'manager' ? 'purple' : activeTab === 'cashier' ? 'emerald' : 'amber'}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={roleMeta.badge}>{activeTab}</Badge>
                  <PermissionSummary matrix={matrix} role={activeTab} features={roleFeatures} isDark={isDark} />
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAllForRole(activeTab, true)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border border-green-500/30 text-green-500 hover:bg-green-500/10 font-semibold"
                  >
                    Sab ON
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllForRole(activeTab, false)}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-semibold"
                  >
                    Sab OFF
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {roleFeatures.map((feat) => {
                  const FIcon = FEATURE_ICONS[feat.key] || ShieldCheck;
                  const accent = feat.key === 'activityLogs' ? 'blue' : 'amber';

                  return (
                    <div
                      key={feat.key}
                      className={cn(
                        'rounded-xl border p-4',
                        accent === 'blue'
                          ? isDark ? 'border-blue-500/30 bg-blue-500/5' : 'border-blue-200 bg-blue-50/40'
                          : isDark ? 'border-[#2a1f0d] bg-[#070503]' : 'border-amber-100 bg-amber-50/20',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FIcon className={cn('w-5 h-5 shrink-0 mt-0.5', accent === 'blue' ? 'text-blue-400' : 'text-amber-500')} />
                          <div>
                            <p className={cn('font-bold text-sm', isDark ? 'text-white' : 'text-gray-900')}>{feat.label}</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">{FEATURE_HINTS[feat.key] || feat.hint}</p>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button type="button" onClick={() => setRow(activeTab, feat.key, true)} className="text-[10px] px-2 py-1 rounded-lg border border-green-500/30 text-green-500 hover:bg-green-500/10">Sab ON</button>
                          <button type="button" onClick={() => setRow(activeTab, feat.key, false)} className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">Sab OFF</button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {PERM_ACTIONS.map((perm) => {
                          const allowed = feat.actions.includes(perm.key);
                          const Icon = ACTION_ICONS[perm.key];
                          const on = isRoleFeatureAllowed(matrix, activeTab, feat.key, perm.key);
                          const hintKey = ACTION_HINTS[feat.key]?.[perm.key];
                          const hintText = hintKey ? PERM_HINTS[hintKey] : '';

                          return (
                            <div key={perm.key} className="flex flex-col items-center gap-0.5">
                              <PermToggle
                                active={on}
                                disabled={!allowed}
                                onClick={() => toggle(activeTab, feat.key, perm.key)}
                                label={perm.label}
                                Icon={allowed ? Icon : null}
                                isDark={isDark}
                              />
                              {allowed && hintText && (
                                <span className="text-[9px] text-gray-500 max-w-[72px] text-center leading-tight">{hintText}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {feat.key === 'commission' && (
                        <p className={cn('mt-3 text-[10px] rounded-lg px-3 py-2', isDark ? 'bg-[#1a1208] text-amber-200/70' : 'bg-amber-100/60 text-amber-900')}>
                          Agents &amp; system ON/OFF ={' '}
                          <Link to="/admin/commission" className="underline text-amber-500 font-semibold">Commission Settings</Link>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </SettingsCard>
          )}

          <p className={cn(
            'text-[11px] rounded-xl border px-4 py-3',
            isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-gray-200 text-gray-600',
          )}>
            <span className="text-amber-500 font-semibold">●</span> Enabled = role ko ye action allowed &nbsp;·&nbsp;
            <span className="text-gray-500">Grey</span> = is feature par ye action nahi &nbsp;·&nbsp;
            Toggle turant save — reload ki zaroorat nahi
          </p>
        </>
      )}
    </div>
  );
};

export default RolePermissions;
