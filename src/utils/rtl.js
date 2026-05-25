// File: aone-jewelry-pos/src/utils/rtl.js
// RTL utility functions for A One Jewelry POS

/**
 * Get RTL-aware class names
 * @param {string} ltrClass - Class for LTR layout
 * @param {string} rtlClass - Class for RTL layout
 * @param {boolean} isRTL - Whether current layout is RTL
 * @returns {string} Appropriate class based on direction
 */
export const rtlClass = (ltrClass, rtlClass, isRTL) => {
  return isRTL ? rtlClass : ltrClass;
};

/**
 * Get logical property class names
 * @param {string} property - CSS property (e.g., 'margin', 'padding', 'border')
 * @param {string} side - Side (start, end, top, bottom)
 * @param {string} value - Value (e.g., '4', '8', 'auto')
 * @returns {string} Tailwind logical property class
 */
export const logicalClass = (property, side, value) => {
  const logicalSides = {
    left: 'start',
    right: 'end',
    top: 'top',
    bottom: 'bottom'
  };

  const logicalSide = logicalSides[side] || side;
  return `${property}${logicalSide === 'start' ? 's' : logicalSide === 'end' ? 'e' : logicalSide}-${value}`;
};

/**
 * Get text alignment class based on direction
 * @param {string} alignment - 'left' or 'right'
 * @param {boolean} isRTL - Whether current layout is RTL
 * @returns {string} Text alignment class
 */
export const textAlign = (alignment, isRTL) => {
  if (alignment === 'left') return isRTL ? 'text-end' : 'text-start';
  if (alignment === 'right') return isRTL ? 'text-start' : 'text-end';
  return `text-${alignment}`;
};

/**
 * Get flex direction class based on direction
 * @param {string} direction - 'row' or 'row-reverse'
 * @param {boolean} isRTL - Whether current layout is RTL
 * @returns {string} Flex direction class
 */
export const flexDirection = (direction, isRTL) => {
  if (direction === 'row') return 'flex-row';
  if (direction === 'row-reverse') return isRTL ? 'flex-row' : 'flex-row-reverse';
  return `flex-${direction}`;
};