import type { Locale } from '../i18n/translations';

/** «6 ошибок» / «1 error» for export-blocked flash. */
export function formatExportErrorCount(locale: Locale, count: number): string {
  if (locale === 'en') {
    return count === 1 ? '1 error' : `${count} errors`;
  }
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ошибок`;
  if (mod10 === 1) return `${count} ошибка`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ошибки`;
  return `${count} ошибок`;
}
