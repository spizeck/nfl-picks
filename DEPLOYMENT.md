# Deployment and Release Guide

Vercel and Firebase are separate deployment targets. Merging the default branch triggers Vercel automatically; it does not deploy Firestore rules or Cloud Functions.

## Environment separation

Use distinct Firebase projects for production and staging. Each environment needs its own web app, Google provider, Firestore database, Admin service account, and the variables listed in `.env.example`.

For a Vercel preview:

1. Scope all staging Firebase variables to the intended preview branch.
2. Add its stable hostname to the staging Firebase authorized domains.
3. Keep Deployment Protection enabled; use a temporary automation bypass only when necessary and revoke it afterward.
4. Confirm the compiled client project ID and server Admin project ID both identify staging.
5. Never use a production account or modify production picks during preview tests.

Firebase popup sign-in uses the configured `authDomain`. Do not switch to redirect auth merely to silence COOP console warnings; redirect flows require separate hosting/storage and callback validation.

## Required checks

Run from the repository root:

```bash
npm install
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Run for Cloud Functions:

```bash
cd functions
npm install
npm run build
cd ..
```

Validate Firebase rules before deployment:

```bash
firebase use <target-project>
firebase deploy --only firestore:rules --dry-run
```

If the installed Firebase CLI does not support `--dry-run`, validate rules in CI or the Firebase tooling before deploying.

## Preview verification

Verify and record actual versus simulated coverage:

- `/manifest.webmanifest` returns a valid manifest.
- Standard, maskable, and Apple touch icons load.
- Native installation prompt works in a supported browser.
- Fallback installation guidance is correct for the tested platform.
- Standalone display hides **Install App**.
- Offline navigation shows `offline.html`.
- Reconnection restores normal navigation.
- API, auth, schedule, score, and pick responses are absent from Cache Storage.
- Offline pick submissions are not queued.
- A waiting worker displays an update prompt.
- Choosing **Update now** with unsaved picks does not reload.
- Google sign-in, current-season matchups, week navigation, save/reload, leaderboard, and kickoff locking still work.

Do not claim iOS or Android standalone verification without testing physical devices or representative platform environments.

## Production release order

1. Obtain approval and merge the protected default branch through the PR.
2. Wait for Vercel’s automatic production deployment to become `READY`.
3. Smoke-test current week and schedule reads.
4. Deploy Firestore rules if they changed:

   ```bash
   firebase use <production-project>
   firebase deploy --only firestore:rules
   ```

5. Deploy Cloud Functions from the same merged revision:

   ```bash
   firebase deploy --only functions
   ```

6. Verify function revisions, scheduler health, schedule-sync markers, and runtime logs.
7. Re-test Google sign-in, leaderboard, current week, pick persistence, and kickoff locking.
8. Test PWA metadata, offline fallback, and update prompt on production without changing real picks.

This order minimizes the period in which old scheduled writers remain active: the updated web app refuses to trust schedules lacking a fresh exact event-ID sync marker while Functions are being deployed.

## Failure and rollback behavior

- **Vercel deployment fails:** Do not deploy new Functions. Production remains on the previous web/Functions pair.
- **Vercel succeeds, Functions fail:** Keep the new web deployment. It safely fetches ESPN when sync markers are absent or stale. Retry Functions promptly.
- **Firestore rules fail:** Stop and resolve the rules deployment before relying on profile/auth behavior that needs those rules.
- **Functions succeed after Vercel succeeds:** Do not independently roll Vercel back to a version that does not understand the current writer metadata. Coordinate both sides or pause scheduled writers.
- **PWA regression:** Revert through a reviewed commit. A new service worker can retire the old cache; do not force client reloads that can discard unsaved picks.

Never force-push, bypass checks, restore Firestore, delete records, or run historical migrations as part of a routine rollback.

## PWA release notes

The service worker caches only the offline document, manifest, and public icons. It does not cache application APIs or authenticated/private data. A new worker waits until the user accepts the in-app update. If picks are unsaved, the app blocks the update reload and asks the user to save or discard those changes first.

After a deployment, verify the old worker detects the update, **Later** leaves the current page untouched, and **Update now** activates the new worker only when no picks are unsaved.

## Historical Firestore repair

The historical mislabeled schedule repair remains pending separately approved work. The current application filters those records. The 93 inspected picks already reside under the authoritative 2025 Week 17 hierarchy with consistent statistics. Do not move, archive, delete, or recalculate them during deployment.
