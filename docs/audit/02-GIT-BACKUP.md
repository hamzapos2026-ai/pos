# 02 — Git repository backup & branch

**Date:** 10 Jul 2026

## Current branch

| Field | Value |
|-------|--------|
| Branch | `main` |
| Tracking | `origin/main` |
| Remote fetch/push | `https://github.com/hamzapos2026-ai/pos.git` |
| Audit baseline commit | `2129948` — `chore: snapshot Operational POS baseline and formal audit package` |
| Note | Local branch is **ahead of origin by 1 commit** (not pushed unless you request push) |

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

- Working tree may contain uncommitted Operational POS work; the audit ZIP includes the **working tree snapshot** (secret-free), while the **bundle** captures committed history.
- `.env` is gitignored and must never be in the bundle if it was never committed (verify with `git log --all -- .env`).
- Prefer sharing the bundle + source ZIP together so both history and latest files are available.

## Recommended tag (optional, after commit)

```bash
git tag -a audit-baseline-2026-07-10 -m "Formal audit baseline Jul 2026"
```
