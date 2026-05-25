# Manager Module Implementation Notes

Summary of work completed:

- Branch access checks implemented via `authService.canUserAccessBranch` enforcement.
- Payments flow (`collectPayment`) implemented: local `db.payments` writes, order `paidAmount` updates, cash transaction creation, commission logging, enqueue to `db.sync_queue` and immediate Firestore sync attempts.
- Salesperson commission accounting: `commissionEarned`, `commissionPending`, `commissionPaid` fields updated on `db.users`; `markCommissionPaid` API implemented to record payouts, create cash transactions, log events, and enqueue/sync.
- Cashflow features: `addCashTransaction`, `listCashTransactions`, `markCashTransactionReconciled` with UI filtering and CSV export.
- Shift management: `openShift`, `closeShift`, `getActiveShift` and `Shifts` UI to open/close shifts and associate transactions with `shiftId`.
- Credits UI: `Credits.jsx` lists outstanding bills and collects partial payments using `collectPayment`.
- Basic reports and CSV export added in `Reports.jsx` and `CashFlow.jsx`.

Files added/modified (high level):
- `src/services/managerService.js` (core APIs)
- `src/pages/manager/*` (Salespersons, CashFlow, Credits, Shifts and wiring changes)
- `src/utils/exportUtils.js` (used for CSV download)
- `test/managerService.spec.js` (basic vitest smoke test)

Next recommended work:
- Add integration tests that mock `db` and `firebase` to validate offline->online sync behavior.
- Add end-to-end tests for UI flows (collect payment, reconcile cash, payout commissions).
- Comprehensive QA pass for race conditions in sync queue and conflict resolution.

How to run tests (locally):

1. Install dev deps:

```bash
npm install
```

2. Run the test suite:

```bash
npm test
```

Notes:
- Tests currently include a basic smoke test to verify managerService exports. Integration tests require adding `vitest` mocks for `src/db/index.js` and `src/services/firebase.js`.

CI:

- A GitHub Actions workflow `/.github/workflows/ci.yml` is included to run `npm ci` and `npm test` on pushes and pull requests to `main`/`master`.
- Ensure the project has a lockfile (`package-lock.json`) for deterministic installs. The CI uses `npm ci` for faster, reproducible installs.
