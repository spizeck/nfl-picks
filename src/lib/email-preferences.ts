/**
 * Per-user email preferences stored on `users/{uid}.emailPreferences`.
 * Both categories default to enabled; an explicit `false` opts the user out.
 */

export interface EmailPreferences {
  weeklyRecap: boolean;
  pickReminders: boolean;
}

export const EMAIL_PREFERENCE_DEFAULTS: EmailPreferences = {
  weeklyRecap: true,
  pickReminders: true,
};

export function resolveEmailPreferences(
  data: { emailPreferences?: unknown } | null | undefined
): EmailPreferences {
  const prefs =
    data?.emailPreferences && typeof data.emailPreferences === "object"
      ? (data.emailPreferences as Record<string, unknown>)
      : {};
  return {
    weeklyRecap:
      typeof prefs.weeklyRecap === "boolean"
        ? prefs.weeklyRecap
        : EMAIL_PREFERENCE_DEFAULTS.weeklyRecap,
    pickReminders:
      typeof prefs.pickReminders === "boolean"
        ? prefs.pickReminders
        : EMAIL_PREFERENCE_DEFAULTS.pickReminders,
  };
}

/**
 * Dotted Firestore field path for updating one preference without touching
 * its sibling, e.g. `emailPreferences.weeklyRecap`.
 */
export function emailPreferenceField(key: keyof EmailPreferences): string {
  return `emailPreferences.${key}`;
}

/**
 * Merge a single preference change into a resolved preference set while
 * preserving the sibling setting.
 */
export function withEmailPreference(
  current: EmailPreferences,
  key: keyof EmailPreferences,
  value: boolean
): EmailPreferences {
  return { ...current, [key]: value };
}

/**
 * Minimal write surface for persisting one preference. Callers adapt their
 * Firestore SDK (client or admin) to these two operations.
 */
export interface EmailPreferenceStore {
  /** Dotted-path field update, e.g. client `updateDoc(ref, field, value)`. */
  update(field: string, value: boolean): Promise<unknown>;
  /** Merge-write used when the user document does not exist yet. */
  setMerge(data: {
    emailPreferences: Partial<EmailPreferences>;
  }): Promise<unknown>;
}

/**
 * Persist a single preference change without touching its sibling. Tries a
 * dotted-path update first so an explicitly stored sibling is preserved;
 * falls back to a merge write when the user document does not exist yet.
 * Rejects when both writes fail so callers never report a false save.
 */
export async function saveEmailPreference(
  store: EmailPreferenceStore,
  key: keyof EmailPreferences,
  value: boolean
): Promise<void> {
  try {
    await store.update(emailPreferenceField(key), value);
  } catch {
    await store.setMerge({ emailPreferences: { [key]: value } });
  }
}

/**
 * Conservative "can we send to this address" check. Not a full RFC validator;
 * it only filters out missing or clearly malformed values.
 */
export function isUsableEmail(email: unknown): email is string {
  return (
    typeof email === "string" &&
    email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}
