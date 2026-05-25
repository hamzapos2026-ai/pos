// File: src/components/biller/BillNotes.jsx
// Purpose: Bill notes input component
// Features: Collapsible, character limit, keyboard shortcut hint
// Offline: Yes
// Dependencies: react, framer-motion, lucide-react

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { cn } from "../../utils/cn";

const MAX_CHARS = 120;

export const BillNotes = ({
  note = "",
  onNoteChange,
  disabled = false,
  isDark,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isExpanded) {
      textareaRef.current?.focus();
    }
  }, [isExpanded]);

  const handleChange = (e) => {
    const value = e.target.value.slice(0, MAX_CHARS);
    onNoteChange?.(value);
  };

  const toggleExpanded = () => {
    if (!disabled) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border p-2 text-xs",
      isDark ? "border-yellow-500/20 bg-white/5" : "border-yellow-200 bg-yellow-50/50"
    )}>
      <button
        onClick={toggleExpanded}
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1">
          <StickyNote size={12} className={isDark ? "text-yellow-400" : "text-yellow-600"} />
          <span className={cn(
            "font-medium",
            isDark ? "text-gray-300" : "text-gray-700"
          )}>
            Note
          </span>
          {note && (
            <span className={cn(
              "rounded-full px-1 text-[10px]",
              isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700"
            )}>
              {note.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronDown size={12} />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 overflow-hidden"
          >
            <textarea
              ref={textareaRef}
              value={note}
              onChange={handleChange}
              placeholder="Add note to bill..."
              disabled={disabled}
              rows={2}
              maxLength={MAX_CHARS}
              className={cn(
                "w-full resize-none rounded border px-2 py-1 text-xs",
                "focus:outline-none focus:ring-1 focus:ring-yellow-500",
                isDark
                  ? "border-white/10 bg-white/5 text-white placeholder-gray-500"
                  : "border-gray-300 bg-white text-gray-900"
              )}
            />
            <div className={cn(
              "mt-1 text-[10px]",
              isDark ? "text-gray-500" : "text-gray-600"
            )}>
              Ctrl+Alt+N to toggle • {MAX_CHARS - note.length} chars remaining
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BillNotes;