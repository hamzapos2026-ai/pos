// File: src/components/biller/CreditWarning.jsx
// Purpose: Show warning when customer has outstanding balance
// Features: Warning levels based on amount, auto-hide
// Offline: Yes
// Dependencies: react, framer-motion

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { cn } from "../../utils/cn";

const getWarningLevel = (amount, limit) => {
  if (!amount || amount <= 0) return null;
  const ratio = amount / (limit || 1);
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.5) return "warning";
  return "info";
};

export const CreditWarning = ({
  customer,
  limit = 10000,
  isDark,
}) => {
  const [visible, setVisible] = useState(false);
  const [outstanding, setOutstanding] = useState(0);

  useEffect(() => {
    if (customer?.credit) {
      const newOutstanding = customer.credit.outstanding || 0;
      setOutstanding(newOutstanding);
      setVisible(true);
      
      const level = getWarningLevel(newOutstanding, limit);
      if (level === "info") {
        const timer = setTimeout(() => setVisible(false), 10000);
        return () => clearTimeout(timer);
      }
    }
  }, [customer, limit]);

  const level = getWarningLevel(outstanding, limit);
  if (!level || !visible) return null;

  const colors = {
    info: isDark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600",
    warning: isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600",
    danger: isDark ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-600",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
          colors[level]
        )}
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={14} />
          <span>
            Outstanding: Rs. {outstanding.toLocaleString()} / Limit: Rs. {limit.toLocaleString()}
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="rounded p-0.5 hover:bg-white/10"
        >
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreditWarning;