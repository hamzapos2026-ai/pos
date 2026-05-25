import { vi } from 'vitest';

// Prevent firebase client from initializing during tests
vi.doMock('../src/services/firebase', () => ({
  default: { isFirebaseReady: () => false },
  db: {},
  setDoc: async () => {},
  doc: () => ({}),
  addDoc: async () => {},
  updateDoc: async () => {},
  serverTimestamp: () => '__server_ts__'
}));

// Provide a default authService mock for tests; individual tests can override
vi.doMock('../src/services/authService', () => ({
  getCurrentUserData: async () => ({ uid: 'test_user', displayName: 'Test User', primaryStore: 'store1' }),
  canUserAccessBranch: async () => true
}));
