import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillSheetDocument, toDisplayLines } from '../src/components/sheet-document';
import { isFieldPrintable } from '../src/lib/sheet/visibility';

/**
 * Guards for the rules Sano-san set out in his reply.
 *
 * These test the printed document rather than the database layer, so they run
 * without a Prisma client.
 */

let seq = 0;
const id = () => `id${++seq}`;

function field(code: string, nameJa: string, valueJa: string, isDisplayed = true) {
  return {
    id: id(),
    code,
    nameJa,
    nameEn: null,
    order: seq,
    processing: 'COPY',
    editing: 'PROMPT_AND_MANUAL',
    valueType: 'STRING',
    includeInPdf: true,
    displayToggle: false,
    isRequired: false,
    helpText: null,
    generationPrompt: null,
    targetLengthMin: null,
    targetLengthMax: null,
    sourceCodes: [],
    valueId: id(),
    valueJa,
    valueJson: null,
    sourceText: '',
    isLocked: false,
    isReviewed: true,
    isDisplayed,
    generatedAt: null,
    characterCount: valueJa.length,
    styleIssues: [],
    historyCount: 0,
  };
}

function modelWith(fields: unknown[], email: string | null = null) {
  return {
    personId: 'p1',
    skillSheetId: 's1',
    person: {
      id: 'p1',
      employeeNumber: 'IIT-2026-001',
      fullNameEnglish: 'Priya Nair',
      fullNameKatakana: 'ナイル・プリヤ',
      email,
      cohort: '2026',
      photoKey: null,
    },
    version: {
      id: 'v1',
      versionNo: 1,
      status: 'FINAL',
      updatedAt: new Date(),
      finalisedAt: new Date(),
    },
    preset: null,
    emptyFields: [],
    unreviewedCount: 0,
    sections: [
      {
        id: id(),
        code: 'other',
        nameJa: 'その他',
        nameEn: 'Other',
        order: 10,
        kind: 'SINGLE',
        recordKind: null,
        isVisible: true,
        hideWhenEmpty: false,
        maxDisplayed: 10,
        description: null,
        fields,
        records: [],
        isEmpty: false,
      },
    ],
  } as never;
}

const render = (model: unknown) =>
  renderToStaticMarkup(createElement(SkillSheetDocument, { model: model as never, photoUrl: null }));

describe('C-1 — the email address never reaches the printed sheet', () => {
  it('does not print the address even when the record carries one', () => {
    const html = render(
      modelWith([field('oth_github', 'GitHub', 'https://github.com/example')], 'priya.nair@example.com'),
    );
    expect(html).not.toContain('priya.nair@example.com');
    expect(html).not.toContain('@example.com');
  });
});

describe('A-3 — required fields always print; others only when filled', () => {
  const opts = { forPdf: true, hiddenFieldCodes: new Set<string>() };
  const f = (over: Partial<Parameters<typeof isFieldPrintable>[0]>) => ({
    code: 'oth_github',
    includeInPdf: true,
    isDisplayed: true,
    isRequired: false,
    valueJa: '',
    ...over,
  });

  it('prints a required field even when it is empty', () => {
    expect(isFieldPrintable(f({ isRequired: true, valueJa: '' }), opts)).toBe(true);
  });

  it('prints a required field even when it was left unticked', () => {
    // The importer unticks empty fields; required overrides that.
    expect(isFieldPrintable(f({ isRequired: true, isDisplayed: false }), opts)).toBe(true);
  });

  it('leaves an empty optional field off the sheet', () => {
    expect(isFieldPrintable(f({ valueJa: '' }), opts)).toBe(false);
    expect(isFieldPrintable(f({ valueJa: '   ' }), opts)).toBe(false);
  });

  it('prints an optional field that has a value and is ticked', () => {
    expect(isFieldPrintable(f({ valueJa: 'github.com/x' }), opts)).toBe(true);
  });

  it('omits an optional field the operator has unticked, even with content', () => {
    expect(isFieldPrintable(f({ valueJa: '長距離走', isDisplayed: false }), opts)).toBe(false);
  });

  it('still honours includeInPdf and the per-recipient preset, even when required', () => {
    expect(isFieldPrintable(f({ isRequired: true, includeInPdf: false }), opts)).toBe(false);
    // ...but a screen-only view may still show it.
    expect(
      isFieldPrintable(f({ includeInPdf: false, valueJa: 'x' }), {
        forPdf: false,
        hiddenFieldCodes: new Set(),
      }),
    ).toBe(true);
    expect(
      isFieldPrintable(f({ code: 'dietary', isRequired: true }), {
        forPdf: true,
        hiddenFieldCodes: new Set(['dietary']),
      }),
    ).toBe(false);
  });

  it('renders a ticked field with content', () => {
    const html = render(modelWith([field('oth_hobbies', '趣味', '長距離走', true)]));
    expect(html).toContain('長距離走');
  });
});

describe('toDisplayLines', () => {
  it('drops blank lines and never starts a line with punctuation', () => {
    expect(toDisplayLines('数値は1、1、2\n\n、1である。')).toEqual(['数値は1、1、2、1である。']);
  });

  it('keeps genuine separate lines', () => {
    expect(toDisplayLines('一行目\n二行目')).toEqual(['一行目', '二行目']);
  });
});

describe('not asked — a field the candidate was never asked', () => {
  const base = { code: 'jlpt', includeInPdf: true, isDisplayed: true, isRequired: true, valueJa: '' };
  const opts = { forPdf: true, hiddenFieldCodes: new Set<string>() };
  it('does not print, even when required', () => {
    expect(isFieldPrintable({ ...base, notAsked: true }, opts)).toBe(false);
  });
  it('prints when someone typed a value in', () => {
    expect(isFieldPrintable({ ...base, notAsked: true, valueJa: 'N2' }, opts)).toBe(true);
  });
  it('still prints a required empty field that was asked', () => {
    expect(isFieldPrintable({ ...base, notAsked: false }, opts)).toBe(true);
  });
});

