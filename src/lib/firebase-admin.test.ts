import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

const ADMIN_ENV_VARS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

function withoutAdminEnv<T>(fn: () => T): T {
  const saved = ADMIN_ENV_VARS.map((key) => [key, process.env[key]] as const);
  for (const key of ADMIN_ENV_VARS) delete process.env[key];
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
