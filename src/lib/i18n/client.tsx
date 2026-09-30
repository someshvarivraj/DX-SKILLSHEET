'use client';

import { createContext, useContext, useMemo } from 'react';
import { makeT, type Lang, type T } from './index';

const LangContext = createContext<Lang>('ja');

/** Set once in the root layout from the language cookie. */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}
