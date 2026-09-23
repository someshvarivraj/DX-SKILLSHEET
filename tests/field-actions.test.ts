import { describe, expect, it } from 'vitest';
import { fieldActions } from '../src/lib/sheet/field-actions';

describe('buttons by processing type (feedback 2026-09-23, item 8)', () => {
  it('offers only save and history for values that are not generated', () => {
    for (const p of ['MANUAL', 'COPY', 'RULE_BASED', 'ENRICH']) {
      expect(fieldActions(p, 'STRING')).toEqual({
        regenerate: false,
        regenerateWithInstructions: false,
        showOriginal: false,
      });
    }
  });

  it('offers regenerate and the original for dictionary and translation fields', () => {
    for (const p of ['GLOSSARY', 'TRANSLATE']) {
      expect(fieldActions(p, 'STRING')).toEqual({
        regenerate: true,
        regenerateWithInstructions: false,
        showOriginal: true,
      });
    }
  });

  it('adds regenerate-with-instructions for AI-generated fields', () => {
    expect(fieldActions('GENERATE', 'TEXT')).toEqual({
      regenerate: true,
      regenerateWithInstructions: true,
      showOriginal: true,
    });
  });

  it('never offers regeneration on a grid', () => {
    expect(fieldActions('GENERATE', 'GRID').regenerate).toBe(false);
  });
});
