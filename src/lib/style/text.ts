/**
 * Japanese text conventions for the skill sheet.  Specification chapter 9.
 *
 * Two jobs live here:
 *   normaliseJapanese()  — mechanically fix orthography (§9.2)
 *   checkStyle()         — report violations the editor shows as warnings
 *
 * Nothing here calls the AI. Orthography is a mechanical rule, so it is applied
 * mechanically and identically every time.
 */

const JP_CHAR =
  '\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\u3005\\u3006\\u30FC\\uFF01-\\uFF60';
const JP_RE = new RegExp(`[${JP_CHAR}]`);

/** True when the string contains any kana or kanji. */
export function hasJapanese(s: string): boolean {
  return JP_RE.test(s);
}

const FULLWIDTH_DIGITS = /[０-９]/g;
const FULLWIDTH_LATIN = /[Ａ-Ｚａ-ｚ]/g;

function toHalfWidth(ch: string): string {
  return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
}

/**
 * Apply the orthography rules of §9.2:
 *   - full-width 、。 for punctuation
 *   - half-width numerals and Latin letters
 *   - no space between Japanese and Latin/numerals
 *   - full-width ・ for the middle dot
 *   - full-width （） around Japanese content, half-width for English-only
 *   - half-width %
 */
export function normaliseJapanese(input: string): string {
  if (!input) return input;
  let s = input;

  // Numerals and Latin letters to half width.
  s = s.replace(FULLWIDTH_DIGITS, toHalfWidth).replace(FULLWIDTH_LATIN, toHalfWidth);

  // Percent and middle dot.
  s = s.replace(/％/g, '%').replace(/･/g, '・');

  // Western punctuation used between Japanese to the full-width forms.
  s = s.replace(/，/g, '、').replace(/．/g, '。');
  s = s.replace(
    new RegExp(`([${JP_CHAR}]),\\s*(?=[${JP_CHAR}])`, 'g'),
    '$1、',
  );
  s = s.replace(new RegExp(`([${JP_CHAR}])\\.(\\s|$)`, 'g'), '$1。');

  // Parentheses: full-width when the content contains Japanese.
  s = s.replace(/\(([^()]*)\)/g, (m, inner: string) =>
    hasJapanese(inner) ? `（${inner}）` : m,
  );
  // ...and half-width when the content is purely English/numeric.
  s = s.replace(/（([^（）]*)）/g, (m, inner: string) =>
    hasJapanese(inner) || inner.trim() === '' ? m : `（${inner}）`,
  );

  // No space between Japanese and Latin/numerals, in both directions.
  s = s.replace(new RegExp(`([${JP_CHAR}])[ \\u3000]+([A-Za-z0-9])`, 'g'), '$1$2');
  s = s.replace(new RegExp(`([A-Za-z0-9%\\)])[ \\u3000]+([${JP_CHAR}])`, 'g'), '$1$2');

  // Collapse runs of spaces and tidy spaces around full-width punctuation.
  s = s.replace(/[ 　]{2,}/g, ' ');
  s = s.replace(/[ 　]+([、。）])/g, '$1');
  s = s.replace(/([（])[ 　]+/g, '$1');

  // Line structure. A cell on the skill sheet never wants a blank line inside
  // it, and a line must never begin with punctuation that Japanese forbids at
  // the start of a line (禁則処理). A stray newline before 、 or 。 produces
  // exactly that, so fold such a break away rather than printing it.
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[ 　\t]+\n/g, '\n');
  s = s.replace(/\n[ 　\t]+/g, '\n');
  s = s.replace(/\n{2,}/g, '\n');
  s = s.replace(/\n(?=[、。，．・）」』】〕）])/g, '');

  return s.trim();
}

export type StyleIssue = {
  rule: string;
  message: string;
  sample?: string;
};

/** Politeness markers that §9.1 forbids in prose fields. */
const POLITE_PATTERNS: Array<[RegExp, string]> = [
  [/(です|ます|ました|ません|でしょう)(。|、|$)/, '敬体（です・ます調）が使われている'],
];

/** Vague evaluative words §10.3 forbids. */
const VAGUE_WORDS = ['堪能', '流暢', 'ペラペラ', '完璧'];

export function checkStyle(
  text: string,
  options: { prose?: boolean; nounForm?: boolean; min?: number | null; max?: number | null } = {},
): StyleIssue[] {
  const issues: StyleIssue[] = [];
  if (!text) return issues;

  if (options.prose !== false) {
    for (const [re, message] of POLITE_PATTERNS) {
      const m = text.match(re);
      if (m) issues.push({ rule: 'tone', message, sample: m[0] });
    }
  }

  for (const w of VAGUE_WORDS) {
    if (text.includes(w)) {
      issues.push({
        rule: 'vague-word',
        message: `根拠の曖昧な評価語「${w}」が使われている`,
        sample: w,
      });
    }
  }

  if (/[０-９]/.test(text)) {
    issues.push({ rule: 'numerals', message: '全角数字が使われている' });
  }
  if (/[Ａ-Ｚａ-ｚ]/.test(text)) {
    issues.push({ rule: 'latin', message: '全角英字が使われている' });
  }
  if (/％/.test(text)) {
    issues.push({ rule: 'percent', message: '全角の％が使われている' });
  }
  if (new RegExp(`[${JP_CHAR}][ \\u3000][A-Za-z0-9]`).test(text)) {
    issues.push({ rule: 'spacing', message: '日本語と英数字の間に空白がある' });
  }

  if (options.nounForm) {
    if (/(すること|をする|します)$/.test(text.trim())) {
      issues.push({ rule: 'noun-form', message: '体言止めになっていない' });
    }
  }

  const len = [...text].length;
  if (options.min && len < options.min) {
    issues.push({
      rule: 'length',
      message: `目安の下限（${options.min}字）より短い。現在${len}字`,
    });
  }
  if (options.max && len > options.max) {
    issues.push({
      rule: 'length',
      message: `目安の上限（${options.max}字）より長い。現在${len}字`,
    });
  }

  return issues;
}

/** Character count as a human counts it (surrogate pairs count as one). */
export function characterCount(text: string | null | undefined): number {
  return text ? [...text].length : 0;
}
