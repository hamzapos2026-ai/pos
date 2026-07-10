# 09 — Screen recording checklist (10–15 minutes)

**Status:** Checklist only — **you** (or a demo operator) must record on a real machine with a demo Firebase project.  
**Do not** show real customer PII, real passwords, or `.env` / API keys on screen.

## Suggested title

`A One Jewelry POS — Module Walkthrough — Jul 2026`

## Prep (2 min before record)

- [ ] Use a **demo** shop / demo users (Biller, Cashier, Manager, Admin)
- [ ] Demo printer or “Save as PDF” / print dialog cancel is OK if no thermal printer
- [ ] Clear browser console of secrets; hide bookmarks with credentials
- [ ] Window size 1280×720 or 1920×1080
- [ ] Narrate briefly in Urdu or English (optional)

## Recording script (~12 min)

| Time | Module | What to show |
|------|--------|----------------|
| 0:00–1:00 | **Login** | Open app → login as Admin → mention roles |
| 1:00–2:00 | **Dashboard** | Admin dashboard cards / navigation |
| 2:00–4:30 | **Billing** | Switch to Biller → add items → customer → F8 checkout → serial |
| 4:30–5:30 | **Printing** | Invoice print dialog / preview (thermal or A4) |
| 5:30–7:00 | **Cashier / payment** | Pending bill → pay (cash or demo method) |
| 7:00–8:00 | **Customer** | Manager or Admin customers list → open one persona/detail |
| 8:00–9:30 | **Reports** | Manager Reports (or Admin reports) — date filter + one chart/table |
| 9:30–11:00 | **Settings** | Shop settings / payment methods / one discount or role setting |
| 11:00–13:00 | **Offline** | DevTools Offline → create bill or pay → back online → sync/flush |
| 13:00–14:00 | **Close** | Logout; state “end of walkthrough” |

## Optional extras (if time)

- Reconciliation screen  
- Commission / salesperson report  
- Branch switch (if multi-branch demo)  
- LAN shop-server mention (do not expose internal IPs if sensitive)

## Deliverable

Place the MP4/WebM next to the audit ZIP:

```
audit-dist/
  AOne-POS-Walkthrough-2026-07.mp4
  aone-jewelry-pos-source-YYYYMMDD.zip
  ...
```

## Privacy

- Blur or avoid: real phone numbers, CNICs, live card numbers, Firebase console with keys visible.
- Prefer demo data created for audit day.
