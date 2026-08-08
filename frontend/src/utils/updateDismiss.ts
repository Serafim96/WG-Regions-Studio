/** Persist dismissed update tags so the same release is not re-notified. */

const DISMISSED_KEY = 'mrv.update.dismissedTag';

export function getDismissedUpdateTag(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissUpdateTag(tag: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, tag.replace(/^v/i, ''));
  } catch {
    // ignore
  }
}

export function isUpdateTagDismissed(tag: string): boolean {
  const dismissed = getDismissedUpdateTag();
  if (!dismissed) return false;
  return dismissed === tag.replace(/^v/i, '');
}
