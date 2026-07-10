import { ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { getDeliveryStatus, getDeliveryStatusLabel, DELIVERY_STATUS } from '../../utils/deliveryStatus';
import { cn } from '../../utils/cn';
import useLanguage from '../../hooks/useLanguage';

const STYLES = {
  [DELIVERY_STATUS.PAYMENT_VERIFIED]: {
    icon: ShieldCheck,
    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
  [DELIVERY_STATUS.PENDING_REVIEW]: {
    icon: AlertTriangle,
    cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  },
  [DELIVERY_STATUS.NOT_PAID]: {
    icon: XCircle,
    cls: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
};

/** Delivery staff — only verified / pending review labels, no raw bill details */
const DeliveryStatusBadge = ({ bill, className }) => {
  const { t } = useLanguage();
  const status = getDeliveryStatus(bill);
  const label = getDeliveryStatusLabel(bill, t);
  const { icon: Icon, cls } = STYLES[status] || STYLES[DELIVERY_STATUS.NOT_PAID];

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold',
      cls,
      className,
    )}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
};

export default DeliveryStatusBadge;
