/**
 * Build a complete sample skill sheet as HTML, for showing the client what the
 * printed output looks like.
 *
 *   npm run sample:sheet
 *
 * The sample is driven by `prisma/seed/sheet-definition.ts`: it walks the real
 * section and field definitions and fills each one from SAMPLE_VALUES below,
 * keyed by field code. Add a field to the definition and it appears here too —
 * the sample cannot quietly fall out of step with the sheet.
 *
 * The data is invented. A banner above the sheet says so, placed outside the
 * sheet itself so the layout being judged is exactly the real one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SHEET_STYLES, SkillSheetDocument } from '../src/components/sheet-document';
import { SUPPLEMENT_STYLES, SupplementDocument } from '../src/components/supplement-document';
import { SECTIONS, type SectionSeed } from '../prisma/seed/sheet-definition';
import { Glossary, type GlossaryRecord } from '../src/lib/glossary/glossary';
import { runRule } from '../src/lib/rules';
import type { JlptScores } from '../src/lib/rules/jlpt';

type Grid = Array<{ row: string; value: string }>;
type Sample = string | Grid;

/** Sample content by field code. Repeating sections use the per-record maps. */
const SAMPLE_VALUES: Record<string, Sample> = {
  employee_number: 'IIT-2026-018',
  gender: '女性',
  current_location: '兵庫県尼崎市',
  languages_spoken: '英語、マラヤーラム語、ヒンディー語、日本語（N4）',
  dietary: 'ベジタリアン（卵・牛乳は可。肉・魚は不可）',

  desired_industry: '自動車、産業機械',
  desired_job_type_1: '組込みソフトウェア開発',
  desired_job_type_2: '制御設計',
  desired_job_type_3: '生産技術',
  target_role: '車載制御ソフトウェアの設計担当',
  work_style: '実装・開発中心、課題解決・提案型、研究志向',
  jp_study_history: '大学の日本語講座を2年間受講し、週2回の会話練習を継続している。',

  skill_programming: 'C、C++、Python、MATLAB',
  skill_dev_tools: 'Git、Docker、Keil uVision、STM32CubeIDE',
  skill_cad: 'SolidWorks、AutoCAD',
  skill_cae: 'ANSYS Maxwell、LTspice',
  skill_control: 'PLC（ラダー）、インバータ制御',
  skill_materials: 'SEM、XRD（基礎レベル）',
  skill_drawing: 'JIS製図規格に基づく回路図および基板図の作成',
  skill_top5: [
    { row: '組込みC言語', value: '実務で使用可能' },
    { row: 'STM32マイコン開発', value: '実務で使用可能' },
    { row: '制御理論', value: '基礎を習得済み' },
    { row: 'Python', value: '実務で使用可能' },
    { row: '回路設計', value: '学習中' },
  ],


  jp_interest:
    '品質に対する考え方が工程全体に行き渡っている点に関心がある。設計段階で不具合を防ぐ仕組みを学びたいと考えている。',
  jp_learn:
    '要件定義から量産立ち上げまでの一連の流れを、実際の製品開発のなかで習得したい。設計意図を文書として残す進め方も身につけたい。',

  work_values:
    'ひとつの技術領域を深めることと、担当範囲を広げることの双方を重視する。5年後には車載制御ソフトウェアの設計を一人で担当できる状態を目標としている。',

  jlpt_description:
    'N4を取得している。言語知識・読解は120点中78点と一定の水準にあり、仕様書や手順書を辞書を用いて読み進められる。' +
    '一方、聴解は60点中19点と基準点をわずかに上回る水準にとどまり、会議での口頭のやり取りには補助が要る。' +
    '聴解については、来日後の生活のなかで改善が見込まれる。',
  jlpt_scores: [
    { row: '総合点', value: '97 / 180' },
    { row: '言語知識・読解', value: '78 / 120' },
    { row: '聴解', value: '19 / 60' },
  ],

  res_thesis:
    '部分影のかかる条件下で太陽光発電の出力を最大に保つ制御方式を設計し、実機で評価した研究である。' +
    '既存方式では出力が局所的な最大値に留まる場合があり、探索の手順を見直すことで改善を図った。\n' +
    '指導教員・研究室：インド工科大学カンプール校 電気工学科 R. Sharma研究室',

  plc_desired_role_other: '制御系の組込みソフトウェア開発であれば、分野は問わない。',
  plc_outside_major: [
    { row: '電気専攻 → 機械設計', value: '前向きに検討する' },
    { row: '電気専攻 → 生産技術', value: '積極的に希望する' },
    { row: '電気専攻 → 品質保証', value: '条件によって検討する' },
  ],
  plc_working_styles: [
    { row: '国内出張', value: '可能である' },
    { row: '客先常駐', value: '可能である' },
    { row: '交替勤務', value: '条件によって検討する' },
  ],
  plc_common_tasks: [
    { row: '仕様が固まらないまま進む案件', value: '経験がある' },
    { row: '既存設備の改修', value: '経験がある' },
    { row: '報告書・手順書の作成', value: '対応できる' },
  ],

  ldr_student_groups: 'ロボティクス部において技術リードを務めた（部員32名）。',
  ldr_awards: '学内技術コンテストにおいて最優秀賞を受賞した（2025年）。',

  oth_hobbies: '古典音楽（ヴィーナ）、長距離走',
  oth_github: 'https://github.com/example-priya-nair',
  sup_remarks: '2026年7月にJLPT N3を受験する予定である。家族の来日予定は未定とのこと。',
};


/**
 * Raw form answers for the rule-driven fields.
 *
 * These are the only inputs a RULE_BASED field is allowed to have here. The
 * printed value is produced below by the application's own rule, never typed
 * out by hand: a sample that hardcodes a rule's output can show the client
 * something the software would never print — which is exactly what happened
 * with 論文・学会発表, where the hand-written value carried a leading 「あり」
 * that `publicationsCombined` drops.
 */
const SAMPLE_ANSWERS: Record<string, unknown> = {
  'A-1-1': 'Priya Nair',
  'A-1-2': 'ナイル・プリヤ',
  'A-1-4': '2003-01-15',
  'A-1-6': 'Kochi, Kerala',
  'H-2-1': '査読付き国際会議で発表済み／Presented at a peer-reviewed international conference',
  'H-2-5': 'なし／None',
  'H-2-2':
    'Nair, P. ほか「太陽光発電システムにおける最大電力点追従制御の改良」IEEE国際会議、2025年、査読あり。',
};

const SAMPLE_JLPT: JlptScores = {
  level: 'N4',
  examYear: 2025,
  examMonth: 12,
  total: 97,
  languageAndReading: 78,
  listening: 19,
};

/**
 * Corrections an operator makes on screen after a rule has run.
 *
 * Only allowed where the rule itself flagged the value for checking (it
 * returns a `note`): 出身地 keeps the city in Latin script because the table
 * maps states, not cities, and the screen tells the operator to fix it. The
 * guard below rejects an entry for any field the rule did not flag, so this
 * cannot become a second place to invent output.
 */
const MANUAL_EDITS: Record<string, string> = {
  hometown: 'コーチ・ケーララ州（南インド）',
};

/** Fixed so the calculated age does not drift every time the sample is built. */
const RULE_REFERENCE_DATE = new Date('2026-09-01T00:00:00Z');

/** The seeded glossary, so 出身地 resolves through the real table. */
const GLOSSARY = new Glossary(
  (
    (
      JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'prisma/seed/glossary.json'), 'utf8'),
      ) as { entries: Array<Partial<GlossaryRecord>> }
    ).entries
  ).map((e, i) => ({
    id: `g${i}`,
    category: e.category!,
    english: e.english ?? '',
    aliases: e.aliases ?? [],
    japanese: e.japanese ?? '',
    gloss: e.gloss ?? null,
    region: e.region ?? null,
  })),
);

/**
 * Fill every RULE_BASED field by running its rule. A rule-driven code present
 * in SAMPLE_VALUES is an error rather than an override — that is the mistake
 * this guard exists to catch.
 *
 * A GENERATE field may also carry a ruleKey, but there the rule only supplies
 * 確定事実 for the prompt; what prints is AI prose, which no script can
 * reproduce. Those stay in SAMPLE_VALUES as illustrative text.
 */
for (const section of SECTIONS) {
  for (const field of section.fields) {
    // A GENERATE field's ruleKey only supplies 確定事実; what prints is AI
    // prose. Every other ruleKey produces the printed value itself.
    if (!field.ruleKey || field.processing === 'GENERATE') continue;
    if (field.code in SAMPLE_VALUES) {
      throw new Error(
        `${field.code} は規則（${field.ruleKey}）で生成される項目である。` +
          'SAMPLE_VALUES に直接書かず、SAMPLE_ANSWERS に回答を書くこと。',
      );
    }
    const result = runRule(field.ruleKey, {
      answers: SAMPLE_ANSWERS,
      glossary: GLOSSARY,
      now: RULE_REFERENCE_DATE,
      jlpt: SAMPLE_JLPT,
    });
    if (!result.text) {
      throw new Error(
        `${field.code}（${field.ruleKey}）が空になった。SAMPLE_ANSWERS を確認すること。`,
      );
    }
    const edit = MANUAL_EDITS[field.code];
    if (edit && !result.note) {
      throw new Error(
        `${field.code} は規則が確認を求めていない。MANUAL_EDITS から外すこと。`,
      );
    }
    SAMPLE_VALUES[field.code] = edit ?? result.text;
  }
}

/** One entry per record of each repeating section. */
const SAMPLE_RECORDS: Record<string, Array<Record<string, Sample>>> = {
  EDUCATION: [
    {
      edu_years: '2022年8月 – 2026年5月',
      edu_institution: 'インド工科大学カンプール校',
      edu_score: 'CGPA 8.7 / 10',
      edu_major: '電気工学',
      edu_degree: '学士（工学）',
    },
    {
      edu_years: '2020年6月 – 2022年5月',
      edu_institution: 'ケーララ州立高等学校',
      edu_score: '92%',
      edu_major: '理数科',
      edu_degree: '高等学校卒業',
    },
  ],
  INTERNSHIP: [
    {
      int_title: '車載ECU向け診断通信モジュールの試作',
      int_company: 'ボッシュ・インド',
      int_period: '2025年5月 – 2025年7月（10週間）',
      int_technologies: 'C、STM32、CAN通信、Vector CANoe',
      int_team_size: '5名',
      int_summary:
        '車載ECU向けの診断通信モジュールの試作を担当した。CAN通信のフレーム設計と単体試験の自動化に取り組んだ。',
      int_description:
        '既存のECUに診断通信の機能を追加する試作を担当した。まず通信仕様を読み解いてフレーム構成を設計し、次にマイコン上に実装した。最後に単体試験をスクリプトで自動化し、変更のたびに全項目を再実行できる状態にした。',
      int_role: '設計から実装、試験の自動化までを一人で担当した。仕様の確認は指導担当者と週1回行った。',
      int_challenges:
        '通信仕様の記述に解釈の分かれる箇所があり、実機の挙動と突き合わせて確認する必要があった。判断の根拠を記録に残し、後から追えるようにした。',
      int_outcome: '試験工数を約30%削減した。作成した試験スクリプトは後続の案件でも使用されている。',
    },
  ],
  PROJECT: [
    {
      prj_title: '太陽光発電向け最大電力点追従制御器の設計',
      prj_period: '2025年8月 – 2026年3月',
      prj_technologies: 'MATLAB、Simulink、LTspice、C',
      prj_team_size: '3名',
      prj_summary:
        '最大電力点追従制御器を設計し、実機で変換効率を測定した。従来方式と比較して追従時間を短縮した。',
      prj_description:
        '卒業研究として取り組んだ。既存方式の課題を文献で整理したうえで制御則を設計し、シミュレーションで妥当性を確認してから実機に実装した。部分的に影がかかる条件での挙動を重点的に評価した。',
      prj_role: '制御則の設計、実装、実機評価を担当した。基板製作は共同研究者が担当した。',
      prj_challenges:
        '部分影下では出力特性に複数の極大点が現れ、従来方式では誤った点に収束する場合があった。探索範囲の与え方を見直して対応した。',
      prj_outcome: '追従時間を従来方式比で短縮し、部分影下での出力低下を抑えた。結果は国際会議で発表した。',
    },
  ],
  WORK_EXPERIENCE: [
    {
      wjp_site: '中島製作所 第2工場',
      wjp_period: '2026年4月 – 2026年9月',
      wjp_role: '搬送装置の制御ソフト改修を担当した。',
      wjp_technologies: 'C、PLC（ラダー）、タッチパネル',
      wjp_team_size: '5名（うち日本人3名）',
      wjp_outcome: '段取り替え時間を15%短縮した。手順書を日本語で作成し、現場で使用されている。',
    },
  ],
};

let seq = 0;
const id = () => `s${++seq}`;

function buildField(
  code: string,
  nameJa: string,
  nameEn: string,
  valueType: string,
  sample: Sample | undefined,
  includeInPdf = true,
) {
  const isGrid = Array.isArray(sample);
  const valueJa = isGrid
    ? (sample as Grid).map((g) => `${g.row}：${g.value}`).join('\n')
    : ((sample as string) ?? '');
  return {
    id: id(),
    code,
    nameJa,
    nameEn,
    order: seq,
    processing: 'COPY',
    editing: 'PROMPT_AND_MANUAL',
    valueType: isGrid ? 'GRID' : valueType,
    includeInPdf,
    displayToggle: false,
    isRequired: false,
    helpText: null,
    generationPrompt: null,
    targetLengthMin: null,
    targetLengthMax: null,
    sourceCodes: [],
    valueId: id(),
    valueJa,
    valueJson: isGrid ? sample : null,
    sourceText: '',
    isLocked: false,
    isReviewed: true,
    // Mirrors the real rule: a field with nothing in it is unticked and does
    // not print (see src/lib/sheet/visibility.ts).
    // Mirrors the real print rule: a blank field is unticked, and a field the
    // definition excludes from the PDF never appears however it is filled in.
    isDisplayed: valueJa !== '' && includeInPdf,
    generatedAt: null,
    characterCount: valueJa.length,
    styleIssues: [],
    historyCount: 0,
  } as never;
}

function buildSection(section: SectionSeed) {
  const defs = [...section.fields].sort((a, b) => a.order - b.order);

  const records =
    section.kind === 'REPEATING'
      ? (SAMPLE_RECORDS[section.recordKind ?? ''] ?? []).map((values, i) => ({
          id: id(),
          kind: section.recordKind,
          origin: 'IMPORTED',
          sourcePrefix: null,
          isDisplayed: true,
          displayOrder: i + 1,
          label: section.nameJa,
          fields: defs
            .map((f) =>
              buildField(
                f.code, f.nameJa, f.nameEn, f.valueType ?? 'STRING',
                values[f.code], f.includeInPdf !== false,
              ),
            )
            .filter((f) => (f as { isDisplayed: boolean }).isDisplayed),
        }))
      : [];

  const fields =
    section.kind === 'REPEATING'
      ? []
      : defs
          .filter((f) => f.code !== 'photo')
          .map((f) =>
            buildField(
              f.code, f.nameJa, f.nameEn, f.valueType ?? 'STRING',
              SAMPLE_VALUES[f.code], f.includeInPdf !== false,
            ),
          )
          .filter((f) => (f as { isDisplayed: boolean }).isDisplayed);

  return {
    id: id(),
    code: section.code,
    nameJa: section.nameJa,
    nameEn: section.nameEn,
    order: section.order,
    kind: section.kind,
    recordKind: section.recordKind ?? null,
    isVisible: section.isVisible ?? true,
    hideWhenEmpty: section.hideWhenEmpty ?? false,
    maxDisplayed: section.maxDisplayed ?? 10,
    description: null,
    fields,
    records,
    isEmpty: fields.length === 0 && records.length === 0,
  } as never;
}

const model = {
  personId: 'sample',
  skillSheetId: 'sample',
  person: {
    id: 'sample',
    employeeNumber: 'IIT-2026-018',
    fullNameEnglish: 'Priya Nair',
    fullNameKatakana: 'ナイル・プリヤ',
    // Never printed; kept only to prove the sheet does not leak it.
    email: 'priya.nair@example.com',
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
  sections: SECTIONS.filter((s) => (s.document ?? 'SKILL_SHEET') === 'SKILL_SHEET')
    .map(buildSection)
    .filter((s) => !(s as { isEmpty: boolean }).isEmpty),
} as never;

/** The same person, but only the sections that print on the supplement. */
const supplementModel = {
  ...(model as Record<string, unknown>),
  sections: SECTIONS.filter((s) => s.document === 'SUPPLEMENT')
    .map(buildSection)
    .filter((s) => !(s as { isEmpty: boolean }).isEmpty),
} as never;

const SAMPLE_MEMOS = [
  {
    id: 'm1',
    body: '面談実施。搬送装置の制御に強い関心を示した。現場常駐にも前向きである。',
    createdAt: new Date('2026-09-10T10:00:00+09:00'),
    authorName: '営業部　田中',
  },
  {
    id: 'm2',
    body: '中島製作所様へ提案予定。日本語は読み書き中心のため、現場では書面での指示が望ましい旨を申し送ること。',
    createdAt: new Date('2026-09-16T14:30:00+09:00'),
    authorName: '営業部　田中',
  },
];

const body = renderToStaticMarkup(createElement(SkillSheetDocument, { model, photoUrl: null }));

if (body.includes('priya.nair@example.com')) {
  throw new Error('メールアドレスがシートに出力されている。');
}

const BANNER = `<p class="sample-banner">※本書は架空のデータによるサンプルです。実在の人物のものではありません。</p>`;

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><title>スキルシート サンプル</title>
<style>
body { margin: 0; }
.sample-banner {
  margin: 0 0 8px; padding: 5px 9px; font-size: 8.5pt; color: #8d3a5c;
  background: #fdeef3; border: 1px solid #e6bccd; border-radius: 4px;
  font-family: "Noto Sans JP","Hiragino Kaku Gothic ProN",sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
</style>
<style>${SHEET_STYLES}</style>
</head><body>${BANNER}${body}</body></html>`;

const out = path.join(__dirname, '..', 'tmp-sample-sheet.html');
fs.writeFileSync(out, html, 'utf-8');
console.log(`wrote ${out}`);

const supBody = renderToStaticMarkup(
  createElement(SupplementDocument, { model: supplementModel, memos: SAMPLE_MEMOS }),
);
const supHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><title>補足資料 サンプル</title>
<style>
body { margin: 0; }
.sample-banner {
  margin: 0 0 8px; padding: 5px 9px; font-size: 8.5pt; color: #8d3a5c;
  background: #fdeef3; border: 1px solid #e6bccd; border-radius: 4px;
  font-family: "Noto Sans JP","Hiragino Kaku Gothic ProN",sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
</style>
<style>${SUPPLEMENT_STYLES}</style>
</head><body>${BANNER}${supBody}</body></html>`;
const supOut = path.join(__dirname, '..', 'tmp-sample-supplement.html');
fs.writeFileSync(supOut, supHtml, 'utf-8');
console.log(`wrote ${supOut}`);
