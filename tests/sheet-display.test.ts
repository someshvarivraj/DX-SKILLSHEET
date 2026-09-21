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

describe('A-3 — printing follows the display checkbox, not emptiness', () => {
  const opts = { forPdf: true, hiddenFieldCodes: new Set<string>() };

  it('keeps a ticked field that is empty, so the row exists to fill in later', () => {
    // Sano-san's case: someone has no GitHub today but may create one later.
    // The old behaviour dropped the row, leaving nowhere to put it.
    expect(
      isFieldPrintable({ code: 'oth_github', includeInPdf: true, isDisplayed: true }, opts),
    ).toBe(true);
  });

  it('omits a field the operator has unticked, even though it has content', () => {
    expect(
      isFieldPrintable({ code: 'oth_hobbies', includeInPdf: true, isDisplayed: false }, opts),
    ).toBe(false);
  });

  it('still honours includeInPdf and the per-recipient preset', () => {
    expect(
      isFieldPrintable({ code: 'jlpt_scores', includeInPdf: false, isDisplayed: true }, opts),
    ).toBe(false);
    // ...but a screen-only view may still show it.
    expect(
      isFieldPrintable(
        { code: 'jlpt_scores', includeInPdf: false, isDisplayed: true },
        { forPdf: false, hiddenFieldCodes: new Set() },
      ),
    ).toBe(true);
    expect(
      isFieldPrintable(
        { code: 'dietary', includeInPdf: true, isDisplayed: true },
        { forPdf: true, hiddenFieldCodes: new Set(['dietary']) },
      ),
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
