import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";

/**
 * Keyboard Shortcuts Help Modal
 */
const KeyboardShortcutsHelp = memo(({ isOpen, onClose, role = "biller" }) => {
  const shortcuts = {
    biller: [
      { key: "INSERT", action: "Start new bill" },
      { key: "ENTER", action: "Add item to bill" },
      { key: "F8", action: "Checkout & print" },
      { key: "ESC", action: "Go back" },
      { key: "MINUS (-)", action: "Delete last item" },
      { key: "DEL", action: "Clear all items" },
      { key: "↑↓", action: "Navigate items" },
      { key: "Page Up/Down", action: "Jump 5 rows" },
      { key: "HOME", action: "Focus customer phone" },
      { key: "Num+", action: "Focus quantity" },
      { key: "Num/", action: "Focus discount" },
      { key: "?", action: "Toggle this help" },
    ],
    cashier: [
      { key: "ENTER", action: "Complete payment" },
      { key: "ESC", action: "Cancel payment" },
      { key: "Tab", action: "Switch fields" },
    ],
    manager: [
      { key: "Ctrl+S", action: "Save report" },
      { key: "Ctrl+P", action: "Print report" },
    ],
  };

  const items = shortcuts[role] || shortcuts.biller;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#15120d] border border-yellow-500/30 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-yellow-500/20 sticky top-0 bg-[#15120d]">
              <h2 className="text-lg font-bold text-yellow-400">⌨️ Keyboard Shortcuts</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1 hover:bg-red-500/20 text-red-400 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Shortcuts Grid */}
            <div className="p-4 space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-yellow-500/10 transition"
                >
                  <kbd className="shrink-0 px-2.5 py-1 rounded font-mono text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                    {item.key}
                  </kbd>
                  <span className="text-sm text-gray-300 leading-tight pt-0.5">
                    {item.action}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-yellow-500/20 p-3 bg-yellow-500/5 text-xs text-gray-400 text-center">
              Press <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px] font-mono">?</kbd> to toggle
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

KeyboardShortcutsHelp.displayName = "KeyboardShortcutsHelp";
export default KeyboardShortcutsHelp;
