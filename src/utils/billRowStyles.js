import { cn } from './cn';
import { getBillHighlightKind, isBillRemoved, isBillEdited } from './billsFilterUtils';

export const billRowId = (b) => b?.id || b?.localId || '';

/** CSS classes for manager/admin bill rows */
export function getBillRowHighlightClass(row, { newBillIds, idx } = {}) {
  const kind = getBillHighlightKind(row);
  const id = billRowId(row);
  const isNew = newBillIds?.has?.(id) && !kind;

  return cn(
    kind === 'deleted' || kind === 'cancelled' ? 'bill-row-removed' : null,
    kind === 'edited' ? 'bill-row-edited' : null,
    isNew ? 'bill-row-new' : null,
    !kind && !isNew
      ? (idx != null && idx % 2 === 1 ? 'bill-row-default-alt' : 'bill-row-default')
      : null,
  );
}

/** Mobile card wrapper classes */
export function getBillCardHighlightClass(row, { newBillIds } = {}) {
  const kind = getBillHighlightKind(row);
  const id = billRowId(row);
  const isNew = newBillIds?.has?.(id) && !kind;

  return cn(
    'p-2.5 rounded-lg border cursor-pointer transition-all',
    (kind === 'deleted' || kind === 'cancelled') && 'bill-card-removed',
    kind === 'edited' && 'bill-card-edited',
    isNew && 'bill-card-new',
    !kind && !isNew && 'border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] hover:border-amber-500/30',
  );
}

export function getBillRemovedBadge(row) {
  const kind = getBillHighlightKind(row);
  if (kind === 'cancelled') return { label: 'CANCELLED', tone: 'red' };
  if (kind === 'deleted' || isBillRemoved(row)) return { label: 'DELETED', tone: 'red' };
  return null;
}

export function getBillEditedBadge(row) {
  if (getBillHighlightKind(row) === 'edited') {
    return { label: 'EDITED', tone: 'purple' };
  }
  return null;
}
