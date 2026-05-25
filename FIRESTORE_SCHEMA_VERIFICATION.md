# Firebase Firestore Schema Verification Guide

## Expected User Document Structure

### Location
```
Firestore → users collection → {uid} document
```

### Expected Fields

```javascript
// Example Biller Document in Firestore
{
  uid: "zX7mK9pQlRtU2vWxYzAbCdEfGhIjKlMn",          // User ID
  name: "Ali Nawaz",                               // Full name
  email: "ali.nawaz@example.com",                  // Email
  phone: "0321-1234567",                           // Phone
  
  // 🔴 CRITICAL FIELDS FOR STORE ASSIGNMENT
  storeIds: [                                      // ← MUST BE PRESENT
    "ubjR7S5KBhj1oseY4bIx",                        // Store ID 1
    "aGhIjKlMnOpQrStUvWxYzAb"                      // Store ID 2
  ],
  storeId: "ubjR7S5KBhj1oseY4bIx",                 // ← Primary store (should match storeIds[0])
  primaryStore: "ubjR7S5KBhj1oseY4bIx",            // ← Same as storeId (for clarity)
  
  // User Roles & Permissions
  roles: ["biller"],                              // Array of roles
  role: "biller",                                 // Primary role (backward compat)
  primaryRole: "biller",                          // Primary role
  permissions: {
    biller: true,
    // ... other permissions
  },
  
  // User Code (for serial generation)
  userCode: "BIL",                                // 3-char user code
  
  // Status
  isActive: true,                                 // User active status
  status: "active",                               // Status string
  
  // Metadata
  notes: "Senior biller",                         // Optional notes
  loginCount: 42,                                 // Total login count
  lastLogin: Timestamp(seconds: 1715820600),      // Last login time
  isDeleted: false,                               // Soft delete flag
  deletedAt: null,                                // When deleted (null if active)
  
  // Audit Trail
  createdBy: "qK8nL9mOpQrStUvWxYzAbCdEfGhIjKl",   // Creator user ID
  createdAt: Timestamp(seconds: 1715000000),      // Creation timestamp
  updatedBy: "qK8nL9mOpQrStUvWxYzAbCdEfGhIjKl",   // Last updater
  updatedAt: Timestamp(seconds: 1715820600)       // Last update timestamp
}
```

## Expected Store Document Structure

### Location
```
Firestore → stores collection → {storeId} document
```

### Expected Fields

```javascript
// Example Store Document in Firestore
{
  id: "ubjR7S5KBhj1oseY4bIx",                    // Store ID (same as doc ID)
  storeName: "Main Branch Karachi",               // ← Store name (REQUIRED for display)
  
  // Alternatively (backward compat)
  name: "Main Branch Karachi",                    // If storeName not present
  
  // Store Details
  location: "Karachi",                            // City/location
  address: "123 Main Street, Karachi",            // Full address
  city: "Karachi",                                // City
  country: "Pakistan",                            // Country
  
  // Store Configuration
  branchCode: "KHI",                              // 3-char branch code
  timezone: "Asia/Karachi",                       // Timezone
  currency: "PKR",                                // Currency
  
  // Store Status
  isActive: true,                                 // Store active status
  status: "active",                               // Status string
  
  // Metadata
  notes: "Main jewelry store",                    // Optional notes
  
  // Audit Trail
  createdAt: Timestamp(seconds: 1714000000),      // Creation timestamp
  updatedAt: Timestamp(seconds: 1715000000)       // Last update timestamp
}
```

## How to Verify in Firebase Console

### Step 1: Navigate to Firestore
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database**
4. You should see collections list on the left

### Step 2: Check Users Collection
1. Click on **users** collection
2. You'll see a list of user documents by UID
3. Click on a biller's UID to view the document
4. **Expected to see:**
   - ✅ `storeIds` field (array)
   - ✅ `storeId` field (string)
   - ✅ `primaryStore` field (string)
   - ❌ If any of above are missing → sync issue

### Step 3: Check Stores Collection
1. Click on **stores** collection
2. You'll see a list of store documents
3. Click on a store ID
4. **Expected to see:**
   - ✅ `storeName` field with value
   - ✅ `location` field
   - ✅ `branchCode` field
   - ❌ If `storeName` is missing → names won't display

### Step 4: Verify Linking
1. Get a biller's UID from users collection (e.g., `abc123xyz`)
2. Get the storeIds array value (e.g., `["store1", "store2"]`)
3. Go to stores collection
4. Look for documents with IDs matching those store IDs
5. Verify each store has `storeName` field

## How to Check via Console Query

### See a Specific Biller's Stores

```javascript
// In browser console (F12 → Console tab)

// Step 1: Get current user
const currentUid = 'YOUR_BILLER_UID_HERE';  // Replace with actual UID

// Step 2: Get auth & firestore
const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
const { getFirestore, doc, getDoc, collection, query, where, getDocs } = 
  await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');

const auth = getAuth();
const db = getFirestore();

// Step 3: Fetch user document
const userRef = doc(db, 'users', currentUid);
const userSnap = await getDoc(userRef);
const user = userSnap.data();

console.log('User:', user.name);
console.log('Assigned Stores:', user.storeIds);
console.log('Primary Store:', user.primaryStore);

// Step 4: Fetch store details
const storesCol = collection(db, 'stores');
const storesSnap = await getDocs(storesCol);

user.storeIds.forEach(storeId => {
  const storeDoc = storesSnap.docs.find(d => d.id === storeId);
  if (storeDoc) {
    const store = storeDoc.data();
    console.log(`  - ${store.storeName || store.name} (${storeId})`);
  } else {
    console.log(`  - ⚠️  Store NOT FOUND: ${storeId}`);
  }
});
```

## Common Issues & What to Look For

### Issue 1: storeIds Field Missing
**What you see in Firestore:**
```javascript
{
  uid: "...",
  name: "Ali",
  email: "ali@example.com",
  roles: ["biller"],
  // ❌ NO storeIds field
}
```

**Problem:** Store assignment never synced to Firebase
**Solution:** 
1. Check IndexedDB has storeIds
2. Check SYNC_QUEUE for failed items
3. Manually trigger: `await processSyncQueue()`

### Issue 2: storeIds Empty Array
**What you see in Firestore:**
```javascript
{
  uid: "...",
  name: "Ali",
  storeIds: [],          // ❌ Empty!
  primaryStore: "",
}
```

**Problem:** User created without store assignment
**Solution:**
1. Edit user in UI
2. Assign stores
3. Save (will trigger sync)

### Issue 3: storeName Missing from Store Document
**What you see in Firestore:**
```javascript
// stores/storeId1
{
  id: "storeId1",
  location: "Karachi",
  // ❌ NO storeName field
}
```

**Problem:** Store names won't display in UI
**Solution:**
1. Edit store to add storeName
2. Or ensure backend creates stores with storeName

### Issue 4: Mismatch Between storeId and storeIds
**What you see in Firestore:**
```javascript
{
  uid: "...",
  storeIds: ["storeA", "storeB"],
  storeId: "storeC",          // ❌ Doesn't match!
  primaryStore: "storeC",     // ❌ Doesn't match!
}
```

**Problem:** Primary store not in assigned stores array
**Solution:**
1. Edit user and ensure primary store is one of assigned stores
2. System should auto-set to storeIds[0]

## Expected Field Types

| Field | Type | Required | Note |
|-------|------|----------|------|
| uid | string | ✅ Yes | Document ID should match uid |
| storeIds | array | ✅ Yes | Array of store IDs |
| storeId | string | ✅ Yes | Primary store ID (should be in storeIds) |
| primaryStore | string | ✅ Yes | Same as storeId (for clarity) |
| storeName | string | ✅ Yes | Store's display name |
| roles | array | ✅ Yes | ["biller"], ["cashier"], etc. |
| isActive | boolean | ✅ Yes | true or false |
| isDeleted | boolean | ✅ Yes | false for active users |

## What Should Happen When Store Syncs

### Scenario: Edit Biller, Add Store

```
Timeline:

T1: User clicks Edit Biller
T2: User selects stores (storeIds = ["store1", "store2"])
T3: User clicks Save
    ↓
    Saved to IndexedDB immediately
    Added to SYNC_QUEUE
    UI shows "⏳ Pending" sync badge
    
T4: Internet connected
    ↓
    processSyncQueue() triggered
    setDoc(users/{uid}, {storeIds: ["store1", "store2"], ...})
    ↓
    Firestore updated
    _syncStatus changed to "synced"
    UI shows "☁️ Synced" badge
```

## Debug by Firestore Document

### Check if Sync Worked
1. Edit user and assign stores
2. Wait for sync badge to show "☁️ Synced"
3. Go to Firebase Console
4. Open users/{uid}
5. **You should see:**
   ```
   storeIds: ["storeA", "storeB", ...]
   storeId: "storeA"
   primaryStore: "storeA"
   ```

### If Still Missing
1. Open DevTools Console
2. Run debug script: `DEBUG_STORE_ASSIGNMENT.js`
3. Check output for sync failures
4. Look at `SYNC_QUEUE` entries for error messages

## Production Checklist

- [ ] All users in Firestore have `storeIds` array
- [ ] All users have `storeId` matching `primaryStore`
- [ ] All stores in `storeIds` exist in stores collection
- [ ] All stores have `storeName` or `name` field
- [ ] No users with empty `storeIds` arrays (except admins if allowed)
- [ ] `_syncStatus` shows "synced" for all users
- [ ] No failed items in `SYNC_QUEUE`
