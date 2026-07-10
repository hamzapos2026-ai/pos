/**
 * useBillerHotkeys.js - Enhanced hotkeys hook for billing operations
 * Features: Item management, bill actions, navigation, with debouncing
 * Author: Senior Developer
 */

import { useEffect, useCallback, useRef } from "react";

// ─── Hotkey Configuration ──────────────────────────────
export const HOTKEYS = {
  // Item management
  ADD_ITEM: { key: "__DISABLED__", name: "Add Item" },
  DUPLICATE_ITEM: { key: "d", ctrl: true, name: "Duplicate Item" },
  DELETE_ITEM: { key: "__DISABLED__", name: "Delete Last Row (−)" },
  EDIT_ITEM: { key: "e", name: "Edit Item" },

  // Bill actions
  SAVE_BILL: { key: "s", ctrl: true, name: "Save Draft" },
  PRINT_BILL: { key: "p", ctrl: true, name: "Print Bill" },
  CLEAR_BILL: { key: "Delete", ctrl: true, name: "Clear All Items" },
  NEW_BILL: { key: "n", ctrl: true, name: "New Bill" },

  // Navigation
  MOVE_UP: { key: "ArrowUp", name: "Move Up" },
  MOVE_DOWN: { key: "ArrowDown", name: "Move Down" },
  HOME: { key: "Home", name: "Go to First" },
  END: { key: "End", name: "Go to Last" },

  // Global
  ESCAPE: { key: "Escape", name: "Close/Cancel" },
  SEARCH: { key: "f", ctrl: true, name: "Search Items" },
};

// ─── Debounce configuration ───────────────────────────
const HOTKEY_DEBOUNCE = {
  ADD_ITEM: 80,
  DELETE_ITEM: 500,
  SAVE_BILL: 1000,
  PRINT_BILL: 1000,
  MOVE_UP: 60,
  MOVE_DOWN: 60,
  SEARCH: 200,
};

/**
 * useHotkeysHandler Hook
 * Provides hotkey handling for billing operations
 * @param {Object} handlers - Object with callback functions
 * @param {Object} options - Configuration options
 */
export const useBillerHotkeys = (handlers = {}, options = {}) => {
  const {
    enabled = true,
    blockInInputs = ["DELETE_ITEM", "MOVE_UP", "MOVE_DOWN"],
    alwaysFire = ["ESCAPE", "SAVE_BILL", "PRINT_BILL"],
  } = options;

  const lastPressRef = useRef({});
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // ─── Check if hotkey is debounced ──────────────────────
  const isDebounced = useCallback((hotkeyName) => {
    const debounceTime = HOTKEY_DEBOUNCE[hotkeyName] || 0;
    const lastPress = lastPressRef.current[hotkeyName] || 0;
    const now = Date.now();

    if (now - lastPress < debounceTime) {
      return true;
    }

    lastPressRef.current[hotkeyName] = now;
    return false;
  }, []);

  // ─── Check if an element is input ──────────────────────
  const isInputFocused = useCallback(() => {
    const active = document.activeElement;
    if (!active) return false;

    const isEditable = ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
    const isContentEditable = active.contentEditable === "true";
    const isDataInput = active.getAttribute("data-bill-input") === "true";

    return (isEditable || isContentEditable) && !isDataInput;
  }, []);

  // ─── Match hotkey ─────────────────────────────────────
  const matchHotkey = useCallback((event, hotkeyConfig) => {
    const { key, ctrl = false, shift = false, alt = false } = hotkeyConfig;
    const targetKey = String(key || "")
      .trim()
      .toLowerCase();
    const eventKey = String(event.key || "")
      .trim()
      .toLowerCase();
    const eventCode = String(event.code || "").trim();

    const isLetter = /^[a-z]$/.test(targetKey);
    const keyMatches =
      eventKey === targetKey ||
      eventCode === targetKey ||
      (isLetter && eventCode === `Key${targetKey.toUpperCase()}`);

    if (!keyMatches) return false;

    const ctrlMatches = ctrl
      ? event.ctrlKey || event.metaKey
      : !event.ctrlKey && !event.metaKey;
    const shiftMatches = shift ? event.shiftKey : !event.shiftKey;
    const altMatches = alt ? event.altKey : !event.altKey;

    return ctrlMatches && shiftMatches && altMatches;
  }, []);

  // ─── Find matching hotkey ─────────────────────────────
  const findMatchingHotkey = useCallback(
    (event) => {
      for (const [name, config] of Object.entries(HOTKEYS)) {
        if (matchHotkey(event, config)) {
          return name;
        }
      }
      return null;
    },
    [matchHotkey],
  );

  // ─── Handle keydown ───────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      // 🔧 HOTKEY: primary useKeyboardShortcuts may already handle calculator-speed keys.
      if (event.defaultPrevented) return;

      // Enter / NumpadEnter on bill entry fields → ADD_ITEM (calculator speed)
      if (
        (event.key === "Enter" || event.code === "NumpadEnter")
        && !event.ctrlKey && !event.metaKey && !event.altKey
      ) {
        const active = document.activeElement;
        if (active?.getAttribute?.("data-bill-input") === "true") {
          const entryField = active?.getAttribute?.("data-entry-field") || "";
          const hasProductField = Boolean(
            document.querySelector('[data-entry-field="product"]:not([disabled])'),
          );
          if (entryField === "product") return;
          if (entryField === "price" && hasProductField) return;
          if (!isDebounced("ADD_ITEM")) {
            event.preventDefault();
            const fn = handlersRef.current.ADD_ITEM;
            if (typeof fn === "function") fn(event);
          }
          return;
        }
      }

      const hotkeyName = findMatchingHotkey(event);

      if (!hotkeyName) return;

      // Check debouncing
      if (isDebounced(hotkeyName)) {
        return;
      }

      // Check if should block in inputs
      const inputFocused = isInputFocused();
      // Always fire some hotkeys regardless of input focus
      if (
        inputFocused &&
        blockInInputs.includes(hotkeyName) &&
        !alwaysFire.includes(hotkeyName)
      ) {
        return;
      }

      // Fire callback if exists
      const handler = handlersRef.current[hotkeyName];
      if (handler && typeof handler === "function") {
        event.preventDefault();
        handler(event);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    enabled,
    blockInInputs,
    isInputFocused,
    isDebounced,
    findMatchingHotkey,
    alwaysFire,
  ]);

  // ─── Return hotkey info for UI display ───────────────
  return {
    HOTKEYS,
    getHotkeyDisplay: (hotkeyName) => {
      const config = HOTKEYS[hotkeyName];
      if (!config) return "";

      const parts = [];
      if (config.ctrl) parts.push("Ctrl");
      if (config.shift) parts.push("Shift");
      if (config.alt) parts.push("Alt");
      parts.push(config.key);

      return parts.join("+");
    },
  };
};

/**
 * Hook to get all available hotkeys with their descriptions
 */
export const useHotkeysInfo = () => {
  return {
    items: [
      { name: HOTKEYS.EDIT_ITEM.name, keys: "E" },
      { name: HOTKEYS.DUPLICATE_ITEM.name, keys: "Ctrl+D" },
      { name: HOTKEYS.DELETE_ITEM.name, keys: "Delete" },
    ],
    bill: [
      { name: HOTKEYS.SAVE_BILL.name, keys: "Ctrl+S" },
      { name: HOTKEYS.PRINT_BILL.name, keys: "Ctrl+P" },
      { name: HOTKEYS.CLEAR_BILL.name, keys: "Ctrl+Delete" },
      { name: HOTKEYS.NEW_BILL.name, keys: "Ctrl+N" },
    ],
    navigation: [
      { name: HOTKEYS.MOVE_UP.name, keys: "↑" },
      { name: HOTKEYS.MOVE_DOWN.name, keys: "↓" },
      { name: HOTKEYS.HOME.name, keys: "Home" },
      { name: HOTKEYS.END.name, keys: "End" },
    ],
    global: [
      { name: HOTKEYS.SEARCH.name, keys: "Ctrl+F" },
      { name: HOTKEYS.ESCAPE.name, keys: "Esc" },
    ],
  };
};

export default useBillerHotkeys;
