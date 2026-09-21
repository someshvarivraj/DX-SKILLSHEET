/**
 * A second, independent batch of sample Google Form responses — new people,
 * different emails, so it can be imported without colliding with
 * data/sample-responses.csv (see scripts/make-sample-responses.ts for the
 * original three). Useful for testing a second import round, or the
 * "existing person" diff/review path against people already imported once.
 *
 *   npm run sample:responses2
 *
 * Output: data/sample-responses-2.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Question = {
  code: string;
  titleJa: string;
  fullTitle: string;
  type: string;
  options: string[];
  gridRows: string[];
  gridColumns: string[];
};

type Catalogue = { questions: Question[] };

/** One test person. Keys are question codes; values are the English answers. */
type Persona = Record<string, string | string[] | Record<string, string>>;

const ELECTRICAL: Persona = {
  'A-1-1': 'Priya Nair',
  'A-1-2': 'ナイル・プリヤ',
  'A-1-3': '女性／Female',
  'A-1-4': '2001-05-09',
  'A-1-5': 'Kobe',
  'A-1-6': 'Uttar Pradesh, Kanpur',
  'A-1-7': 'ベジタリアン（卵は食べる）／Vegetarian (egg allowed)',
  'A-1-8': 'No allergies.',
  'B-1-1': '修士／Master’s',
  'B-1-2(M)': 'M.Tech（Master of Technology）',
  'B-1-3': 'Electrical Engineering',
  'B-1-4': 'IIT Kanpur／IITカーンプル',
  'B-1-5': 'Aug 2023 – May 2025',
  'B-1-6': 'CGPA: 8.7',
  'B-2-3': 'Electrical Engineering',
  'B-2-4': 'IIT Kanpur／IITカーンプル',
  'B-2-5': 'Aug 2019 – May 2023',
  'B-2-6': 'CGPA: 8.5',
  'B-3-1': '高校／High School・Senior Secondary School',
  'B-3-2': 'Science (Physics, Chemistry, Mathematics)',
  'B-3-3': 'Delhi Public School, Kanpur',
  'B-3-4': 'Jun 2017 – May 2019',
  'B-3-5': 'Percentage: 94%',
  'C-1-1': 'N4',
  'C-2-1': '2025年7月／July 2025',
  'C-2-2': '98',
  'C-2-3': '40',
  'C-2-4': '38',
  'C-2-5': '-',
  'C-2-6': '20',
  'C-1-2': '2026年12月に受験予定／December 2026',
  'C-1-3': 'Self-study for one year using textbooks, then group lessons at the company for six months.',
  'C-1-4': 'IELTS 7.5 (2023)',
  'C-1-5': 'Hindi',
  'C-1-6': 'Malayalam (native), English (business)',
  'D-1-1': ['C', 'C++', 'Python'],
  'D-1-2': ['SQL'],
  'D-1-3': ['Git／GitHub'],
  'D-1-4': ['Visual Studio Code（VSCode）', 'Keil µVision'],
  'D-1-5': ['使用経験なし／None'],
  'D-1-6': ['Arduino', 'Raspberry Pi', 'STM32'],
  'D-1-7': ['Windows', 'Linux（Ubuntu, CentOS など）／Linux (Ubuntu, CentOS, etc.)'],
  'D-1-8': ['使用経験なし／None'],
  'D-1-9': ['AutoCAD Electrical'],
  'D-1-10': ['MATLAB／Simulink'],
  'D-1-11': ['オシロスコープ／Oscilloscope', 'ロジックアナライザ／Logic Analyzer'],
  'D-1-12': ['使用経験なし／None'],
  'D-1-13': ['回路図の読解／Reading circuit schematics'],
  'D-1-14': 'STM32 ④、MATLAB／Simulink ③、C ④、Python ③、回路設計 ③',
  'E-1-1': 'Embedded firmware intern, motor control board',
  'E-1-2': 'Bosch Limited',
  'E-1-3': 'Jun 2024 – Aug 2024',
  'E-1-4': '5 people',
  'E-1-5': 'STM32, Keil, oscilloscope',
  'E-1-6': 'Developing firmware for a brushless DC motor controller used in a small appliance.',
  'E-1-7': 'The existing controller had audible noise at low speed, so the team investigated the PWM switching strategy.',
  'E-1-8': 'I implemented a space-vector PWM scheme, tuned the current control loop, and validated it on the bench with an oscilloscope.',
  'E-1-9': 'The current sensor had more noise than expected. I added a digital filter and re-tuned the control loop gains to compensate.',
  'E-1-10': 'Audible noise dropped noticeably and the revised firmware was carried into the next hardware revision.',
  'E-2-1': 'Test engineering intern',
  'E-2-2': 'Havells India Limited',
  'E-2-3': 'May 2022 – Jul 2022',
  'E-2-4': '3 people',
  'E-2-5': 'LabVIEW, Excel',
  'E-2-6': 'Automating a repetitive functional test for a power supply unit.',
  'E-2-7': 'Manual testing took too long and results were inconsistent between operators.',
  'E-2-8': 'I wrote a LabVIEW test sequence that automated the measurement steps and logged results automatically.',
  'E-2-9': 'The test rig occasionally lost communication with the instrument. I added retry logic and a timeout to make it reliable.',
  'E-2-10': 'Test time per unit dropped by about 40%, and the results became repeatable across operators.',
  'F-1-1': 'Design of a solar-powered water pumping controller',
  'F-1-2': 'Jan 2023 – May 2023',
  'F-1-3': '4 people',
  'F-1-4': 'MATLAB／Simulink, AutoCAD Electrical',
  'F-1-5': 'Final year project to design a maximum-power-point-tracking controller for a small solar pump.',
  'F-1-6': 'The baseline design lost efficiency under partial shading conditions common on the test site.',
  'F-1-7': 'I designed and simulated the MPPT algorithm and built the control board.',
  'F-1-8': 'The first algorithm converged too slowly under fast-changing light. I switched to an incremental-conductance method and retuned it.',
  'F-1-9': 'Efficiency improved by about 14% over the baseline under partial shading, measured on the physical prototype.',
  'G-1-1A': 'B1. 電気・電子回路設計（アナログ／デジタル）／Electrical & Electronics Circuit Design',
  'G-1-1B': 'B3. 組込みソフトウェア・ファームウェア開発／Embedded Software & Firmware Development',
  'G-1-1C': 'C2. CAE・構造解析・シミュレーション（FEM／CFD／熱流体／振動）／CAE & Simulation',
  'G-1-2': [
    '電機・重電・産業機器／Electrical & Heavy Machinery',
    '自動車／Automobile',
    '製造業（機械・電子・電気）／Manufacturing (Mechanical / Electronics / Electrical)',
  ],
  'G-1-3': [
    '実装・開発中心（手を動かすことが好き）／Hands-on Development-Oriented',
    '技術を突き詰めたい・専門性重視／Depth-Oriented, Specialist-Focused',
  ],
  'G-1-4': [
    '組込みエンジニア（ファームウェア）／Embedded Engineer (Firmware)',
    '電気・電子回路設計エンジニア／Electrical & Electronics Design Engineer',
  ],
  'G-1-5': [
    'チームで働きたい・チームワークを大切にしたい／I want to work in a team',
    '技術力を磨き続けたい／I want to continuously improve my technical skills',
  ],
  'G-1-6': 'None',
  'G-1-7': {
    '機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）／Mechanical → Civil & infrastructure design':
      'できれば避けたい／Prefer to avoid',
    '材料専攻 → 生産技術・品質保証／Materials → Manufacturing engineering & QA':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '情報系以外 → ソフトウェア開発／Non-IT → Software development':
      '積極的に希望する／Actively prefer',
    '情報系 → 制御・組込みソフト開発／IT → Control & embedded software':
      '積極的に希望する／Actively prefer',
  },
  'G-1-8': {
    '工場・製造現場での勤務／Working at a factory or production site':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '顧客先での据付・現地試運転立会い（国内出張を伴う）／On-site installation and commissioning':
      '積極的に希望する／Actively prefer',
    '客先常駐／Long-term assignment at a client site':
      '条件次第で受け入れられる／Acceptable depending on conditions',
  },
  'G-1-9': {
    '紙・PDF・Excel帳票などの非構造化データを整理・構造化する業務／Structuring unstructured data':
      '条件次第で取り組める／Acceptable depending on conditions',
    '日本語の仕様書・図面・マニュアルを読み解く業務／Reading Japanese specs, drawings and manuals':
      '積極的に取り組みたい／Actively want to take it on',
    'レガシーシステム（古い言語・古い設備）の保守・改修／Maintaining and updating legacy systems':
      '条件次第で取り組める／Acceptable depending on conditions',
    '仕様が固まっていない状態で、関係者と調整しながら進める業務／Working from incomplete specifications':
      '条件次第で取り組める／Acceptable depending on conditions',
    '手作業で行われている業務プロセスの自動化／Automating manual business processes':
      '積極的に取り組みたい／Actively want to take it on',
  },
  'H-1-1': 'Coordinator of the electronics club for two years, organising workshops for first-year students.',
  'H-1-2': 'Won second place at the college robotics competition, 2024.',
  'H-2-1': 'なし／None',
  'H-2-3': '',
  'H-2-4': '',
  'H-2-5': 'なし／None',
  'I-1-1': 'I am interested in Japanese manufacturers’ approach to reliability testing, and I want to see how that discipline is built into everyday engineering work.',
  'I-1-2': [
    '品質意識の高さ／Strong sense of quality',
    'ものづくりの現場（製造・据付・試運転）／Manufacturing sites',
  ],
  'I-1-3': [
    '組込みソフトウェア開発／Embedded Software Development',
    '電気・電子回路設計／Electrical & Electronics Circuit Design',
  ],
  'J-1-1': 'I am taking a Japanese class twice a week and hope to take N3 next year.',
  'J-1-2': 'https://github.com/example-priya',
  'J-1-3': 'Badminton, sketching',
};

const CIVIL: Persona = {
  ...ELECTRICAL,
  'A-1-1': 'Arjun Reddy',
  'A-1-2': 'レッディ・アルジュン',
  'A-1-3': '男性／Male',
  'A-1-4': '2000-12-30',
  'A-1-5': 'Yokohama',
  'A-1-6': 'Telangana, Hyderabad',
  'A-1-7': 'ノンベジタリアン（牛肉は食べない）／Non-vegetarian (no beef)',
  'A-1-8': 'No allergies.',
  'B-1-3': 'Civil Engineering',
  'B-1-4': 'IIT Madras／IITマドラス',
  'B-2-3': 'Civil Engineering',
  'B-2-4': 'IIT Madras／IITマドラス',
  'C-1-1': '取得していない／Not certified',
  'C-2-1': '受験していない／Not taken',
  'C-2-2': '-',
  'C-2-3': '-',
  'C-2-4': '-',
  'C-2-5': '-',
  'C-2-6': '-',
  'C-1-2': '2026年12月に初受験予定／First attempt planned December 2026',
  'C-1-3': 'Just started self-study three months ago using an app.',
  'C-1-4': '',
  'C-1-5': 'Telugu',
  'D-1-1': ['Python', 'MATLAB'],
  'D-1-2': ['SQL', '使用経験なし／None'],
  'D-1-3': ['Git／GitHub'],
  'D-1-4': ['使用経験なし／None'],
  'D-1-5': ['使用経験なし／None'],
  'D-1-6': ['使用経験なし／None'],
  'D-1-7': ['Windows'],
  'D-1-8': ['使用経験なし／None'],
  'D-1-9': ['AutoCAD', 'Revit', 'STAAD.Pro'],
  'D-1-10': ['ETABS', 'ANSYS'],
  'D-1-11': ['使用経験なし／None'],
  'D-1-12': ['使用経験なし／None'],
  'D-1-13': [
    'JIS／ISO 製図の読解／Reading JIS or ISO engineering drawings',
    '施工図の読解／Reading construction drawings',
  ],
  'D-1-14': 'STAAD.Pro ④、ETABS ③、AutoCAD ④、Revit ③、Python ②',
  'E-1-1': 'Site engineering intern, residential tower construction',
  'E-1-2': 'Larsen & Toubro Construction',
  'E-1-3': 'Jun 2024 – Aug 2024',
  'E-1-4': '8 people',
  'E-1-5': 'AutoCAD, STAAD.Pro, Excel',
  'E-1-6': 'Supporting the site engineering team on a 20-storey residential tower during the structural phase.',
  'E-1-7': 'The project was behind schedule on column casting, and the team needed better tracking of formwork reuse.',
  'E-1-8': 'I maintained the daily progress tracker, checked rebar placement against drawings, and helped coordinate the formwork reuse schedule.',
  'E-1-9': 'A drawing revision was not communicated to the site team in time, causing rework on one column. I proposed a daily drawing-revision checklist that the site adopted.',
  'E-1-10': 'Formwork cycle time improved by about 2 days per floor over the internship period.',
  'E-2-1': 'Geotechnical field intern',
  'E-2-2': 'RITES Limited',
  'E-2-3': 'May 2022 – Jul 2022',
  'E-2-4': '4 people',
  'E-2-5': 'Excel',
  'E-2-6': 'Soil investigation for a highway bridge foundation.',
  'E-2-7': 'The site had variable soil conditions across the span, and the design needed reliable bearing capacity data.',
  'E-2-8': 'I logged borehole samples, assisted with standard penetration tests, and compiled the soil profile report.',
  'E-2-9': 'Groundwater was higher than expected at two boreholes. I flagged it immediately so the design team could revise the foundation assumptions early.',
  'E-2-10': 'The soil report was delivered on schedule and used directly in the foundation design.',
  'F-1-1': 'Seismic performance evaluation of a mid-rise RC frame building',
  'F-1-2': 'Jan 2023 – May 2023',
  'F-1-3': '3 people',
  'F-1-4': 'ETABS, STAAD.Pro',
  'F-1-5': 'Final year project evaluating whether an existing RC frame building meets current seismic code requirements.',
  'F-1-6': 'The building was designed under an older code and its actual seismic performance was unknown.',
  'F-1-7': 'I built the ETABS model, ran the pushover analysis, and identified the weak storey.',
  'F-1-8': 'The initial model did not match the as-built drawings in a few bays. I revisited the site survey and corrected the model before rerunning the analysis.',
  'F-1-9': 'The study confirmed a soft-storey irregularity at the ground floor and proposed a jacketing retrofit that met the target performance level.',
  'G-1-1A': 'D2. 構造設計・構造解析（建築・土木）／Structural Design & Analysis (Building / Civil)',
  'G-1-1B': 'D1. 土木設計・インフラ計画（道路・橋梁・上下水道等）／Civil Design & Infrastructure Planning',
  'G-1-1C': 'C2. CAE・構造解析・シミュレーション（FEM／CFD／熱流体／振動）／CAE & Simulation',
  'G-1-2': [
    '建設・建築・プラントエンジニアリング／Construction, Architecture & Plant Engineering',
    'インフラ（鉄道・電力・上下水道等）／Infrastructure (Rail, Power, Water, etc.)',
  ],
  'G-1-3': [
    '課題解決・提案型（問題発見と改善志向）／Problem-Solving & Proposal-Oriented',
    '現場密着型（人と接する仕事が好き）／On-site, People-Facing Work',
  ],
  'G-1-4': [
    '構造設計エンジニア／Structural Design Engineer',
    '施工管理エンジニア／Construction Management Engineer',
  ],
  'G-1-5': [
    '現場で経験を積みたい／I want to gain hands-on site experience',
    'チームで働きたい・チームワークを大切にしたい／I want to work in a team',
  ],
  'G-1-6': 'None',
  'G-1-7': {
    '機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）／Mechanical → Civil & infrastructure design':
      '積極的に希望する／Actively prefer',
    '材料専攻 → 生産技術・品質保証／Materials → Manufacturing engineering & QA':
      'できれば避けたい／Prefer to avoid',
    '情報系以外 → ソフトウェア開発／Non-IT → Software development':
      'できれば避けたい／Prefer to avoid',
    '情報系 → 制御・組込みソフト開発／IT → Control & embedded software':
      'できれば避けたい／Prefer to avoid',
  },
  'G-1-8': {
    '工場・製造現場での勤務／Working at a factory or production site':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '顧客先での据付・現地試運転立会い（国内出張を伴う）／On-site installation and commissioning':
      '積極的に希望する／Actively prefer',
    '客先常駐／Long-term assignment at a client site':
      '積極的に希望する／Actively prefer',
  },
  'H-1-1': 'Organiser of the annual civil engineering department site-visit trip for two years.',
  'H-1-2': '',
  'I-1-1': 'I visited a Japanese-built metro line during a college trip and want to understand how that level of construction quality is achieved on site.',
  'I-1-2': [
    '現場改善や生産性／On-site improvement & productivity',
    'ものづくりの現場（製造・据付・試運転）／Manufacturing sites',
  ],
  'I-1-3': [
    '構造設計（建築・土木）／Structural Design (Building / Civil)',
    '施工管理／Construction Management',
  ],
  'J-1-1': 'I am just starting Japanese study and would appreciate recommendations for beginner materials.',
  'J-1-2': '',
  'J-1-3': 'Cricket, trekking',
};

const PERSONAS: Array<{ email: string; persona: Persona }> = [
  { email: 'priya.nair@example.com', persona: ELECTRICAL },
  { email: 'arjun.reddy@example.com', persona: CIVIL },
];

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function main() {
  const cataloguePath = resolve(
    process.cwd(),
    'prisma/seed/form-questions-2026.json',
  );
  const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8')) as Catalogue;

  // Build the header row exactly as the response spreadsheet would.
  const headers: string[] = ['タイムスタンプ', 'メールアドレス'];
  const columnPlan: Array<{ code: string; gridRow: string | null; header: string }> = [];

  for (const q of catalogue.questions) {
    if (q.type === 'GRID' && q.gridRows.length > 0) {
      for (const row of q.gridRows) {
        const header = `${q.fullTitle} [${row}]`;
        headers.push(header);
        columnPlan.push({ code: q.code, gridRow: row, header });
      }
    } else {
      headers.push(q.fullTitle);
      columnPlan.push({ code: q.code, gridRow: null, header: q.fullTitle });
    }
  }

  const rows: string[][] = [];
  let day = 20;

  for (const { email, persona } of PERSONAS) {
    const row: string[] = [`2026/09/${day++} 14:30:00`, email];
    for (const column of columnPlan) {
      const answer = persona[column.code];
      if (answer === undefined || answer === null) {
        row.push('');
        continue;
      }
      if (column.gridRow) {
        const grid = answer as Record<string, string>;
        row.push(grid[column.gridRow] ?? '');
        continue;
      }
      row.push(Array.isArray(answer) ? answer.join(', ') : String(answer));
    }
    rows.push(row);
  }

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  const outputPath = resolve(process.cwd(), 'data/sample-responses-2.csv');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, '﻿' + csv + '\n', 'utf8');

  console.log(`Wrote ${rows.length} sample responses to ${outputPath}`);
  console.log(`Columns: ${headers.length}`);
  console.log('People:');
  for (const { email, persona } of PERSONAS) {
    console.log(`  - ${persona['A-1-1']} (${email})`);
  }
}

main();
