import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { getApps } from "firebase-admin/app";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

const ADMIN_ENV_VARS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

function withEnv<T>(
  overrides: Partial<Record<(typeof ADMIN_ENV_VARS)[number], string>>,
  fn: () => T
): T {
  const saved = ADMIN_ENV_VARS.map((key) => [key, process.env[key]] as const);
  for (const key of ADMIN_ENV_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const withoutAdminEnv = <T>(fn: () => T): T => withEnv({}, fn);

test("admin getters return null instead of throwing when env vars are absent", () => {
  withoutAdminEnv(() => {
    assert.equal(getAdminDb(), null);
    assert.equal(getAdminAuth(), null);
  });
});

test("admin getters are idempotent across repeated calls", () => {
  withoutAdminEnv(() => {
    assert.equal(getAdminDb(), getAdminDb());
    assert.equal(getAdminAuth(), getAdminAuth());
  });
});

test("configured admin getters initialize once and return the same instances", () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  withEnv(
    {
      FIREBASE_ADMIN_PROJECT_ID: "nfl-picks-test",
      FIREBASE_ADMIN_CLIENT_EMAIL:
        "sa@nfl-picks-test.iam.gserviceaccount.com",
      FIREBASE_ADMIN_PRIVATE_KEY: privateKey,
    },
    () => {
      const db = getAdminDb();
      assert.notEqual(db, null);
      assert.equal(getAdminDb(), db);
      const auth = getAdminAuth();
      assert.notEqual(auth, null);
      assert.equal(getAdminAuth(), auth);
      assert.equal(getApps().length, 1);
    }
  );
});
