/** Shared date preset chips — Cash Flow, Reports, Bills, Activity Logs */

export const getDatePresets = () => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return {
    today: { label: 'Today', from: today },
    yesterday: { label: 'Yesterday', from: yesterday, to: today },
    week: { label: '7 Days', from: weekAgo },
    month: { label: '30 Days', from: monthAgo },
    all: { label: 'All Time', from: new Date(0) },
  };
};

export const resolveDatePresetRange = (preset, customFrom = '', customTo = '') => {
  if (preset === 'custom' && customFrom) {
    const from = new Date(customFrom);
    from.setHours(0, 0, 0, 0);
    const to = customTo
      ? new Date(new Date(customTo).getTime() + 86400000 - 1)
      : new Date();
    return { from, to };
  }
  const presets = getDatePresets();
  const p = presets[preset] || presets.month;
  return { from: p.from, to: p.to || new Date() };
};

/** Map preset key → Reports/Bills client filter key */
export const presetToClientDateFilter = (preset) => {
  if (preset === 'today') return 'today';
  if (preset === 'week') return 'week';
  if (preset === 'month') return 'month';
  return 'all';
};

/** yyyy-MM-dd for <input type="date" /> */
export const toDateInputValue = (d) => {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
