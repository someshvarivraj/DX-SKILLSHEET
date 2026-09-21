/**
 * Generate a sample Google Form response file for testing.
 *
 * The specification (§2.3) notes that no real responses exist yet and that we
 * should produce our own test data. This script builds a CSV whose column
 * headers are exactly the question titles the real response sheet would carry,
 * so the import path is exercised for real — including the grid questions,
 * which arrive as one column per row.
 *
 *   npm run sample:responses
 *
 * Output: data/sample-responses.csv
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

const MECHANICAL: Persona = {
  'A-1-1': 'Rohan Deshmukh',
  'A-1-2': 'デシュムク・ローハン',
  'A-1-3': '男性／Male',
  'A-1-4': '2001-08-14',
  'A-1-5': 'Amagasaki',
  'A-1-6': 'Maharashtra, Pune',
  'A-1-7': 'ベジタリアン（卵は食べる）／Vegetarian (egg allowed)',
  'A-1-8': 'No allergies. I do not eat beef or pork.',
  'B-1-1': '修士／Master’s',
  'B-1-2(M)': 'M.Tech（Master of Technology）',
  'B-1-3': 'Mechanical Engineering',
  'B-1-4': 'IIT Bombay／IITボンベイ',
  'B-1-5': 'Aug 2023 – May 2025',
  'B-1-6': 'CGPA: 8.4',
  'B-2-3': 'Mechanical Engineering',
  'B-2-4': 'その他（下の「その他」欄に大学名を記入）／Other (please specify)',
  'B-2-4-2': 'MIT Art, Design and Technology University',
  'B-2-5': 'Aug 2019 – May 2023',
  'B-2-6': 'CGPA: 8.1',
  'B-3-1': '高校／High School・Senior Secondary School',
  'B-3-2': 'Science (Physics, Chemistry, Mathematics)',
  'B-3-3': 'Kendriya Vidyalaya Pune',
  'B-3-4': 'Jun 2017 – May 2019',
  'B-3-5': 'Percentage: 91%',
  'C-1-1': 'N3',
  'C-2-1': '2025年12月／December 2025',
  'C-2-2': '112',
  'C-2-3': '44',
  'C-2-4': '38',
  'C-2-5': '-',
  'C-2-6': '30',
  'C-1-2': '2026年7月に受験予定／July 2026',
  'C-1-3': 'Studied for about 18 months, first with an online course and then with a teacher at the company twice a week.',
  'C-1-4': 'IELTS 7.0 (2023)',
  'C-1-5': 'Marathi',
  'C-1-6': 'Hindi (fluent), English (business)',
  'D-1-1': ['Python', 'C++', 'MATLAB'],
  'D-1-2': ['SQL', '使用経験なし／None'],
  'D-1-3': ['Git／GitHub'],
  'D-1-4': ['Visual Studio Code（VSCode）'],
  'D-1-5': ['使用経験なし／None'],
  'D-1-6': ['Arduino'],
  'D-1-7': ['Windows', 'Linux（Ubuntu, CentOS など）／Linux (Ubuntu, CentOS, etc.)'],
  'D-1-8': ['使用経験なし／None'],
  'D-1-9': ['SolidWorks', 'CATIA', 'AutoCAD'],
  'D-1-10': ['ANSYS', 'MATLAB／Simulink'],
  'D-1-11': ['使用経験なし／None'],
  'D-1-12': ['引張試験・硬さ試験／Tensile & hardness testing'],
  'D-1-13': [
    'JIS／ISO 製図の読解／Reading JIS or ISO engineering drawings',
    '幾何公差（GD&T）／Geometric Dimensioning and Tolerancing',
  ],
  'D-1-14': 'SolidWorks ④、ANSYS ③、CATIA ③、Python ②、GD&T ③',
  'E-1-1': 'Design intern, disc brake rotor development',
  'E-1-2': 'Endurance Technologies Limited',
  'E-1-3': 'Jun 2024 – Aug 2024',
  'E-1-4': '4 people',
  'E-1-5': 'SolidWorks, ANSYS, MATLAB',
  'E-1-6': 'Improving the cooling performance of a ventilated disc brake rotor for a two-wheeler platform.',
  'E-1-7': 'The existing rotor showed thermal fade during repeated braking tests, so the team was asked to evaluate alternative vane geometries.',
  'E-1-8': 'I built the CAD models for four vane geometries, set up the FEM meshes, and ran the coupled thermal and structural analyses. I also prepared the comparison report for the design review.',
  'E-1-9': 'Mesh convergence was unstable at the pad contact surface. I refined the local mesh and validated the result against a hand calculation before trusting the model.',
  'E-1-10': 'The selected geometry reduced peak rotor temperature by 12% compared with the baseline, and the design was taken forward for physical testing.',
  'E-2-1': 'Production engineering intern',
  'E-2-2': 'Bharat Forge Limited',
  'E-2-3': 'May 2022 – Jul 2022',
  'E-2-4': '6 people',
  'E-2-5': 'AutoCAD, Excel',
  'E-2-6': 'Line balancing study on a crankshaft machining line.',
  'E-2-7': 'The line had an uneven cycle time across stations, creating a bottleneck at the grinding stage.',
  'E-2-8': 'I measured cycle times at each station over two weeks and produced the time study, then proposed a revised station allocation.',
  'E-2-9': 'Operators were initially reluctant to be timed. I explained the purpose of the study and shared the results with them, which improved cooperation.',
  'E-2-10': 'The proposal reduced the bottleneck station time by about 9%. I learned how much shop-floor communication matters to a process change.',
  'F-1-1': 'Design and analysis of a lightweight chassis for an electric go-kart',
  'F-1-2': 'Jan 2023 – May 2023',
  'F-1-3': '5 people',
  'F-1-4': 'SolidWorks, ANSYS',
  'F-1-5': 'Final year project to design a chassis 20% lighter than the previous year’s entry while keeping torsional stiffness.',
  'F-1-6': 'The previous chassis was over the weight target and failed the stiffness requirement at the rear mounting points.',
  'F-1-7': 'I was responsible for the structural analysis and the material selection, and I presented the trade-off study to the faculty panel.',
  'F-1-8': 'The first iteration met the weight target but lost stiffness. I added a triangulated rear section and re-ran the analysis until both requirements were met.',
  'F-1-9': 'Final chassis was 18% lighter with 5% higher torsional stiffness. The kart completed the regional event without structural failure.',
  'G-1-1A': 'C1. 機械設計・機構設計／Mechanical & Mechanism Design',
  'G-1-1B': 'C2. CAE・構造解析・シミュレーション（FEM／CFD／熱流体／振動）／CAE & Simulation',
  'G-1-1C': 'C4. 生産技術・製造プロセス設計／Manufacturing Engineering & Process Design',
  'G-1-2': [
    '自動車／Automobile',
    'ロボティクス・FA（工場自動化）／Robotics & Factory Automation',
    '製造業（機械・電子・電気）／Manufacturing (Mechanical / Electronics / Electrical)',
  ],
  'G-1-3': [
    '実装・開発中心（手を動かすことが好き）／Hands-on Development-Oriented',
    '課題解決・提案型（問題発見と改善志向）／Problem-Solving & Proposal-Oriented',
  ],
  'G-1-4': [
    '設計エンジニア（機械・電気・土木）／Design Engineer (Mechanical / Electrical / Civil)',
    'CAE・シミュレーションエンジニア／CAE & Simulation Engineer',
  ],
  'G-1-5': [
    'チームで働きたい・チームワークを大切にしたい／I want to work in a team',
    '新しい技術に挑戦したい／I want to challenge new technologies',
    '技術力を磨き続けたい／I want to continuously improve my technical skills',
  ],
  'G-1-6': 'None',
  'G-1-7': {
    '機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）／Mechanical → Civil & infrastructure design':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '材料専攻 → 生産技術・品質保証／Materials → Manufacturing engineering & QA':
      '積極的に希望する／Actively prefer',
    '情報系以外 → ソフトウェア開発／Non-IT → Software development':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '情報系 → 制御・組込みソフト開発／IT → Control & embedded software':
      '条件次第で受け入れられる／Acceptable depending on conditions',
  },
  'G-1-8': {
    '工場・製造現場での勤務／Working at a factory or production site':
      '積極的に希望する／Actively prefer',
    '顧客先での据付・現地試運転立会い（国内出張を伴う）／On-site installation and commissioning':
      '条件次第で受け入れられる／Acceptable depending on conditions',
    '客先常駐／Long-term assignment at a client site':
      'できれば避けたい／Prefer to avoid',
  },
  'G-1-9': {
    '紙・PDF・Excel帳票などの非構造化データを整理・構造化する業務／Structuring unstructured data':
      '条件次第で取り組める／Acceptable depending on conditions',
    '日本語の仕様書・図面・マニュアルを読み解く業務／Reading Japanese specs, drawings and manuals':
      '積極的に取り組みたい／Actively want to take it on',
    'レガシーシステム（古い言語・古い設備）の保守・改修／Maintaining and updating legacy systems':
      '条件次第で取り組める／Acceptable depending on conditions',
    '仕様が固まっていない状態で、関係者と調整しながら進める業務／Working from incomplete specifications':
      '積極的に取り組みたい／Actively want to take it on',
    '手作業で行われている業務プロセスの自動化／Automating manual business processes':
      '積極的に取り組みたい／Actively want to take it on',
  },
  'H-1-1': 'Team lead of the college motorsports team for one year, managing 18 members and the build schedule.',
  'H-1-2': 'Presented the chassis trade-off study at the college technical symposium, 2023.',
  'H-2-1': 'なし／None',
  'H-2-3': 'Thermal and structural optimisation of ventilated disc brake rotors. The work compared four vane geometries using coupled thermal-structural finite element analysis and validated the selected design against bench test data.',
  'H-2-4': 'Prof. S. Kulkarni, Thermal Systems Laboratory',
  'H-2-5': 'なし／None',
  'I-1-1': 'I want to learn how Japanese manufacturers achieve such consistent quality. During my internship I saw how much variation there was between shifts, and I want to understand the systems that prevent it.',
  'I-1-2': [
    '品質意識の高さ／Strong sense of quality',
    '現場改善や生産性／On-site improvement & productivity',
    'ものづくりの現場（製造・据付・試運転）／Manufacturing sites',
  ],
  'I-1-3': [
    'CAD設計（機械・電気）／CAD Design (Mechanical / Electrical)',
    '生産技術・製造プロセス改善／Manufacturing Engineering & Process Improvement',
    '品質管理（QA）／Quality Assurance',
  ],
  'J-1-1': 'I am currently taking a Japanese class twice a week and hope to take N2 next year.',
  'J-1-2': 'https://github.com/example-rohan',
  'J-1-3': 'Reading books, playing cricket, cooking',
};

const MATERIALS: Persona = {
  ...MECHANICAL,
  'A-1-1': 'Ananya Iyer',
  'A-1-2': 'アイヤル・アナンヤ',
  'A-1-3': '女性／Female',
  'A-1-4': '2002-02-03',
  'A-1-6': 'Tamil Nadu, Coimbatore',
  'A-1-7': 'ベジタリアン（卵は食べない）／Vegetarian (no egg)',
  'A-1-8': 'Vegetarian for religious reasons. No nut allergies.',
  'B-1-3': 'Metallurgical and Materials Engineering',
  'B-1-4': 'IIT BHU Varanasi／IITバラナシ',
  'B-2-3': 'Metallurgical and Materials Engineering',
  'B-2-4': 'IIT BHU Varanasi／IITバラナシ',
  'C-1-1': 'N2',
  'C-2-1': '2025年7月／July 2025',
  'C-2-2': '134',
  'C-2-3': '52',
  'C-2-4': '48',
  'C-2-6': '34',
  'C-1-5': 'Tamil',
  'D-1-1': ['Python', 'MATLAB'],
  'D-1-9': ['SolidWorks', '使用経験なし／None'],
  'D-1-10': ['ANSYS', 'COMSOL Multiphysics'],
  'D-1-12': [
    'SEM（走査型電子顕微鏡）／Scanning Electron Microscope',
    'XRD（X線回折）／X-ray Diffraction',
    'Thermo-Calc／CALPHAD',
    'DSC／TGA（熱分析）／Thermal Analysis',
  ],
  'D-1-14': 'SEM ④、XRD ④、Thermo-Calc ③、Python ③、ANSYS ②',
  'E-1-1': 'Research intern, heat treatment of maraging steel',
  'E-1-2': 'Tata Steel Limited',
  'E-1-5': 'SEM, XRD, Thermo-Calc',
  'E-1-6': 'Studying how ageing temperature affects the hardness of a novel maraging steel grade.',
  'E-1-8': 'I designed the heat treatment experiments, performed the SEM and XRD analysis, and wrote the first draft of the internal report.',
  'E-1-10': 'Identified an ageing window that raised hardness by 15% over the existing process. The result was included in an internal technical note.',
  'G-1-1A': 'E1. 材料開発・材料評価（金属・高分子・セラミックス・複合材）／Materials Development',
  'G-1-1B': 'E3. 材料シミュレーション・マテリアルズインフォマティクス／Materials Simulation & MI',
  'G-1-1C': 'C5. 品質保証・品質管理（検査・信頼性）／Quality Assurance & Quality Control',
  'G-1-2': [
    '素材・鉄鋼・非鉄・化学／Materials, Steel, Non-ferrous Metals & Chemicals',
    '自動車／Automobile',
  ],
  'H-2-1': '査読付き国際誌に掲載済み／Published in a peer-reviewed international journal',
  'H-2-2':
    'Iyer, A. (first author), Sharma, R. — "Microstructural evolution in novel maraging steels during heat treatment," Materials Science and Engineering A, 2025, DOI: 10.1016/j.msea.2025.00000, peer-reviewed. Contribution: designed the heat-treatment experiments, performed SEM/XRD analysis, and wrote the first draft.',
  'H-2-3': 'Microstructural evolution in maraging steels during ageing. The study tracked precipitate formation using SEM and XRD across six ageing conditions and correlated the results with hardness measurements.',
  'H-2-4': 'Prof. R. Sharma, Physical Metallurgy Laboratory',
  'J-1-2': '',
  'J-1-3': 'Listening to music, classical dance',
};

const SOFTWARE: Persona = {
  ...MECHANICAL,
  'A-1-1': 'Karthik Menon',
  'A-1-2': 'メノン・カールティク',
  'A-1-4': '2001-11-22',
  'A-1-6': 'Kerala, Kochi',
  'A-1-7': 'ノンベジタリアン（牛肉は食べない）／Non-vegetarian (no beef)',
  'A-1-8': 'None',
  'B-1-3': 'Computer Science and Engineering',
  'B-1-4': 'IIT Hyderabad／IITハイデラバード',
  'B-2-3': 'Computer Science and Engineering',
  'B-2-4': 'IIT Hyderabad／IITハイデラバード',
  'C-1-1': '取得していない／Not certified',
  'C-2-1': '受験していない／Not taken',
  'C-2-2': '-',
  'C-2-3': '-',
  'C-2-4': '-',
  'C-2-5': '-',
  'C-2-6': '-',
  'C-1-5': 'Malayalam',
  'D-1-1': ['Python', 'Java', 'JavaScript', 'C++'],
  'D-1-2': ['SQL', 'PostgreSQL', 'MongoDB'],
  'D-1-5': ['TensorFlow', 'PyTorch', 'scikit-learn'],
  'D-1-8': ['AWS', 'GCP（Google Cloud Platform）'],
  'D-1-9': ['使用経験なし／None'],
  'D-1-10': ['使用経験なし／None'],
  'D-1-12': ['使用経験なし／None'],
  'D-1-13': ['経験なし／None'],
  'D-1-14': 'Python ④、PyTorch ③、AWS ③、SQL ④、Docker ②',
  'E-1-1': 'Machine learning intern, defect detection on a production line',
  'E-1-2': 'Intellify Edventures Private Ltd',
  'E-1-5': 'Python, OpenCV, TensorFlow, Google Colab',
  'E-1-6': 'Building an image recognition system to detect defective products on a manufacturing line.',
  'E-1-8': 'I preprocessed the training data, trained the model and validated its accuracy against a held-out set.',
  'E-1-9': 'The dataset was small, so the first model overfitted. I applied image augmentation and cross-validation to improve generalisation.',
  'E-1-10': 'Achieved over 92% detection accuracy on the validation set, which was enough for the client to run a pilot on one line.',
  'G-1-1A': 'A3. AI・機械学習・データサイエンス／AI, Machine Learning & Data Science',
  'G-1-1B': 'A1. システムエンジニア（要件定義・設計）／System Engineer (Requirements & Design)',
  'G-1-1C': 'A9. 業務プロセス自動化・データ基盤構築（非構造化データの構造化を含む）／Business Process Automation & Data Infrastructure',
  'G-1-2': [
    'ITサービス・SIer／IT Services & System Integrators',
    'ロボティクス・FA（工場自動化）／Robotics & Factory Automation',
  ],
  'H-2-1': '投稿済み・査読中／Submitted, currently under review',
  'H-2-2':
    'Menon, K. (first author) — "Few-shot defect detection for low-volume manufacturing," submitted to IEEE Access, 2026, under review. Contribution: designed the model architecture and ran all experiments.',
  'H-2-3': 'Few-shot learning for visual defect detection. The work addresses the problem of training a reliable detector when only a small number of defective samples are available.',
  'H-2-4': 'Prof. A. Nair, Machine Learning Laboratory',
  'J-1-2': 'https://github.com/example-karthik',
  'J-1-3': 'Watching movies, going for walks',
};

const PERSONAS: Array<{ email: string; persona: Persona }> = [
  { email: 'rohan.deshmukh@example.com', persona: MECHANICAL },
  { email: 'ananya.iyer@example.com', persona: MATERIALS },
  { email: 'karthik.menon@example.com', persona: SOFTWARE },
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
  let day = 10;

  for (const { email, persona } of PERSONAS) {
    const row: string[] = [`2026/09/${day++} 10:00:00`, email];
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

  const outputPath = resolve(process.cwd(), 'data/sample-responses.csv');
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
