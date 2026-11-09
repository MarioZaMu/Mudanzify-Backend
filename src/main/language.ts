import type { Language } from '../shared/contract';
import { readSettings, writeSettings } from './settings';

/** Language of the interface and of every document Mudanzify writes. */
export const getLanguage = (): Language => readSettings().language;

export function setLanguage(language: Language): Language {
  writeSettings({ language });
  return language;
}
