/**
 * JLPT — deterministic description generator.  Specification chapter 10.
 *
 * This module contains NO AI. The specification requires the Japanese-ability
 * paragraph to be produced by rule from the score breakdown so that the same
 * input always yields the same sentence (§8.6, §10). Everything here is a pure
 * function of its arguments and is covered by unit tests.
 *
 * Two score layouts exist (§10.1):
 *   N1・N2・N3  言語知識 60 + 読解 60 + 聴解 60 = 180
 *   N4・N5      言語知識・読解 120 + 聴解 60   = 180
 */

export type JlptLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

export type JlptScores = {
  level: JlptLevel;
  examYear?: number | null;
  /** 7 or 12 */
  examMonth?: number | null;
  total?: number | null;
  /** N1–N3 only */
  languageKnowledge?: number | null;
  /** N1–N3 only */
  reading?: number | null;
  /** N4–N5 only */
  languageAndReading?: number | null;
  /** all levels */
  listening?: number | null;
};

export type SectionKey = 'languageKnowledge' | 'reading' | 'languageAndReading' | 'listening';

export type SectionResult = {
  key: SectionKey;
  label: string;
  score: number;
  max: number;
  minimum: number;
  ratio: number;
  meetsMinimum: boolean;
  /** Clears the minimum by 3 points or fewer — worth calling out (§10.1). */
  barelyClears: boolean;
};

export type JlptEvaluation = {
  level: JlptLevel;
  layout: 'THREE_SECTION' | 'TWO_SECTION';
  total: number | null;
  passMark: number;
  sections: SectionResult[];
  totalMeetsPassMark: boolean;
  allSectionsMeetMinimum: boolean;
  passed: boolean;
  /** Sections could not be evaluated because scores are missing. */
  incomplete: boolean;
};

/** Pass marks and per-section minimums, spec §10.1. */
export const PASS_CRITERIA: Record<
  JlptLevel,
  { passMark: number; sectionMinimum: number; layout: 'THREE_SECTION' | 'TWO_SECTION' }
> = {
  N1: { passMark: 100, sectionMinimum: 19, layout: 'THREE_SECTION' },
  N2: { passMark: 90, sectionMinimum: 19, layout: 'THREE_SECTION' },
  N3: { passMark: 95, sectionMinimum: 19, layout: 'THREE_SECTION' },
  N4: { passMark: 90, sectionMinimum: 19, layout: 'TWO_SECTION' },
  N5: { passMark: 80, sectionMinimum: 19, layout: 'TWO_SECTION' },
};

/** N4/N5 combine language knowledge and reading, with a higher minimum. */
const COMBINED_SECTION_MINIMUM = 38;

const SECTION_LABELS: Record<SectionKey, string> = {
  languageKnowledge: '言語知識（文字・語彙・文法）',
  reading: '読解',
  languageAndReading: '言語知識・読解',
  listening: '聴解',
};

/** What each section implies for day-to-day work (§10.3). */
const SECTION_STRENGTH_IMPLICATION: Record<SectionKey, string> = {
  languageKnowledge: '社内文書や指示の語彙・文法面の理解に支障はないと見込まれる',
  reading: '技術文書や仕様書の読解に支障はないと見込まれる',
  languageAndReading: '文書による指示の理解に大きな支障はないと見込まれる',
  listening: '会議や口頭での指示のやり取りに対応できると見込まれる',
};

const SECTION_WEAKNESS_IMPLICATION: Record<SectionKey, string> = {
  languageKnowledge: '専門用語や複雑な言い回しについては、用語集の準備や言い換えの配慮があるとよい',
  reading: '長文の仕様書や手順書については、要点を整理した資料の補助があるとよい',
  languageAndReading: '文書での指示については、平易な表現への言い換えや図示の補助があるとよい',
  listening: '会議など口頭でのやり取りには一定の慣れが必要であり、当面は要点の文書化が有効である',
};

export function isThreeSection(level: JlptLevel): boolean {
  return PASS_CRITERIA[level].layout === 'THREE_SECTION';
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Evaluate a result against the official criteria.
 * Passing requires BOTH the total to reach the pass mark AND every section to
 * reach its minimum (§10.1).
 */
export function evaluate(scores: JlptScores): JlptEvaluation {
  const criteria = PASS_CRITERIA[scores.level];
  const threeSection = criteria.layout === 'THREE_SECTION';
  const sections: SectionResult[] = [];

  const push = (key: SectionKey, score: number | null, max: number, minimum: number) => {
    if (score === null) return;
    const ratio = max > 0 ? score / max : 0;
    sections.push({
      key,
      label: SECTION_LABELS[key],
      score,
      max,
      minimum,
      ratio,
      meetsMinimum: score >= minimum,
      barelyClears: score >= minimum && score - minimum <= 3,
    });
  };

  if (threeSection) {
    push('languageKnowledge', num(scores.languageKnowledge), 60, criteria.sectionMinimum);
    push('reading', num(scores.reading), 60, criteria.sectionMinimum);
  } else {
    push('languageAndReading', num(scores.languageAndReading), 120, COMBINED_SECTION_MINIMUM);
  }
  push('listening', num(scores.listening), 60, criteria.sectionMinimum);

  const expectedSections = threeSection ? 3 : 2;
  const incomplete = sections.length < expectedSections;

  const total =
    num(scores.total) ??
    (incomplete ? null : sections.reduce((sum, s) => sum + s.score, 0));

  const totalMeetsPassMark = total !== null && total >= criteria.passMark;
  const allSectionsMeetMinimum =
    !incomplete && sections.every((s) => s.meetsMinimum);

  return {
    level: scores.level,
    layout: criteria.layout,
    total,
    passMark: criteria.passMark,
    sections,
    totalMeetsPassMark,
    allSectionsMeetMinimum,
    passed: totalMeetsPassMark && allSectionsMeetMinimum,
    incomplete,
  };
}

/** "2025年12月にN3取得" — spec §6.10. */
export function buildQualificationLine(scores: JlptScores): string {
  const { level, examYear, examMonth } = scores;
  if (examYear && examMonth) return `${examYear}年${examMonth}月に${level}取得`;
  if (examYear) return `${examYear}年に${level}取得`;
  return `${level}取得`;
}

/** Relative gap between the strongest and weakest section that triggers a
 *  "mention both sides" sentence (§10.3). */
export const GAP_THRESHOLD = 0.2;

const LEVEL_OVERVIEW: Record<JlptLevel, string> = {
  N1: '業務上のやり取りは日本語で進められる水準にある',
  N2: '日常的な業務のやり取りは日本語で対応できる水準にある',
  N3: '基本的なやり取りは日本語で対応でき、専門的な内容では補助が要る水準にある',
  N4: '日常的な表現の理解が中心であり、業務では英語での補助が前提となる水準にある',
  N5: '基礎的な表現の理解が中心であり、業務では英語での補助が前提となる水準にある',
};

function describeLevelOfSection(s: SectionResult): string {
  if (s.score === s.max) return '満点';
  if (s.ratio >= 0.85) return '高い水準';
  if (s.ratio >= 0.7) return '安定した水準';
  if (s.ratio >= 0.55) return '一定の水準';
  if (s.ratio >= 0.4) return 'やや低い水準';
  return '低い水準';
}

/**
 * Generate the Japanese description printed on the skill sheet.
 *
 * Writing rules applied (§9.1, §10.3):
 *   - plain form (だ・である), never です／ます
 *   - no vague evaluative words such as 堪能 or 流暢
 *   - concrete work situations, not adjectives
 *   - the raw scores are used but the numbers of individual sections are only
 *     quoted where they carry meaning
 */
export function buildDescription(scores: JlptScores): string {
  const evaluation = evaluate(scores);
  const sentences: string[] = [];

  // 1. Qualification status.
  if (evaluation.passed) {
    sentences.push(`${scores.level}を取得している`);
  } else if (evaluation.incomplete) {
    // Scores missing: state the level only, do not infer anything (§8.3).
    return `${scores.level}を取得している。`;
  } else if (!evaluation.totalMeetsPassMark) {
    sentences.push(
      `${scores.level}を受験したが、総合点が合格点（${evaluation.passMark}点）に届いていない`,
    );
  } else {
    const below = evaluation.sections.filter((s) => !s.meetsMinimum);
    sentences.push(
      `${scores.level}を受験し、総合点は合格点に達しているが、${below
        .map((s) => s.label)
        .join('と')}が基準点に届いていない`,
    );
  }

  const sorted = [...evaluation.sections].sort((a, b) => b.ratio - a.ratio);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const gap = strongest.ratio - weakest.ratio;

  // 2. Strong side.
  if (gap >= GAP_THRESHOLD) {
    const strongLabels = sorted
      .filter((s) => strongest.ratio - s.ratio < GAP_THRESHOLD / 2)
      .map((s) => s.label);
    sentences.push(
      `${strongLabels.join('・')}は${describeLevelOfSection(strongest)}であり、${
        SECTION_STRENGTH_IMPLICATION[strongest.key]
      }`,
    );
    // 3. Weak side, with the actual figure because the contrast is the point.
    sentences.push(
      `一方、${weakest.label}は${weakest.max}点中${weakest.score}点と相対的に弱く、${
        SECTION_WEAKNESS_IMPLICATION[weakest.key]
      }`,
    );
  } else {
    sentences.push(
      `得点は区分間で大きな偏りがなく、${LEVEL_OVERVIEW[scores.level]}`,
    );
  }

  // 4. Any section that only just clears its minimum (§10.1 note).
  const barely = evaluation.sections.filter(
    (s) => s.barelyClears && s.key !== weakest.key,
  );
  for (const s of barely) {
    sentences.push(
      `なお、${s.label}は基準点（${s.minimum}点）をわずかに上回る水準であり、${
        SECTION_WEAKNESS_IMPLICATION[s.key]
      }`,
    );
  }

  return sentences.join('。') + '。';
}

/**
 * Pick the result the skill sheet should describe: the highest level actually
 * passed; if none was passed, the most recent attempt (§6.10 keeps history).
 */
export function selectPrimaryResult<T extends JlptScores>(results: T[]): T | null {
  if (results.length === 0) return null;
  const order: Record<JlptLevel, number> = { N1: 5, N2: 4, N3: 3, N4: 2, N5: 1 };
  const passed = results.filter((r) => evaluate(r).passed);
  const pool = passed.length > 0 ? passed : results;
  return [...pool].sort((a, b) => {
    const byLevel = order[b.level] - order[a.level];
    if (byLevel !== 0) return byLevel;
    const byYear = (b.examYear ?? 0) - (a.examYear ?? 0);
    if (byYear !== 0) return byYear;
    return (b.examMonth ?? 0) - (a.examMonth ?? 0);
  })[0];
}
