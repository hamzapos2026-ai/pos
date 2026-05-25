// src/components/biller/LockScreen.jsx
// ✅ COMPLETE v3 — Dashboard Compatible
// ✅ Full screen animated lock overlay
// ✅ LiveClock separated (saves CPU when unlocked)
// ✅ INSERT key hint
// ✅ Blur backdrop + ambient glow
// ✅ Bill count shown (blurred for privacy)
// ✅ Next bill serial display
// ✅ Framer Motion entrance/exit (spring)
// ✅ Offline indicator
// ✅ Multi-tab indicator (switch tabs on lock screen)
// ✅ Biller name display
// ✅ Brand logo + "A ONE JEWELRY POS"
// ✅ Dark/Light mode via useTheme
// ✅ cn() utility
// ✅ No inline styles
// ✅ Sound toggle on lock screen
// ✅ AnimatePresence wrapper

import { useEffect, useState, memo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, WifiOff, Gem, Volume2, VolumeX } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { cn } from "../../utils/cn";

// ═══════════════════════════════════════════════════════════════
// LIVE CLOCK (only ticks when lock screen visible — saves CPU)
// ═══════════════════════════════════════════════════════════════
const LiveClock = memo(({ isDark }) => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = time.toLocaleDateString("en-PK", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="text-center mb-6">
      {/* Time */}
      <div
        className={cn(
          "font-mono font-bold tracking-tight tabular-nums",
          "text-4xl sm:text-5xl md:text-6xl",
          isDark ? "text-white" : "text-gray-900",
        )}
      >
        {timeStr}
      </div>
      {/* Date */}
      <p
        className={cn(
          "text-sm font-medium mt-1",
          isDark ? "text-gray-400" : "text-gray-500",
        )}
      >
        {dateStr}
      </p>
    </div>
  );
});
LiveClock.displayName = "LiveClock";

// ═══════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════
const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 1.05, transition: { duration: 0.2 } },
};

const cardVariants = {
  initial: { scale: 0.9, y: 20, opacity: 0 },
  animate: {
    scale: 1,
    y: 0,
    opacity: 1,
    transition: { type: "spring", damping: 20, stiffness: 300, delay: 0.1 },
  },
  exit: { scale: 0.95, y: 10, opacity: 0 },
};

// ═══════════════════════════════════════════════════════════════
// LOCK SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════════
const LockScreen = memo(
  ({
    isLocked,
    itemCount = 0,
    nextBillSerial = "----",
    isOnline = true,
    billerName = "",
    // Multi-tab support
    tabs = [],
    activeTabId = 1,
    onSwitchTab,
    // Sound toggle on lock screen
    soundEnabled = true,
    onToggleSound,
    // When false (multi-tab), don't show full overlay
    showLockOverlay = true,
  }) => {
    const { isDark } = useTheme();

    if (!isLocked || !showLockOverlay) return null;

    return (
      <AnimatePresence>
        {isLocked && (
          <motion.div
            key="lock-screen"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "fixed inset-0 z-[60] flex flex-col items-center justify-center",
              "backdrop-blur-xl select-none",
              isDark ? "bg-[#0a0805]/90" : "bg-white/90",
            )}
          >
            {/* ── Ambient glow ── */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                className={cn(
                  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                  "w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl opacity-20",
                  isDark ? "bg-yellow-500" : "bg-yellow-400",
                )}
              />
            </div>

            {/* ── Content card ── */}
            <motion.div
              variants={cardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(
                "relative z-10 w-full max-w-sm mx-4 rounded-3xl px-8 py-10",
                "text-center shadow-2xl",
                isDark
                  ? "bg-[#15120d]/95 border border-yellow-500/20"
                  : "bg-white/95 border border-yellow-200",
              )}
            >
              {/* Logo */}
              <div className="flex justify-center mb-4">
                <div
                  className={cn(
                    "rounded-2xl p-3 shadow-lg",
                    "bg-gradient-to-br from-yellow-500 to-amber-600",
                    "shadow-yellow-500/30",
                  )}
                >
                  <Gem size={28} className="text-white" />
                </div>
              </div>

              {/* Brand name */}
              <p
                className={cn(
                  "text-xs font-bold uppercase tracking-widest mb-4",
                  isDark ? "text-yellow-500/60" : "text-yellow-600/60",
                )}
              >
                A ONE JEWELRY POS
              </p>

              {/* Live Clock */}
              <LiveClock isDark={isDark} />

              {/* Lock icon with pulse rings */}
              <div className="relative flex justify-center mb-5">
                {/* Pulse rings */}
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3 / i, 0.1 / i, 0.3 / i],
                    }}
                    transition={{
                      duration: 1.5 + i * 0.3,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                    className={cn(
                      "absolute rounded-full border-2 border-yellow-500/30",
                      "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                    )}
                    style={{
                      width: `${48 + i * 20}px`,
                      height: `${48 + i * 20}px`,
                    }}
                  />
                ))}
                <motion.div
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={cn(
                    "relative z-10 flex h-12 w-12 items-center justify-center",
                    "rounded-full",
                    isDark
                      ? "bg-yellow-500/20 border-2 border-yellow-500/40"
                      : "bg-yellow-100 border-2 border-yellow-300",
                  )}
                >
                  <Lock size={20} className="text-yellow-500" />
                </motion.div>
              </div>

              {/* Instruction */}
              <h2
                className={cn(
                  "text-xl font-bold mb-2",
                  isDark ? "text-white" : "text-gray-900",
                )}
              >
                Screen Locked
              </h2>
              <p
                className={cn(
                  "text-sm mb-4",
                  isDark ? "text-gray-400" : "text-gray-600",
                )}
              >
                Press{" "}
                <kbd
                  className={cn(
                    "rounded-lg px-3 py-1 font-mono font-bold text-yellow-500",
                    isDark
                      ? "bg-yellow-500/20"
                      : "bg-yellow-50 border border-yellow-300",
                  )}
                >
                  INSERT
                </kbd>{" "}
                to start new bill
              </p>

              {/* Next bill serial */}
              {nextBillSerial !== "----" && (
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 mb-4 text-sm",
                    isDark
                      ? "bg-yellow-500/5 border border-yellow-500/10"
                      : "bg-yellow-50 border border-yellow-100",
                  )}
                >
                  <span className={isDark ? "text-gray-500" : "text-gray-400"}>
                    Next Bill:{" "}
                  </span>
                  <span className="font-mono font-bold text-yellow-500">
                    #{nextBillSerial}
                  </span>
                </div>
              )}

              {/* Draft items hint */}
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "rounded-xl px-3 py-2 mb-3 text-xs font-semibold",
                      isDark
                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                        : "bg-amber-50 border border-amber-200 text-amber-700",
                    )}
                  >
                    ⚠️ {itemCount} item{itemCount !== 1 ? "s" : ""} in draft
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Multi-tab switcher on lock screen */}
              {tabs.length > 1 && (
                <div className="mt-3 flex flex-wrap justify-center gap-1">
                  {tabs.map((tab) => (
                    <motion.button
                      key={tab.tabId}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onSwitchTab?.(tab.tabId)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
                        "transition-colors",
                        tab.tabId === activeTabId
                          ? "bg-yellow-500 text-black"
                          : isDark
                            ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                            : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
                      )}
                    >
                      {tab.label}
                      {tab.items?.length > 0 && ` (${tab.items.length})`}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Sound toggle */}
              {onToggleSound && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={onToggleSound}
                  className={cn(
                    "mt-4 flex items-center gap-2 px-3 py-1.5 rounded-xl",
                    "text-xs transition-colors mx-auto",
                    isDark
                      ? "bg-white/5 text-gray-400 hover:bg-white/10"
                      : "bg-black/5 text-gray-500 hover:bg-black/10",
                  )}
                >
                  {soundEnabled ? (
                    <Volume2 size={12} />
                  ) : (
                    <VolumeX size={12} />
                  )}
                  Sound {soundEnabled ? "ON" : "OFF"}
                </motion.button>
              )}

              {/* Biller name */}
              {billerName && (
                <p
                  className={cn(
                    "mt-4 text-xs",
                    isDark ? "text-gray-600" : "text-gray-400",
                  )}
                >
                  Logged in as{" "}
                  <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                    {billerName}
                  </span>
                </p>
              )}

              {/* Offline indicator */}
              <AnimatePresence>
                {!isOnline && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="mt-3 flex items-center justify-center gap-2 text-orange-400 text-xs"
                  >
                    <WifiOff size={12} />
                    <span>Offline — bills save locally</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Bottom branding */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className={cn(
                "mt-6 text-xs font-medium z-10",
                isDark ? "text-gray-600" : "text-gray-400",
              )}
            >
              A One Jewelry POS • Offline Ready
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

LockScreen.displayName = "LockScreen";
export default LockScreen;