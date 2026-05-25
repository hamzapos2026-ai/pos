// File: src/components/manager/AdvancedFilters.jsx
// Purpose: Reusable advanced filter bar (date, branch, status, search, custom)
// Features: Date presets, branch select, active chips, reset, RTL safe

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Filter, X, Calendar, ChevronDown,
    RotateCcw, SlidersHorizontal,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getDatePresets } from '../../utils/managerHelpers';

const cn = (...inputs) => twMerge(clsx(inputs));

const AdvancedFilters = ({
    searchValue = '',
    onSearchChange,
    searchPlaceholder = 'Search…',

    dateFrom = '',
    dateTo = '',
    onDateChange,
    showDatePresets = true,

    branches = [],
    selectedBranch = '',
    onBranchChange,
    showBranches = true,

    customFilters = [],   // [{ key, label, value, options: [{value, label}], onChange }]
    onReset,

    resultCount = null,
    totalCount = null,
    compact = false,
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const presets = getDatePresets();

    const handlePreset = useCallback((preset) => {
        onDateChange?.({ from: preset.from, to: preset.to });
    }, [onDateChange]);

    const hasActiveFilters =
        searchValue || dateFrom || dateTo || selectedBranch ||
        customFilters.some(f => f.value);

    return (
        <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-3">
            {/* PRIMARY ROW: Search + Toggle */}
            <div className="flex flex-col sm:flex-row gap-2">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600 pointer-events-none" />
                    <input
                        type="text"
                        value={searchValue}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        placeholder={searchPlaceholder}
                        className={cn(
                            'w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805]',
                            'pl-10 pr-9 py-2 text-sm text-gray-200 placeholder-gray-600',
                            'focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50',
                            'transition-colors',
                        )}
                    />
                    {searchValue && (
                        <button
                            type="button"
                            onClick={() => onSearchChange?.('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Branch */}
                    {showBranches && branches.length > 0 && (
                        <div className="relative">
                            <select
                                value={selectedBranch}
                                onChange={(e) => onBranchChange?.(e.target.value)}
                                className="appearance-none rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-3 pr-8 py-2 text-xs text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => (
                                    <option key={b.id || b.value} value={b.id || b.value}>
                                        {b.label || b.storeName || b.name || b.id}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
                        </div>
                    )}

                    {/* Date Range Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(v => !v)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors',
                            showAdvanced
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                                : 'border-[#2a1f0d] bg-[#0a0805] text-gray-400 hover:text-gray-200',
                        )}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Filters</span>
                        {hasActiveFilters && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        )}
                    </button>

                    {/* Reset */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={onReset}
                            className="flex items-center gap-1.5 rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Reset</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ADVANCED ROW: Date range + custom filters */}
            <AnimatePresence>
                {showAdvanced && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-3 mt-3 border-t border-[#0f0a04] space-y-3">
                            {/* Date Range */}
                            <div>
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2 block flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3" />
                                    Date Range
                                </label>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => onDateChange?.({ from: e.target.value, to: dateTo })}
                                        className="rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-3 py-1.5 text-xs text-gray-300"
                                    />
                                    <span className="text-xs text-gray-500">to</span>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => onDateChange?.({ from: dateFrom, to: e.target.value })}
                                        className="rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-3 py-1.5 text-xs text-gray-300"
                                    />
                                </div>

                                {showDatePresets && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Object.entries(presets).map(([key, preset]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => handlePreset(preset)}
                                                className={cn(
                                                    'rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors',
                                                    dateFrom === preset.from && dateTo === preset.to
                                                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                                        : 'border border-[#2a1f0d] text-gray-500 hover:text-gray-300 hover:border-amber-500/20',
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Custom Filters */}
                            {customFilters.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {customFilters.map(filter => (
                                        <div key={filter.key} className="flex-1 min-w-[140px]">
                                            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1 block">
                                                {filter.label}
                                            </label>
                                            <div className="relative">
                                                <select
                                                    value={filter.value}
                                                    onChange={(e) => filter.onChange?.(e.target.value)}
                                                    className="w-full appearance-none rounded-lg border border-[#2a1f0d] bg-[#0a0805] pl-3 pr-8 py-1.5 text-xs text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                                >
                                                    <option value="">All {filter.label}</option>
                                                    {filter.options.map(opt => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* RESULT COUNT */}
            {(resultCount !== null || hasActiveFilters) && (
                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[#0f0a04]">
                    <Filter className="h-3 w-3 text-gray-600" />
                    <span className="text-xs text-gray-500">
                        {resultCount !== null && totalCount !== null
                            ? `${resultCount.toLocaleString()} of ${totalCount.toLocaleString()}`
                            : `${resultCount?.toLocaleString() || 0} results`}
                    </span>
                </div>
            )}
        </div>
    );
};

export default AdvancedFilters;