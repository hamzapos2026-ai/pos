/** Roman Urdu — Reconciliation page short hints */

export const RECON_HINTS = {
  page: 'Fraud, duplicate, offline payment aur sync fail — branch ke hisab se, biller/cashier ke sath.',
  offline: 'Internet nahi — is PC ka local data. Online aane par Force Sync dabao.',
  fraud: 'Amount galat, branch galat, ya suspicious payment — reason ke sath.',
  duplicates: 'Double payment ya bill pehle paid — duplicate detect hua.',
  offlineIssues: 'Payment save hui lekin bill se match/sync nahi hui.',
  syncFailures: 'Sync queue fail — Fix/Retry se dubara try karo.',
  allClear: 'Sab theek — koi issue nahi.',
  forceSync: 'Sab pending payments + bills cloud par bhej kar match karo.',
  scopeAll: 'Sab branches — Super Admin view',
  scopeStore: 'Sirf aapka branch.',
  deviceOnly: 'Is PC par — har computer alag ho sakta hai.',
  cloudTag: 'Cloud',
  localTag: 'Is PC',
  btnRetry: 'Retry',
  btnFix: 'Fix',
  btnDismiss: 'Dismiss',
  btnApprove: 'Approve',
  btnReject: 'Reject',
  btnCashierRetry: 'Cashier Fix',
  btnRefresh: 'Refresh',
  /** Button ke neeche — kya hoga */
  hintRetry: 'Dubara match/sync try — bill cloud par ho to auto fix',
  hintFix: 'Sync queue dubara chalao — failed upload retry',
  hintApprove: 'Payment theek hai — bill paid mano, issue hat jayega',
  hintReject: 'Payment galat — reject karo, cashier se dubara lo',
  hintDismiss: 'False alarm / solve ho gaya — list se hata do',
  hintCashierFix: 'Cashier ko wapas bhejo — sahi amount dubara pay',
  actionHint: 'Har row par SNO, branch, biller, cashier (fraud by) + Retry/Approve/Dismiss. Manager ya Super Admin action — dono ko cloud par same dikhega.',
  tabAll: 'Sab',
  tabFraud: 'Fraud',
  tabDuplicate: 'Duplicate',
  tabOffline: 'Offline',
  tabSync: 'Sync Fail',
  billsNote: 'Pending bills yahan nahi — Bills page dekho.',
};

export const ISSUE_TYPE_META = {
  fraud: { label: 'Fraud', color: 'rose', hint: 'Suspicious / amount / branch issue' },
  duplicate: { label: 'Duplicate', color: 'purple', hint: 'Double payment ya paid bill' },
  offline: { label: 'Offline', color: 'blue', hint: 'Match/sync pending' },
  sync_failed: { label: 'Sync Fail', color: 'amber', hint: 'Queue fail — retry karo' },
};

export const FRAUD_REASON_LABELS = {
  bill_id_mismatch: 'Bill ID galat hai',
  amount_mismatch: 'Amount match nahi hoti',
  duplicate_payment: 'Double payment mili',
  duplicate_bill: 'Bill pehle se paid hai',
  bill_not_found: 'Bill abhi sync nahi hui',
  branch_mismatch: 'Store/branch galat hai',
  offline_unsynced: 'Offline payment sync pending',
  manual_review: 'Manual review zaroori',
  sync_failed: 'Sync queue fail',
};

export const getFraudReasonLabel = (reason) =>
  FRAUD_REASON_LABELS[reason] || reason || 'Review zaroori';

/** Kis ki wajah se issue — cashier / biller / system */
export const getFraudAttribution = (item = {}) => {
  const reason = String(item.reason || item.reviewReason || '').toLowerCase();
  const details = String(item.details || '').toLowerCase();

  if (reason.includes('amount_mismatch') || details.includes('amount_mismatch') || details.includes('≠')) {
    return {
      who: 'biller',
      short: 'Biller / bill edit',
      explain: 'Cashier screen par jo amount thi woh pay hui. Baad mein biller bill change kiya (discount/item) ya cloud bill update hui — system mismatch pakda.',
    };
  }
  if (reason.includes('duplicate') || details.includes('duplicate')) {
    return {
      who: 'cashier',
      short: 'Cashier — double pay',
      explain: 'Is bill par pehle se payment hai — cashier dubara pay kar diya ya same bill do dafa scan hui.',
    };
  }
  if (reason.includes('branch_mismatch')) {
    return {
      who: 'cashier',
      short: 'Cashier — galat branch',
      explain: 'Payment doosri branch se hui, bill is branch ki hai.',
    };
  }
  if (reason.includes('bill_not_found') || reason.includes('offline_unsynced') || reason.includes('offline')) {
    return {
      who: 'system',
      short: 'System — sync pending',
      explain: 'Payment save hui lekin bill abhi cloud par sync nahi — internet/sync delay. Cashier error nahi dekhta, system wait karta hai.',
    };
  }
  if (reason.includes('sync_failed') || item.issueType === 'sync_failed') {
    return {
      who: 'system',
      short: 'System — sync fail',
      explain: 'Is PC par payment queue fail hui — Force Sync ya Fix dabao.',
    };
  }
  return {
    who: 'system',
    short: 'System review',
    explain: 'Automatic check — manager approve/dismiss/reject se close karo.',
  };
};
