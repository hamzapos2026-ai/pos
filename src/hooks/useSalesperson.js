// File: src/hooks/useSalesperson.js
// Purpose: Salesperson management hook with SuperAdmin-only permissions

import { useState, useCallback, useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════════════
// 🔒 PERMISSION HELPER — Only SuperAdmin can manage agents
// ═══════════════════════════════════════════════════════════════
export const canManageSalespersons = (userData) => {
  if (!userData) return false;
  const role = (userData.role || '').toLowerCase().trim();
  return (
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'super_admin' ||
    role === 'super-admin' ||
    role === 'super admin' ||
    userData.isSuperAdmin === true ||
    userData.isAdmin === true
  );
};

// ═══════════════════════════════════════════════════════════════
// COMMISSION CALCULATOR — per item
// ═══════════════════════════════════════════════════════════════
export const calcItemCommission = (item) => {
  const qty      = Number(item.qty || item.quantity || 1);
  const price    = Number(item.price || item.salePrice || 0);
  const discount = Number(item.discount || 0);
  const discType = item.discountType || 'amount';

  let net = price * qty;
  if (discType === 'percent') net -= (net * discount) / 100;
  else                        net -= discount * qty;
  net = Math.max(0, net);

  const pct   = Number(item.commissionPercent || 0);
  const type  = item.commissionType || 'percent';
  const fixed = Number(item.commissionFixed || 0);

  const rawComm = type === 'fixed' ? fixed * qty : (net * pct) / 100;
  return { net, rawComm };
};

// ── Aggregate commissions by salesperson from items array ────
export const aggregateByAgent = (items, paidRatio = 1) => {
  const map = new Map();
  items.forEach((item) => {
    if (!item.salespersonId) return;
    const { net, rawComm } = calcItemCommission(item);
    if (!map.has(item.salespersonId)) {
      map.set(item.salespersonId, {
        salespersonId:    item.salespersonId,
        salespersonName:  item.salespersonName || '',
        totalNet:         0,
        rawCommission:    0,
        earnedCommission: 0,
        itemCount:        0,
      });
    }
    const entry = map.get(item.salespersonId);
    entry.totalNet         += net;
    entry.rawCommission    += rawComm;
    entry.earnedCommission  = entry.rawCommission * paidRatio;
    entry.itemCount        += Number(item.qty || item.quantity || 1);
  });
  return [...map.values()];
};

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════
const useSalesperson = () => {
  const { settings } = useSettings();
  const { userData } = useAuth();

  const sp      = settings.salesperson || {};
  const agents  = sp.agents || [];
  const enabled = !!sp.enableCommission;
  const multiSP = !!sp.allowMultiplePerBill;

  // 🔒 Permission flag (true only for SuperAdmin / Admin)
  const canManage = useMemo(() => canManageSalespersons(userData), [userData]);

  // Current salesperson selected in the billing UI
  const [currentSPId, setCurrentSPId] = useState(null);

  const currentAgent = useMemo(
    () =>
      agents.find((a) => a.id === currentSPId && a.isActive !== false) || null,
    [agents, currentSPId]
  );

  // ── Enrich a NEW item with salesperson + commission fields ──
  const enrichItem = useCallback(
    (item) => {
      if (!enabled || !currentAgent) return item;
      return {
        ...item,
        salespersonId:     currentAgent.id,
        salespersonName:   currentAgent.name,
        commissionType:    currentAgent.commissionType || 'percent',
        commissionPercent:
          currentAgent.commissionType === 'percent' ? currentAgent.commissionRate : 0,
        commissionFixed:
          currentAgent.commissionType === 'fixed' ? currentAgent.commissionRate : 0,
      };
    },
    [enabled, currentAgent]
  );

  // ── Re-assign existing item to a different SP ───────────────
  const reassignItem = useCallback(
    (item, agentId) => {
      const agent = agents.find((a) => a.id === agentId);
      if (!agent) {
        return { ...item, salespersonId: null, salespersonName: null };
      }
      return {
        ...item,
        salespersonId:     agent.id,
        salespersonName:   agent.name,
        commissionType:    agent.commissionType || 'percent',
        commissionPercent: agent.commissionType === 'percent' ? agent.commissionRate : 0,
        commissionFixed:   agent.commissionType === 'fixed' ? agent.commissionRate : 0,
      };
    },
    [agents]
  );

  // ── Build summary for the current bill ──────────────────────
  const buildCommissionSummary = useCallback(
    (items, paidAmount, totalAmount) => {
      const paidRatio =
        totalAmount > 0 ? Math.min(1, paidAmount / totalAmount) : 1;
      return aggregateByAgent(items, paidRatio);
    },
    []
  );

  // ── Validate before checkout ────────────────────────────────
  const validateAssignment = useCallback(
    (items) => {
      if (!enabled || !sp.requireSelection) return { valid: true };

      if (multiSP) {
        const unassigned = items.filter((i) => !i.salespersonId);
        if (unassigned.length > 0) {
          return {
            valid:   false,
            message: `${unassigned.length} item(s) have no salesperson assigned.`,
          };
        }
      } else {
        const hasSP = items.some((i) => i.salespersonId) || currentSPId;
        if (!hasSP) {
          return {
            valid:   false,
            message: 'Please select a salesperson before checkout.',
          };
        }
      }
      return { valid: true };
    },
    [enabled, sp.requireSelection, multiSP, currentSPId]
  );

  // Active agents (visible to billers)
  const activeAgents = useMemo(
    () => agents.filter((a) => a.isActive !== false),
    [agents]
  );

  return {
    // ── Config ────────────────────────────
    enabled,
    multiSP,
    showColumn: !!sp.showOnTable,
    required:   !!sp.requireSelection,

    // ── 🔒 Permission ────────────────────
    canManage,        // true only for SuperAdmin / Admin
    hasAgents: activeAgents.length > 0,

    // ── Agents (READ-ONLY for billers) ───
    agents,
    activeAgents,

    // ── Current selection ────────────────
    currentSPId,
    setCurrentSPId,
    currentAgent,

    // ── Actions ──────────────────────────
    enrichItem,
    reassignItem,
    buildCommissionSummary,
    validateAssignment,
  };
};

export default useSalesperson;