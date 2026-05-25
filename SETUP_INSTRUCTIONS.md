# A One Jewelry POS - Setup & Deployment Guide

## ✅ Recent Fixes Applied

### 1. Firebase Configuration Fixed
- Updated `.env` file with your Firebase credentials
- All environment variables properly configured

### 2. Firestore Security Rules Created
- Created `firestore.rules` with proper security
- Allows initial setup (unauthenticated access to settings)
- Role-based access control for all collections

### 3. PWA Icons Fixed
- Updated `manifest.json` to use SVG icons
- Updated `index.html` to use SVG favicon
- No more 404 errors for missing PNG icons

### 4. Form Improvements
- **Enter key submission**: Now pressing Enter moves to next step or submits form
- **Input padding increased**: More comfortable input fields (px-4 py-3)

---

## 🚀 Quick Start Guide

### Step 1: Install Dependencies
```bash
cd aone-jewelry-pos
npm install
```

### Step 2: Start Development Server
```bash
npm run dev
```
**Important**: You must restart the server after `.env` changes!

### Step 3: Complete Initial Setup
1. Open browser to `http://localhost:3000` (or the URL shown)
2. You'll be redirected to `/setup` page
3. Fill in the two-step form:
   - **Step 1**: Personal info (name, email, password)
   - **Step 2**: Business info (business name, store name, location)
4. Press Enter or click "Create Account"
5. You'll be redirected to login page
6. Login with your credentials

### Step 4: Test PWA Installation
1. Click the install icon in Chrome address bar
2. App will install as standalone application
3. Test offline mode by disconnecting internet

---

## 🔥 Deploy Firestore Rules

```bash
# Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy rules
firebase deploy --only firestore:rules
```

---

## 📱 Chromebook PWA Setup

### Install on Chromebook:
1. Open app in Chrome browser
2. Click the install icon (📥) in address bar
3. App installs as standalone application
4. Works offline with IndexedDB

### Features Ready:
- ✅ Offline billing with local database
- ✅ Keyboard shortcuts (F8, +, Insert, etc.)
- ✅ Auto-logout after 1 hour
- ✅ Background sync when online
- ✅ Fast performance (Vite build)

---

## 🎯 Testing Checklist

### Basic Functionality:
- [ ] Setup page loads
- [ ] Can create super admin account
- [ ] Login works
- [ ] Enter key submits forms
- [ ] Input fields have proper padding

### PWA Features:
- [ ] App can be installed
- [ ] Works offline
- [ ] Icons display correctly
- [ ] No console errors

### Firebase Integration:
- [ ] User created in Firebase Auth
- [ ] User document created in Firestore
- [ ] Settings document created
- [ ] No permission errors

---

## 🐛 Troubleshooting

### "Firebase is not configured properly" error:
1. Stop the development server (Ctrl+C)
2. Verify `.env` file has correct values
3. Restart server: `npm run dev`

### PWA icons not showing:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh: Ctrl+F5
3. Uninstall and reinstall PWA

### Can't access setup page again:
- Setup page only shows once
- To reset: Open browser console and run:
  ```javascript
  localStorage.removeItem('aone-setup-complete')
  ```
- Then refresh the page

---

## 📊 Database Schema

### Local Database (IndexedDB):
- `bills` - Bill records
- `billItems` - Items in each bill
- `customers` - Customer database
- `payments` - Payment records
- `items` - Product inventory
- `syncQueue` - Pending sync operations
- And 6 more tables for complete POS functionality

### Firebase Collections:
- `users` - User accounts
- `settings` - App settings
- `stores` - Store information
- `products` - Product catalog
- `bills` - Bill records (synced)
- And more...

---

## 🔐 Security Notes

### Firestore Rules:
- Anyone can write to `settings` during setup (needed for first-time setup)
- After setup, only authenticated users can access data
- Role-based permissions (superAdmin, admin, manager, biller, cashier)
- Users can only access their own data
- Admins can manage all data

### Important:
- Never commit `.env` file to version control
- Keep Firebase credentials private
- Use environment variables for sensitive data

---

## 📞 Support

If you encounter any issues:
1. Check browser console for errors
2. Verify `.env` file is correct
3. Restart development server
4. Clear browser cache
5. Check Firebase console for any issues

---

## 🎉 You're All Set!

Your POS system is now:
- ✅ Properly configured with Firebase
- ✅ Ready for Chromebook PWA deployment
- ✅ Offline-capable with local database
- ✅ Secure with proper Firestore rules
- ✅ User-friendly with Enter key support
- ✅ Comfortable with better input padding

**Next Steps:**
1. Complete the setup process
2. Test all features
3. Deploy to production when ready
4. Install on Chromebook as PWA

Happy billing! 🚀