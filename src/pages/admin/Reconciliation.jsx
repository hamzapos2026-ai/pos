import useReconciliationScope from '../../hooks/useReconciliationScope';
import ReconciliationDashboard from '../../components/reconciliation/ReconciliationDashboard';

const Reconciliation = () => {
  const scope = useReconciliationScope();
  return (
    <ReconciliationDashboard
      {...scope}
      billsPath="/admin/bills"
    />
  );
};

export default Reconciliation;
