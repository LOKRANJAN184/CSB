# Chendurar Sweets & Bakery (செந்தூரர் ஸ்வீட்ஸ் & பேக்கரி)

Daily sales tally, staff attendance and salary app for the shop — Android app + web.

- **Live:** https://csb-three.vercel.app  ·  health check: `/api/health`
- **Android app:** download the latest APK from [Releases](../../releases/latest). The app updates itself from there.
- **Learn how everything works:** [LEARN.md](LEARN.md)

## Features
- **Sales tally** — system sales vs. cash + GPay + expenses, live "Tallied / Shortage / Excess", bill photos
- **Attendance** — present / half day / absent with in & out times
- **Records** — calendar showing which days tallied
- **Reports (owner)** — monthly totals, staff salary (days × per-day rate), any date range, all branches, PDF
- **Multi-branch**, owner logins per phone, manager locked to one approved shop device
- **Edit history** — every change with who, when, old → new
- Light / dark theme, Tamil + English font, works on cheap phones

## Quick start (developers)
```bash
cp .env.example .env     # set MONGODB_URI and JWT_SECRET
npm install
npm run dev              # http://localhost:5000
npm test                 # API tests (needs a local MongoDB)
```

## Release a new app version
```bash
npm run release -- patch "What changed"
```
GitHub Actions builds a signed APK and publishes it; phones see "Update available".
One-time setup: `bash scripts/upload-signing-secrets.sh` (see LEARN.md §10).
