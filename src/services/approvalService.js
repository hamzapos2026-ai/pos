// File: src/services/approvalService.js
// Purpose: Manage approval requests for discounts and actions
// Features: Create, fetch, approve, reject approval requests
// Offline: Partial (local queue fallback)
// Dependencies: firebase/firestore, ./firebase, ./indexedDBService

import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { addToSyncQueue } from "./indexedDBService";

/**
 * Create an approval request
 */
export const requestApproval = async (data) => {
  try {
    const approval = {
      ...data,
      status: "pending",
      createdAt: serverTimestamp(),
    };

    if (navigator.onLine) {
      const docRef = await addDoc(collection(db, "approvalRequests"), approval);
      return { success: true, id: docRef.id };
    } else {
      // Save to local queue
      const localId = `local_approval_${Date.now()}`;
      await addToSyncQueue({
        type: "approval_request",
        data: { ...approval, localId },
        priority: 2,
      });
      return { success: true, id: localId, offline: true };
    }
  } catch (err) {
    console.error("[approvalService] requestApproval:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get pending approvals for a manager's store
 */
export const getPendingApprovals = async (managerId, storeId) => {
  try {
    const q = query(
      collection(db, "approvalRequests"),
      where("storeId", "==", storeId),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("[approvalService] getPendingApprovals:", err);
    return [];
  }
};

/**
 * Approve an approval request
 */
export const approveRequest = async (requestId, managerId) => {
  try {
    await updateDoc(doc(db, "approvalRequests", requestId), {
      status: "approved",
      approvedBy: managerId,
      approvedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    console.error("[approvalService] approveRequest:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Reject an approval request
 */
export const rejectRequest = async (requestId, managerId, reason) => {
  try {
    await updateDoc(doc(db, "approvalRequests", requestId), {
      status: "rejected",
      rejectedBy: managerId,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason,
    });
    return { success: true };
  } catch (err) {
    console.error("[approvalService] rejectRequest:", err);
    return { success: false, error: err.message };
  }
};

export default {
  requestApproval,
  getPendingApprovals,
  approveRequest,
  rejectRequest,
};