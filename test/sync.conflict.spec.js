import { test, expect } from 'vitest';

// NOTE: This is a scaffold for testing conflict-resolution behavior in
// `src/services/localSyncService.js`. It is intentionally skipped until
// test harness setup and firebase mocking are available.

test.skip('sync conflict resolution (server wins) — scaffold', async () => {
  // TODO: implement with mocked Dexie and Firestore
  // Steps:
  // 1) Insert a local order into Dexie with localId X
  // 2) Simulate Firebase setDoc throwing an error for write
  // 3) Ensure localSyncService fetches server doc and applies server-wins
  // 4) Verify local backup created in `deleted_records`
  expect(true).toBe(true);
});
