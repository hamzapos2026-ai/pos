Param(
  [string]$Project = $env:FIREBASE_PROJECT
)
if (-not $Project) {
  Write-Host "Usage: .\deploy-firestore-rules.ps1 -Project <firebase-project-id> or set FIREBASE_PROJECT"
  exit 2
}

Write-Host "About to deploy firestore.rules to project: $Project"
$c = Read-Host "Type YES to confirm"
if ($c -ne 'YES') { Write-Host 'Aborting'; exit 0 }

npx firebase deploy --only firestore:rules --project $Project
Write-Host 'Done'
