import { describe, expect, it } from 'vitest';
import { fieldActions } from '../src/lib/sheet/field-actions';

describe('buttons by processing type (feedback 2026-09-23, item 8)', () => {
  it('offers only save and history for values that are not generated', () => {
    for (const p of ['MANUAL', 'COPY', 'RULE_BASED', 'ENRICH']) {
      expect(fieldActions(p, 'STRING')).toEqual({
        regenerate: false,
        regenerateWithInstructions: false,
        showOriginal: false,
        translate: false,
      });
    }
  });

  it('offers regenerate and the original for dictionary and translation fields', () => {
    for (const p of ['GLOSSARY', 'TRANSLATE']) {
      expect(fieldActions(p, 'STRING')).toEqual({
        regenerate: true,
        regenerateWithInstructions: false,
        showOriginal: true,
        translate: false,
      });
    }
  });

  it('adds regenerate-with-instructions for AI-generated fields', () => {
    expect(fieldActions('GENERATE', 'TEXT')).toEqual({
      regenerate: true,
      regenerateWithInstructions: true,
      showOriginal: true,
      translate: false,
    });
  });

  it('never offers regeneration on a grid', () => {
    expect(fieldActions('GENERATE', 'GRID').regenerate).toBe(false);
  });

  it('offers translation and the original when a copied answer came out in English (2026-10-11)', () => {
    const english = 'I have been studying Japanese for the past 1.5 years through a course.';
    expect(fieldActions('COPY', 'STRING', english)).toMatchObject({ translate: true, showOriginal: true });
    expect(fieldActions('COPY', 'STRING', '自動車、製造業').translate).toBe(false);
    expect(fieldActions('COPY', 'STRING', 'Python, C++').translate).toBe(false);
    expect(fieldActions('COPY', 'STRING', 'https://github.com/anurag161').translate).toBe(false);
  });
});
