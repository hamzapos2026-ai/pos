// src/components/cashier/FilterTabs.jsx
// ✅ PREMIUM v3 — Smooth animations, gradient active state

import React from "react";
import { motion } from "framer-motion";
import { Receipt, Clock, XCircle, CheckCircle } from "lucide-react";
import { cn } from "../../utils/cn";
import { useSettings } from "../../context/SettingsContext";

const TABS = [
  { key: "all", label: "All", icon: Receipt, color: "blue", gradient: "from-blue-500 to-blue-600" },
  { key: "pending", label: "Pending", icon: Clock, color: "amber", gradient: "from-amber-500 to-orange-500" },
  { key: "cancelled", label: "Cancelled", icon: XCircle, color: "red", gradient: "from-red-500 to-rose-500" },
];

const FilterTabs = ({ activeTab, setActiveTab, onChange, stats = {}, isDark }) => {
  const { getSetting } = useSettings();
  const disableOffline = getSetting('disableCashierOffline', false);
  const tabs = disableOffline ? TABS.filter(t => t.key !== 'cancelled') : TABS;

  const handleChange = (key) => {
    if (typeof setActiveTab === "function") setActiveTab(key);
    else if (typeof onChange === "function") onChange(key);
  };

  const containerBg = isDark
    ? "bg-[#13101a]/60 backdrop-blur-xl border border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.03)]"
    : "bg-white/70 backdrop-blur-xl border border-black/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.5)]";

  const inactiveText = isDark ? "text-gray-400" : "text-gray-600";

  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.1 }}
      className={`flex gap-1 p-1 rounded-xl ${containerBg} overflow-x-auto`}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const Icon = tab.icon;
        const count = stats[tab.key] || 0;

        return (
          <motion.button
            key={tab.key}
            whileHover={{ scale: active ? 1 : 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleChange(tab.key)}
            className={cn(
              "relative flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all",
              active ? "text-white" : `${inactiveText} hover:bg-amber-500/5`
            )}
          >
            {active && (
              <motion.div
                layoutId="activeTab"
                className={`absolute inset-0 rounded-lg bg-gradient-to-r ${tab.gradient} shadow-[0_4px_15px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]`}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0 rounded-full font-extrabold ${
                active
                  ? "bg-white/25 text-white"
                  : isDark
                    ? "bg-white/[0.06] text-gray-400"
                    : "bg-black/[0.06] text-gray-700"
              }`}>
                {count}
              </span>
            </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
};

export default FilterTabs;