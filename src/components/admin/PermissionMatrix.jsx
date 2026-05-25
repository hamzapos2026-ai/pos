// src/components/admin/PermissionMatrix.jsx
// ═══════════════════════════════════════════════════════════
// Permission Matrix — Shows merged, per-role, and overrides
// Fully responsive: Desktop / Tablet / Mobile / PWA
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Receipt,
  CreditCard,
  Banknote,
  BarChart2,
  Users,
  Store,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Lock,
  Unlock,
  RotateCcw,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  ROLE_INFO,
  PERMISSION_GROUPS,
  DEFAULT_PERMISSIONS,
  mergePermissions,
  isPermissionOverridden,
} from '../../utils/rolePermissions'

const cn = (...inputs) => twMerge(clsx(inputs))

// ─── Icon Map ─────────────────────────────────────────────
const GROUP_ICON_MAP = {
  Receipt,
  CreditCard,
  Banknote,
  BarChart2,
  Users,
  Store,
}

// ─── Boolean Permission Cell ──────────────────────────────
const BoolCell = ({ value, isOverride, className }) => (
  <div className={cn('flex items-center justify-center', className)}>
    {value ? (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/15">
        <Check className="h-3.5 w-3.5 text-green-400" strokeWidth={3} />
      </div>
    ) : (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10">
        <X className="h-3.5 w-3.5 text-red-400/60" strokeWidth={2} />
      </div>
    )}
    {isOverride && (
      <Lock className="ml-1 h-3 w-3 text-amber-500/60" />
    )}
  </div>
)

// ─── Number Permission Cell ───────────────────────────────
const NumCell = ({ value, isOverride, className }) => (
  <div className={cn('flex items-center justify-center gap-1', className)}>
    <span className="font-mono text-xs font-bold text-blue-400">
      {typeof value === 'number' ? value.toLocaleString() : '—'}
    </span>
    {isOverride && (
      <Lock className="h-3 w-3 text-amber-500/60" />
    )}
  </div>
)

// ─── Permission Row (Mobile Card Layout) ──────────────────
const PermissionRowMobile = ({
  item,
  roles,
  mergedValue,
  customValue,
  isOverridden,
  onOverrideToggle,
  onValueChange,
  onReset,
  readonly,
}) => {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-[#2a1f0d] bg-[#0f0a04] overflow-hidden">
      {/* Main Row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isOverridden && (
            <Lock className="h-3 w-3 text-amber-500 shrink-0" />
          )}
          <span className="text-xs text-gray-300 truncate">
            {item.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {item.isNumber ? (
            <NumCell value={isOverridden ? customValue : mergedValue} isOverride={false} />
          ) : (
            <BoolCell value={isOverridden ? customValue : mergedValue} isOverride={false} />
          )}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
          )}
        </div>
      </button>

      {/* Expanded Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#2a1f0d] px-3 py-2 space-y-2">
              {/* Per-role values */}
              <div className="grid grid-cols-2 gap-1.5">
                {roles.map((role) => {
                  const ri = ROLE_INFO[role]
                  const roleVal = DEFAULT_PERMISSIONS[role]?.[item.key]
                  return (
                    <div
                      key={role}
                      className={cn(
                        'flex items-center justify-between rounded-lg px-2 py-1.5 text-[10px]',
                        ri?.chipBg,
                        'border',
                        ri?.chipBorder
                      )}
                    >
                      <span className={ri?.chipText}>{ri?.label}</span>
                      {item.isNumber ? (
                        <span className="font-mono font-bold text-blue-300">
                          {roleVal}
                        </span>
                      ) : roleVal ? (
                        <Check className="h-3 w-3 text-green-400" />
                      ) : (
                        <X className="h-3 w-3 text-red-400/60" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Override Controls */}
              {!readonly && (
                <div className="flex items-center justify-between pt-1 border-t border-[#1a1208]">
                  <button
                    type="button"
                    onClick={() => {
                      if (isOverridden) {
                        onReset(item.key)
                      } else {
                        onOverrideToggle(item.key, mergedValue)
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg transition-colors',
                      isOverridden
                        ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1208]'
                    )}
                  >
                    {isOverridden ? (
                      <>
                        <Unlock className="h-3 w-3" />
                        Reset
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" />
                        Override
                      </>
                    )}
                  </button>

                  {isOverridden && (
                    <div className="flex items-center gap-2">
                      {item.isNumber ? (
                        <input
                          type="number"
                          value={customValue ?? ''}
                          onChange={(e) =>
                            onValueChange(item.key, parseInt(e.target.value) || 0)
                          }
                          className="w-20 rounded-lg border border-[#2a1f0d] bg-[#1a1208] px-2 py-1 text-xs text-amber-300 font-mono text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onValueChange(item.key, !customValue)}
                          className={cn(
                            'relative flex h-6 w-11 items-center rounded-full transition-colors',
                            customValue ? 'bg-green-500/30' : 'bg-red-500/20'
                          )}
                        >
                          <motion.div
                            animate={{ x: customValue ? 22 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={cn(
                              'h-4.5 w-4.5 rounded-full',
                              customValue ? 'bg-green-400' : 'bg-red-400/60'
                            )}
                            style={{ width: 18, height: 18 }}
                          />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Permission Row (Desktop Table Layout) ────────────────
const PermissionRowDesktop = ({
  item,
  roles,
  mergedValue,
  customValue,
  isOverridden,
  onOverrideToggle,
  onValueChange,
  onReset,
  readonly,
}) => {
  const finalValue = isOverridden ? customValue : mergedValue

  return (
    <tr
      className={cn(
        'border-b border-[#1a1208] hover:bg-[#0f0a04]/60 transition-colors',
        isOverridden && 'bg-amber-500/[0.03]'
      )}
    >
      {/* Permission Label */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isOverridden && (
            <Lock className="h-3 w-3 text-amber-500 shrink-0" />
          )}
          <span className="text-xs text-gray-300">{item.label}</span>
        </div>
      </td>

      {/* Per-role columns */}
      {roles.map((role) => {
        const roleVal = DEFAULT_PERMISSIONS[role]?.[item.key]
        return (
          <td key={role} className="px-2 py-2.5">
            {item.isNumber ? (
              <NumCell value={roleVal} />
            ) : (
              <BoolCell value={roleVal} />
            )}
          </td>
        )
      })}

      {/* Merged column */}
      <td className="px-2 py-2.5">
        {item.isNumber ? (
          <NumCell value={finalValue} isOverride={isOverridden} />
        ) : (
          <BoolCell value={finalValue} isOverride={isOverridden} />
        )}
      </td>

      {/* Override column */}
      {!readonly && (
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-center gap-1.5">
            {isOverridden ? (
              <>
                {item.isNumber ? (
                  <input
                    type="number"
                    value={customValue ?? ''}
                    onChange={(e) =>
                      onValueChange(item.key, parseInt(e.target.value) || 0)
                    }
                    className="w-16 rounded-md border border-amber-500/30 bg-[#1a1208] px-1.5 py-0.5 text-[11px] text-amber-300 font-mono text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onValueChange(item.key, !customValue)}
                    className={cn(
                      'relative flex h-5 w-9 items-center rounded-full transition-colors',
                      customValue ? 'bg-green-500/30' : 'bg-red-500/20'
                    )}
                  >
                    <motion.div
                      animate={{ x: customValue ? 16 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={cn(
                        'rounded-full',
                        customValue ? 'bg-green-400' : 'bg-red-400/60'
                      )}
                      style={{ width: 14, height: 14 }}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onReset(item.key)}
                  className="p-0.5 rounded text-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  title="Reset to default"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOverrideToggle(item.key, mergedValue)}
                className="p-1 rounded text-gray-600 hover:text-gray-400 hover:bg-[#1a1208] transition-colors"
                title="Override this permission"
              >
                <Lock className="h-3 w-3" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

// ─── Permission Group Section ─────────────────────────────
const PermissionGroupSection = ({
  group,
  roles,
  merged,
  customPermissions,
  onOverrideToggle,
  onValueChange,
  onReset,
  readonly,
  isMobile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const GroupIcon = GROUP_ICON_MAP[group.icon] || Receipt

  const overriddenCount = group.keys.filter((item) =>
    isPermissionOverridden(item.key, customPermissions)
  ).length

  return (
    <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] overflow-hidden">
      {/* Group Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-3 hover:bg-[#1f1a0e] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg',
              `bg-${group.color}-500/10`
            )}
          >
            <GroupIcon
              className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', `text-${group.color}-400`)}
            />
          </div>
          <div className="text-left">
            <span className="text-xs sm:text-sm font-semibold text-gray-200">
              {group.label}
            </span>
            <span className="text-[10px] text-gray-600 ml-2">
              {group.keys.length} permissions
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {overriddenCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
              <Lock className="h-2.5 w-2.5" />
              {overriddenCount}
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-600" />
          )}
        </div>
      </button>

      {/* Group Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#2a1f0d]">
              {/* Desktop Table */}
              {!isMobile && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#2a1f0d]">
                        <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-gray-600 w-40">
                          Permission
                        </th>
                        {roles.map((role) => (
                          <th
                            key={role}
                            className={cn(
                              'px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider',
                              ROLE_INFO[role]?.chipText
                            )}
                          >
                            {ROLE_INFO[role]?.label}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-amber-500">
                          Merged
                        </th>
                        {!readonly && (
                          <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-gray-600 w-28">
                            Override
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {group.keys.map((item) => {
                        const mergedValue = merged[item.key]
                        const isOver = isPermissionOverridden(
                          item.key,
                          customPermissions
                        )
                        const customValue = customPermissions?.[item.key]
                        return (
                          <PermissionRowDesktop
                            key={item.key}
                            item={item}
                            roles={roles}
                            mergedValue={mergedValue}
                            customValue={customValue}
                            isOverridden={isOver}
                            onOverrideToggle={onOverrideToggle}
                            onValueChange={onValueChange}
                            onReset={onReset}
                            readonly={readonly}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Mobile Card Layout */}
              {isMobile && (
                <div className="p-2 space-y-1.5">
                  {group.keys.map((item) => {
                    const mergedValue = merged[item.key]
                    const isOver = isPermissionOverridden(
                      item.key,
                      customPermissions
                    )
                    const customValue = customPermissions?.[item.key]
                    return (
                      <PermissionRowMobile
                        key={item.key}
                        item={item}
                        roles={roles}
                        mergedValue={mergedValue}
                        customValue={customValue}
                        isOverridden={isOver}
                        onOverrideToggle={onOverrideToggle}
                        onValueChange={onValueChange}
                        onReset={onReset}
                        readonly={readonly}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main PermissionMatrix Component ──────────────────────
const PermissionMatrix = ({
  roles = [],
  customPermissions = {},
  onPermissionChange,
  readonly = false,
}) => {
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useState(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  })

  // Merged permissions
  const merged = useMemo(() => mergePermissions(roles), [roles])

  // Count overrides
  const overrideCount = useMemo(() => {
    return Object.keys(customPermissions || {}).length
  }, [customPermissions])

  // Handle override toggle
  const handleOverrideToggle = useCallback(
    (key, currentValue) => {
      if (readonly || !onPermissionChange) return
      const newCustom = { ...customPermissions, [key]: currentValue }
      onPermissionChange(newCustom)
    },
    [customPermissions, onPermissionChange, readonly]
  )

  // Handle value change
  const handleValueChange = useCallback(
    (key, value) => {
      if (readonly || !onPermissionChange) return
      const newCustom = { ...customPermissions, [key]: value }
      onPermissionChange(newCustom)
    },
    [customPermissions, onPermissionChange, readonly]
  )

  // Handle reset single
  const handleReset = useCallback(
    (key) => {
      if (readonly || !onPermissionChange) return
      const newCustom = { ...customPermissions }
      delete newCustom[key]
      onPermissionChange(newCustom)
    },
    [customPermissions, onPermissionChange, readonly]
  )

  // Handle reset all
  const handleResetAll = useCallback(() => {
    if (readonly || !onPermissionChange) return
    onPermissionChange({})
  }, [onPermissionChange, readonly])

  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldAlert className="h-10 w-10 text-gray-600 mb-3" />
        <p className="text-sm text-gray-500">No roles selected</p>
        <p className="text-xs text-gray-600 mt-1">
          Select roles above to view permissions
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Permissions Preview
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Merged from:{' '}
            {roles.map((r) => ROLE_INFO[r]?.label).join(' + ')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <motion.button
              type="button"
              onClick={handleResetAll}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg hover:bg-amber-500/15 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset All ({overrideCount})
            </motion.button>
          )}

          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-400" />
              Allowed
            </span>
            <span className="flex items-center gap-1">
              <X className="h-3 w-3 text-red-400/60" />
              Denied
            </span>
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3 text-amber-500" />
              Overridden
            </span>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300/70 space-y-0.5">
          <p>
            <strong>Boolean:</strong> If ANY role has access → merged = ✅
          </p>
          <p>
            <strong>Numbers:</strong> Highest value across roles wins
          </p>
          {!readonly && (
            <p>
              <strong>Override:</strong> Click the lock icon to customize
            </p>
          )}
        </div>
      </div>

      {/* Permission Groups */}
      <div className="space-y-3">
        {PERMISSION_GROUPS.map((group) => (
          <PermissionGroupSection
            key={group.label}
            group={group}
            roles={roles}
            merged={merged}
            customPermissions={customPermissions}
            onOverrideToggle={handleOverrideToggle}
            onValueChange={handleValueChange}
            onReset={handleReset}
            readonly={readonly}
            isMobile={isMobile}
          />
        ))}
      </div>
    </div>
  )
}

export default PermissionMatrix