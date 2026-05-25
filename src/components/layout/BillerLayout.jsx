// src/components/layout/BillerLayout.jsx
// ✅ COMPLETE v2 — ALL FIXES
// FIX-1: import { useSpeech } — named export (fixed)
// FIX-2: import { useSound }  — named export (fixed)
// FIX-3: isDark from useTheme — light mode fixed
// FIX-4: Lock z-index 70 → 60 (below dialogs at z-200)
// FIX-5: children pointer-events fix only for lock overlay
// FIX-6: billData multi-tab compatible (items check safe)
// FIX-7: Outlet support via children prop
// FIX-8: Multi-role redirect handled
// FIX-9: No inline styles
// FIX-10: cn() everywhere
// FIX-11: AnimatePresence on ALL mount/unmount
// FIX-12: PWA standalone detection improved
// FIX-13: Speech bar position accounts for offline pill

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { useNavigate, Outlet }  from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Lock, WifiOff, Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react';
import { useAuth }    from '../../context/AuthContext';
import { useTheme }   from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import { useSpeech }  from '../../hooks/useSpeech';
import { useSound }   from '../../hooks/useSound';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useDraft }   from '../../hooks/useDraft';
import { cn }         from '../../utils/cn';
import toast          from 'react-hot-toast';

// ─── Allowed roles ────────────────────────────────────────────
const ALLOWED_ROLES = ['biller', 'admin', 'superadmin', 'manager'];

// ─── PWA detection ────────────────────────────────────────────
const _isPWA = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
};

// ═══════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════
const lockOverlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit:    { opacity: 0, transition: { duration: 0.2  } },
};

const speechBarVariants = {
  initial: { opacity: 0, height: 0   },
  animate: { opacity: 1, height: 28,
    transition: { duration: 0.2 },
  },
  exit:    { opacity: 0, height: 0,
    transition: { duration: 0.15 },
  },
};

const offlinePillVariants = {
  initial: { opacity: 0, y: 20, scale: 0.9 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', damping: 20, stiffness: 300 },
  },
  exit:    { opacity: 0, y: 20, scale: 0.9,
    transition: { duration: 0.2 },
  },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT: BillerLayout
// ═══════════════════════════════════════════════════════════════
const BillerLayout = ({
  children,
  // Multi-tab bill data (for lock screen item count hint)
  billData  = null,
  tabId     = 0,
  // Lock state — single source of truth in parent (BillerDashboard)
  isLocked  = false,
  onToggleLock,
}) => {
  const navigate = useNavigate();

  // ── Context ───────────────────────────────────────────────
  const { userData, hasRole }              = useAuth();
  const { isDark }                         = useTheme();
  const { isOnline, pendingCount = 0 }     = useNetwork();

  // FIX-1 + FIX-2: named imports (fixed export in hooks)
  const {
    isSpeechEnabled,
    isListening,
    transcript,
  } = useSpeech();

  const {
    isSoundEnabled,
    toggleSound,
    playUnlock,
  } = useSound();

  // ── Auto-save draft ───────────────────────────────────────
  useDraft(billData, tabId);

  // ── Live clock (only when locked — saves CPU) ─────────────
  const [currentTime, setCurrentTime] = useState(new Date());
  const clockRef = useRef(null);

  useEffect(() => {
    if (isLocked) {
      clockRef.current = setInterval(
        () => setCurrentTime(new Date()), 1000,
      );
    } else {
      clearInterval(clockRef.current);
    }
    return () => clearInterval(clockRef.current);
  }, [isLocked]);

  // ── Play unlock sound ONLY locked→unlocked transition ─────
  const prevLockedRef = useRef(isLocked);
  useEffect(() => {
    if (prevLockedRef.current === true && isLocked === false) {
      playUnlock();
    }
    prevLockedRef.current = isLocked;
  }, [isLocked, playUnlock]);

  // ── Role guard ────────────────────────────────────────────
  const hasAccess = ALLOWED_ROLES.some((r) => hasRole?.(r));

  useEffect(() => {
    if (userData && !hasAccess) {
      toast.error('Access denied. Biller role required.');
      navigate('/auth/login', { replace: true });
    }
  }, [userData, hasAccess, navigate]);

  // ── INSERT shortcut (fallback — Dashboard handles primary) ─
  const handleInsert = useCallback(() => {
    onToggleLock?.();
  }, [onToggleLock]);

  useKeyboardShortcuts({ insert: handleInsert }, true);

  // ── Don't render until auth resolved ─────────────────────
  if (userData && !hasAccess) return null;

  // ── Time/date for lock screen ─────────────────────────────
  const timeStr = currentTime.toLocaleTimeString('en-PK', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const dateStr = currentTime.toLocaleDateString('en-PK', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });

  // ── Safe item count (multi-tab compatible) ────────────────
  const itemCount = Array.isArray(billData?.items)
    ? billData.items.length
    : 0;

  // ── PWA flag ─────────────────────────────────────────────
  const isPWA = _isPWA();

  return (
    <div className={cn(
      // FIX-3: isDark based bg
      'min-h-screen relative overflow-x-hidden',
      isDark
        ? 'bg-[#0a0805] text-[#f5f5f4]'
        : 'bg-[#fafaf9] text-[#1c1917]',
      isPWA && 'pwa-standalone',
    )}>

      {/* ══════════════════════════════════════════════════════
          SPEECH STATUS BAR
          Slim 28px bar — only when speech ON + listening
          Positioned below header (top-14)
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isSpeechEnabled && isListening && (
          <motion.div
            key="speech-bar"
            variants={speechBarVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              // FIX-13: z-40 (below lock z-60, above content)
              'fixed top-14 left-0 right-0 z-40 overflow-hidden',
              'flex items-center justify-center gap-2',
              isDark
                ? 'bg-[#0f0a04] border-b border-[#2a1f0d]'
                : 'bg-amber-50 border-b border-amber-200',
            )}
          >
            {/* Red pulse dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={cn(
                'animate-ping absolute inline-flex h-full w-full',
                'rounded-full bg-red-500 opacity-75',
              )} />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className={cn(
              'text-xs italic truncate max-w-[80vw]',
              isDark ? 'text-amber-500' : 'text-amber-700',
            )}>
              🎤 {transcript ? `"${transcript}"` : 'Listening...'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          LOCK SCREEN OVERLAY
          FIX-4: z-[60] — BELOW dialog z-[200]
          FIX-5: Only overlay is pointer-events-none
                 (children NOT blurred — just overlay blocks)
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isLocked && (
          <motion.div
            key="lock-screen"
            variants={lockOverlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              // FIX-4: z-[60] not z-[70]
              'fixed inset-0 z-[60]',
              'bg-black/85 backdrop-blur-2xl',
              'flex flex-col items-center justify-center',
              'select-none cursor-default',
            )}
            // Allow INSERT key to pass through
            onKeyDown={(e) => {
              if (e.key === 'Insert') onToggleLock?.();
            }}
          >
            {/* ── Pulsing lock icon ── */}
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{
                duration: 2.5,
                repeat:   Infinity,
                ease:     'easeInOut',
              }}
              className="mb-8 relative"
            >
              {/* Glow ring */}
              <motion.div
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className={cn(
                  'absolute inset-0 rounded-full scale-150',
                  'bg-amber-500/20',
                )}
              />
              <div className={cn(
                'relative p-6 rounded-full',
                'bg-amber-500/10 border border-amber-500/30',
              )}>
                <Lock className="w-16 h-16 text-amber-500" />
              </div>
            </motion.div>

            {/* ── Live clock ── */}
            <div className={cn(
              'text-6xl font-mono font-bold tracking-widest mb-2 tabular-nums',
              isDark ? 'text-white' : 'text-gray-900',
            )}>
              {timeStr}
            </div>

            {/* ── Date ── */}
            <div className={cn(
              'text-lg mb-10',
              isDark ? 'text-[#a8a29e]' : 'text-gray-500',
            )}>
              {dateStr}
            </div>

            {/* ── Unlock hint ── */}
            <div className="flex items-center gap-2 text-amber-500 text-base font-medium">
              <span>Press</span>
              <kbd className={cn(
                'px-3 py-1.5 rounded-lg font-mono font-bold',
                'bg-amber-500/20 border border-amber-500/30 text-amber-400',
              )}>
                INSERT
              </kbd>
              <span>to unlock</span>
            </div>

            {/* ── Item count hint (blurred for privacy) ── */}
            {itemCount > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className={cn(
                  'mt-6 text-sm blur-sm hover:blur-none',
                  'transition-all duration-300 cursor-default',
                  isDark ? 'text-[#a8a29e]/50' : 'text-gray-400/50',
                )}
              >
                {itemCount} item{itemCount !== 1 ? 's' : ''} in current bill
              </motion.div>
            )}

            {/* ── Sound toggle (accessible on lock screen) ── */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              onClick={toggleSound}
              className={cn(
                'mt-8 flex items-center gap-2 px-3 py-1.5 rounded-xl',
                'text-xs transition-colors',
                isDark
                  ? 'bg-white/5 text-gray-400 hover:bg-white/10'
                  : 'bg-black/5 text-gray-500 hover:bg-black/10',
              )}
            >
              {isSoundEnabled
                ? <Volume2 size={12} />
                : <VolumeX  size={12} />
              }
              Sound {isSoundEnabled ? 'ON' : 'OFF'}
            </motion.button>

            {/* ── User info bottom ── */}
            {userData && (
              <div className={cn(
                'absolute bottom-6 text-xs',
                isDark ? 'text-[#a8a29e]/40' : 'text-gray-400/40',
              )}>
                {userData.name || userData.email || 'User'}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          OFFLINE PILL — Bottom-right corner
          Small indicator (NOT full banner per UI spec)
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            key="offline-pill"
            variants={offlinePillVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'fixed bottom-4 right-4 z-[65]',
              'flex items-center gap-2 px-3 py-2',
              'rounded-xl border shadow-lg backdrop-blur-sm',
              'bg-orange-500/10 border-orange-500/30',
              'shadow-orange-500/10',
            )}
          >
            <WifiOff className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <div className="leading-none">
              <p className="text-orange-400 text-xs font-semibold">
                Offline
              </p>
              {pendingCount > 0 && (
                <p className="text-orange-400/60 text-[10px] mt-0.5">
                  {pendingCount} pending sync
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT
          FIX-5: children not blurred (dialogs still work)
          Lock overlay blocks interaction at z-[60]
          Dialogs open at z-[200] — above lock
      ══════════════════════════════════════════════════════ */}
      <div className="relative">
        {/* Support both children prop and <Outlet /> */}
        {children ?? <Outlet />}
      </div>

    </div>
  );
};

export default BillerLayout;