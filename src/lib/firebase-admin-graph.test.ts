import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

/**
 * Guards the module split that fixed the production outage where
 * Firestore-only API routes pulled `firebase-admin/auth` — and its
 * `jwks-rsa` -> ESM-only `jose` chain — into the server bundle.
 * This file intentionally imports nothing firebase-admin statically;
 * node:test runs each file in its own process, so the require cache
 * reflects only what this file triggers.
 */

const require = createRequire(import.meta.url);

function loadedNodeModules(): string[] {
  return Object.keys(require.cache ?? {}).filter((p) =>
    /node_modules[\\/]/.test(p)
  );
}

test("the Firestore admin helper loads no Admin Auth or jose modules", async () => {
  const { getAdminDb } = await import("./firebase-admin-db");
  // Exercise the getter; envs may be absent in tests — module loading is
  // what this assertion covers.
  getAdminDb();

  const offenders = loadedNodeModules().filter((p) =>
    /firebase-admin[\\/]lib[\\/]auth|jwks-rsa|[\\/]jose[\\/]/.test(p)
  );
  assert.deepEqual(
    offenders,
    [],
    `Firestore-only import path must not load Admin Auth modules:\n${offenders.join(
      "\n"
    )}`
  );
});

test("Firestore-only sources never import the admin Auth graph", () => {
  const firestoreOnlySources = [
    "src/app/api/games/route.ts",
    "src/app/api/all-picks/route.ts",
    "src/app/api/nfl-games/route.ts",
    "src/app/api/cron/pick-reminder/route.ts",
    "src/app/api/cron/weekly-recap/route.ts",
    "src/lib/espn-cache.ts",
    "src/lib/firebase-admin-app.ts",
    "src/lib/firebase-admin-db.ts",
  ];

  // Quoted module specifiers only, so explanatory comments mentioning the
  // auth package do not trip the guard.
  const authSpecifier = /["'][^"']*(firebase-admin\/auth|firebase-admin-auth)["']/;

  for (const rel of firestoreOnlySources) {
    const source = readFileSync(rel, "utf8").replace(/\/\/.*$/gm, "");
    assert.equal(
      authSpecifier.test(source),
      false,
      `${rel} must not import the Admin Auth module graph`
    );
  }
});
