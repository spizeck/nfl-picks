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

test("jwks-rsa resolves a require()-able jose build", () => {
  // jwks-rsa is CommonJS and calls require("jose"); jose@6 ships no CJS
  // build, which caused ERR_REQUIRE_ESM in the Vercel runtime. The package
  // override pins jwks-rsa's jose to 5.x — this guards that resolution.
  const jwksRsaDir = require("path").dirname(
    require.resolve("jwks-rsa/package.json")
  );
  const joseEntry = require.resolve("jose", { paths: [jwksRsaDir] });
  const josePkg = require(require.resolve("jose/package.json", {
    paths: [jwksRsaDir],
  })) as { version: string };

  assert.ok(
    Number(josePkg.version.split(".")[0]) < 6,
    `jose@${josePkg.version} must be < 6 (6.x is ESM-only); ` +
      `resolved entry: ${joseEntry}`
  );
  assert.doesNotThrow(
    () => require(joseEntry),
    `jwks-rsa's jose must be require()-able; resolved: ${joseEntry}`
  );
});

test("firebase-admin/auth loads without ERR_REQUIRE_ESM", () => {
  // The exact production failure: evaluating the auth graph (jwks-rsa ->
  // jose) threw ERR_REQUIRE_ESM inside the Vercel server bundle. Requiring
  // the real package exercises the same module resolution.
  assert.doesNotThrow(() => {
    require("firebase-admin/auth");
  });
});
