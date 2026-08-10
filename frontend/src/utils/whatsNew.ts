/** Persist which local app build already showed the Changelog dialog (offline, no GitHub). */

const SEEN_KEY = 'mrv.whatsNew.seenBuild';
/** Legacy key from 2.0.10–2.0.11 (version string only). */
const LEGACY_SEEN_KEY = 'mrv.whatsNew.seenVersion';

/**
 * Stable id for this running build: semver + optional frontend asset name from `/api/version`.
 * A new packaged/frontend build changes the asset hash → dialog shows again even if APP_VERSION
 * was not bumped (e.g. rebuild for testing). Independent of GitHub / update checks.
 */
export function buildWhatsNewId(version: string, frontendBundle?: string | null): string {
  const v = version.trim().replace(/^v/i, '');
  const b = (frontendBundle ?? '').trim();
  return b ? `${v}|${b}` : v;
}

export function getSeenWhatsNewId(): string | null {
  try {
    const modern = localStorage.getItem(SEEN_KEY);
    if (modern) return modern;
    return localStorage.getItem(LEGACY_SEEN_KEY);
  } catch {
    return null;
  }
}

export function markWhatsNewSeen(version: string, frontendBundle?: string | null): void {
  try {
    const id = buildWhatsNewId(version, frontendBundle);
    localStorage.setItem(SEEN_KEY, id);
    localStorage.removeItem(LEGACY_SEEN_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/** True until the user closes the auto-opened dialog for this exact local build. */
export function shouldShowWhatsNew(version: string, frontendBundle?: string | null): boolean {
  const id = buildWhatsNewId(version, frontendBundle);
  if (!id) return false;
  const seen = getSeenWhatsNewId();
  if (!seen) return true;
  return seen !== id;
}
