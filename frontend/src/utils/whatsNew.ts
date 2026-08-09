/** Persist which app version the user already saw in the What's New dialog. */

const SEEN_KEY = 'mrv.whatsNew.seenVersion';

export function getSeenWhatsNewVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version.replace(/^v/i, ''));
  } catch {
    // ignore
  }
}

export function shouldShowWhatsNew(version: string): boolean {
  const seen = getSeenWhatsNewVersion();
  if (!seen) return true;
  return seen !== version.replace(/^v/i, '');
}
