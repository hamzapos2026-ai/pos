// File: src/hooks/useSoundFeedback.js
// Purpose: Thin re-export + extended wrapper over useSound.js for biller-specific sounds
// Features: Named semantic actions (add, delete, error, unlock, paid, hold, reprint)
// Offline: Yes
// Dependencies: ./useSound

/**
 * useSoundFeedback
 *
 * Semantic sound feedback for biller actions.
 * Wraps useSound.js and adds named helper functions.
 * This is a convenience layer — the actual sound engine is in useSound.js.
 *
 * Usage:
 *   const { playAdd, playDelete, playError, playUnlock, playPaid } = useSoundFeedback();
 *   playAdd();       // item added
 *   playDelete();    // item/bill deleted
 *   playError();     // validation fail
 *   playUnlock();    // screen unlocked
 *   playPaid();      // bill finalized
 *   playHold();      // bill held
 *   playReprint();   // bill reprinted
 */
export { useSound as useSoundFeedback } from './useSound';

// Named re-export for backwards compat
export default function useSoundFeedbackDefault() {
  const { useSound } = require('./useSound');
  return useSound();
}
