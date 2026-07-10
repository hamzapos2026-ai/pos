// File: src/components/manager/ExportMenu.jsx
// Purpose: Dropdown menu for exporting to CSV/Excel/PDF

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, FileSpreadsheet, FileType, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { exportData } from '../../utils/exportUtils';
import { toast } from 'react-hot-toast';

const cn = (...inputs) => twMerge(clsx(inputs));

const ExportMenu = ({
    data = [],
    filename = 'export',
    pdfOptions = {},      // { title, subtitle, headers, rows, branchName, dateRange }
    formats = ['csv', 'excel', 'pdf'],
    disabled = false,
    label = 'Export',
    size = 'md',
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleExport = (format) => {
        if (!data || data.length === 0) {
            toast.error('No data to export');
            setOpen(false);
            return;
        }
        try {
            exportData(format, filename, data, pdfOptions);
            toast.success(`Exported as ${format.toUpperCase()}`, { icon: '📥' });
        } catch (err) {
            toast.error(`Export failed: ${err.message}`);
        }
        setOpen(false);
    };

    const formatOptions = [
        { value: 'csv', label: 'CSV File', icon: FileText, desc: 'Comma-separated values' },
        { value: 'excel', label: 'Excel File', icon: FileSpreadsheet, desc: 'Microsoft Excel (.xlsx)' },
        { value: 'pdf', label: 'PDF Report', icon: FileType, desc: 'Formatted PDF document' },
    ].filter(opt => formats.includes(opt.value));

    const sizeClasses = {
        sm: 'px-2.5 py-1.5 text-xs',
        md: 'px-3 py-2 text-xs',
        lg: 'px-4 py-2.5 text-sm',
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                disabled={disabled || data.length === 0}
                className={cn(
                    'flex items-center gap-1.5 rounded-xl border border-[#2a1f0d] bg-[#1a1208]',
                    'text-gray-400 hover:text-gray-200 hover:border-amber-500/30 transition-colors',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    sizeClasses[size],
                )}
            >
                <Download className="h-3.5 w-3.5" />
                <span>{label}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[#2a1f0d] bg-[#1a1208] shadow-2xl z-50 overflow-hidden"
                    >
                        <div className="p-1.5">
                            {formatOptions.map(opt => {
                                const Icon = opt.icon;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleExport(opt.value)}
                                        className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-[#0f0a04] transition-colors text-left"
                                    >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-gray-200">{opt.label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="border-t border-[#2a1f0d] px-3 py-2">
                            <p className="text-[10px] text-gray-600">
                                {data.length.toLocaleString()} records ready
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ExportMenu;