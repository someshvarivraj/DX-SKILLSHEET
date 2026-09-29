/**
 * Turn a Google Apps Script form definition (create_iit_form_YYYY.gs) into a
 * machine-readable question catalogue.
 *
 * WHY THIS EXISTS
 * ----------------
 * The client states that the .gs script is the authoritative input
 * specification and that the form changes every year (spec §4, §4.1). Rather
 * than transcribing questions by hand each year, this EXECUTES the Apps
 * Script against a stub of the FormApp API and records every item it
 * creates.
 *
 * Shared by two callers:
 *   - `scripts/parse-form-script.ts`, the original CLI (`npm run form:parse`),
 *     kept for anyone who prefers a local file over the browser.
 *   - `src/app/(app)/admin/fields/form-import-actions.ts`, the in-app upload
 *     on the field-definition screen (Sano-san's review, 2026-09-29: dropping
 *     in a new .gs and running a command was a developer's step, not an
 *     operator's — the screen now does it directly, so a new form year needs
 *     no one who can run `npm`).
 */

import vm from 'node:vm';

export type ParsedQuestion = {
  code: string;
  titleJa: string;
  titleEn: string | null;
  fullTitle: string;
  helpText: string | null;
  type:
    | 'TEXT'
    | 'PARAGRAPH'
    | 'RADIO'
    | 'CHECKBOX'
    | 'LIST'
    | 'GRID'
    | 'DATE'
    | 'SCALE'
    | 'UNKNOWN';
  sectionLabel: string | null;
  options: string[];
  gridRows: string[];
  gridColumns: string[];
  isRequired: boolean;
  order: number;
};

export type ParsedForm = {
  revisionCode: string;
  sourceFile: string;
  title: string | null;
  parsedAt: string;
  questions: ParsedQuestion[];
};

/** "A-1-1. 氏名（英）／Full Name (English)" -> "A-1-1" */
export function extractCode(title: string): string | null {
  const m = title.trim().match(/^([A-Z]-\d+-\d+(?:\([A-Z]\)|[A-Z])?)\s*[.．]/);
  return m ? m[1] : null;
}

/** Split "日本語タイトル／English title" on the full-width solidus. */
export function splitTitle(title: string): { ja: string; en: string | null } {
  const withoutCode = title.replace(/^[A-Z]-\d+-\d+(?:\([A-Z]\)|[A-Z])?\s*[.．]\s*/, '').trim();
  const idx = withoutCode.indexOf('／');
  if (idx === -1) return { ja: withoutCode, en: null };
  return {
    ja: withoutCode.slice(0, idx).trim(),
    en: withoutCode.slice(idx + 1).trim() || null,
  };
}

type Recorded = {
  type: ParsedQuestion['type'];
  title: string;
  help: string | null;
  options: string[];
  rows: string[];
  columns: string[];
  required: boolean;
  order: number;
  section?: string | null;
};

export function parseAppsScript(source: string): {
  title: string | null;
  items: Recorded[];
} {
  const items: Recorded[] = [];
  let order = 0;
  let formTitle: string | null = null;
  let currentSection: string | null = null;

  const makeItem = (type: ParsedQuestion['type']): Recorded & Record<string, unknown> => {
    const rec: Recorded = {
      type,
      title: '',
      help: null,
      options: [],
      rows: [],
      columns: [],
      required: false,
      order: order++,
    };
    items.push(rec);

    // Chainable stub mirroring the subset of the FormApp item API the script uses.
    const api: Record<string, unknown> = {
      setTitle(v: string) {
        rec.title = String(v);
        return api;
      },
      setHelpText(v: string) {
        rec.help = v ? String(v) : null;
        return api;
      },
      setRequired(v: boolean) {
        rec.required = Boolean(v);
        return api;
      },
      setChoiceValues(v: string[]) {
        rec.options = (v || []).map(String);
        return api;
      },
      setChoices(v: unknown[]) {
        // Choices built with createChoice() carry their own label.
        rec.options = (v || []).map((c) =>
          typeof c === 'object' && c !== null && 'label' in c
            ? String((c as { label: unknown }).label)
            : String(c),
        );
        return api;
      },
      createChoice(label: string, _pageOrValue?: unknown) {
        return { label: String(label) };
      },
      showOtherOption(_v: boolean) {
        return api;
      },
      setRows(v: string[]) {
        rec.rows = (v || []).map(String);
        return api;
      },
      setColumns(v: string[]) {
        rec.columns = (v || []).map(String);
        return api;
      },
      setGoToPage(_p: unknown) {
        return api;
      },
      setPoints(_p: number) {
        return api;
      },
      // Page breaks are used as section headers.
      getTitle() {
        return rec.title;
      },
    };
    return api as Recorded & Record<string, unknown>;
  };

  const form: Record<string, unknown> = {
    setTitle(v: string) {
      formTitle = String(v);
      return form;
    },
    setDescription() {
      return form;
    },
    setProgressBar() {
      return form;
    },
    setCollectEmail() {
      return form;
    },
    addTextItem: () => makeItem('TEXT'),
    addParagraphTextItem: () => makeItem('PARAGRAPH'),
    addMultipleChoiceItem: () => makeItem('RADIO'),
    addCheckboxItem: () => makeItem('CHECKBOX'),
    addListItem: () => makeItem('LIST'),
    addGridItem: () => makeItem('GRID'),
    addCheckboxGridItem: () => makeItem('GRID'),
    addDateItem: () => makeItem('DATE'),
    addScaleItem: () => makeItem('SCALE'),
    addSectionHeaderItem: () => makeItem('UNKNOWN'),
    addPageBreakItem: () => {
      const api = makeItem('UNKNOWN');
      const original = api.setTitle as (v: string) => unknown;
      (api as Record<string, unknown>).setTitle = (v: string) => {
        currentSection = String(v);
        return original.call(api, v);
      };
      return api;
    },
    getEditUrl: () => 'about:blank',
    getPublishedUrl: () => 'about:blank',
  };

  const sandbox = {
    FormApp: {
      create: (title: string) => {
        formTitle = String(title);
        return form;
      },
      openById: () => form,
      ItemType: {},
    },
    Logger: { log: () => undefined },
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    Utilities: { sleep: () => undefined },
    // Page-break items double as section labels; capture the active one.
    __section: () => currentSection,
  };

  vm.createContext(sandbox);
  // Define the script, then call its entry point.
  vm.runInContext(source, sandbox, { timeout: 15_000 });
  const entry = (sandbox as Record<string, unknown>).createForm;
  if (typeof entry !== 'function') {
    throw new Error('The script does not define a createForm() function. Check the .gs file.');
  }
  (entry as () => void)();

  // Assign the section label that was in effect when each item was created.
  let section: string | null = null;
  for (const item of items) {
    if (item.type === 'UNKNOWN' && item.options.length === 0 && item.title) {
      section = item.title;
    }
    item.section = section;
  }

  return { title: formTitle, items };
}

export function toCatalogue(source: string, revisionCode: string, sourceFile: string): ParsedForm {
  const { title, items } = parseAppsScript(source);
  const questions: ParsedQuestion[] = [];
  let order = 0;

  for (const item of items) {
    const code = extractCode(item.title);
    if (!code) continue; // page breaks, disclaimers, section headers
    const { ja, en } = splitTitle(item.title);
    questions.push({
      code,
      titleJa: ja,
      titleEn: en,
      fullTitle: item.title,
      helpText: item.help,
      type: item.type,
      sectionLabel: item.section ?? null,
      options: item.options,
      gridRows: item.rows,
      gridColumns: item.columns,
      isRequired: item.required,
      order: order++,
    });
  }

  return {
    revisionCode,
    sourceFile,
    title,
    parsedAt: new Date().toISOString(),
    questions,
  };
}
