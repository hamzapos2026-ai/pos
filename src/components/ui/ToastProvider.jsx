// File: aone-jewelry-pos/src/components/ui/ToastProvider.jsx
// React Hot Toast provider with dark-first defaults and no inline styles.

import { Toaster } from 'react-hot-toast';

/**
 * Central toast container for the application.
 */
const ToastProvider = () => (
  <Toaster
    position="top-right"
    gutter={12}
    toastOptions={{
      className: 'rounded-2xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-3 text-sm font-medium text-gray-100 shadow-2xl shadow-black/40',
      duration: 4000,
    }}
  />
);

export default ToastProvider;