---
name: guided-user-testing
description: Run a step-by-step user-tested validation walkthrough for a feature or release
argument-hint: "[<branch-or-pr>]"
---

# Guided user testing workflow

Run a focused, step-by-step validation of the current change with the user as the final tester. Complete automated checks first, then guide the user through one short action at a time. Wait for their result before continuing.

## Before involving the user

1. Determine the target branch or PR:
   - If the user invoked `/guided-user-testing <branch-or-pr>`, use that.
   - Otherwise, inspect `git status --short --branch` and any open PR to identify what is being tested.
2. Confirm the isolated test environment:
   - Use staging, preview, or test data; never test against production user data.
   - Verify the correct Firebase/project environment is active for preview URLs.
3. Find project-specific context:
   - Look for a sibling file named `REFERENCE.md` or `*.reference.md` in this skill's directory.
   - If one exists, read it and use the URLs, scenarios, and account notes it contains.
   - If not, ask the user for the test URL, isolated environment, and the two or three most important user-facing scenarios to verify.
4. Prepare the deployment:
   - Run the project's automated checks: tests, lint, typecheck, and production build.
   - If the build produces a preview URL, verify it points to the intended commit/environment.
   - Fix any failures before asking the user to test. Do not hand a broken build to the user.
5. Set up a results tracker with these columns:
   - Step, Method (auto/user), Result (passed/failed/not-tested/blocked), Notes.

## Guiding the user

- Present one short action per message. Explain exactly what to do and what success looks like.
- Let the user perform sign-in, install prompts, OS-level permissions, or anything involving their account/device. Never ask them to paste credentials, tokens, or OTPs.
- After each step, ask the user for the result. Do not infer success from silence.
- If the result differs from the expected behavior, stop the planned sequence. Investigate, fix, and re-run the affected step before moving to dependent steps.
- If a step cannot be tested on the user's current platform/browser, mark it **not tested** and continue with what can be tested.

## Core scenario checklist (tailor to the change)

Choose the subset relevant to the change; do not run unrelated steps.

1. **Smoke test** — load the app at the test URL and confirm the current feature is visible.
2. **Authentication** — sign in with the provider relevant to the project. Expected: user reaches the app, account recognized, no infinite spinner.
3. **Primary happy path** — perform the main action (e.g., make a pick, submit a form). Expected: success feedback, data updated.
4. **Persistence after reload** — reload the page. Expected: the action from step 3 is still reflected.
5. **Offline / failure recovery** — go offline or trigger an error path relevant to the change. Expected: graceful fallback, no data corruption, recovery works when connection returns.
6. **Install / standalone (PWA only)** — trigger install, launch standalone. Expected: app opens without browser chrome, sign-in still works, feature works.
7. **Update behavior (PWA only)** — trigger a service-worker update. Expected: user-controlled prompt, unsaved work not discarded, update succeeds after saving.

Record each result as:

- **Automated** — you verified it with a script/build/check.
- **User-confirmed** — the user reported the expected behavior.
- **Failed** — actual behavior differed; record the symptom and blocker.
- **Not tested** — the user's environment or platform could not cover it.

## Summary

- Report which platforms/browsers/devices were actually used and which were not.
- List automated results first, then user-confirmed results.
- Clearly separate any failed or not-tested items.
- State remaining release blockers, if any.
- Do not mark the PR as approved, do not merge, and do not deploy based solely on test completion. Testing is complete; permission to merge/deploy is a separate decision.
