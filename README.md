# NFL Picks

NFL Picks is a Next.js 16 application for choosing NFL game winners, comparing results with other players, and tracking weekly and season records. Version 1.1.0 adds installable PWA support and includes the season-qualified schedule and Google sign-in fixes.

## Features

- Firebase Google sign-in and Firestore-backed profiles, picks, and leaderboards
- ESPN schedules and scores qualified by NFL season, season type, and week
- Server-enforced kickoff locking and checked pick-save responses
- Regular-season weeks 1–18 and postseason weeks 19–22 (Pro Bowl excluded)
- Installable PWA with a minimal offline fallback and user-controlled updates
- Resend-powered weekly recap and incomplete-picks reminder emails

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS, and Radix UI
- Firebase Authentication, Firestore, Admin SDK, and Cloud Functions
- Vercel for the web application

## Local setup

Requirements: Node.js 24 for the web app and Cloud Functions (see `.nvmrc` and each package's `engines.node`), npm, and a Firebase project.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Configure this domain in Firebase Authentication when testing Google sign-in locally.

Required environment-variable names:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
RESEND_API_KEY
RESEND_EMAIL_DOMAIN
CRON_SECRET
NEXT_PUBLIC_APP_URL
```

`RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN` configure transactional email through the existing `mail.seasaba.com` Resend domain (sender `NFL Picks <picks@mail.seasaba.com>`). `CRON_SECRET` authenticates the scheduled `/api/cron/*` routes that Vercel Cron calls. `NEXT_PUBLIC_APP_URL` supplies the absolute URL for email links; on Vercel it falls back to `VERCEL_URL`.

Never commit `.env.local`, service-account JSON, private keys, or Vercel bypass tokens. Preserve escaped newlines in `FIREBASE_ADMIN_PRIVATE_KEY`.

## Scheduled emails

Two Vercel Cron jobs in `vercel.json` drive email:

- `/api/cron/pick-reminder` fires Thursday 00:00 UTC and only sends when it is Wednesday 5:00 PM `America/Phoenix`, which the route verifies from the IANA timezone rather than a fixed offset. Users with unpicked games whose kickoffs are still ahead get a reminder listing the missing matchups.
- `/api/cron/weekly-recap` runs daily, finds the most recent week whose games are all final, and sends one recap per player who picked that week.

Both jobs write `emailSends/{year}-{week}-{userId}-{type}` records claimed in a transaction before sending, and the same key is passed to Resend as its `Idempotency-Key` header. Provider rejections are retryable; once Resend accepts a message the record is reconciled to `sent` (via `accepted` if the write fails) rather than resent. The honest guarantee is at-least-once with provider-level dedupe: a crash in the narrow gap between provider acceptance and the state write can only be fully deduped while Resend retains the idempotency key. Users can toggle each email category under the mail icon in the header (`users/{uid}.emailPreferences`).

## Commands

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build

cd functions
npm install
npm run build
```

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) validates every pull request and push to `master` under Node 24. The `App (Next.js)` job runs `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`; the `Functions (Firebase)` job runs `npm ci`, `npm run lint`, and `npm run build` in `functions/`. CI requires no production secrets and never deploys. Both checks are required to pass before a pull request can merge to `master`.

## Firebase and Google sign-in

1. Register a Firebase web app.
2. Enable the Google provider in Firebase Authentication.
3. Add `localhost`, the production hostname, and each intended stable staging/preview hostname to Firebase Authentication authorized domains.
4. Use the Firebase-generated auth domain unless a custom auth domain has been fully configured.
5. Set matching client and Admin project variables for each environment.

The application uses Firebase popup sign-in in normal and standalone display modes. Browser COOP `window.closed` warnings can be harmless; diagnose the Firebase error code and network response before changing headers or switching to redirect auth.

## Isolated staging

Use a separate Firebase project, web app, Firestore database, Google provider, and Admin service account. In Vercel, scope staging variables to the intended preview branch only. Never point a test preview at production Firestore. Authorize the stable preview hostname in the staging Firebase project before testing sign-in.

Preview verification should cover sign-in, current week, week navigation, schedule sync, pick save/reload, kickoff locking, leaderboard profile creation, manifest/icons, installation, offline fallback, and service-worker updates. See `DEPLOYMENT.md` for release order and rollback constraints.

## PWA behavior

- Chromium browsers use the native install prompt when available.
- On iPhone/iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**.
- Other browsers show concise browser-menu installation guidance.
- The install control is hidden in standalone mode.
- Offline mode displays a connection-required page. Games, authentication, private data, picks, schedules, and score APIs are not cached.
- Pick submissions are never queued offline.
- A waiting service worker displays an update prompt. Reload occurs only after the user chooses **Update now**, and updating is blocked while picks are unsaved.

Installed-app capabilities vary by browser and OS. iOS and Android standalone behavior must be reported as untested unless exercised on those devices.

## Data model

```text
games/{eventId}
cache/schedule-{year}-{week}
cache/schedule-sync-{year}-{week}
emailSends/{year}-{week}-{userId}-{type}
users/{uid}
users/{uid}/seasons/{year}
users/{uid}/seasons/{year}/weeks/{week}
users/{uid}/seasons/{year}/weeks/{week}/picks/{eventId}
```

A fresh schedule-sync marker records the exact authoritative ESPN event-ID set. Firestore schedules are trusted only when their validated IDs exactly match that marker.

## Deployment ownership

Vercel deploys the Next.js UI and API routes. Firebase CLI deployment separately updates Firestore rules and Cloud Functions. A Vercel deployment does not update scheduled writers. Follow the coordinated sequence in `DEPLOYMENT.md`.

## Outstanding historical repair

Production contains historical 2025 Week 1 and Week 17 game documents that were mislabeled as season 2026 by older writers. Runtime filtering prevents them from supplying current schedules. Existing referenced picks and statistics already belong to the correct 2025 hierarchy and must be preserved. Repair remains pending separate approval; it has not been executed.

## Security

See `SECURITY.md`. Report vulnerabilities privately rather than opening a public issue containing credentials or exploit details.
