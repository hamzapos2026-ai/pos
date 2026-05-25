// File: src/pages/manager/BillDetail.jsx
// Purpose: Detailed bill view with items, payments, activity log

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, FileText, Activity, User, Loader2, Receipt, Calendar, Tag } from 'lucide-react';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime, getBillPaymentStatus, getBillStatusInfo } from '../../utils/managerHelpers';
import PaymentModal from './PaymentModal';

const BillDetail = ({ localId, onClose }) => {
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('items');
  const [showPayment, setShowPayment] = useState(false);

  const loadBill = async () => {
    setLoading(true);
    try {
      const data = await managerService.getBillDetails(localId);
      setBill(data);
    } catch (err) {
      console.warn('BillDetail load:', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadBill(); }, [localId]);

  if (!localId) return null;

  const total = Number(bill?.totalAmount || bill?.total || 0);
  const paid = Number(bill?.paidAmount || 0);
  const outstanding = Math.max(0, total - paid);
  const ps = bill ? getBillPaymentStatus(bill) : null;
  const status = bill ? getBillStatusInfo(bill.status) : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#2a1f0d] bg-[#12100a] shadow-2xl flex flex-col"
        >
          {/* HEADER */}
          <div className="flex items-center justify-between p-4 border-b border-[#2a1f0d] bg-gradient-to-r from-[#1a1208] to-[#12100a]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-100 truncate">
                  {bill?.serialNo || bill?.billSerial || localId?.slice(-10)}
                </h2>
                <p className="text-[10px] text-gray-500">{bill && getRelativeTime(bill.savedAt || bill.createdAt)}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
              <p className="text-sm text-gray-500 mt-3">Loading bill details…</p>
            </div>
          ) : !bill ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">Bill not found</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* SUMMARY */}
              <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-[#2a1f0d]">
                <div className="rounded-lg bg-[#1a1208] p-2.5 border border-[#2a1f0d]">
                  <p className="text-[10px] text-gray-500 uppercase">Total</p>
                  <p className="text-sm font-bold text-gray-100 mt-1">{formatPKR(total)}</p>
                </div>
                <div className="rounded-lg bg-green-500/5 p-2.5 border border-green-500/20">
                  <p className="text-[10px] text-green-500/70 uppercase">Paid</p>
                  <p className="text-sm font-bold text-green-400 mt-1">{formatPKR(paid)}</p>
                </div>
                <div className={'rounded-lg p-2.5 border ' + (outstanding > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-[#1a1208] border-[#2a1f0d]')}>
                  <p className={'text-[10px] uppercase ' + (outstanding > 0 ? 'text-red-500/70' : 'text-gray-500')}>Outstanding</p>
                  <p className={'text-sm font-bold mt-1 ' + (outstanding > 0 ? 'text-red-400' : 'text-gray-500')}>{formatPKR(outstanding)}</p>
                </div>
                <div className="rounded-lg bg-[#1a1208] p-2.5 border border-[#2a1f0d]">
                  <p className="text-[10px] text-gray-500 uppercase">Status</p>
                  <div className="flex gap-1 mt-1">
                    {status && <span className={'text-[9px] px-1.5 py-0.5 rounded-full ' + status.bg + ' ' + status.text}>{status.label}</span>}
                    {ps && <span className={'text-[9px] px-1.5 py-0.5 rounded-full ' + ({
                      green: 'bg-green-500/15 text-green-400',
                      orange: 'bg-orange-500/15 text-orange-400',
                      red: 'bg-red-500/15 text-red-400',
                      gray: 'bg-gray-500/15 text-gray-400',
                    }[ps.color])}>{ps.label}</span>}
                  </div>
                </div>
              </div>

              {/* CUSTOMER & BILLER */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-[#2a1f0d]">
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Customer</p>
                    <p className="text-sm text-gray-200">{bill.customer?.name || bill.customerName || 'Walk-in'}</p>
                    {(bill.customer?.phone || bill.customerPhone) && (
                      <p className="text-[10px] text-gray-500">{bill.customer?.phone || bill.customerPhone}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Tag className="w-4 h-4 text-gray-500 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Biller</p>
                    <p className="text-sm text-gray-200">{bill.billerName || bill.billerId || '—'}</p>
                    <p className="text-[10px] text-gray-500">Branch: {bill.storeId}</p>
                  </div>
                </div>
              </div>

              {/* TABS */}
              <div className="flex gap-1 px-4 pt-3 border-b border-[#2a1f0d]">
                {[
                  { id: 'items', label: 'Items', icon: FileText },
                  { id: 'payments', label: 'Payments', icon: DollarSign },
                  { id: 'activity', label: 'Activity', icon: Activity },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ' +
                      (tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300')
                    }
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB CONTENT */}
              <div className="p-4">
                {tab === 'items' && (
                  <div className="space-y-1.5">
                    {(bill.items || bill.bill_items || []).length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">No items found</p>
                    ) : (bill.items || bill.bill_items || []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#1a1208] border border-[#2a1f0d]">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-200 truncate">{item.productName || item.name}</p>
                          <p className="text-[10px] text-gray-500">Qty: {item.qty || 1} × {formatPKR(item.price)}</p>
                          {item.salespersonName && (
                            <p className="text-[10px] text-gray-400">Salesperson: {item.salespersonName}</p>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-100">{formatPKR(item.total || item.qty * item.price)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'payments' && (
                  <div className="space-y-1.5">
                    {(bill.paymentHistory || []).length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">No payment history</p>
                    ) : (bill.paymentHistory || []).map(p => (
                      <div key={p.paymentId} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#1a1208] border border-[#2a1f0d]">
                        <div>
                          <p className="text-sm text-gray-200">{formatPKR(p.amount)} • {p.paymentMethod}</p>
                          <p className="text-[10px] text-gray-500">{getRelativeTime(p.createdAt)} • by {p.collectedByName || p.collectedBy}</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Collected</span>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'activity' && (
                  <div className="space-y-1.5">
                    {(bill.activityLogs || []).length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">No activity recorded</p>
                    ) : (bill.activityLogs || []).map((l, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-[#1a1208] border border-[#2a1f0d]">
                        <Calendar className="w-3.5 h-3.5 text-gray-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-200">{l.action}</p>
                          <p className="text-[10px] text-gray-500">{getRelativeTime(l.timestamp)} • {l.userName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FOOTER */}
          {bill && (
            <div className="p-3 border-t border-[#2a1f0d] bg-[#1a1208] flex justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-[#2a1f0d] bg-[#0a0805] text-sm text-gray-400 hover:text-gray-200"
                >
                  Close
                </button>
                {outstanding > 0 && (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#1a1208] text-sm font-semibold hover:from-amber-400 hover:to-amber-500"
                  >
                    <DollarSign className="w-4 h-4" />
                    Collect Payment
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {bill.status === 'pending' && (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          const requests = await managerService.getApprovalRequests({ status: 'pending' });
                          const req = requests.find(r => r.billId === bill.billId || r.localBillId === localId || r.localBillId === bill.localId);
                          if (!req) return alert('Approval request not found');
                          const res = await managerService.processApprovalRequest(req.requestId || req.id, 'approve', 'Approved from Manager Bill view');
                          if (res.success) { alert('Approved'); onClose(); }
                          else alert(res.error || 'Approve failed');
                        } catch (err) { console.error(err); alert('Approve failed'); }
                      }}
                      className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold"
                    >Approve</button>
                    <button
                      onClick={async () => {
                        try {
                          const reason = prompt('Enter cancel reason:');
                          if (reason == null) return;
                          if (!reason || reason.trim().length === 0) return alert('Reason required');
                          const requests = await managerService.getApprovalRequests({ status: 'pending' });
                          const req = requests.find(r => r.billId === bill.billId || r.localBillId === localId || r.localBillId === bill.localId);
                          if (!req) return alert('Approval request not found');
                          const res = await managerService.processApprovalRequest(req.requestId || req.id, 'cancel', reason);
                          if (res.success) { alert('Cancelled'); onClose(); }
                          else alert(res.error || 'Cancel failed');
                        } catch (err) { console.error(err); alert('Cancel failed'); }
                      }}
                      className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold"
                    >Cancel</button>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {showPayment && bill && (
          <PaymentModal
            localId={localId}
            total={total}
            outstanding={outstanding}
            onClose={() => setShowPayment(false)}
            onSaved={() => { setShowPayment(false); loadBill(); }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default BillDetail;