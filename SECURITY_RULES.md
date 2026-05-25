# Firebase Security Rules Guidance for A One Jewelry POS

## Goals
- Protect sensitive collections
- Prevent unauthorized writes to audit and global counter data
- Enforce branch and store ownership
- Keep client writes limited to permitted operations

## Guarded Collections
- `users` — only user themselves and admins may edit
- `roles` — only superAdmin can change
- `stores` / `branches` — only authorized admin roles
- `orders` / `payments` — only users with matching store/branch and permission
- `auditLogs` — no client writes, only trusted backend or Cloud Function
- `globalCounters` — no client writes, only server-managed counters
- `settings` — restricted by store scope
- `syncQueue` — only local queue writes should be allowed from client, but writes must be validated

## Example Rule Patterns
### User document rule
- Allow read if auth.uid == userId or user has `viewAllUsers`
- Allow write if auth.uid == userId or user has `manageUsers`
- Deny if `isDeleted` is true and trying to access user data

### Order document rule
- Allow creation if `request.auth.uid` exists and `request.resource.data.storeId == request.auth.token.storeId`
- Allow update only for allowed transitions, not for arbitrary status resets
- Deny writes if `source == 'offline'` without proper offline metadata

### Payment document rule
- Allow create if the user has `receivePayments`
- Allow read if same store/branch or if user has `viewAllReports`
- Deny update on `amount`, `paymentMethod` unless user has `editPayments`

### Audit log rule
- Deny all client writes:
  - `allow create: if false;`
  - `allow read: if request.auth.uid != null && hasPermission('viewAuditLog');`

## Security Rule Best Practices
- Use custom claims sparingly; prefer document-based permissions
- Use `request.auth.uid` and a server-side user document lookup helper
- Validate required fields and data types
- Do not trust client-provided `storeId`, `branchId`, or `amount`
- Use Firestore transactions for counters and serial generation

## Migration Notes
- Add a `permissions` collection and a `roles` collection for dynamic RBAC
- Keep old `role` field for backwards compatibility while migrating UI
- Convert route guards to permission-based checks gradually
- Add Cloud Functions to generate protected sequence numbers and audit-only writes

## Implementation Recommendation
1. Keep `RoleBasedRoute.jsx` and `App.jsx` layered with role fallback
2. Add `hasPermission` checks on feature-level UI components
3. Use server-side rules to enforce `allowedPermissions` for protected operations
4. Archive old collections only after migration and verify via `FIRESTORE_SCHEMA_VERIFICATION.md`
