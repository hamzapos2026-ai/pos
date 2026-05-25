// ✨ NEW: src/hooks/useCashierHotkeys.js
// Purpose: Keyboard shortcut management for cashier dashboard
// Shortcuts: INSERT, F2-F9, ESC, arrow keys, ENTER

import { useEffect, useCallback } from 'react';

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════

/**
 * useCashierHotkeys — binds all cashier keyboard shortcuts
 *
 * @param {object} handlers — map of shortcut → callback
 *   onFocusSearch     — INSERT
 *   onOpenQR          — F2
 *   onPendingTab      — F3
 *   onPaidTab         — F4
 *   onCancelledTab    — F5
 *   onRefresh         — F9
 *   onCloseModal      — ESC
 */
export const useCashierHotkeys = ({
  onFocusSearch,
  onOpenQR,
  onPendingTab,
  onPaidTab,
  onCancelledTab,
  onRefresh,
  onCloseModal,
  isModalOpen = false,
  isDropdownOpen = false,
}) => {
  const handleKeyDown = useCallback((e) => {
    // Don't intercept if user is typing in an input/textarea UNLESS it's a function key
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    // ── ESC — always close modal/dropdown first ──────────────
    if (e.key === 'Escape') {
      e.preventDefault();
      onCloseModal?.();
      return;
    }

    // ── Function keys — always active ────────────────────────
    if (e.key === 'F2') {
      e.preventDefault();
      onOpenQR?.();
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      onPendingTab?.();
      return;
    }
    if (e.key === 'F4') {
      e.preventDefault();
      onPaidTab?.();
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      onCancelledTab?.();
      return;
    }
    if (e.key === 'F9') {
      e.preventDefault();
      onRefresh?.();
      return;
    }

    // ── INSERT — focus search (don't intercept if modal open) ─
    if (e.key === 'Insert' && !isModalOpen) {
      e.preventDefault();
      onFocusSearch?.();
      return;
    }
  }, [
    onFocusSearch, onOpenQR, onPendingTab,
    onPaidTab, onCancelledTab, onRefresh,
    onCloseModal, isModalOpen,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useCashierHotkeys;
