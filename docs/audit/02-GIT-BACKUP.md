# 02 — Git repository backup & branch

**Date:** 10 Jul 2026

## Current branch

| Field | Value |
|-------|--------|
| Branch | `main` |
| Tracking | `origin/main` (in sync after push) |
| Remote | `https://github.com/hamzapos2026-ai/pos.git` |
| Audit baseline commits | `2129948` (Operational POS snapshot) · `8de1c4a` (audit git-backup note) |
| GitHub push | **Done** — 10 Jul 2026 · `e75499e..8de1c4a` → `origin/main` |
| Clone | `git clone https://github.com/hamzapos2026-ai/pos.git` |

## How to create a full Git backup (no secrets in history if never committed)

```powershell
cd D:\Advance_POS\aone-jewelry-pos
# Bundle all refs (portable backup of the git database)
git bundle create .\audit-dist\aone-jewelry-pos-git-$(Get-Date -Format yyyyMMdd).bundle --all

# Verify
git bundle verify .\audit-dist\aone-jewelry-pos-git-*.bundle
```

Restore elsewhere:

```bash
git clone aone-jewelry-pos-git-YYYYMMDD.bundle aone-jewelry-pos-restored
cd aone-jewelry-pos-restored
git checkout main
```

## Notes for auditors

- Latest audit baseline is on GitHub `main` (`https://github.com/hamzapos2026-ai/pos.git`).
- The **git bundle** in `audit-dist/` is a portable offline copy of the same history.
- The **source ZIP** is a secret-free working-tree snapshot (no `.env`, no `node_modules`).
- `.env` is gitignored — verify it was never committed: `git log --all -- .env`.
- Prefer sharing the bundle + source ZIP + `AUDIT-DOCS/` together; add screen recording MP4 when ready.

## Recommended tag (optional, after commit)

```bash
git tag -a audit-baseline-2026-07-10 -m "Formal audit baseline Jul 2026"
```
