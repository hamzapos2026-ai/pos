# 🧪 A One POS — Production Test Plan

Run this checklist **BEFORE** handing over to client.  
Mark each test ✅ PASS or ❌ FAIL.

---

## 📋 PRE-TEST SETUP

- [ ] Firestore rules deployed
- [ ] At least 2 user accounts created:
  - Biller: `biller@test.com` (role: `biller`)
  - Super Admin: `admin@test.com` (role: `superadmin`)
- [ ] Firebase Console open in another tab
- [ ] Chrome DevTools ready (Console + Network + Application tabs)
- [ ] Test data: customer phone numbers ready

---

## 🔵 TEST SUITE 1: SERIAL NUMBER SYSTEM

### Test 1.1: Single User Serial
1. Login as biller
2. Note current serial in header (e.g., `Next: 0005`)
3. Save a bill
4. Verify serial appears in Firebase Console: `orders/{id}.serialNo = "0005"`
5. Verify `stores/mo2msiaf.lastSerialNumber = 5`
6. Verify `serialLocks/{storeId}_5` document created

**✅ PASS** if all 4 verifications pass  
**❌ FAIL** → Check serialService.js

---

### Test 1.2: Login Persistence
1. Note current serial (e.g., `Next: 0006`)
2. Logout
3. Login again
4. Verify serial still shows `Next: 0006` (NOT `0001`)

**✅ PASS** if serial persists  
**❌ FAIL** → Check `resetSerialService()` is commented in BillerHeader.jsx

---

### Test 1.3: Multi-Tab Sync
1. Open Tab 1 → note serial (e.g., `0007`)
2. Open Tab 2 in same browser → verify serial shows `0007`
3. Save bill in Tab 1 → serial becomes `0008`
4. Wait 2 seconds
5. Tab 2 should auto-update to `0008`

**✅ PASS** if Tab 2 updates within 2 seconds  
**❌ FAIL** → Check BroadcastChannel in serialService.js

---

### Test 1.4: Multi-Device Sync
1. Login on Device 1 (PC) → serial `0009`
2. Login on Device 2 (laptop/phone) → serial `0009`
3. Save bill on Device 1 → becomes `0010`
4. Refresh Device 2 → should show `0010`

**✅ PASS** if Device 2 syncs after refresh  
**❌ FAIL** → Check Firestore transaction

---

### Test 1.5: Offline Serial
1. Disconnect internet (DevTools → Network → Offline)
2. Save bill → should get serial like `OFFL-XXXX-001`
3. Save another → `OFFL-XXXX-002`
4. Reconnect internet
5. Wait 30 seconds (sync engine runs every 30s)
6. Check Firebase Console → bills appear with normal serials

**✅ PASS** if offline bills sync to Firebase  
**❌ FAIL** → Check syncService

---

### Test 1.6: Blank Serial Prevention
1. Open Firebase Console → orders collection
2. Try to manually create order with `serialNo: ""`
3. Should fail with "permission denied"

**✅ PASS** if creation blocked  
**❌ FAIL** → Check Firestore rules `hasValidSerial()`

---

## 🟡 TEST SUITE 2: SECURITY (BILLER PERMISSIONS)

### Test 2.1: Biller Cannot Delete from UI
1. Login as biller
2. Open BillerHeader menu
3. Verify "Clear Local Cache" button is **HIDDEN** or shows "🚫 Only Super Admin"

**✅ PASS** if button not visible or disabled  
**❌ FAIL** → Check role check in BillerHeader.jsx

---

### Test 2.2: Biller Cannot Delete via Firebase Console
1. Login as biller
2. Open Firebase Console → orders → any document
3. Click 3-dot menu → Delete document
4. Should fail with "Missing or insufficient permissions"

**✅ PASS** if deletion blocked  
**❌ FAIL** → Re-check Firestore rules deployment

---

### Test 2.3: Biller Cannot Delete via Code Console
1. Login as biller
2. Open Chrome DevTools → Console
3. Run:
```javascript
db.collection('orders').limit(1).get().then(snap => {
  const doc = snap.docs[0];
  doc.ref.delete().then(() => console.log('DELETED'))
    .catch(e => console.log('BLOCKED:', e.code));
});
```
Should print: `BLOCKED: permission-denied`

**✅ PASS** if blocked  
**❌ FAIL** → Rules not deployed

---

### Test 2.4: Counter Cannot Go Backward
1. In Firebase Console, open `stores/mo2msiaf`
2. Note current `lastSerialNumber` (e.g., `10`)
3. Try to manually edit it to `5`
4. Save → should fail

**✅ PASS** if edit blocked (non-superadmin user)  
**❌ FAIL** → Check store rules

---

### Test 2.5: Serial Locks Are Immutable
1. In Firebase Console, open any `serialLocks/{id}` document
2. Try to edit any field → should fail
3. Try to delete document → should fail

**✅ PASS** if both blocked  
**❌ FAIL** → Check serialLocks rules

---

### Test 2.6: Activity Logs Are Immutable
1. In Firebase Console, open any `activityLogs/{id}` document
2. Try to edit → should fail
3. Try to delete → should fail

**✅ PASS** if both blocked  
**❌ FAIL** → Check activityLogs rules

---

## 🟢 TEST SUITE 3: SUPER ADMIN PERMISSIONS

### Test 3.1: Super Admin Can Delete
1. Login as super admin
2. Open Firebase Console → delete any test order
3. Should succeed

**✅ PASS** if deletion works  
**❌ FAIL** → Check rules `isSuperAdmin()` function

---

### Test 3.2: Audit Log Created on Delete Attempt
1. Login as biller
2. Try to delete via code (will be blocked)
3. Login as super admin → check `activityLogs` collection
4. Should see entry with attempted deletion

**✅ PASS** if log entry exists  
**❌ FAIL** → Check activityLogger.js

---

## 🔴 TEST SUITE 4: PWA & DEPLOYMENT

### Test 4.1: PWA Install on Localhost
1. Open `https://localhost:3000` in Chrome
2. Address bar should show install icon (⊕)
3. Click → Install
4. App opens in standalone window

**✅ PASS** if installs  
**❌ FAIL** → Check manifest.json + service worker

---

### Test 4.2: PWA Install on LAN IP
1. Find PC's IP: `ipconfig` (Windows) / `ifconfig` (Mac/Linux)
2. From another device, open `https://192.168.0.118:3000`
3. Accept SSL warning
4. Install icon should appear
5. Install successfully

**✅ PASS** if installs from LAN  
**❌ FAIL** → Check vite.config.js basicSsl plugin

---

### Test 4.3: Offline Mode
1. Install PWA
2. Disconnect internet
3. Open installed PWA
4. Should load and work
5. Save bills locally
6. Reconnect → bills sync

**✅ PASS** if works fully offline  
**❌ FAIL** → Check workbox config

---

### Test 4.4: PWA Updates Automatically
1. Make a small visible change in code (e.g., title)
2. Build + deploy
3. Open PWA on device
4. Within 1 minute, should auto-reload with new version

**✅ PASS** if auto-updates  
**❌ FAIL** → Check `registerType: "autoUpdate"`

---

## 🔵 TEST SUITE 5: BUSINESS FLOWS

### Test 5.1: Complete Bill Flow
1. Login as biller
2. Add customer (or select existing)
3. Add 3 items to bill
4. Apply discount
5. Click checkout (F8)
6. Payment screen → cash payment
7. Print invoice
8. Verify in Firebase

**✅ PASS** if all steps work  
**❌ FAIL** → Document failure point

---

### Test 5.2: Hold Bill & Resume
1. Add items to bill
2. Click Hold (F10)
3. Start new bill
4. Open held bills
5. Resume held bill
6. Items should be restored

**✅ PASS** if resume works  
**❌ FAIL** → Check holdBillService

---

### Test 5.3: Multi-Tab Bill Drafts
1. Open Tab 1 → add items
2. Open Tab 2 → add different items
3. Refresh both tabs
4. Each tab restores its own draft

**✅ PASS** if drafts persist per tab  
**❌ FAIL** → Check draftService

---

### Test 5.4: Customer Search
1. Add customer with phone `03001234567`
2. New bill → search `"03001"`
3. Customer appears in dropdown
4. Select → fills form

**✅ PASS** if search works  
**❌ FAIL** → Check customer search logic

---

### Test 5.5: Print Invoice
1. Complete a bill
2. Print preview opens
3. Verify all data correct
4. Print to PDF
5. Verify formatting

**✅ PASS** if print works  
**❌ FAIL** → Check InvoicePrint component

---

## 📊 TEST SUITE 6: PERFORMANCE

### Test 6.1: Page Load Speed
1. Chrome DevTools → Network tab
2. Hard refresh
3. Load time should be < 3 seconds

**✅ PASS** if < 3s  
**⚠️ WARNING** if 3-5s  
**❌ FAIL** if > 5s

---

### Test 6.2: Bill Save Speed
1. DevTools → Performance → Record
2. Save a bill
3. Stop recording
4. Measure save time

**✅ PASS** if < 500ms (online), < 100ms (offline)  
**❌ FAIL** otherwise

---

### Test 6.3: Memory Leak Test
1. DevTools → Performance Monitor
2. Save 50 bills in a row
3. Memory should stabilize, not grow continuously

**✅ PASS** if memory stable  
**❌ FAIL** if memory grows continuously

---

## ✅ FINAL SIGN-OFF

When **ALL** tests pass:

```
PRODUCTION READINESS CHECKLIST:
- [ ] Test Suite 1: Serial System (6/6 pass)
- [ ] Test Suite 2: Security (6/6 pass)
- [ ] Test Suite 3: Super Admin (2/2 pass)
- [ ] Test Suite 4: PWA & Deployment (4/4 pass)
- [ ] Test Suite 5: Business Flows (5/5 pass)
- [ ] Test Suite 6: Performance (3/3 pass)

Total: ___/26 tests passed

Approved by: _____________
Date: _____________
```

---

## 🚨 CRITICAL FAILURES (BLOCK PRODUCTION)

If **ANY** of these fail, **DO NOT DEPLOY**:

- ❌ Test 1.2 (Serial persistence)
- ❌ Test 2.2 (Biller delete blocked)
- ❌ Test 2.3 (Code-level delete blocked)
- ❌ Test 1.6 (Blank serial prevention)
- ❌ Test 4.2 (LAN PWA install)

**Fix these first, then re-test.**

