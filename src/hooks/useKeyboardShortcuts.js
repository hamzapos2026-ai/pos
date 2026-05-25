// src/hooks/useKeyboardShortcuts.js
// ✅ FIXED FINAL v2 — Production Ready
// 🔧 FIX-1: "&" key buildCombo — shift excluded (like "?")
// 🔧 FIX-2: numpadMultiply returns correct actionKey
// 🔧 FIX-3: ALWAYS_FIRE includes "&" and "numpadMultiply"
// 🔧 FIX-4: Empty catch → comment added
// 🔧 FIX-5: isDropdownVisible checks data-dropdown-open (CustomerDialog compatible)

import { useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════
// PER-KEY DEBOUNCE (ms)
// ══════════════════════════════════════════════════════════════
const KEY_DEBOUNCE = {
  Insert: 50,
  F8: 300,
  Escape: 120,
  Delete: 500,
  Home: 150,
  End: 150,
  ArrowUp: 60,
  ArrowDown: 60,
  PageUp: 180,
  PageDown: 180,
  numpadAdd: 180,
  Minus: 500,
  numpadSubtract: 500,
  numpadDivide: 180,
  numpadMultiply: 180,
  "&": 200,
  ClearCache: 1000,
  // F-keys
  F1: 200,
  F2: 200,
  F3: 150,
  F4: 150,
  F5: 150,
  F6: 150,
  F7: 200,
  F9: 300,
  F10: 300,
  F11: 500,
  F12: 300,
  // Combos
  "ctrl+m": 300,
  "ctrl+shift+v": 300,
  "ctrl+shift+l": 300,
  "ctrl+shift+c": 300,
  "ctrl+shift+x": 300,
  "ctrl+s": 300,
  "ctrl+n": 300,
  "ctrl+t": 300,
  "ctrl+w": 300,
  "ctrl+1": 150,
  "ctrl+2": 150,
  "ctrl+3": 150,
  "ctrl+4": 150,
  "ctrl+5": 150,
  "?": 300,
};

// ══════════════════════════════════════════════════════════════
// ALWAYS FIRE — even when input is focused
// ══════════════════════════════════════════════════════════════
const ALWAYS_FIRE = new Set([
  "Insert",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "Escape",
  "Home",
  "End",
  "Delete",
  "Minus",
  "numpadSubtract",
  "numpadAdd",
  "numpadDivide",
  "numpadMultiply", // Numpad * → percent-only discount action
  "NumpadEnter",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "?",
  "&", // New tab shortcut
]);

// ══════════════════════════════════════════════════════════════
// BLOCK IN EDITABLE — block when input/textarea focused
// ══════════════════════════════════════════════════════════════
const BLOCK_IN_EDITABLE = new Set([
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const isEditableElement = (el) => {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
};

const isBillTableInput = (el) => {
  if (!el) return false;
  if (el.dataset?.billInput === "true") return true;
  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 4) {
    if (node.dataset?.billInput === "true") return true;
    node = node.parentElement;
    depth++;
  }
  return false;
};

const isDropdownVisible = () => {
  // CustomerDialog + BillSearch suggestion dropdowns
  if (document.querySelector('[data-dropdown-open="true"]')) return true;
  if (document.querySelector('[role="listbox"]:not([hidden])')) return true;
  if (document.querySelector(".suggestion-list:not(.hidden)")) return true;
  return false;
};

// ══════════════════════════════════════════════════════════════
// MAP EVENT → ACTION KEY
// ══════════════════════════════════════════════════════════════
const getActionKey = (e) => {
  const { code, key } = e;

  // ── Numpad ────────────────────────────────────────────────
  if (code === "NumpadAdd") return "numpadAdd";
  if (code === "NumpadSubtract") return "numpadSubtract";
  if (code === "NumpadDivide") return "numpadDivide";
  if (code === "NumpadEnter") return "NumpadEnter";
  if (code === "NumpadDecimal") return null;
  if (code === "NumpadMultiply") return "numpadMultiply";
  if (/^Numpad\d$/.test(code)) return null;

  // ── Insert ────────────────────────────────────────────────
  if (code === "Insert" || key === "Insert") return "Insert";

  // ── F-keys ────────────────────────────────────────────────
  const fMatch = key?.match(/^F(\d{1,2})$/);
  if (fMatch) {
    const n = parseInt(fMatch[1], 10);
    // Let browser handle F5/F11/F12
    if (n === 5 || n === 11 || n === 12) return null;
    return `F${n}`;
  }

  // ── Named keys ────────────────────────────────────────────
  if (key === "Escape") return "Escape";
  if (key === "Home") return "Home";
  if (key === "End") return "End";
  if (key === "Delete") return "Delete";
  if (key === "ArrowUp") return "ArrowUp";
  if (key === "ArrowDown") return "ArrowDown";
  if (key === "ArrowLeft") return "ArrowLeft";
  if (key === "ArrowRight") return "ArrowRight";
  if (key === "PageUp") return "PageUp";
  if (key === "PageDown") return "PageDown";
  if (key === "Enter") return "Enter";
  if (key === "Tab") return null; // never intercept Tab

  // ── Minus — main keyboard only ────────────────────────────
  if (code === "Minus" && key === "-") return "Minus";

  // ── Special single chars ──────────────────────────────────
  if (key === "?") return "?";
  if (key === "&") return "&"; // Shift+7
  if (key === "/") return "numpadDivide"; // Map main keyboard slash to numpadDivide

  // ── Printable char ────────────────────────────────────────
  if (key && key.length === 1) return key.toLowerCase();

  return null;
};

// ══════════════════════════════════════════════════════════════
// BUILD COMBO STRING
// 🔧 FIX-1: "&" treated like "?" — shift NOT added to combo
//   Without fix: Shift+7 → combo = "shift+&" → no match
//   With fix:    Shift+7 → combo = "&"        → matches handler
// ══════════════════════════════════════════════════════════════
const buildCombo = (e, baseKey) => {
  if (!baseKey) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  // 🔧 FIX-1: Don't add "shift" for "?" and "&"
  // These keys ARE Shift+/ and Shift+7 but we treat them as plain keys
  if (
    e.shiftKey &&
    baseKey !== "?" &&
    baseKey !== "&" &&
    baseKey !== "numpadDivide"
  )
    parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(baseKey);
  return parts.join("+");
};

// ══════════════════════════════════════════════════════════════
// FIND HANDLER in shortcuts map
// ══════════════════════════════════════════════════════════════
const findHandler = (shortcuts, combo, baseKey, hasModifiers) => {
  if (!shortcuts) return null;

  // 1. Exact combo match: "ctrl+m", "ctrl+shift+v"
  if (typeof shortcuts[combo] === "function") return shortcuts[combo];

  // 2. Lowercase combo
  const comboLower = combo.toLowerCase();
  if (typeof shortcuts[comboLower] === "function") return shortcuts[comboLower];

  // 3. No modifiers → try baseKey variants
  if (!hasModifiers) {
    // Direct
    if (typeof shortcuts[baseKey] === "function") return shortcuts[baseKey];

    // PascalCase: "insert" → "Insert"
    const pascal = baseKey.charAt(0).toUpperCase() + baseKey.slice(1);
    if (typeof shortcuts[pascal] === "function") return shortcuts[pascal];

    // UPPERCASE
    const upper = baseKey.toUpperCase();
    if (typeof shortcuts[upper] === "function") return shortcuts[upper];

    // F-key: "f8" → "F8"
    if (baseKey.startsWith("f") && baseKey.length <= 3) {
      const fUpper = baseKey.toUpperCase();
      if (typeof shortcuts[fUpper] === "function") return shortcuts[fUpper];
    }

    // Legacy map
    const legacyMap = {
      numpadadd: "numpadAdd",
      numpadsubtract: "numpadSubtract",
      numpaddivide: "numpadDivide",
      numpadmultiply: "numpadMultiply",
      numpadenter: "NumpadEnter",
      "-": "Minus",
    };
    const legacy = legacyMap[baseKey.toLowerCase()];
    if (legacy && typeof shortcuts[legacy] === "function")
      return shortcuts[legacy];
  }

  return null;
};

// ══════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════
function useKeyboardShortcuts(shortcuts, enabled = true) {
  const shortcutsRef = useRef(shortcuts);
  const lastFiredRef = useRef({});
  const heldCodesRef = useRef(new Set());

  // Always fresh — no stale closures
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e) => {
      // Special: Ctrl+Shift+Delete → cache clear
      const isCacheClear =
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Delete";

      const hasModifiers = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;

      // Resolve action key
      const baseKey = isCacheClear ? "clearcache" : getActionKey(e);
      if (!baseKey) return;

      // Build combo
      const combo = isCacheClear
        ? "ctrl+shift+clearcache"
        : buildCombo(e, baseKey);
      if (!combo) return;

      // Effective modifiers ("?" and "&" treated as no-modifier)
      const effectiveModifiers =
        baseKey === "?" || baseKey === "&" ? false : hasModifiers;

      // Find handler
      const handler = findHandler(
        shortcutsRef.current,
        combo,
        baseKey,
        effectiveModifiers,
      );
      if (typeof handler !== "function") return;

      const editable = isEditableElement(e.target);
      const dropdownOpen = isDropdownVisible();

      // ── Routing logic ────────────────────────────────────
      if (editable) {
        if (ALWAYS_FIRE.has(baseKey)) {
          // Always fire these even in inputs
          // But don't steal cursor movement for Home/End/Escape
          if (baseKey !== "Home" && baseKey !== "End" && baseKey !== "Escape") {
            e.preventDefault();
          }
          // fall through → fire
        } else if (effectiveModifiers && !e.altKey) {
          // Ctrl combos: Ctrl+S, Ctrl+M, Ctrl+Shift+V
          e.preventDefault();
          // fall through → fire
        } else if (BLOCK_IN_EDITABLE.has(baseKey)) {
          // Arrow keys: let dropdown handle if open
          if (
            (baseKey === "ArrowUp" || baseKey === "ArrowDown") &&
            dropdownOpen
          ) {
            return;
          }
          // Delete in bill table inputs → let input handle
          if (baseKey === "Delete" && isBillTableInput(e.target)) {
            return;
          }
          // Block arrows/delete/pageup/dn in all other inputs
          return;
        } else {
          // Regular typing → browser handles
          return;
        }
      } else {
        // Not editable → prevent browser defaults (scroll etc.)
        if (!["f5", "f11", "f12"].includes(baseKey.toLowerCase())) {
          e.preventDefault();
        }
      }

      // ── Hold-key / repeat prevention ─────────────────────
      if (e.repeat) return;
      if (heldCodesRef.current.has(e.code)) return;
      heldCodesRef.current.add(e.code);

      // ── Per-key debounce ──────────────────────────────────
      const debounceMs =
        KEY_DEBOUNCE[combo] ??
        KEY_DEBOUNCE[baseKey] ??
        KEY_DEBOUNCE[combo.toLowerCase()] ??
        150;
      const now = Date.now();
      const lastFired = lastFiredRef.current[combo] || 0;
      if (now - lastFired < debounceMs) return;
      lastFiredRef.current[combo] = now;

      // ── Fire ──────────────────────────────────────────────
      try {
        handler(e);
      } catch (err) {
        console.error(`[useKeyboardShortcuts] "${combo}" handler threw:`, err);
      }
    };

    // keyUp: clear held key by e.code
    const onKeyUp = (e) => {
      heldCodesRef.current.delete(e.code);
    };

    // Capture phase — runs before React synthetic events
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
    };
  }, [enabled]);
}

export { useKeyboardShortcuts };
export default useKeyboardShortcuts;
