// File: src/components/manager/DataTable.jsx
// Purpose: Sortable table with client-side pagination (always) + optional per-page virtual scroll

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    ArrowUpDown, ArrowUp, ArrowDown, Inbox, Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import PaginationBar from '../ui/PaginationBar';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '../../utils/paginationConstants';

const cn = (...inputs) => twMerge(clsx(inputs));

const DataTable = ({
    columns = [],
    data = [],
    loading = false,
    emptyMessage = 'No data found',
    emptySubtext = '',
    onRowClick,
    rowKey = 'id',
    pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    paginate = true,
    enableVirtualization = false,
    virtualizationThreshold = 80,
    maxHeight = '600px',
    mobileCardRenderer,
    stickyHeader = true,
    striped = true,
    hoverable = true,
    defaultSortField = null,
    defaultSortDir = 'desc',
    getRowClassName,
    wrapperClassName = '',
    rowEstimateSize = 56,
    billsTableMode = false,
    paginationResetKey,
}) => {
    const [sortField, setSortField] = useState(defaultSortField);
    const [sortDir, setSortDir] = useState(defaultSortDir);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [isMobile, setIsMobile] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [paginationResetKey, data.length, pageSize]);

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

    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

    const pageSlice = useMemo(() => {
        if (!paginate) return sortedData;
        const start = (currentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, currentPage, pageSize, paginate]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [totalPages, currentPage]);

    const useVirtual = enableVirtualization
        && pageSlice.length > virtualizationThreshold
        && !isMobile;

    const displayData = pageSlice;

    const virtualizer = useVirtualizer({
        count: displayData.length,
        getScrollElement: () => containerRef.current,
        estimateSize: () => rowEstimateSize,
        overscan: 8,
        enabled: useVirtual,
    });

    const rowClass = useCallback((row, idx) => cn(
        billsTableMode ? 'bill-data-row' : 'border-b border-[#1a1208]',
        hoverable && 'hover:bg-[#0f0a04]/60 cursor-pointer transition-colors',
        striped && idx % 2 === 1 && !billsTableMode && 'bg-[#0f0a04]/30',
        getRowClassName?.(row, idx),
    ), [billsTableMode, hoverable, striped, getRowClassName]);

    const cellClass = billsTableMode
        ? 'px-2 py-2 text-xs text-gray-300 align-top'
        : 'px-3 py-2.5 text-sm text-gray-300';

    const handleSort = useCallback((field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
        setCurrentPage(1);
    }, [sortField]);

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
        return sortDir === 'asc'
            ? <ArrowUp className="h-3 w-3 text-amber-400" />
            : <ArrowDown className="h-3 w-3 text-amber-400" />;
    };

    const paginationFooter = paginate && sortedData.length > 0 ? (
        <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            totalItems={sortedData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
            }}
        />
    ) : null;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                <p className="text-sm text-gray-500">Loading...</p>
            </div>
        );
    }

    if (!sortedData.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0f0a04] border border-[#2a1f0d]">
                    <Inbox className="h-8 w-8 text-gray-600" />
                </div>
                <p className="text-sm font-medium text-gray-400 mb-1">{emptyMessage}</p>
                {emptySubtext && <p className="text-xs text-gray-600 max-w-xs mx-auto">{emptySubtext}</p>}
            </div>
        );
    }

    if (isMobile && mobileCardRenderer) {
        return (
            <div className="space-y-2">
                {displayData.map((row, idx) => (
                    <div key={row[rowKey] || idx} className={getRowClassName?.(row, idx)}>
                        {mobileCardRenderer(row, idx)}
                    </div>
                ))}
                {paginationFooter}
            </div>
        );
    }

    return (
        <div className={cn('rounded-xl border border-[#2a1f0d] bg-[#1a1208] overflow-hidden', wrapperClassName, billsTableMode && 'bills-table-wrap')}>

            {useVirtual ? (
                <div
                    ref={containerRef}
                    className="overflow-auto"
                    style={{ maxHeight }}
                >
                    <table className={cn('w-full min-w-full', billsTableMode && 'table-fixed')}>
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
                        <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                            {virtualizer.getVirtualItems().map(virtualRow => {
                                const row = displayData[virtualRow.index];
                                return (
                                    <tr
                                        key={row[rowKey] || virtualRow.index}
                                        data-index={virtualRow.index}
                                        ref={virtualizer.measureElement}
                                        onClick={() => onRowClick?.(row)}
                                        className={rowClass(row, virtualRow.index)}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            display: 'table',
                                            tableLayout: 'fixed',
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.field || col.label}
                                                className={cn(
                                                    cellClass,
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
                    <table className={cn('w-full min-w-full', billsTableMode && 'table-fixed')}>
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
                                        transition={{ delay: Math.min(idx * 0.015, 0.15), duration: 0.2 }}
                                        onClick={() => onRowClick?.(row)}
                                        className={rowClass(row, idx)}
                                    >
                                        {columns.map(col => (
                                            <td
                                                key={col.field || col.label}
                                                className={cn(
                                                    cellClass,
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

            {paginationFooter}
        </div>
    );
};

export default DataTable;
