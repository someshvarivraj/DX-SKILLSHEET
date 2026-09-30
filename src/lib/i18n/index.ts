/**
 * Screen language: 日本語 or English (2026-09-30).
 *
 * The Japanese text stays in the code and is the lookup key; `en.ts` maps it
 * to English. Japanese mode therefore returns the text exactly as written —
 * nothing can go missing for a Japanese reader — and a string with no English
 * entry yet simply stays Japanese rather than breaking.
 *
 * What is NOT translated, deliberately: the skill sheet itself (preview, PDF,
 * field values, AI output). It is written for Japanese client companies; the
 * language switch changes the application around it, not the product.
 *
 * Messages built on the server with numbers or names in them (「20項目を生成
 * した」) are matched by the patterns in `en.ts`, so they can be translated
 * where they are shown without changing the code that builds them.
 */

import { EN, EN_PATTERNS } from './en';

export type Lang = 'ja' | 'en';
export const LANGS: Lang[] = ['ja', 'en'];
export const LANG_COOKIE = 'skillsheet_lang';

export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export function isLang(value: unknown): value is Lang {
  return value === 'ja' || value === 'en';
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  let out = key;
  if (lang === 'en' && key) {
    const hit = EN[key];
    if (hit !== undefined) {
      out = hit;
    } else {
      for (const [pattern, render] of EN_PATTERNS) {
        const match = key.match(pattern);
        if (match) {
          out = render(match);
          break;
        }
      }
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
  return out;
}

export function makeT(lang: Lang): T {
  return (key, vars) => translate(lang, key, vars);
}

/** A section or field name: the English name in English mode when there is one. */
export function pickName(lang: Lang, ja: string, en: string | null | undefined): string {
  return lang === 'en' && en ? en : ja;
}
