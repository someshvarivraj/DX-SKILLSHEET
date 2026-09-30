import { describe, expect, it } from 'vitest';
import {
  SECTION_PALETTE,
  nextSectionColour,
  resolveSectionColours,
} from '../src/lib/sheet/section-colours';

const keys = (map: Map<string, { key: string }>) => Object.fromEntries([...map].map(([c, v]) => [c, v.key]));

describe('resolveSectionColours', () => {
  it('keeps the traditional colours of the seeded sections', () => {
    const result = keys(
      resolveSectionColours([
        { code: 'personal', colour: null, order: 1 },
        { code: 'education', colour: null, order: 2 },
      ]),
    );
    expect(result).toEqual({ personal: 'navy', education: 'blue' });
  });

  it('gives a later section a different colour when its traditional one is taken', () => {
    // interests and japanese_companies have always shared amber.
    const result = keys(
      resolveSectionColours([
        { code: 'interests', colour: null, order: 1 },
        { code: 'japanese_companies', colour: null, order: 2 },
      ]),
    );
    expect(result.interests).toBe('amber');
    expect(result.japanese_companies).not.toBe('amber');
  });

  it('never repeats a colour while unused ones remain', () => {
    const sections = Array.from({ length: SECTION_PALETTE.length }, (_, i) => ({
      code: `section_${i}`,
      colour: null,
      order: i,
    }));
    const used = [...resolveSectionColours(sections).values()].map((c) => c.key);
    expect(new Set(used).size).toBe(SECTION_PALETTE.length);
  });

  it('respects a chosen colour, even over an earlier traditional one', () => {
    const result = keys(
      resolveSectionColours([
        { code: 'personal', colour: null, order: 1 },
        { code: 'section_x', colour: 'navy', order: 2 },
      ]),
    );
    expect(result.section_x).toBe('navy');
    expect(result.personal).not.toBe('navy');
  });

  it('with every colour in use, still avoids repeating the previous section', () => {
    const sections = Array.from({ length: SECTION_PALETTE.length + 3 }, (_, i) => ({
      code: `section_${i}`,
      colour: null,
      order: i,
    }));
    const ordered = [...resolveSectionColours(sections).values()].map((c) => c.key);
    for (let i = 1; i < ordered.length; i++) expect(ordered[i]).not.toBe(ordered[i - 1]);
  });
});

describe('nextSectionColour', () => {
  it('picks a colour no existing section uses', () => {
    const existing = [
      { code: 'personal', colour: null, order: 1 },
      { code: 'section_a', colour: 'teal', order: 2 },
    ];
    const next = nextSectionColour(existing);
    expect(['navy', 'teal']).not.toContain(next);
  });
});

describe('resolveSectionColours — existing sections never shift', () => {
  it('a clash further up does not take a later section’s traditional colour', () => {
    const result = keys(
      resolveSectionColours([
        { code: 'interests', colour: null, order: 1 },
        { code: 'japanese_companies', colour: null, order: 2 },
        { code: 'japanese_ability', colour: null, order: 3 },
      ]),
    );
    expect(result.japanese_ability).toBe('red');
    expect(result.japanese_companies).not.toBe('red');
    expect(result.japanese_companies).not.toBe('amber');
  });
});
