#!/usr/bin/env bash
# Deploy firestore.rules to a Firebase project (staging)
set -euo pipefail

PROJECT=${1:-${FIREBASE_PROJECT:-}}
if [ -z "$PROJECT" ]; then
  echo "Usage: $0 <firebase-project-id>  (or set FIREBASE_PROJECT env var)"
  exit 2
fi

echo "About to deploy firestore.rules to project: $PROJECT"
read -p "Type YES to confirm: " confirm
if [ "$confirm" != "YES" ]; then
  echo "Aborting"
  exit 0
fi

echo "Deploying rules..."
npx firebase deploy --only firestore:rules --project "$PROJECT"
echo "Done"
