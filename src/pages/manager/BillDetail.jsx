// File: src/pages/manager/BillDetail.jsx

// Unified invoice view — same InvoicePrint UI as Biller



import React, { useEffect, useState, useMemo } from 'react';

import { Loader2 } from 'lucide-react';

import managerService from '../../services/managerService';

import { formatPKR } from '../../utils/managerHelpers';

import { useLanguage } from '../../hooks/useLanguage';

import PaymentModal from './PaymentModal';

import InvoicePrint from '../../components/biller/InvoicePrint';

import { buildInvoicePrintProps } from '../../utils/invoiceUtils';

import { useSettings } from '../../context/SettingsContext';



const BillDetail = ({ localId, onClose }) => {

  const { t } = useLanguage();

  const { settings } = useSettings();

  const [bill, setBill] = useState(null);

  const [loading, setLoading] = useState(true);

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



  const store = useMemo(() => ({

    name: settings?.shop?.name || settings?.store?.name,

    address: settings?.shop?.address || settings?.store?.address,

    phone: settings?.shop?.phone || settings?.store?.phone,

    email: settings?.shop?.email,

    tagline: settings?.shop?.tagline,

    ntn: settings?.shop?.ntn,

  }), [settings]);



  if (!localId) return null;



  if (loading) {

    return (

      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">

        <div className="text-center">

          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />

          <p className="text-sm text-gray-500 mt-3">{t('manager.billDetailPage.loading', 'Loading bill…')}</p>

        </div>

      </div>

    );

  }



  if (!bill) {

    return (

      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">

        <div className="rounded-2xl border border-[#2a1f0d] bg-[#12100a] p-8 text-center">

          <p className="text-sm text-gray-500 mb-4">{t('manager.billDetailPage.notFound', 'Bill not found')}</p>

          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#2a1f0d] text-sm text-gray-400">{t('manager.common.close', 'Close')}</button>

        </div>

      </div>

    );

  }



  const total = Number(bill?.totalAmount || bill?.total || 0);

  const paid = Number(bill?.paidAmount || 0);

  const outstanding = Math.max(0, total - paid);



  const managerActions = (

    <div className="px-4 py-2.5 border-t border-yellow-500/20 bg-[#15120d] flex flex-wrap gap-2">

      {outstanding > 0 && (

        <button

          type="button"

          onClick={() => setShowPayment(true)}

          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-[#1a1208]"

        >

          {t('manager.billDetailPage.collect', 'Collect {{amount}}', { amount: formatPKR(outstanding) })}

        </button>

      )}

      {bill?.status === 'pending' && (

        <>

          <button

            type="button"

            onClick={async () => {

              try {

                const requests = await managerService.getApprovalRequests({ status: 'pending' });

                const req = requests.find(r => r.billId === bill.billId || r.localBillId === localId || r.localBillId === bill.localId);

                if (!req) return alert(t('manager.billDetailPage.approvalNotFound', 'Approval request not found'));

                const res = await managerService.processApprovalRequest(req.requestId || req.id, 'approve', t('manager.approvalsPage.approvedByManager', 'Approved by manager'));

                if (res.success) { alert(t('manager.billDetailPage.approved', 'Approved')); onClose(); }

                else alert(res.error || t('manager.billDetailPage.approveFailed', 'Approve failed'));

              } catch (err) { console.error(err); alert(t('manager.billDetailPage.approveFailed', 'Approve failed')); }

            }}

            className="px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold"

          >

            {t('manager.billDetailPage.approve', 'Approve')}

          </button>

          <button

            type="button"

            onClick={async () => {

              try {

                const reason = prompt(t('manager.billDetailPage.cancelReasonPrompt', 'Enter cancel reason:'));

                if (reason == null || !reason.trim()) return;

                const requests = await managerService.getApprovalRequests({ status: 'pending' });

                const req = requests.find(r => r.billId === bill.billId || r.localBillId === localId || r.localBillId === bill.localId);

                if (!req) return alert(t('manager.billDetailPage.approvalNotFound', 'Approval request not found'));

                const res = await managerService.processApprovalRequest(req.requestId || req.id, 'cancel', reason);

                if (res.success) { alert(t('manager.billDetailPage.cancelled', 'Cancelled')); onClose(); }

                else alert(res.error || t('manager.billDetailPage.cancelFailed', 'Cancel failed'));

              } catch (err) { console.error(err); alert(t('manager.billDetailPage.cancelFailed', 'Cancel failed')); }

            }}

            className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"

          >

            {t('manager.billDetailPage.cancelBill', 'Cancel Bill')}

          </button>

        </>

      )}

    </div>

  );



  return (

    <>

      <InvoicePrint

        {...buildInvoicePrintProps({

          order: bill,

          store,

          onClose,

          settings,

          extra: { isReprint: true, extraFooter: managerActions },

        })}

      />

      {showPayment && bill && (

        <PaymentModal

          localId={localId}

          total={total}

          outstanding={outstanding}

          onClose={() => setShowPayment(false)}

          onSaved={() => { setShowPayment(false); loadBill(); }}

        />

      )}

    </>

  );

};



export default BillDetail;

