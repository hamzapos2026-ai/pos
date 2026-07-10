import { useEffect, useState, useCallback } from 'react';
import CenterAlert from './CenterAlert';
import { bindFieldAlertHost } from '../../utils/fieldAlert';

const FieldAlertHost = () => {
  const [alert, setAlert] = useState(null);

  useEffect(() => bindFieldAlertHost(setAlert), []);

  const close = useCallback(() => setAlert(null), []);

  return (
    <CenterAlert
      open={Boolean(alert?.open)}
      variant={alert?.variant || 'warning'}
      title={alert?.title}
      message={alert?.message}
      fieldLabel={alert?.fieldLabel}
      confirmLabel={alert?.confirmLabel || 'Got it'}
      onClose={close}
    />
  );
};

export default FieldAlertHost;
