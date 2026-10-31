import { create } from 'zustand';
import { es } from './es';
import { sv } from './sv';
import { de } from './de';

/**
 * Interface language. Strings are looked up by their English text, so any
 * text without a translation falls back to English instead of breaking:
 *
 *   const t = useT();          // in a component (re-renders on change)
 *   t('Run simulation')
 *   t('{n} stations', { n: 3 })
 *
 * Non-component code can call `t()` directly; it reads the current language.
 * The choice is saved per user (Settings → Language).
 */

export type Lang = 'en' | 'es' | 'sv' | 'de';

export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'sv', name: 'Svenska' },
  { code: 'de', name: 'Deutsch' },
];

const DICTS: Record<Lang, Record<string, string>> = { en: {}, es, sv, de };
const KEY = 'factorysim-lang';

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in DICTS) return v as Lang;
  } catch { /* storage unavailable */ }
  return 'en';
}

export const useI18n = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    set({ lang });
  },
}));

const missing = new Set<string>();
// Values already in the target language (a label translated before it reaches a
// component that translates again) pass through unchanged.
const translatedValues: Partial<Record<Lang, Set<string>>> = {};
function isTranslated(lang: Lang, s: string) {
  let set = translatedValues[lang];
  if (!set) set = translatedValues[lang] = new Set(Object.values(DICTS[lang]));
  return set.has(s);
}

/** Translate an English UI string; `{name}` placeholders are filled from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = useI18n.getState().lang;
  let s = key;
  if (lang !== 'en') {
    const hit = DICTS[lang][key];
    if (hit !== undefined) s = hit;
    else if (import.meta.env.DEV && !missing.has(key) && !isTranslated(lang, key)) {
      missing.add(key);
      (window as unknown as { __i18nMissing?: string[] }).__i18nMissing = [...missing];
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** `t` for components: subscribing to the language makes the component re-render when it changes. */
export function useT() {
  useI18n((s) => s.lang);
  return t;
}

/** Translate a label that may be a React node (only plain strings are translated). */
export function tNode<T>(label: T): T | string {
  return typeof label === 'string' ? t(label) : label;
}
