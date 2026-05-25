// File: src/components/manager/ConfirmDialog.jsx
// Purpose: Reusable confirmation modal

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs) => twMerge(clsx(inputs));

const COLOR_MAP = {
    red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', hover: 'hover:bg-red-500/20' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', hover: 'hover:bg-green-500/20' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', hover: 'hover:bg-blue-500/20' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', hover: 'hover:bg-orange-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', hover: 'hover:bg-amber-500/20' },
};

const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    subMessage,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmIcon: ConfirmIcon = CheckCircle,
    confirmColor = 'amber',
    loading = false,
    icon: HeaderIcon = AlertTriangle,
    inputs = [],          // Optional: [{ key, label, type, placeholder, value, onChange }]
}) => {
    const colors = COLOR_MAP[confirmColor] || COLOR_MAP.amber;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 16 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                        className="w-full max-w-sm rounded-2xl border border-[#2a1f0d] bg-[#12100a] p-5 shadow-2xl"
                    >
                        <div className="text-center">
                            <div className={cn(
                                'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl mb-4',
                                colors.bg,
                            )}>
                                <HeaderIcon className={cn('h-7 w-7', colors.text)} />
                            </div>
                            <h3 className="text-base font-bold text-gray-100 mb-2">{title}</h3>
                            {message && <p className="text-sm text-gray-400 leading-relaxed">{message}</p>}
                            {subMessage && (
                                <p className="text-xs text-gray-600 mt-2">{subMessage}</p>
                            )}
                        </div>

                        {inputs.length > 0 && (
                            <div className="mt-4 space-y-3">
                                {inputs.map(input => (
                                    <div key={input.key}>
                                        <label className="text-xs text-gray-500 mb-1 block">{input.label}</label>
                                        <input
                                            type={input.type || 'text'}
                                            value={input.value}
                                            onChange={(e) => input.onChange(e.target.value)}
                                            placeholder={input.placeholder}
                                            className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-3 mt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-40"
                            >
                                {cancelText}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={loading}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5',
                                    'text-sm font-semibold transition-all border',
                                    colors.bg, colors.text, colors.border, colors.hover,
                                    'disabled:opacity-40',
                                )}
                            >
                                {loading
                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                                    : <><ConfirmIcon className="h-4 w-4" /> {confirmText}</>
                                }
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmDialog;