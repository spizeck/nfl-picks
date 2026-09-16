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
