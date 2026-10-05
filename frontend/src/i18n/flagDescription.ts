import type { Locale } from './I18nContext';
import type { FlagInfo } from '../types';
import { FLAG_DESCRIPTION_RU } from './flagDescriptionRu';

/**
 * Catalog text for the active UI language.
 * If only one language has a text, that text is used in both interfaces.
 * Custom flags have a single description written by the user.
 */
export function localizedFlagDescription(
  flag: Pick<FlagInfo, 'name' | 'description' | 'builtin'>,
  locale: Locale,
): string {
  const english = flag.description?.trim() ?? '';
  const russian = flag.builtin === false ? '' : (FLAG_DESCRIPTION_RU[flag.name]?.trim() ?? '');
  if (russian && english) return locale === 'ru' ? russian : english;
  return russian || english;
}
