# Deploying Firestore Rules (Safe workflow)

This document describes how to safely deploy `firestore.rules` to a Firebase project (staging/production).

Steps:

1. Run the unit tests locally against the emulator to ensure rules behave as expected:

```
npx firebase emulators:exec --only firestore "node scripts/test-firestore-rules.js"
```

2. Review `firestore.rules` changes and ensure tests pass.

3. Deploy to a staging project using the helper script (you will be prompted to confirm):

Linux/macOS:
```
./scripts/deploy-firestore-rules.sh your-staging-project-id
```

Windows PowerShell:
```
.\scripts\deploy-firestore-rules.ps1 -Project your-staging-project-id
```

4. After deploy, exercise the application against the staging project and run integration tests.

Notes:
- You must be logged in with `firebase login` and have the appropriate permissions for the target project.
- DO NOT deploy to production without code review and staging verification.
