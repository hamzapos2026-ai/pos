# GitHub Push Checklist — A One Jewelry POS

**Project:** `aone-jewelry-pos`  
**Last Audit:** 5 June 2026

Use this checklist before every push to GitHub, especially before making the repo public.

---

## 🔴 BLOCKERS — Push se pehle MUST fix

- [ ] **`TROUBLESHOOTING.md` se Firebase credentials hatao**
  - File: `TROUBLESHOOTING.md` (lines ~29–30, 122–128)
  - Real API key `AIzaSy...` aur project ID committed hai
  - Action: Redact + Firebase Console se keys rotate (agar repo kabhi public hua)

- [ ] **Verify `.env` files gitignore mein hain aur commit nahi ho rahe**
  - Check: `git status` mein koi `.env`, `.env.local` na ho
  - `.gitignore` already has `.env`, `.env.local`, `.env.*.local` ✅

- [ ] **Firestore rules review (minimum awareness)**
  - `firestore.rules` — users self-escalation, open bills/counters
  - Push kar sakte ho lekin **production deploy mat karo** jab tak fix na ho

---

## 🟠 HIGH — Strongly recommended before push

- [ ] **Add `.env.example`** (currently missing)
  ```env
  VITE_FIREBASE_API_KEY=your_key_here
  VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=your_project_id
  VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
  VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
  VITE_FIREBASE_APP_ID=1:123456789:web:abc123
  ```

- [ ] **Remove or gate console.log (133 in src/)**
  - Worst offenders:
    - `src/hooks/useCashierBills.js` (28)
    - `src/services/serialService.js` (20)
    - `src/services/localSyncService.js` (12)
    - `src/main.jsx` (10)
    - `src/context/AuthContext.jsx` (10)
  - Option: `if (import.meta.env.DEV) console.log(...)`

- [ ] **Run build locally**
  ```bash
  npm run build
  ```
  - Must exit 0

- [ ] **Run tests**
  ```bash
  npm test
  ```

- [ ] **Run lint**
  ```bash
  npm run lint
  ```
  - CI currently does NOT run lint — manual required

---

## 🟡 MEDIUM — Clean commit hygiene

- [ ] **Review untracked files (24 new files)**
  - Decide: commit ya .gitignore
  - New modules: commission, activity logs, settings sync, counting speech, etc.
  - `COMMISSION_TROUBLESHOOTING.md` — check for secrets before commit

- [ ] **No duplicate path entries**
  - Git status should use forward slashes only (currently OK)

- [ ] **Deleted file intentional**
  - `src/pages/admin/FeatureToggles.jsx` (D) — confirm removal in commit message

- [ ] **firestore.rules changes reviewed**
  - Modified file — document what changed in PR/commit

- [ ] **README updated** if new env vars or setup steps added

---

## 🟢 LOW — Nice to have

- [ ] Add CI steps for `npm run lint` and `npm run build`
  - File: `.github/workflows/ci.yml` (currently test-only)

- [ ] Add `no-console` ESLint rule for production builds

- [ ] PWA manifest `dir` — consider dynamic or note LTR-only

- [ ] Pre-commit hook (optional): lint-staged

---

## Git Commands (Pre-Push)

```bash
# 1. Status check
git status

# 2. Ensure no secrets staged
git diff --cached | findstr /i "AIza apiKey password secret"

# 3. Build + test
npm run build
npm test
npm run lint

# 4. Stage intentionally (example)
git add src/ docs/ firestore.rules
# DO NOT: git add .env TROUBLESHOOTING.md (if contains secrets)

# 5. Commit with clear message
git commit -m "feat: commission, activity logs, QR serial, counting fixes"

# 6. Push
git push -u origin HEAD
```

---

## Files That Should NEVER Be Committed

| Pattern | Reason |
|---------|--------|
| `.env`, `.env.local` | Secrets |
| `node_modules/` | Dependencies |
| `dist/` | Build output |
| Firebase service account JSON | Admin SDK key |
| Real API keys in any `.md` | Public exposure |
| User data exports / backups | PII |

---

## Post-Push Verification

- [ ] GitHub repo settings: private if not production-ready
- [ ] Firebase Console: restrict API key to your domains
- [ ] Firestore rules deployed match committed version
- [ ] No secrets in GitHub secret scanning alerts
- [ ] Create GitHub Release notes mentioning known limitations

---

## Release Blocker Summary (Do NOT deploy to public production until fixed)

1. Firestore `users` self-escalation
2. Open `bills` / `globalCounters` rules
3. Branch isolation in rules
4. Serial duplicate prevention
5. QR tamper protection (optional but recommended)

---

## Roman Urdu Quick Summary

Push se pehle: **credentials hatao**, **build chalao**, **console.log saaf karo**, **.env.example add karo**.  
Private repo push OK hai agar secrets redact hain.  
Production deploy tab jab Firestore rules fix hon.

---

*Related: `docs/final-pos-audit-report-roman-urdu.md`, `docs/final-testing-checklist.md`*
