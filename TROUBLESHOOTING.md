# 🔧 Firebase Configuration Troubleshooting

## Issue: "Firebase is not configured properly"

This error occurs when the application can't read the Firebase credentials from the `.env` file.

---

## ✅ Solution Steps

### Step 1: RESTART THE DEVELOPMENT SERVER (MOST IMPORTANT!)

**Environment variables are only loaded when the server starts.** If you changed the `.env` file while the server was running, you MUST restart it.

```bash
# Stop the server
# Press Ctrl+C in the terminal

# Start the server again
npm run dev
```

### Step 2: Check Browser Console

After restarting, open the browser console (F12) and look for:

```
=== ENVIRONMENT VARIABLES TEST ===
VITE_FIREBASE_API_KEY: AIzaSyBSWbAM6S5lr_Hml8hoQdBRejXzhjlQQxE
VITE_FIREBASE_AUTH_DOMAIN: adpos-b8af3.firebaseapp.com
...
=== END TEST ===
```

And:

```
Firebase Config Status: {
  apiKey: "✓ Set",
  authDomain: "✓ Set",
  projectId: "✓ Set",
  ...
}
```

### Step 3: Verify .env File Location

The `.env` file MUST be in the root of the `aone-jewelry-pos` directory:

```
aone-jewelry-pos/
├── .env          ← MUST be here
├── package.json
├── vite.config.js
├── src/
└── ...
```

### Step 4: Check .env File Format

Make sure there are NO spaces around the `=` sign:

✅ **CORRECT:**
```
VITE_FIREBASE_API_KEY=AIzaSyBSWbAM6S5lr_Hml8hoQdBRejXzhjlQQxE
```

❌ **WRONG:**
```
VITE_FIREBASE_API_KEY = AIzaSyBSWbAM6S5lr_Hml8hoQdBRejXzhjlQQxE
```

### Step 5: Clear Browser Cache

Sometimes the browser caches old JavaScript files:

1. Press `Ctrl + Shift + Delete`
2. Select "Cached images and files"
3. Click "Clear data"
4. Hard refresh: `Ctrl + F5`

### Step 6: Check for .env.local

If you have a `.env.local` file, it will override `.env`:

```bash
# Check if .env.local exists
dir .env.local

# If it exists, either delete it or update it
```

---

## 🚀 Quick Fix Commands

```bash
# Navigate to project
cd aone-jewelry-pos

# Stop any running server (Ctrl+C)

# Clear npm cache (optional)
npm cache clean --force

# Reinstall dependencies (optional)
rm -rf node_modules package-lock.json
npm install

# Start fresh
npm run dev
```

---

## 📋 Verify .env Content

Your `.env` file should look exactly like this:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyBSWbAM6S5lr_Hml8hoQdBRejXzhjlQQxE
VITE_FIREBASE_AUTH_DOMAIN=adpos-b8af3.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=adpos-b8af3
VITE_FIREBASE_STORAGE_BUCKET=adpos-b8af3.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=346878143963
VITE_FIREBASE_APP_ID=1:346878143963:web:11b89feb8f4e1d2850cbfe
VITE_FIREBASE_MEASUREMENT_ID=G-4N5VLKBGCD
```

---

## 🔍 Still Not Working?

### Check if Vite is reading .env:

Create a temporary component to log the values:

```jsx
// Add to any component
console.log('API Key:', import.meta.env.VITE_FIREBASE_API_KEY);
```

If it shows `undefined`, Vite isn't reading the file.

### Common Issues:

1. **File extension**: Must be `.env` (not `.env.txt` or `.env.json`)
2. **File location**: Must be in project root (same level as `package.json`)
3. **Variable prefix**: Must start with `VITE_` (Vite requirement)
4. **Server running**: Must restart after `.env` changes
5. **Quotes**: Don't use quotes around values unless they contain spaces

---

## 🧪 Test After Fix

1. Restart server: `npm run dev`
2. Open browser console (F12)
3. Look for "Firebase Config Status" log
4. All values should show "✓ Set"
5. Try creating an account on setup page

---

## 📞 If Still Stuck

1. Take a screenshot of:
   - Your `.env` file content
   - Browser console logs
   - Terminal output

2. Check these files exist:
   - `aone-jewelry-pos/.env`
   - `aone-jewelry-pos/src/services/firebase.js`
   - `aone-jewelry-pos/package.json`

3. Verify you're running `npm run dev` from the `aone-jewelry-pos` directory

---

## ✨ Success Indicators

When everything works correctly, you'll see:

```
Firebase Config Status: {
  apiKey: "✓ Set",
  authDomain: "✓ Set",
  projectId: "✓ Set",
  storageBucket: "✓ Set",
  messagingSenderId: "✓ Set",
  appId: "✓ Set",
  measurementId: "✓ Set"
}
```

And the setup page will allow you to create an account without errors!