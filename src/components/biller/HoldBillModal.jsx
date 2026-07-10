// File: src/components/biller/HoldBillModal.jsx
// Purpose: Modal for holding and restoring bills
// Features: Hold current bill, restore held bills, delete held bills
// Offline: Yes
// Dependencies: react, framer-motion, lucide-react

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, PlayCircle, Clock } from "lucide-react";
import { getHeldBills, deleteHeldBill } from "../../services/holdBillService";
import { toast } from "react-hot-toast";
import { cn } from "../../utils/cn";

export const HoldBillModal = ({
  isOpen,
  onClose,
  currentBill,
  onHold,
  onRestore,
  billerId,
  storeId,
  isDark,
}) => {
  const [heldBills, setHeldBills] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const loadHeldBills = async () => {
      setLoading(true);
      const bills = await getHeldBills(billerId, storeId);
      setHeldBills(bills);
      setLoading(false);
    };
    
    loadHeldBills();
  }, [isOpen, billerId, storeId]);

  const handleHold = async () => {
    if (!currentBill || !currentBill.items?.length) {
      toast.error("No bill to hold");
      return;
    }
    
    const result = await onHold();
    if (result?.success) {
      // Refresh held bills
      const bills = await getHeldBills(billerId, storeId);
      setHeldBills(bills);
      onClose();
    }
  };

  const handleRestore = async (holdId) => {
    const result = await onRestore?.(holdId);
    if (result?.success) {
      const bills = await getHeldBills(billerId, storeId);
      setHeldBills(bills);
      onClose();
    }
  };

  const handleDelete = async (holdId) => {
    if (!confirm("Delete this held bill?")) return;
    await deleteHeldBill(holdId);
    const bills = await getHeldBills(billerId, storeId);
    setHeldBills(bills);
    toast.success("Held bill deleted");
  };

  const formatTime = (iso) => {
    if (!iso) return "--:--";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
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
                Hold Bill
              </h3>
              <button
                onClick={onClose}
                className={cn(
                  "rounded p-1",
                  isDark ? "hover:bg-white/10" : "hover:bg-gray-100"
                )}
              >
                <X size={16} />
              </button>
            </div>

            {/* Current bill summary */}
            {currentBill && (
              <div className={cn(
                "mb-3 rounded-lg p-3 text-sm",
                isDark ? "bg-yellow-500/10" : "bg-yellow-50"
              )}>
                <p className="font-medium mb-1">
                  {currentBill.items?.length || 0} item(s) • Rs. {(currentBill.totalAmount || 0).toLocaleString()}
                </p>
                <p className={cn(isDark ? "text-gray-400" : "text-gray-600")}>
                  {currentBill.customer?.name || "Walking Customer"}
                </p>
                <button
                  onClick={handleHold}
                  className={cn(
                    "mt-2 w-full rounded-lg py-2 font-medium",
                    "bg-yellow-500 text-black hover:bg-yellow-400"
                  )}
                >
                  Hold This Bill
                </button>
              </div>
            )}

            {/* Held bills list */}
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <p className="text-center py-4">Loading...</p>
              ) : heldBills.length === 0 ? (
                <p className={cn(
                  "py-4 text-center text-sm",
                  isDark ? "text-gray-500" : "text-gray-400"
                )}>
                  No held bills
                </p>
              ) : (
                <div className="space-y-2">
                  {heldBills.map((bill) => (
                    <div
                      key={bill.holdId}
                      className={cn(
                        "flex items-center justify-between rounded-lg p-2",
                        isDark ? "bg-white/5" : "bg-gray-50"
                      )}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {bill.items?.length || 0} item(s) • Rs. {(bill.totalAmount || 0).toLocaleString()}
                        </p>
                        <p className={cn(
                          "text-xs",
                          isDark ? "text-gray-500" : "text-gray-600"
                        )}>
                          {bill.customer?.name || "Walking Customer"} • {formatTime(bill.heldAt)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleRestore(bill.holdId)}
                          className={cn(
                            "rounded p-1",
                            isDark ? "text-green-400 hover:bg-green-500/20" : "text-green-600 hover:bg-green-100"
                          )}
                          title="Restore"
                        >
                          <PlayCircle size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(bill.holdId)}
                          className={cn(
                            "rounded p-1",
                            isDark ? "text-red-400 hover:bg-red-500/20" : "text-red-600 hover:bg-red-100"
                          )}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HoldBillModal;