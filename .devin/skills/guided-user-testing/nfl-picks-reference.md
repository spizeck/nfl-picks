# NFL Picks guided testing reference

Use this with the `guided-user-testing` skill for the `nfl-picks` repository.

## Environments

- **Production site:** `https://nfl-picks-alpha.vercel.app/`
- **Default staging preview (PWA/feature branch):** `https://nfl-picks-git-feature-pwa-110-chad-nuttalls-projects.vercel.app`
- **Preferred test Firebase project:** `cj-nfl-picks-staging`
- **Auth provider:** Google sign-in

Always verify the preview URL resolves to the intended commit before testing. Do not test against production user data.

## Typical user-facing scenarios

1. **Current-week schedule loads**
   - Open the preview.
   - Confirm the current NFL season/week display and game list appear.
2. **Pick save and persistence**
   - Select a team for an upcoming game.
   - Save the pick.
   - Reload the page and confirm the pick is still selected.
3. **Offline fallback**
   - Open DevTools → Network and set it to Offline.
   - Navigate to another page.
   - Confirm the offline page appears and explains picks are not queued.
   - Disable Offline and confirm normal loading resumes.
4. **Install and standalone launch**
   - Look for the in-app install prompt or browser install icon.
   - Install the PWA.
   - Launch from the installed shortcut.
   - Confirm it opens without browser chrome.
5. **Google sign-in in standalone mode**
   - In the installed PWA, sign in with Google.
   - Confirm the user name/avatar appears.
6. **PWA update with unsaved pick**
   - Deploy or wait for a new service-worker revision.
   - Select a team but do not save.
   - Trigger the update prompt (DevTools → Service Workers → Update).
   - Confirm the update is blocked while a pick is unsaved.
   - Save the pick.
   - Confirm the update can now activate and reload.
   - Confirm the saved pick is still present after reload.

## Cache and data expectations

- The service worker cache namespace is `nfl-picks-static-*`.
- It should only contain public static shell assets.
- It should NOT contain `/api/*`, Firebase auth, Firestore data, schedules, scores, picks, or user profiles.
- Old `nfl-picks-static-*` caches may be removed; unrelated same-origin caches must remain untouched.

## Untested platform defaults

If the user is on Chrome on Windows, validate that platform only. The following are usually not physically tested and should be reported separately unless the user explicitly confirms otherwise:

- iPhone / iPad Safari installation and standalone mode
- Android Chrome installation and standalone mode
- macOS Safari / Firefox
- Linux browsers
