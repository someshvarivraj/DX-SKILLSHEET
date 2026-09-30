import { cookies } from 'next/headers';
import { isLang, LANG_COOKIE, makeT, type Lang, type T } from './index';

/** The reader's chosen language (server components, server actions). */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : 'ja';
}

export async function getT(): Promise<T> {
  return makeT(await getLang());
}
