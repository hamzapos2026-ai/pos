// File: src/components/manager/StatCard.jsx
// Purpose: Animated stat card for manager dashboard
// Features: Count-up animation, trend indicator, icon, color themes

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs) => twMerge(clsx(inputs));

const COLOR_MAP = {
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/20', glow: 'shadow-amber-500/10' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', ring: 'ring-green-500/20', glow: 'shadow-green-500/10' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/20', glow: 'shadow-red-500/10' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', ring: 'ring-blue-500/20', glow: 'shadow-blue-500/10' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', ring: 'ring-purple-500/20', glow: 'shadow-purple-500/10' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', ring: 'ring-orange-500/20', glow: 'shadow-orange-500/10' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', ring: 'ring-cyan-500/20', glow: 'shadow-cyan-500/10' },
    pink: { bg: 'bg-pink-500/10', text: 'text-pink-400', ring: 'ring-pink-500/20', glow: 'shadow-pink-500/10' },
};

const StatCard = ({
    label,
    value = 0,
    prefix = '',
    suffix = '',
    icon: Icon,
    color = 'amber',
    trend = null,           // { value: 12.5, direction: 'up' | 'down' | 'neutral' }
    subtitle = '',
    onClick,
    loading = false,
    compact = false,
}) => {
    const [display, setDisplay] = useState(0);
    const palette = COLOR_MAP[color] || COLOR_MAP.amber;

    // Count-up animation
    useEffect(() => {
        if (loading) return;
        const target = Number(value) || 0;
        if (target === 0) { setDisplay(0); return; }

        let current = 0;
        const duration = 800;
        const steps = 30;
        const increment = target / steps;
        const stepTime = duration / steps;

        const interval = setInterval(() => {
            current += increment;
            if (current >= target) {
                setDisplay(target);
                clearInterval(interval);
            } else {
                setDisplay(Math.floor(current));
            }
        }, stepTime);

        return () => clearInterval(interval);
    }, [value, loading]);

    const formattedValue = typeof display === 'number'
        ? display.toLocaleString('en-PK', { maximumFractionDigits: 2 })
        : display;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={onClick ? { y: -2, transition: { duration: 0.15 } } : {}}
            onClick={onClick}
            className={cn(
                'rounded-2xl p-3 sm:p-4 border transition-all duration-300 relative overflow-hidden',
                onClick && 'cursor-pointer hover:-translate-y-1 hover:shadow-xl',
                'bg-[#0f0a05] border-[#2a1f0d]',
                compact ? 'p-3' : 'p-4',
            )}
        >
            <div className={cn(
                'absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br opacity-20',
                palette.bg,
            )} />

            <div className="relative">
                <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                    <p className={cn('text-[10px] sm:text-xs font-medium uppercase tracking-wider leading-tight text-gray-400')}>
                        {label}
                    </p>
                    {Icon && (
                        <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0', palette.text)}>
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                    )}
                </div>
                <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        {loading ? (
                            <div className="h-7 w-24 rounded-lg bg-[#1f1a0e] animate-pulse mt-1.5" />
                        ) : (
                            <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight break-words text-white">
                                {prefix}{formattedValue}{suffix}
                            </p>
                        )}
                        {subtitle && !loading && (
                            <p className="text-xs mt-1 text-gray-500">{subtitle}</p>
                        )}
                    </div>
                    {trend && !loading && (
                        <div className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold',
                            trend.direction === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        )}>
                            {trend.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(trend.value)}%
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default StatCard;