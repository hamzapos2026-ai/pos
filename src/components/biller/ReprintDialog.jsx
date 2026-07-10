// File: src/components/biller/ReprintDialog.jsx
// Purpose: Dialog for searching and reprinting bills by serial
// Features: Search, recent bills, select to reprint
// Offline: Yes
// Dependencies: react, framer-motion, lucide-react

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Receipt } from "lucide-react";
import { getRecentOrders } from "../../services/localBillService";
import { toast } from "react-hot-toast";
import { cn } from "../../utils/cn";

export const ReprintDialog = ({
  isOpen,
  onClose,
  storeId,
  billerId,
  isDark,
  onSelect,
}) => {
  const [serial, setSerial] = useState("");
  const [recentBills, setRecentBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    if (!isOpen) return;

    const loadRecent = async () => {
      const bills = await getRecentOrders(storeId, 10);
      setRecentBills(bills || []);
    };
    loadRecent();
  }, [isOpen, storeId]);

  const handleSearch = () => {
    if (!serial.trim()) return;
    onSelect?.(serial.trim());
    onClose();
  };

  const handleSelect = (selectedSerial) => {
    onSelect?.(selectedSerial);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, recentBills.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0 && recentBills[selectedIndex]) {
        handleSelect(recentBills[selectedIndex].serialNo);
      } else {
        handleSearch();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={cn(
              "w-full max-w-md rounded-xl border p-4",
              isDark ? "bg-[#1a1208] border-yellow-500/20" : "bg-white border-yellow-200"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className={cn(
                "font-bold",
                isDark ? "text-yellow-400" : "text-yellow-700"
              )}>
                Reprint Bill
              </h3>
              <button onClick={onClose} className="rounded p-1 hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter bill serial..."
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm",
                  isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-300"
                )}
                autoFocus
              />
              <button
                onClick={handleSearch}
                disabled={loading || !serial.trim()}
                className="rounded-lg bg-yellow-500 px-3 py-2 text-black hover:bg-yellow-400 disabled:opacity-50"
              >
                <Search size={14} />
              </button>
            </div>

            {/* Recent bills */}
            {recentBills.length > 0 && (
              <div className="mt-3">
                <p className={cn(
                  "mb-1 text-xs",
                  isDark ? "text-gray-500" : "text-gray-600"
                )}>
                  Recent bills:
                </p>
                <div className="max-h-40 overflow-y-auto">
                  {recentBills.map((bill, index) => (
                    <button
                      key={bill.localId || bill.billId}
                      onClick={() => handleSelect(bill.serialNo)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm",
                        index === selectedIndex
                          ? isDark
                            ? "bg-yellow-500/20"
                            : "bg-yellow-100"
                          : isDark
                            ? "hover:bg-white/5"
                            : "hover:bg-gray-50"
                      )}
                    >
                      <Receipt size={14} />
                      <span className="flex-1">
                        #{bill.serialNo || "----"}
                      </span>
                      <span className={cn(
                        "text-xs",
                        isDark ? "text-gray-500" : "text-gray-600"
                      )}>
                        Rs. {(bill.totalAmount || 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReprintDialog;