// File: src/components/biller/BillerStatsWidget.jsx
// Purpose: Display biller statistics
// Features: Today's bill count, total amount, avg bill, session duration
// Offline: Yes
// Dependencies: react, framer-motion, lucide-react, ../services/localBillService

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Clock } from "lucide-react";
import { getTodayBillerStats } from "../../services/localBillService";
import { cn } from "../../utils/cn";

const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
};

export const BillerStatsWidget = ({
  billerId,
  storeId,
  loginTime,
  isDark,
}) => {
  const [stats, setStats] = useState({ billCount: 0, totalAmount: 0, avgBill: 0 });
  const [sessionStart] = useState(() => new Date());
  const [sessionDisplay, setSessionDisplay] = useState('0:00');

  // Update session display every minute
  useEffect(() => {
    const update = () => {
      const ms    = Date.now() - sessionStart.getTime();
      const h     = Math.floor(ms / 3_600_000);
      const m     = Math.floor((ms % 3_600_000) / 60_000);
      setSessionDisplay(`${h}:${String(m).padStart(2, '0')}`);
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [sessionStart]);

  // Load today's stats, refresh every 30s
  useEffect(() => {
    const loadStats = async () => {
      const data = await getTodayBillerStats(billerId, storeId);
      if (data) setStats(data);
    };
    loadStats();
    const interval = setInterval(loadStats, 30_000);
    return () => clearInterval(interval);
  }, [billerId, storeId]);

  // Listen for local order broadcasts to update stats immediately
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('aone_pos_orders');
    const handler = async (ev) => {
      try {
        const data = ev?.data || ev;
        if (!data) return;
        // react to new local orders or sync completion
        if (['NEW_LOCAL_ORDER', 'ORDER_SAVED_OFFLINE', 'SYNC_COMPLETE', 'SYNC_BATCH_COMPLETE'].includes(data.type)) {
          const updated = await getTodayBillerStats(billerId, storeId);
          if (updated) setStats(updated);
        }
      } catch { /* ignore */ }
    };
    ch.addEventListener('message', handler);
    return () => { ch.removeEventListener('message', handler); ch.close(); };
  }, [billerId, storeId]);


  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border p-2 text-xs",
        isDark ? "border-yellow-500/20 bg-white/5" : "border-yellow-200 bg-yellow-50/50"
      )}
    >
      <div className="flex items-center gap-1 mb-1">
        <TrendingUp size={12} className={isDark ? "text-yellow-400" : "text-yellow-600"} />
        <span className={cn(
          "font-medium",
          isDark ? "text-gray-300" : "text-gray-700"
        )}>
          Today's Stats
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <p className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-600")}>
            Bills
          </p>
          <p className="font-bold">{stats.billCount}</p>
        </div>
        <div>
          <p className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-600")}>
            Amount
          </p>
          <p className="font-bold">Rs. {stats.totalAmount.toLocaleString()}</p>
        </div>
        <div className="col-span-2">
          <p className={cn("text-[10px]", isDark ? "text-gray-500" : "text-gray-600")}>
            Avg Bill
          </p>
          <p className="font-bold">Rs. {Math.round(stats.avgBill).toLocaleString()}</p>
        </div>
      </div>
      <div className="mt-1 pt-1 border-t border-white/10">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span className={cn("text-[10px]", isDark ? "text-gray-400" : "text-gray-600")}>
            Session: {sessionDisplay}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default BillerStatsWidget;