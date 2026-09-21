/**
 * Glossary lookup.  Specification §8.5.
 *
 * Free-text majors, hometowns and technology names drift if the AI translates
 * them afresh each time, so they are substituted mechanically from a table the
 * operator maintains on screen. The AI never decides these wordings, and the
 * explanatory gloss added on first use (§8.1) also comes from the table rather
 * than being composed each time.
 */

import type { GlossaryCategory } from '@prisma/client';

export type GlossaryRecord = {
  id: string;
  category: GlossaryCategory;
  english: string;
  aliases: string[];
  japanese: string;
  gloss: string | null;
  region: string | null;
};

/** Normalise a term for matching: case, spacing and punctuation insensitive. */
/**
 * Normalise a term for matching: case, spacing and punctuation insensitive.
 *
 * The character class keeps Japanese. It used to strip everything outside
 * `[a-z0-9...]`, which made EVERY Japanese term normalise to the empty string —
 * so they all shared one key, and looking up 「データベース」 returned whichever
 * Japanese entry happened to be registered first. A wrong word then went onto
 * the customer's skill sheet with `matched: true`, so nothing warned anyone.
 */
export function normaliseTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[．。，,]/g, '')
    .replace(/[‐‑–—−]/g, '-')
    // Latin, digits, a few symbols that appear in tool names, and the Japanese
    // ranges: hiragana, katakana, CJK ideographs, the long vowel mark and the
    // middle dot. Everything else becomes a space.
    .replace(
      /[^a-z0-9+&#/.\-\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\u30fc\u30fb]/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export class Glossary {
  private byTerm = new Map<string, GlossaryRecord>();
  private byCategory = new Map<GlossaryCategory, GlossaryRecord[]>();

  constructor(entries: GlossaryRecord[]) {
    for (const e of entries) {
      const keys = [e.english, ...e.aliases, e.japanese];
      for (const k of keys) {
        const norm = `${e.category}::${normaliseTerm(k)}`;
        if (!this.byTerm.has(norm)) this.byTerm.set(norm, e);
      }
      const list = this.byCategory.get(e.category) ?? [];
      list.push(e);
      this.byCategory.set(e.category, list);
    }
  }

  lookup(category: GlossaryCategory, term: string): GlossaryRecord | null {
    if (!term) return null;
    return this.byTerm.get(`${category}::${normaliseTerm(term)}`) ?? null;
  }

  all(category: GlossaryCategory): GlossaryRecord[] {
    return this.byCategory.get(category) ?? [];
  }

  /**
   * Translate one free-text term. Returns the Japanese form when the term is
   * known; otherwise returns the input unchanged and flags it so the screen can
   * prompt the operator to add it to the glossary (§8.5 note on high schools).
   */
  translate(
    category: GlossaryCategory,
    term: string,
  ): { text: string; matched: boolean; gloss: string | null } {
    const trimmed = (term ?? '').trim();
    if (!trimmed) return { text: '', matched: true, gloss: null };
    const hit = this.lookup(category, trimmed);
    if (!hit) return { text: trimmed, matched: false, gloss: null };
    return { text: hit.japanese, matched: true, gloss: hit.gloss };
  }

  /** Translate a comma-separated technology list, keeping order. */
  translateList(
    category: GlossaryCategory,
    terms: string[],
  ): { items: string[]; unmatched: string[] } {
    const items: string[] = [];
    const unmatched: string[] = [];
    for (const t of terms) {
      const { text, matched } = this.translate(category, t);
      if (!text) continue;
      if (!matched) unmatched.push(t.trim());
      if (!items.includes(text)) items.push(text);
    }
    return { items, unmatched };
  }

  /** State name -> region, from the supplied table. Never inferred (§8.5 note). */
  regionForState(state: string): { japanese: string; region: string | null } | null {
    const hit = this.lookup('STATE' as GlossaryCategory, state);
    if (!hit) return null;
    return { japanese: hit.japanese, region: hit.region };
  }

  /**
   * Add the parenthetical explanation on first use for technical terms that
   * appear in a generated paragraph (§8.1). Only the first occurrence of each
   * term is annotated, and only when the table supplies a gloss.
   */
  annotateFirstUse(text: string, alreadyGlossed = new Set<string>()): string {
    if (!text) return text;
    let out = text;
    const terms = this.all('TECH_TERM' as GlossaryCategory)
      .filter((e) => e.gloss)
      .sort((a, b) => b.japanese.length - a.japanese.length);

    for (const term of terms) {
      if (alreadyGlossed.has(term.id)) continue;
      const needle = term.japanese;
      const idx = out.indexOf(needle);
      if (idx === -1) continue;
      // Skip when an explanation already follows the term.
      const after = out.slice(idx + needle.length, idx + needle.length + 2);
      if (after.startsWith('（')) continue;
      out =
        out.slice(0, idx + needle.length) +
        `（${term.gloss}）` +
        out.slice(idx + needle.length);
      alreadyGlossed.add(term.id);
    }
    return out;
  }
}
