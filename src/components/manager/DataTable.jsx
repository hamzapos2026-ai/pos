// File: src/components/manager/DataTable.jsx
// Purpose: High-performance data table with virtual scrolling
// Features: 10,000+ rows, sortable headers, mobile cards, custom renderers
// Dependencies: @tanstack/react-virtual, framer-motion

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
    Inbox, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs) => twMerge(clsx(inputs));

const DataTable = ({
    columns = [],
    data = [],
    loading = false,
    emptyMessage = 'No data found',
    emptySubtext = '',
    onRowClick,
    rowKey = 'id',
    pageSize = 50,
    enableVirtualization = true,
    virtualizationThreshold = 100,
    maxHeight = '600px',
    mobileCardRenderer,
    stickyHeader = true,
    striped = true,
    hoverable = true,
}) => {
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [isMobile, setIsMobile] = useState(false);
    const containerRef = useRef(null);

    // Responsive check
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Sort data
    const sortedData = useMemo(() => {
        if (!sortField) return data;
        const col = columns.find(c => c.field === sortField);
        if (!col) return data;

        return [...data].sort((a, b) => {
            const av = col.sortValue ? col.sortValue(a) : a[sortField];
            const bv = col.sortValue ? col.sortValue(b) : b[sortField];

            if (av === bv) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;

            const cmp = typeof av === 'string'
                ? av.localeCompare(bv)
                : av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data, sortField, sortDir, columns]);

    // Decide pagination vs virtualization
    const useVirtual = enableVirtualization && sortedData.length > virtualizationThreshold && !isMobile;
    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

    const displayData = useMemo(() => {
        if (useVirtual) return sortedData;
        const start = (currentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, currentPage, pageSize, useVirtual]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(1);
    }, [totalPages, currentPage]);

    // Virtualizer
    const virtualizer = useVirtualizer({
        count: displayData.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => 56,
        overscan: 10,
        enabled: useVirtual,
    });

    const handleSort = useCallback((field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    }, [sortField]);

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-600" />;
        return sortDir === 'asc'
            ? <ArrowUp className="h-3 w-3 text-amber-500" />
            : <ArrowDown className="h-3 w-3 text-amber-500" />;
    };

    const pageNumbers = useMemo(() => {
        const pages = [];
        const max = 5;
        if (totalPages <= max) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else if (currentPage <= 3) {
            for (let i = 1; i <= max; i++) pages.push(i);
        } else if (currentPage >= totalPages - 2) {
            for (let i = totalPages - max + 1; i <= totalPages; i++) pages.push(i);
        } else {
            for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
        }
        return pages;
    }, [totalPages, currentPage]);

    // Loading state
    if (loading) {
        return (
            <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading data…</p>
            </div>
        );
    }

    // Empty state
    if (!data || data.length === 0) {
        return (
            <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-16 text-center px-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f1a0e] mx-auto mb-4">
                    <Inbox className="h-7 w-7 text-gray-600" />
                </div>
                <p className="text-sm font-medium text-gray-400 mb-1">{emptyMessage}</p>
                {emptySubtext && <p className="text-xs text-gray-600 max-w-xs mx-auto">{emptySubtext}</p>}
            </div>
        );
    }

    // ────────────────────────────────────────────
    // MOBILE: Card view
    // ────────────────────────────────────────────
    if (isMobile && mobileCardRenderer) {
        return (
            <div className="space-y-2">
                {displayData.map((row, idx) => (
                    <div key={row[rowKey] || idx}>
                        {mobileCardRenderer(row, idx)}
                    </div>
                ))}
                {!useVirtual && totalPages > 1 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageNumbers={pageNumbers}
                        onChange={setCurrentPage}
                        total={sortedData.length}
                        pageSize={pageSize}
                    />
                )}
            </div>
        );
    }

    // ────────────────────────────────────────────
    // DESKTOP: Table view
    // ────────────────────────────────────────────
    return (
        <div className="rounded-xl border border-[#2a1f0d] bg-[#1a1208] overflow-hidden">

            {/* Virtual scroll container */}
            {useVirtual ? (
                <div
                    ref={containerRef}
                    className="overflow-auto"
                    style={{ maxHeight }}
                >
                    <table className="w-full min-w-full">
                        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
                            <tr className="bg-[#0f0a04] border-b border-[#2a1f0d]">
                                {columns.map(col => (
                                    <th
                                        key={col.field || col.label}
                                        className={cn(
                                            'px-3 py-3 text-left whitespace-nowrap',
                                            col.align === 'right' && 'text-right',
                                            col.align === 'center' && 'text-center',
                                            col.width && `w-[${col.width}]`,
                                        )}
                                        style={{ width: col.width }}
                                    >
                                        {col.sortable !== false && col.field ? (
                                            <button
                                                type="button"
                                                onClick={() => handleSort(col.field)}
                                                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
                                            >
                                                {col.label}
                                                <SortIcon field={col.field} />
                                            </button>
                                        ) : (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                                {col.label}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                            {virtualizer.getVirtualItems().map(virtualRow => {
                                const row = displayData[virtualRow.index];
                                return (
                                    <tr
                                        key={row[rowKey] || virtualRow.index}
                                        onClick={() => onRowClick?.(row)}
                                        className={cn(
                                            'border-b border-[#1a1208] transition-colors',
                                            striped && virtualRow.index % 2 === 1 && 'bg-[#0f0a04]/30',
                                            hoverable && 'hover:bg-[#0f0a04]/60',
                                            onRowClick && 'cursor-pointer',
                                        )}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: virtualRow.size,
                                            transform: `translateY(${virtualRow.start}px)`,
                                            display: 'table',
                                            tableLayout: 'fixed',
                                        }}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.field || col.label}
                                                className={cn(
                                                    'px-3 py-3 text-sm text-gray-300',
                                                    col.align === 'right' && 'text-right',
                                                    col.align === 'center' && 'text-center',
                                                    col.cellClass,
                                                )}
                                                style={{ width: col.width }}
                                            >
                                                {col.render ? col.render(row) : row[col.field]}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-full">
                        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
                            <tr className="bg-[#0f0a04] border-b border-[#2a1f0d]">
                                {columns.map(col => (
                                    <th
                                        key={col.field || col.label}
                                        className={cn(
                                            'px-3 py-3 text-left whitespace-nowrap',
                                            col.align === 'right' && 'text-right',
                                            col.align === 'center' && 'text-center',
                                        )}
                                        style={{ width: col.width }}
                                    >
                                        {col.sortable !== false && col.field ? (
                                            <button
                                                type="button"
                                                onClick={() => handleSort(col.field)}
                                                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
                                            >
                                                {col.label}
                                                <SortIcon field={col.field} />
                                            </button>
                                        ) : (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                                {col.label}
                                            </span>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence mode="popLayout">
                                {displayData.map((row, idx) => (
                                    <motion.tr
                                        key={row[rowKey] || idx}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ delay: idx * 0.015, duration: 0.2 }}
                                        onClick={() => onRowClick?.(row)}
                                        className={cn(
                                            'border-b border-[#1a1208] transition-colors',
                                            striped && idx % 2 === 1 && 'bg-[#0f0a04]/30',
                                            hoverable && 'hover:bg-[#0f0a04]/60',
                                            onRowClick && 'cursor-pointer',
                                        )}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.field || col.label}
                                                className={cn(
                                                    'px-3 py-3 text-sm text-gray-300',
                                                    col.align === 'right' && 'text-right',
                                                    col.align === 'center' && 'text-center',
                                                    col.cellClass,
                                                )}
                                                style={{ width: col.width }}
                                            >
                                                {col.render ? col.render(row) : row[col.field]}
                                            </td>
                                        ))}
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination (only when not virtualized) */}
            {!useVirtual && totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageNumbers={pageNumbers}
                    onChange={setCurrentPage}
                    total={sortedData.length}
                    pageSize={pageSize}
                />
            )}

            {/* Virtual scroll info */}
            {useVirtual && (
                <div className="border-t border-[#2a1f0d] px-3 py-2 text-xs text-gray-500 text-center">
                    Showing {displayData.length.toLocaleString()} rows (virtual scroll enabled)
                </div>
            )}
        </div>
    );
};

// ────────────────────────────────────────────
// Pagination Component
// ────────────────────────────────────────────
const Pagination = ({ currentPage, totalPages, pageNumbers, onChange, total, pageSize }) => (
    <div className="flex items-center justify-between border-t border-[#2a1f0d] px-3 py-3">
        <span className="text-xs text-gray-500">
            {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()}
        </span>

        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30"
            >
                <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="hidden sm:flex items-center gap-1">
                {pageNumbers.map(page => (
                    <button
                        key={page}
                        type="button"
                        onClick={() => onChange(page)}
                        className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all',
                            currentPage === page
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-[#0f0a04]',
                        )}
                    >
                        {page}
                    </button>
                ))}
            </div>

            <span className="sm:hidden text-xs text-gray-500 px-2">
                {currentPage}/{totalPages}
            </span>

            <button
                type="button"
                onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 rounded-lg border border-[#2a1f0d] bg-[#0a0805] px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30"
            >
                <ChevronRight className="h-3.5 w-3.5" />
            </button>
        </div>
    </div>
);

export default DataTable;