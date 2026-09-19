import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_PREFERENCE_DEFAULTS,
  emailPreferenceField,
  resolveEmailPreferences,
  saveEmailPreference,
  withEmailPreference,
  type EmailPreferenceStore,
  type EmailPreferences,
} from "./email-preferences";

test("users with no stored preferences default to enabled", () => {
  assert.deepEqual(resolveEmailPreferences(undefined), {
    weeklyRecap: true,
    pickReminders: true,
  });
  assert.deepEqual(resolveEmailPreferences(null), EMAIL_PREFERENCE_DEFAULTS);
  assert.deepEqual(resolveEmailPreferences({}), EMAIL_PREFERENCE_DEFAULTS);
  assert.deepEqual(
    resolveEmailPreferences({ emailPreferences: {} }),
    EMAIL_PREFERENCE_DEFAULTS
  );
  // Non-boolean stored values are ignored rather than treated as opt-outs.
  assert.deepEqual(
    resolveEmailPreferences({
      emailPreferences: { weeklyRecap: "no", pickReminders: 0 },
    }),
    EMAIL_PREFERENCE_DEFAULTS
  );
});

test("persisted preference state is reflected correctly", () => {
  assert.deepEqual(
    resolveEmailPreferences({
      emailPreferences: { weeklyRecap: false, pickReminders: false },
    }),
    { weeklyRecap: false, pickReminders: false }
  );
  // Each key resolves independently: an unset sibling still defaults on.
  assert.deepEqual(
    resolveEmailPreferences({ emailPreferences: { weeklyRecap: false } }),
    { weeklyRecap: false, pickReminders: true }
  );
  assert.deepEqual(
    resolveEmailPreferences({ emailPreferences: { pickReminders: false } }),
    { weeklyRecap: true, pickReminders: false }
  );
});

test("withEmailPreference changes one key and preserves the sibling", () => {
  const current: EmailPreferences = { weeklyRecap: false, pickReminders: true };
  assert.deepEqual(withEmailPreference(current, "pickReminders", false), {
    weeklyRecap: false,
    pickReminders: false,
  });
  assert.deepEqual(withEmailPreference(current, "weeklyRecap", true), {
    weeklyRecap: true,
    pickReminders: true,
  });
});

test("emailPreferenceField builds the dotted path for one leaf", () => {
  assert.equal(
    emailPreferenceField("weeklyRecap"),
    "emailPreferences.weeklyRecap"
  );
  assert.equal(
    emailPreferenceField("pickReminders"),
    "emailPreferences.pickReminders"
  );
});

/**
 * In-memory stand-in for the Firestore writes the settings menu performs:
 * a dotted-path `update` (fails on missing docs, like `updateDoc`) and a
 * `setMerge` fallback (like `setDoc(..., { merge: true })`, which merges
 * nested maps and preserves unset sibling fields).
 */
class FakePreferenceStore implements EmailPreferenceStore {
  doc: Record<string, unknown> | undefined;
  failUpdate = false;
  failMerge = false;
  updateCalls: Array<{ field: string; value: boolean }> = [];
  mergeCalls = 0;

  constructor(doc?: Record<string, unknown>) {
    this.doc = doc;
  }

  async update(field: string, value: boolean): Promise<void> {
    this.updateCalls.push({ field, value });
    if (this.failUpdate) throw new Error("injected update failure");
    if (!this.doc) throw new Error("document does not exist");
    const keys = field.split(".");
    let target = this.doc;
    for (const key of keys.slice(0, -1)) {
      const next = target[key];
      if (typeof next !== "object" || next === null) {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = value;
  }

  async setMerge(data: {
    emailPreferences: Partial<EmailPreferences>;
  }): Promise<void> {
    this.mergeCalls += 1;
    if (this.failMerge) throw new Error("injected merge failure");
    const existing = (this.doc?.emailPreferences ?? {}) as Record<
      string,
      unknown
    >;
    this.doc = {
      ...this.doc,
      emailPreferences: { ...existing, ...data.emailPreferences },
    };
  }
}

test("weekly recap can be toggled independently and preserves reminders", async () => {
  const store = new FakePreferenceStore({
    emailPreferences: { weeklyRecap: true, pickReminders: false },
  });

  await saveEmailPreference(store, "weeklyRecap", false);

  assert.deepEqual(store.updateCalls, [
    { field: "emailPreferences.weeklyRecap", value: false },
  ]);
  assert.equal(store.mergeCalls, 0);
  assert.deepEqual(store.doc, {
    emailPreferences: { weeklyRecap: false, pickReminders: false },
  });
});

test("pick reminders can be toggled independently and preserves recap", async () => {
  const store = new FakePreferenceStore({
    emailPreferences: { weeklyRecap: false, pickReminders: true },
  });

  await saveEmailPreference(store, "pickReminders", false);

  assert.deepEqual(store.updateCalls, [
    { field: "emailPreferences.pickReminders", value: false },
  ]);
  assert.equal(store.mergeCalls, 0);
  assert.deepEqual(store.doc, {
    emailPreferences: { weeklyRecap: false, pickReminders: false },
  });
});

test("saving creates the user document via merge without resetting siblings", async () => {
  const store = new FakePreferenceStore();

  await saveEmailPreference(store, "pickReminders", false);

  // updateDoc fails on a missing document, so the merge fallback runs and
  // writes only the changed key — nothing resets the sibling default.
  assert.equal(store.updateCalls.length, 1);
  assert.equal(store.mergeCalls, 1);
  assert.deepEqual(store.doc, {
    emailPreferences: { pickReminders: false },
  });
  assert.deepEqual(resolveEmailPreferences(store.doc), {
    weeklyRecap: true,
    pickReminders: false,
  });
});

test("merge fallback preserves an explicitly stored sibling", async () => {
  const store = new FakePreferenceStore({
    emailPreferences: { weeklyRecap: false },
  });
  store.failUpdate = true;

  await saveEmailPreference(store, "pickReminders", false);

  assert.equal(store.mergeCalls, 1);
  assert.deepEqual(store.doc, {
    emailPreferences: { weeklyRecap: false, pickReminders: false },
  });
});

test("a failed save rejects instead of reporting success", async () => {
  const store = new FakePreferenceStore({
    emailPreferences: { weeklyRecap: true },
  });
  store.failUpdate = true;
  store.failMerge = true;

  await assert.rejects(() =>
    saveEmailPreference(store, "weeklyRecap", false)
  );
  assert.deepEqual(store.doc, {
    emailPreferences: { weeklyRecap: true },
  });
});
