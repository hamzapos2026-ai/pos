// Browser Console Debug Script - Verify Store Assignment
// Usage: Paste this entire script in browser console (F12) and run

(async function debugStoreAssignment() {
  console.log('🔍 STORE ASSIGNMENT DEBUG - Starting...\n');

  try {
    // ═══════════════════════════════════════════════════
    // STEP 1: Check IndexedDB Users
    // ═══════════════════════════════════════════════════
    console.log('📱 STEP 1: Checking IndexedDB USERS Store...\n');
    
    const idbReq = indexedDB.open('aone-jewelry-pos', 1);
    const db = await new Promise((res, rej) => {
      idbReq.onsuccess = () => res(idbReq.result);
      idbReq.onerror = () => rej(idbReq.error);
    });

    const tx = db.transaction('users', 'readonly');
    const store = tx.objectStore('users');
    const allUsers = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    console.log(`Found ${allUsers.length} users in IndexedDB:\n`);
    allUsers.forEach((user, idx) => {
      console.log(`  [${idx}] ${user.name} (${user.email})`);
      console.log(`      uid: ${user.uid}`);
      console.log(`      storeIds: ${JSON.stringify(user.storeIds || [])}`);
      console.log(`      primaryStore: ${user.primaryStore || 'NOT SET'}`);
      console.log(`      _syncStatus: ${user._syncStatus || 'NOT SET'}`);
      console.log('');
    });

    // ═══════════════════════════════════════════════════
    // STEP 2: Check Sync Queue
    // ═══════════════════════════════════════════════════
    console.log('\n📋 STEP 2: Checking SYNC_QUEUE...\n');
    
    const tx2 = db.transaction('syncQueue', 'readonly');
    const queueStore = tx2.objectStore('syncQueue');
    const queueItems = await new Promise((res, rej) => {
      const req = queueStore.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    console.log(`Found ${queueItems.length} items in sync queue:\n`);
    queueItems.forEach((item, idx) => {
      console.log(`  [${idx}] ${item.type}`);
      console.log(`      docId: ${item.docId || item.data?.uid}`);
      console.log(`      status: ${item.status}`);
      console.log(`      attempts: ${item.attempts || 0}`);
      if (item.data?.storeIds) {
        console.log(`      storeIds in data: ${JSON.stringify(item.data.storeIds)}`);
      } else {
        console.log(`      ⚠️  storeIds MISSING in data!`);
      }
      if (item.lastError) {
        console.log(`      lastError: ${item.lastError}`);
      }
      console.log('');
    });

    if (queueItems.length === 0) {
      console.log('  ✅ Queue is empty (all synced or no pending changes)\n');
    }

    // ═══════════════════════════════════════════════════
    // STEP 3: Check Firestore (if online)
    // ═══════════════════════════════════════════════════
    if (navigator.onLine) {
      console.log('\n☁️  STEP 3: Checking Firestore (ONLINE)...\n');
      
      try {
        const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
        const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const auth = getAuth();
        const firestore = getFirestore();
        
        if (!auth.currentUser) {
          console.log('  ⚠️  Not authenticated - Cannot check Firestore\n');
        } else {
          console.log(`  Logged in as: ${auth.currentUser.email}\n`);
          
          const usersSnap = await getDocs(collection(firestore, 'users'));
          console.log(`Found ${usersSnap.docs.length} users in Firestore:\n`);
          
          usersSnap.docs.slice(0, 10).forEach((doc) => {
            const userData = doc.data();
            console.log(`  [${doc.id}] ${userData.name}`);
            console.log(`      email: ${userData.email}`);
            console.log(`      storeIds: ${JSON.stringify(userData.storeIds || [])}`);
            console.log(`      primaryStore: ${userData.primaryStore || 'NOT SET'}`);
            console.log('');
          });
          
          if (usersSnap.docs.length > 10) {
            console.log(`  ... and ${usersSnap.docs.length - 10} more users\n`);
          }
        }
      } catch (firebaseErr) {
        console.log(`  ⚠️  Firestore check failed: ${firebaseErr.message}\n`);
      }
    } else {
      console.log('\n📵 STEP 3: Offline - Cannot check Firestore\n');
    }

    // ═══════════════════════════════════════════════════
    // STEP 4: Analysis & Recommendations
    // ═══════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('🎯 ANALYSIS & RECOMMENDATIONS\n');

    const usersWithoutStores = allUsers.filter(u => !u.storeIds || u.storeIds.length === 0);
    const usersNotSynced = allUsers.filter(u => u._syncStatus === 'pending' || u._syncStatus === 'failed');
    const failedQueueItems = queueItems.filter(i => i.status === 'failed');

    if (usersWithoutStores.length > 0) {
      console.log(`⚠️  ${usersWithoutStores.length} user(s) have NO storeIds assigned!`);
      usersWithoutStores.forEach(u => {
        console.log(`   - ${u.name} (${u.email})`);
      });
      console.log('   ACTION: Re-open user edit form and assign at least 1 store\n');
    } else {
      console.log('✅ All users have storeIds assigned\n');
    }

    if (usersNotSynced.length > 0) {
      console.log(`⚠️  ${usersNotSynced.length} user(s) NOT synced to cloud!`);
      usersNotSynced.forEach(u => {
        console.log(`   - ${u.name} (_syncStatus: ${u._syncStatus})`);
      });
      console.log('   ACTION: Check internet connection and run processSyncQueue()\n');
    } else {
      console.log('✅ All users are synced to cloud\n');
    }

    if (failedQueueItems.length > 0) {
      console.log(`❌ ${failedQueueItems.length} sync operation(s) FAILED!`);
      failedQueueItems.forEach(item => {
        console.log(`   - ${item.type} (${item.docId || item.data?.uid})`);
        if (item.lastError) console.log(`     Error: ${item.lastError}`);
      });
      console.log('   ACTION: Retry sync - run this in console:\n');
      console.log('   const {processSyncQueue} = await import("/src/services/userSyncService.js");');
      console.log('   await processSyncQueue();\n');
    } else if (queueItems.length === 0) {
      console.log('✅ No failed sync operations\n');
    }

    console.log('═'.repeat(60) + '\n');
    console.log('✅ DEBUG COMPLETE\n');

  } catch (err) {
    console.error('❌ Debug script error:', err);
  }
})();
