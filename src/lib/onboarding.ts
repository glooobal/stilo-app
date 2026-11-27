import { readTextPreference, writePreference } from './preferences';

const ONBOARDING_PREFERENCE = 'onboarding.done';

/** The welcome was shown (finished or skipped): it never comes back. */
export function isOnboardingDone(): boolean {
  return readTextPreference(ONBOARDING_PREFERENCE) === 'true';
}

export function markOnboardingDone() {
  writePreference(ONBOARDING_PREFERENCE, 'true');
}
