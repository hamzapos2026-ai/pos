// File: aone-jewelry-pos/src/utils/cn.js
// Shared className merge utility using clsx and tailwind-merge as required by the UI system.

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind CSS conflicts.
 */
export const cn = (...inputs) => twMerge(clsx(inputs));

export default cn;