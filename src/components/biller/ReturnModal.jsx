// File: src/components/biller/ReturnModal.jsx
// Purpose: Modal for processing bill returns
// Features: Search bill by serial, select items, process return
// Offline: Yes
// Dependencies: react, framer-motion, lucide-react

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, PackageX } from "lucide-react";
import { searchBillForReturn, processReturn } from "../../services/returnService";
import toast from "react-hot-toast";
import { cn } from "../../utils/cn";

export const ReturnModal = ({
  isOpen,
  onClose,
  billerId,
  billerName,
  storeId,
  canReturn,
  isDark,
}) => {
  const [serial, setSerial] = useState("");
  const [bill, setBill] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [returning, setReturning] = useState(false);

  const handleSearch = async () => {
    if (!serial.trim()) return;
    setLoading(true);
    const result = await searchBillForReturn(serial.trim(), storeId);
    if (result.success && result.data) {
      setBill(result.data);
      setSelectedItems(result.data.items?.map((i) => i.id) || []);
    } else {
      toast.error(result.error || "Bill not found");
    }
    setLoading(false);
  };

  const handleProcessReturn = async () => {
    if (!bill || selectedItems.length === 0) {
      toast.error("Select items to return");
      return;
    }

    const returnItems = bill.items.filter((i) => selectedItems.includes(i.id));
    const refundAmount = returnItems.reduce((sum, i) => {
      const discount = i.discountType === "percent" 
        ? (i.price * i.discount / 100) 
        : i.discount;
      return sum + (i.price - discount) * i.qty;
    }, 0);

    setReturning(true);
    const result = await processReturn({
      originalBillId: bill.billId || bill.localId,
      returnItems,
      refundAmount,
      reason: reason || "defective",
      billerId,
      storeId,
      customer: bill.customer,
    });

    if (result.success) {
      toast.success("Return processed");
      onClose();
      setBill(null);
      setSerial("");
      setReason("");
    } else {
      toast.error(result.error || "Return failed");
    }
    setReturning(false);
  };

  if (!canReturn) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <div className={cn(
              "rounded-xl border p-6 text-center",
              isDark ? "bg-[#1a1208] border-yellow-500/20" : "bg-white border-yellow-200"
            )}>
              <PackageX size={48} className="mx-auto mb-3 text-red-400" />
              <p className="font-medium">No return permission</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded-lg bg-yellow-500 text-black"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

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
              "w-full max-w-lg rounded-xl border p-4",
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
                Process Return
              </h3>
              <button onClick={onClose} className="rounded p-1 hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            {!bill && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    placeholder="Enter bill serial..."
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm",
                      isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-300"
                    )}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="rounded-lg bg-yellow-500 px-3 py-2 text-black hover:bg-yellow-400 disabled:opacity-50"
                  >
                    <Search size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Bill items */}
            {bill && (
              <div className="max-h-60 overflow-y-auto">
                <p className="mb-2 text-sm font-medium">
                  Select items to return:
                </p>
                <div className="space-y-1">
                  {bill.items?.map((item) => (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-center gap-2 rounded p-2",
                        isDark ? "hover:bg-white/5" : "hover:bg-gray-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems([...selectedItems, item.id]);
                          } else {
                            setSelectedItems(selectedItems.filter((id) => id !== item.id));
                          }
                        }}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm">{item.productName}</p>
                        <p className="text-xs text-gray-500">
                          Rs. {item.price} × {item.qty}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for return (optional)"
                  className={cn(
                    "mt-2 w-full rounded-lg border px-3 py-2 text-sm",
                    isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-300"
                  )}
                />

                <button
                  onClick={handleProcessReturn}
                  disabled={returning || selectedItems.length === 0}
                  className={cn(
                    "mt-3 w-full rounded-lg py-2 font-medium",
                    "bg-red-500 text-white hover:bg-red-400 disabled:opacity-50"
                  )}
                >
                  {returning ? "Processing..." : "Process Return"}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReturnModal;