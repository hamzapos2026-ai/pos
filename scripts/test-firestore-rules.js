import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const PROJECT_ID = 'demo-project';

async function run() {
  const rules = fs.readFileSync('./firestore.rules', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  try {
    // Unauthenticated client
    const unauth = testEnv.unauthenticatedContext();
    const unauthDb = unauth.firestore();

    // 1) Unauthenticated should be able to read settings/setup
    await assertSucceeds(unauthDb.doc('settings/setup').get());

    // 2) Unauthenticated should NOT be able to write dualMode
    await assertFails(unauthDb.doc('settings/dualMode').set({ value: true }));

    // Authenticated non-super user
    const userCtx = testEnv.authenticatedContext('user1', { email: 'user1@example.com' });
    const userDb = userCtx.firestore();

    // Seed a user doc for user1
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      await adminDb.doc('users/user1').set({ role: 'cashier', roles: ['cashier'], name: 'User One' });
    });

    // User should be able to update own profile but NOT change role
    await assertSucceeds(userDb.doc('users/user1').update({ name: 'New Name' }));
    await assertFails(userDb.doc('users/user1').update({ role: 'superAdmin' }));

    // Super Admin should be able to write dualMode
    const saCtx = testEnv.authenticatedContext('sa', { email: 'sa@example.com' });
    // Seed super admin user
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      await adminDb.doc('users/sa').set({ role: 'superAdmin', roles: ['superAdmin'], name: 'SA' });
    });

    // Now attempt write as super admin
    await assertSucceeds(saCtx.firestore().doc('settings/dualMode').set({ value: true }));

    // PAYMENTS: non-admin should NOT mark paid when dualMode == false
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      // Ensure dualMode = false
      await adminDb.doc('settings/dualMode').set({ value: false });
      // Create a payment doc
      await adminDb.doc('payments/pay1').set({ paymentStatus: 'pending', amount: 100 });
    });

    // user (non-admin) attempts to mark paid -> should fail when dualMode false
    await assertFails(userDb.doc('payments/pay1').update({ paymentStatus: 'paid' }));

    // Now enable dualMode and then user should be allowed to mark paid
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      await adminDb.doc('settings/dualMode').set({ value: true });
    });

    await assertSucceeds(userDb.doc('payments/pay1').update({ paymentStatus: 'paid' }));

    console.log('Rule tests passed');
  } catch (e) {
    console.error('Rule tests failed:', e);
    process.exitCode = 2;
  } finally {
    await testEnv.cleanup();
  }
}

run();
