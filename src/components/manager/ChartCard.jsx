// File: src/components/manager/ChartCard.jsx
// Purpose: Wrapper for Chart.js charts with consistent styling
// Dependencies: chart.js, react-chartjs-2

import React from 'react';
import { motion } from 'framer-motion';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, ArcElement, Title, Tooltip, Legend, Filler,
);

const cn = (...inputs) => twMerge(clsx(inputs));

// Default options for dark theme
const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom',
            labels: {
                color: '#a8a29e',
                font: { size: 11 },
                boxWidth: 12,
                padding: 12,
            },
        },
        tooltip: {
            backgroundColor: '#1a1208',
            titleColor: '#f5f5f4',
            bodyColor: '#a8a29e',
            borderColor: '#2a1f0d',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
        },
    },
    scales: {
        x: {
            ticks: { color: '#78716c', font: { size: 10 } },
            grid: { color: '#1a1208' },
        },
        y: {
            ticks: { color: '#78716c', font: { size: 10 } },
            grid: { color: '#1a1208' },
        },
    },
};

// Color palette (jewelry theme)
export const CHART_COLORS = {
    amber: 'rgba(245, 158, 11, 0.7)',
    green: 'rgba(34, 197, 94, 0.7)',
    red: 'rgba(239, 68, 68, 0.7)',
    blue: 'rgba(59, 130, 246, 0.7)',
    purple: 'rgba(168, 85, 247, 0.7)',
    orange: 'rgba(249, 115, 22, 0.7)',
    cyan: 'rgba(6, 182, 212, 0.7)',
    pink: 'rgba(236, 72, 153, 0.7)',
};

export const CHART_COLORS_SOLID = {
    amber: 'rgba(245, 158, 11, 1)',
    green: 'rgba(34, 197, 94, 1)',
    red: 'rgba(239, 68, 68, 1)',
    blue: 'rgba(59, 130, 246, 1)',
    purple: 'rgba(168, 85, 247, 1)',
    orange: 'rgba(249, 115, 22, 1)',
    cyan: 'rgba(6, 182, 212, 1)',
    pink: 'rgba(236, 72, 153, 1)',
};

const ChartCard = ({
    title,
    subtitle,
    type = 'line',          // 'line' | 'bar' | 'doughnut' | 'pie'
    data,
    options = {},
    height = 280,
    loading = false,
    empty = false,
    emptyMessage = 'No data to display',
    action,
    className,
}) => {
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        plugins: {
            ...defaultOptions.plugins,
            ...(options.plugins || {}),
        },
        scales: type === 'doughnut' || type === 'pie' ? undefined : {
            ...defaultOptions.scales,
            ...(options.scales || {}),
        },
    };

    const renderChart = () => {
        if (!data) return null;
        switch (type) {
            case 'bar': return <Bar data={data} options={mergedOptions} />;
            case 'doughnut': return <Doughnut data={data} options={mergedOptions} />;
            case 'pie': return <Pie data={data} options={mergedOptions} />;
            default: return <Line data={data} options={mergedOptions} />;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'rounded-xl border border-[#2a1f0d] bg-[#1a1208] p-4',
                className,
            )}
        >
            {(title || action) && (
                <div className="flex items-center justify-between mb-3">
                    <div>
                        {title && (
                            <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
                        )}
                        {subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}

            <div style={{ height }} className="relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1a1208]/80 backdrop-blur-sm rounded-lg z-10">
                        <div className="h-8 w-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                )}
                {empty || !data ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-sm text-gray-600">{emptyMessage}</p>
                    </div>
                ) : (
                    renderChart()
                )}
            </div>
        </motion.div>
    );
};

export default ChartCard;