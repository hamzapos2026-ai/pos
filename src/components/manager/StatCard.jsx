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
                'relative overflow-hidden rounded-xl border border-[#2a1f0d]',
                'bg-gradient-to-br from-[#1a1208] to-[#12100a]',
                'transition-all duration-200',
                onClick && 'cursor-pointer hover:border-amber-500/30',
                compact ? 'p-3' : 'p-4',
            )}
        >
            {/* Decorative gradient blob */}
            <div className={cn(
                'absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl opacity-30',
                palette.bg,
            )} />

            <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className={cn(
                        'text-[10px] sm:text-xs font-medium uppercase tracking-wider text-gray-500 truncate',
                    )}>
                        {label}
                    </p>

                    {loading ? (
                        <div className="h-7 w-24 rounded-lg bg-[#1f1a0e] animate-pulse mt-1.5" />
                    ) : (
                        <p className={cn(
                            'font-bold text-gray-100 mt-1 truncate',
                            compact ? 'text-lg' : 'text-xl sm:text-2xl',
                        )}>
                            {prefix}{formattedValue}{suffix}
                        </p>
                    )}

                    {subtitle && !loading && (
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{subtitle}</p>
                    )}

                    {trend && !loading && (
                        <div className={cn(
                            'inline-flex items-center gap-1 mt-2 text-[10px] font-medium',
                            trend.direction === 'up' && 'text-green-400',
                            trend.direction === 'down' && 'text-red-400',
                            trend.direction === 'neutral' && 'text-gray-500',
                        )}>
                            {trend.direction === 'up' && <TrendingUp className="h-3 w-3" />}
                            {trend.direction === 'down' && <TrendingDown className="h-3 w-3" />}
                            {trend.direction === 'neutral' && <Minus className="h-3 w-3" />}
                            {Math.abs(trend.value)}% {trend.label || 'vs last'}
                        </div>
                    )}
                </div>

                {Icon && (
                    <div className={cn(
                        'flex shrink-0 items-center justify-center rounded-xl ring-1',
                        palette.bg, palette.ring,
                        compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11',
                    )}>
                        <Icon className={cn(palette.text, compact ? 'h-4 w-4' : 'h-5 w-5')} />
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default StatCard;