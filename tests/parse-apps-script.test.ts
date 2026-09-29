import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCode, splitTitle, toCatalogue } from '../src/lib/form/parse-apps-script';

/**
 * `toCatalogue` is what both `npm run form:parse` and the in-app "Googleフォーム
 * のスクリプトを取り込む" upload run against a real .gs file — tested here
 * against the actual 2026 form script, not a stub, so a change to the parsing
 * logic is checked against real questions, not an idealised example.
 */
const REAL_GS = readFileSync(resolve(__dirname, '../data/create_iit_form_2026.gs'), 'utf-8');

describe('extractCode', () => {
  it('reads the question code off the front of a title', () => {
    expect(extractCode('A-1-1. 氏名（英）／Full Name (English)')).toBe('A-1-1');
    expect(extractCode('G-1-7. グリッド設問')).toBe('G-1-7');
  });

  it('returns null for a title with no code', () => {
    expect(extractCode('このアンケートについて')).toBeNull();
  });
});

describe('splitTitle', () => {
  it('splits the Japanese and English halves on the full-width solidus', () => {
    expect(splitTitle('A-1-1. 氏名（英）／Full Name (English)')).toEqual({
      ja: '氏名（英）',
      en: 'Full Name (English)',
    });
  });

  it('leaves the English side null when there is no solidus', () => {
    expect(splitTitle('A-1-1. 氏名のみ')).toEqual({ ja: '氏名のみ', en: null });
  });
});

describe('toCatalogue against the real 2026 form script', () => {
  const catalogue = toCatalogue(REAL_GS, '2026', 'create_iit_form_2026.gs');

  it('finds a substantial number of coded questions', () => {
    // Not an exact count (the fixture can gain/lose questions over time) —
    // just enough to catch the parser silently returning nothing.
    expect(catalogue.questions.length).toBeGreaterThan(50);
  });

  it('gives every question a unique code', () => {
    const codes = catalogue.questions.map((q) => q.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('carries the revision code and source file through untouched', () => {
    expect(catalogue.revisionCode).toBe('2026');
    expect(catalogue.sourceFile).toBe('create_iit_form_2026.gs');
  });

  it('parses a known question with the expected shape', () => {
    const q = catalogue.questions.find((q) => q.code === 'A-1-1');
    expect(q).toBeDefined();
    expect(q?.titleJa).toBeTruthy();
    expect(q?.type).not.toBe('UNKNOWN');
  });
});

describe('toCatalogue error handling', () => {
  it('rejects a script with no createForm() entry point', () => {
    expect(() => toCatalogue('function notTheRightName() {}', '2026', 'bad.gs')).toThrow(
      /createForm/,
    );
  });
});
