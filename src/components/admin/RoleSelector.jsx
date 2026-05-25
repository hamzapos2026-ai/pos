// src/components/admin/RoleSelector.jsx
// ═══════════════════════════════════════════════════════════
// Multi-Role Selector — A One Jewelry POS
// Fully responsive: Desktop / Tablet / Mobile / PWA
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown,
  ShieldCheck,
  Users,
  Receipt,
  CreditCard,
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  UserCheck,
  UserCog,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  ROLE_INFO,
  ROLE_PRESETS,
  validateRoleCombination,
  getPrimaryRole,
  mergePermissions,
  PERMISSION_GROUPS,
} from '../../utils/rolePermissions'

const cn = (...inputs) => twMerge(clsx(inputs))

// ─── Icon Map ─────────────────────────────────────────────
const ICON_MAP = {
  Crown,
  ShieldCheck,
  Users,
  Receipt,
  CreditCard,
  Layers,
  UserCheck,
  UserCog,
  Shield,
}

const getIcon = (name) => ICON_MAP[name] || Zap

// ─── Role Card Component ─────────────────────────────────
const RoleCard = ({ roleKey, info, isSelected, onToggle, disabled }) => {
  const IconComponent = getIcon(info.icon)

  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onToggle(roleKey)}
      disabled={disabled}
      layout
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 sm:p-4 transition-all duration-300 cursor-pointer select-none',
        'min-h-[100px] sm:min-h-[120px] md:min-h-[140px]',
        'w-full',
        isSelected
          ? cn(
              info.bgColor,
              `border-${info.color}-500`,
              'shadow-lg',
              `shadow-${info.color}-500/20`,
              'ring-2',
              info.ringColor
            )
          : cn(
              'bg-[#1a1208] border-[#2a1f0d]',
              'hover:bg-[#1f1a0e]',
              `hover:border-${info.color}-500/30`
            ),
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {/* Selected Checkmark */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className={cn(
              'absolute -top-2 -right-2 z-10 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full',
              `bg-${info.color}-500 shadow-md shadow-${info.color}-500/40`
            )}
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow Effect */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'absolute inset-0 rounded-2xl',
              `bg-gradient-to-br ${info.gradientFrom} ${info.gradientTo} opacity-5`
            )}
          />
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        animate={{
          scale: isSelected ? 1.15 : 1,
          rotate: isSelected ? [0, -10, 10, 0] : 0,
        }}
        transition={{ duration: 0.4 }}
        className={cn(
          'flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl',
          isSelected ? info.bgColor : 'bg-[#0f0a04]',
          'transition-colors duration-300'
        )}
      >
        <IconComponent
          className={cn(
            'h-5 w-5 sm:h-6 sm:w-6',
            isSelected ? info.textColor : 'text-gray-500'
          )}
        />
      </motion.div>

      {/* Label */}
      <div className="text-center">
        <p
          className={cn(
            'text-xs sm:text-sm font-semibold',
            isSelected ? info.textColor : 'text-gray-400'
          )}
        >
          {info.label}
        </p>
        <p className="mt-0.5 text-[10px] sm:text-xs text-gray-600 leading-tight hidden sm:block">
          {info.shortDesc}
        </p>
      </div>

      {/* Selection Indicator for Mobile */}
      <div
        className={cn(
          'absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 rounded-full transition-all duration-300',
          isSelected
            ? cn(`bg-${info.color}-500`, 'w-8')
            : 'bg-transparent w-0'
        )}
      />
    </motion.button>
  )
}

// ─── Preset Button Component ──────────────────────────────
const PresetButton = ({ preset, isActive, onClick }) => {
  const IconComponent = getIcon(preset.icon)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-all duration-200',
        'whitespace-nowrap',
        isActive
          ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 shadow-sm shadow-amber-500/10'
          : 'border-[#2a1f0d] bg-[#1a1208] text-gray-400 hover:border-amber-500/20 hover:text-gray-300'
      )}
    >
      <IconComponent className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      <span>{preset.label}</span>
    </motion.button>
  )
}

// ─── Permission Preview Chip ──────────────────────────────
const PermPreviewChip = ({ label, value, isNumber }) => (
  <div
    className={cn(
      'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs',
      isNumber
        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
        : value
        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20'
    )}
  >
    {isNumber ? (
      <span className="font-mono font-bold">{value}</span>
    ) : value ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : (
      <XCircle className="h-3 w-3" />
    )}
    <span>{label}</span>
  </div>
)

// ─── Main RoleSelector Component ──────────────────────────
const RoleSelector = ({
  selectedRoles = [],
  onChange,
  disabled = false,
  excludeSuperAdmin = false,
}) => {
  const [showPresets, setShowPresets] = useState(false)
  const [showPermPreview, setShowPermPreview] = useState(false)

  // Filter roles based on excludeSuperAdmin
  const availableRoles = useMemo(() => {
    const allRoles = Object.entries(ROLE_INFO)
    return excludeSuperAdmin
      ? allRoles.filter(([key]) => key !== 'superAdmin')
      : allRoles
  }, [excludeSuperAdmin])

  // Validate current combination
  const validation = useMemo(() => {
    if (selectedRoles.length === 0) {
      return { valid: false, error: null }
    }
    return validateRoleCombination(selectedRoles)
  }, [selectedRoles])

  // Primary role
  const primaryRole = useMemo(() => {
    return selectedRoles.length > 0 ? getPrimaryRole(selectedRoles) : null
  }, [selectedRoles])

  // Merged permissions
  const mergedPerms = useMemo(() => {
    return selectedRoles.length > 0 ? mergePermissions(selectedRoles) : {}
  }, [selectedRoles])

  // Available presets
  const filteredPresets = useMemo(() => {
    return excludeSuperAdmin
      ? ROLE_PRESETS.filter((p) => !p.roles.includes('superAdmin'))
      : ROLE_PRESETS
  }, [excludeSuperAdmin])

  // Handle role toggle
  const handleToggle = useCallback(
    (roleKey) => {
      if (disabled) return

      let newRoles

      if (selectedRoles.includes(roleKey)) {
        // Deselect
        newRoles = selectedRoles.filter((r) => r !== roleKey)
      } else {
        // Select
        if (roleKey === 'superAdmin') {
          // Super admin replaces all
          newRoles = ['superAdmin']
        } else if (selectedRoles.includes('superAdmin')) {
          // Replacing super admin with this role
          newRoles = [roleKey]
        } else {
          newRoles = [...selectedRoles, roleKey]
        }
      }

      onChange(newRoles)
    },
    [selectedRoles, onChange, disabled]
  )

  // Handle preset click
  const handlePresetClick = useCallback(
    (presetRoles) => {
      if (disabled) return
      const isSame =
        selectedRoles.length === presetRoles.length &&
        presetRoles.every((r) => selectedRoles.includes(r))
      if (isSame) {
        onChange([])
      } else {
        onChange([...presetRoles])
      }
    },
    [selectedRoles, onChange, disabled]
  )

  // Check if preset is active
  const isPresetActive = useCallback(
    (presetRoles) => {
      return (
        selectedRoles.length === presetRoles.length &&
        presetRoles.every((r) => selectedRoles.includes(r))
      )
    },
    [selectedRoles]
  )

  // Count enabled permissions
  const permissionCount = useMemo(() => {
    let enabled = 0
    let total = 0
    Object.entries(mergedPerms).forEach(([key, val]) => {
      if (typeof val === 'boolean') {
        total++
        if (val) enabled++
      }
    })
    return { enabled, total }
  }, [mergedPerms])

  return (
    <div className="space-y-4">
      {/* ─── Section Header ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Assign Roles
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Select one or multiple roles for this user
          </p>
        </div>

        {selectedRoles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <span className="text-xs text-gray-500">
              {selectedRoles.length} role{selectedRoles.length > 1 ? 's' : ''} selected
            </span>
            {permissionCount.total > 0 && (
              <span className="text-[10px] text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {permissionCount.enabled}/{permissionCount.total} permissions
              </span>
            )}
          </motion.div>
        )}
      </div>

      {/* ─── Role Cards Grid ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
        {availableRoles.map(([roleKey, info]) => (
          <RoleCard
            key={roleKey}
            roleKey={roleKey}
            info={info}
            isSelected={selectedRoles.includes(roleKey)}
            onToggle={handleToggle}
            disabled={disabled}
          />
        ))}
      </div>

      {/* ─── Validation Status ─────────────────────── */}
      <AnimatePresence mode="wait">
        {selectedRoles.length > 0 && (
          <motion.div
            key={validation.valid ? 'valid' : 'invalid'}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className={cn(
                'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border p-3 sm:p-4',
                validation.valid
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-red-500/30 bg-red-500/5'
              )}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {validation.valid ? (
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-red-400 shrink-0" />
                )}

                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-xs sm:text-sm font-medium',
                      validation.valid ? 'text-green-400' : 'text-red-400'
                    )}
                  >
                    {validation.valid
                      ? `Valid combination: ${selectedRoles
                          .map((r) => ROLE_INFO[r]?.label)
                          .join(' + ')}`
                      : validation.error}
                  </p>
                  {validation.valid && primaryRole && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                      Primary Role:{' '}
                      <span className={ROLE_INFO[primaryRole]?.textColor}>
                        {ROLE_INFO[primaryRole]?.label}
                      </span>{' '}
                      — Default dashboard after login
                    </p>
                  )}
                </div>
              </div>

              {/* Selected role chips */}
              {validation.valid && selectedRoles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:shrink-0">
                  {selectedRoles.map((role) => {
                    const ri = ROLE_INFO[role]
                    const Icon = getIcon(ri?.icon)
                    return (
                      <motion.span
                        key={role}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] sm:text-xs font-medium',
                          ri?.chipBg,
                          ri?.chipText,
                          ri?.chipBorder
                        )}
                      >
                        <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {ri?.label}
                      </motion.span>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Quick Presets Toggle ───────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-1.5 text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
        >
          <Zap className="h-3 w-3" />
          Quick Presets
          {showPresets ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        <AnimatePresence>
          {showPresets && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 mt-3">
                {filteredPresets.map((preset, idx) => (
                  <PresetButton
                    key={idx}
                    preset={preset}
                    isActive={isPresetActive(preset.roles)}
                    onClick={() => handlePresetClick(preset.roles)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Permission Preview Toggle ─────────────── */}
      {selectedRoles.length > 0 && validation.valid && (
        <div>
          <button
            type="button"
            onClick={() => setShowPermPreview(!showPermPreview)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            <Info className="h-3 w-3" />
            {showPermPreview ? 'Hide' : 'Show'} Permission Preview
            {showPermPreview ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <AnimatePresence>
            {showPermPreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-xl border border-[#2a1f0d] bg-[#0f0a04] p-3 sm:p-4 space-y-3">
                  <p className="text-xs text-gray-500 font-medium">
                    Merged Permissions ({selectedRoles.map((r) => ROLE_INFO[r]?.label).join(' + ')})
                  </p>
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.keys.map((item) => (
                          <PermPreviewChip
                            key={item.key}
                            label={item.label}
                            value={mergedPerms[item.key]}
                            isNumber={item.isNumber}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default RoleSelector