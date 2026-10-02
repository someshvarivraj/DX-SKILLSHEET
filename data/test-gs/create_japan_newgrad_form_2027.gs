/**
 * 2027 日本人新卒 スキルシート用アンケート — フォーム自動生成スクリプト（テスト用）
 * ---------------------------------------------------------------------------
 * 日本人新卒向け。氏名・住所・大学・英語は日本向けの新しい設問（新しい番号）。学歴レベル・専攻・技術スキル・インターン・プロジェクト・志向はインド版と共通。JLPT・出身地・食事は聞かない。
 * 使い方: スキルシート管理システムの「設問マスタ」→「Googleフォームのスクリプト（.gs）を取り込む」。
 * ---------------------------------------------------------------------------
 */

function createForm() {
  var form = FormApp.create('2027 Japanese New Graduate Questionnaire');
  form.setTitle('2027 Japanese New Graduate Questionnaire');
  form.setProgressBar(true);
  form.setCollectEmail(true);

  // A. 基本情報 — 日本人向けの新しい設問
  sec(form, 'A. 基本情報／Basic Information');
  txt(form, 'A-2-1. 氏名（漢字）／Full Name (Kanji)', null, true);
  txt(form, 'A-2-2. 氏名（ふりがな）／Full Name (Hiragana Reading)', null, true);
  radio(form, 'A-1-3. 性別／Gender', null,
        ['男性／Male', '女性／Female', '回答しない／Prefer not to say'], true, false);
  form.addDateItem().setTitle('A-1-4. 生年月日／Date of Birth').setRequired(true);
  txt(form, 'A-2-3. 現住所（都道府県・市区町村）／Current Address (Prefecture and City)', '例：大阪府大阪市', true);

  // B. 学歴 — 学歴レベル・専攻は共通、大学名は自由記入（新しい設問）
  sec(form, 'B. 学歴／Education');
  var level = form.addMultipleChoiceItem()
      .setTitle('B-1-1. 学歴レベル／Education Level')
      .setRequired(true);
  var pgBachelor = sec(form, '学士の方／For Bachelor’s Students');
  drop(form, 'B-1-2(B). 学位／Degree', null, ['学士（工学）／B.Eng.', '学士（理学）／B.Sc.', 'その他／Other'], true);
  var pgMaster = sec(form, '修士の方／For Master’s Students');
  drop(form, 'B-1-2(M). 学位／Degree', null, ['修士（工学）／M.Eng.', '修士（理学）／M.Sc.', 'その他／Other'], true);
  var pgEduDetail = sec(form, 'B-1. 最終学歴の詳細／Details of Your Highest Degree');
  level.setChoices([
    level.createChoice('修士／Master’s', pgMaster),
    level.createChoice('学士／Bachelor’s', pgBachelor)
  ]);
  pgBachelor.setGoToPage(pgEduDetail);
  txt(form, 'B-1-3. 専攻／Major', null, true);
  txt(form, 'B-4-1. 大学名・学部・学科／University, Faculty and Department', '例：大阪大学 工学部 機械工学科', true);
  txt(form, 'B-1-5. 在籍期間／Years Attended', null, true);

  // C. 語学 — JLPTは聞かない。TOEICは新しい設問
  sec(form, 'C. 言語能力／Language Skills');
  txt(form, 'C-3-1. TOEICスコア／TOEIC Score', '※受験していない場合は空欄', false);
  txt(form, 'C-1-6. その他言語／Other Languages', null, false);

  // D. 技術スキル — 共通
  sec(form, 'D. 技術スキル／Technical Skills');
  checks(form, 'D-1-1. プログラミング言語／Programming Languages', null,
    ['Python', 'C', 'C++', 'C#', 'Java', 'JavaScript', 'MATLAB', 'R', '使用経験なし／None'], true, true);
  checks(form, 'D-1-9. CAD・3Dモデリング／CAD & 3D Modeling', null,
    ['SolidWorks', 'CATIA', 'AutoCAD', 'Fusion 360', '使用経験なし／None'], true, true);
  para(form, 'D-1-14. 主要スキル上位5件と習熟度／Your Top 5 Skills and Proficiency Levels', null, true);

  // E / F — 共通（繰り返し）
  addExperienceSection(form, 'E-1', 'E. インターン・就業経験 パート1／Internship or Work Experience Part 1', true);
  addExperienceSection(form, 'E-2', 'E. インターン・就業経験 パート2／Internship or Work Experience Part 2', false);
  addProjectSection(form, 'F-1', 'F. プロジェクト経験 パート1／Project Experience Part 1', true);
  addProjectSection(form, 'F-2', 'F. プロジェクト経験 パート2／Project Experience Part 2', false);

  // G — 共通 + 日本人向けの新しい設問
  sec(form, 'G. 興味分野・キャリア志向／Interests & Career Aspirations');
  drop(form, 'G-1-1A. 興味ある職種　第一希望／Interested Job Roles — First Priority', JOB_HELP, JOB_ROLES, true);
  drop(form, 'G-1-1B. 興味ある職種　第二希望／Interested Job Roles — Second Priority', null, JOB_ROLES, true);
  checks(form, 'G-2-1. 希望勤務地／Preferred Work Location', null,
    ['関東／Kanto', '関西／Kansai', '中部／Chubu', '九州／Kyushu', 'どこでも可／Anywhere'], true, false);

  // J
  sec(form, 'J. その他／Other');
  para(form, 'J-1-1. 備考・補足（特記事項や伝えたいこと）／Additional Notes or Comments', null, false);

  Logger.log('編集用URL／Edit URL: ' + form.getEditUrl());
}
// ===========================================================================
// 共通ヘルパー
// ===========================================================================
function sec(form, title, help) {
  var p = form.addPageBreakItem().setTitle(title);
  if (help) p.setHelpText(help);
  return p;
}

function txt(form, title, help, required) {
  var i = form.addTextItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setRequired(!!required);
  return i;
}

function para(form, title, help, required) {
  var i = form.addParagraphTextItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setRequired(!!required);
  return i;
}

function radio(form, title, help, choices, required, other) {
  var i = form.addMultipleChoiceItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setChoiceValues(choices);
  if (other) i.showOtherOption(true);
  i.setRequired(!!required);
  return i;
}

function drop(form, title, help, choices, required) {
  var i = form.addListItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setChoiceValues(choices);
  i.setRequired(!!required);
  return i;
}

function checks(form, title, help, choices, required, other) {
  var i = form.addCheckboxItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setChoiceValues(choices);
  if (other) i.showOtherOption(true);
  i.setRequired(!!required);
  return i;
}

function grid(form, title, help, rows, cols, required) {
  var i = form.addGridItem().setTitle(title);
  if (help) i.setHelpText(help);
  i.setRows(rows).setColumns(cols);
  i.setRequired(!!required);
  return i;
}

// ===========================================================================
// 選択肢の定義
// ===========================================================================

// B-1-4 / B-2-4 大学名（IIT Kanpur を追加）
var UNIVERSITIES = [
  'IIT Jodhpur／IITジョドプール',
  'IIT Kanpur／IITカンプール',
  'IIT Mandi／IITマンディ',
  'IIT Bombay／IITボンベイ',
  'IIT BHU Varanasi／IITバラナシ',
  'IIT Hyderabad／IITハイデラバード',
  'IIT Roorkee／IITルールキー',
  'IIT Delhi／IITデリー',
  'その他（下の「その他」欄に大学名を記入）／Other (please specify)'
];

// G-1-1 興味ある職種（全31項目）
var JOB_ROLES = [
  // カテゴリA：ソフトウェア・IT
  'A1. システムエンジニア（要件定義・設計）／System Engineer (Requirements & Design)',
  'A2. プログラマー（Web・アプリ開発）／Programmer (Web / App Development)',
  'A3. AI・機械学習・データサイエンス／AI, Machine Learning & Data Science',
  'A4. テスト・QA・ソフトウェア評価／Testing, QA & Software Evaluation',
  'A5. サイバーセキュリティ／Cybersecurity',
  'A6. インフラエンジニア（クラウド・ネットワーク）／Infrastructure Engineer (Cloud & Network)',
  'A7. フォワードデプロイドエンジニア（顧客先での導入・実装支援）／Forward Deployed Engineer',
  'A8. システムモダナイゼーション・マイグレーション（既存システムの刷新・移行）／System Modernization & Migration',
  'A9. 業務プロセス自動化・データ基盤構築（非構造化データの構造化を含む）／Business Process Automation & Data Infrastructure',
  // カテゴリB：電気・電子・制御
  'B1. 組込み・制御系ソフト開発／Embedded & Control Software Development',
  'B2. 電気・電子回路設計／Electrical & Electronic Circuit Design',
  'B3. 制御盤設計・PLCプログラミング（FA・産業機械）／Control Panel Design & PLC Programming',
  'B4. 電力・エネルギー設備（発電・送配電）／Power & Energy Systems',
  // カテゴリC：機械・設計・製造
  'C1. 機械設計・機構設計／Mechanical & Mechanism Design',
  'C2. CAE・構造解析・シミュレーション（FEM／CFD／熱流体／振動）／CAE & Simulation',
  'C3. 3D CAD設計（機械・電気）／3D CAD Design (Mechanical / Electrical)',
  'C4. 生産技術・製造プロセス設計／Manufacturing Engineering & Process Design',
  'C5. 品質保証・品質管理（検査・信頼性）／Quality Assurance & Quality Control',
  'C6. フィールドエンジニア（据付・現地試運転立会い・保守）／Field Engineer',
  // カテゴリD：土木・建築・インフラ
  'D1. 土木設計（道路・橋梁・トンネル・河川ダム・上下水道・水力発電）／Civil Design',
  'D2. BIM・CIM・3Dデータを活用した設計／Design Using BIM / CIM / 3D Data',
  'D3. 構造設計・耐震設計／Structural & Seismic Design',
  'D4. 施工管理・プロジェクト管理／Construction & Project Management',
  // カテゴリE：材料・化学・プロセス
  'E1. 材料開発・材料評価（金属・高分子・セラミックス・複合材）／Materials Development',
  'E2. 熱処理・表面処理・接合などのプロセス技術／Process Engineering',
  'E3. 材料シミュレーション・マテリアルズインフォマティクス／Materials Simulation & MI',
  'E4. 化学プロセス・プラントエンジニアリング／Chemical Process & Plant Engineering',
  // カテゴリF：研究開発
  'F1. AI・情報系の研究開発／R&D in AI & Information Systems',
  'F2. 医療・バイオ系の研究開発／R&D in Medical & Biomedical Fields',
  'F3. 環境・エネルギー系の研究開発／R&D in Environment & Energy',
  // カテゴリG：その他・新技術・創造領域
  'G1. Web制作・UI/UXデザイン／Web Production & UI/UX Design',
  'G2. 映像・音響・ゲーム制作／Video, Audio & Game Development',
  'G3. 技術営業・セールスエンジニア／Technical Sales / Sales Engineer',
  'G4. その他（自由記述）／Other (Free Description)'
];

var JOB_HELP =
  'カテゴリA：ソフトウェア・IT／Category A: Software & IT\n' +
  'カテゴリB：電気・電子・制御／Category B: Electrical, Electronics & Control\n' +
  'カテゴリC：機械・設計・製造／Category C: Mechanical Design & Manufacturing\n' +
  'カテゴリD：土木・建築・インフラ／Category D: Civil Engineering & Infrastructure\n' +
  'カテゴリE：材料・化学・プロセス／Category E: Materials, Chemistry & Process\n' +
  'カテゴリF：研究開発／Category F: Research & Development\n' +
  'カテゴリG：その他・新技術・創造領域／Category G: Other, Emerging Tech & Innovation\n\n' +
  '※第一〜第三希望で同じ番号を重複して選ばないでください。／' +
  'Please do not select the same option more than once.';

var CHALLENGE_COLS = [
  '積極的に取り組みたい／Actively want to take it on',
  '条件次第で取り組める／Acceptable depending on conditions',
  'できれば避けたい／Prefer to avoid'
];

var GRID_COLS = [
  '積極的に希望する／Actively prefer',
  '条件次第で受け入れられる／Acceptable depending on conditions',
  'できれば避けたい／Prefer to avoid'
];

// E / F の記入例
var SAMPLE_TEXT =
  '【記入例①（IT系）／Example 1 (IT)】\n' +
  'テーマ：Development of an image-recognition system using AI／期間：Aug 2023 – Dec 2023／' +
  'チーム：5 people／使用技術：Python, OpenCV, TensorFlow, Google Colab\n' +
  '概要：Built an AI system to detect defective products on a manufacturing line.\n' +
  '役割：Preprocessed training data, trained the model, validated accuracy.\n' +
  '課題と対応：With limited data, applied image augmentation to improve performance.\n' +
  '成果：Achieved over 92% detection accuracy.\n\n' +
  '【記入例②（機械・材料系）／Example 2 (Mechanical / Materials)】\n' +
  'テーマ：Structural analysis and design improvement of a disc brake rotor／' +
  '期間：Jul 2024 – Aug 2024／チーム：3 people／' +
  '使用技術：SolidWorks, ANSYS, MATLAB, CNC lathe operation\n' +
  '概要：Modelled several rotor geometries in CAD and ran comparative structural and ' +
  'thermal analyses.\n' +
  '役割：Built the CAD models, set up the FEM meshes, ran the analyses.\n' +
  '課題と対応：Mesh convergence was unstable at the contact surface, so refined the local ' +
  'mesh and validated against a hand calculation.\n' +
  '成果：Reduced peak temperature by 12%.\n\n' +
  '※IT系以外の経験も歓迎します。ご自身の専門に沿って記入してください。／' +
  'Non-IT experience is equally welcome.';

var TECH_HELP = '例：Python, SolidWorks, ANSYS, PLC, SEM, AutoCAD, MATLAB など／' +
  'e.g., Python, SolidWorks, ANSYS, PLC, SEM, AutoCAD, MATLAB';

// ===========================================================================
// E / F セクションの生成
// ===========================================================================
function addExperienceSection(form, id, title, withSample) {
  sec(form, title, withSample ? SAMPLE_TEXT :
      '※2件目のインターン・就業経験があれば記入してください。なければ空欄で構いません。／' +
      'Please fill in a second internship or work experience if you have one. ' +
      'Leave blank if not.');
  txt(form, id + '-1. インターン名（またはテーマ）／Internship Title (or Theme)', null, false);
  txt(form, id + '-2. 企業名・機関名／Company or Institution Name', null, false);
  txt(form, id + '-3. 実施期間（年月〜年月）／Period (Month/Year – Month/Year)', null, false);
  txt(form, id + '-4. チーム規模／Team Size', '例：4人／e.g., 4 people', false);
  txt(form, id + '-5. 使用技術／Technologies Used', TECH_HELP, false);
  para(form, id + '-6. 概要／Summary', null, false);
  para(form, id + '-7. 目的・背景（簡潔に）／Purpose & Background (brief)', null, false);
  para(form, id + '-8. あなたの役割・担当したこと／Your Role or Responsibilities', null, false);
  para(form, id + '-9. 工夫・課題と対応方法／Challenges & How You Solved Them', null, false);
  para(form, id + '-10. 得られた成果や学び／Outcome & Learning', null, false);
}

function addProjectSection(form, id, title, withSample) {
  sec(form, title, withSample ? SAMPLE_TEXT :
      '※2件目のプロジェクト経験があれば記入してください。なければ空欄で構いません。／' +
      'Please fill in a second project if you have one. Leave blank if not.');
  txt(form, id + '-1. プロジェクト名（またはテーマ）／Project Title (or Theme)', null, false);
  txt(form, id + '-2. 実施期間（年月〜年月）／Period (Month/Year – Month/Year)', null, false);
  txt(form, id + '-3. チーム規模／Team Size', '例：4人／e.g., 4 people', false);
  txt(form, id + '-4. 使用技術／Technologies Used', TECH_HELP, false);
  para(form, id + '-5. 概要／Summary', null, false);
  para(form, id + '-6. 目的・背景（簡潔に）／Purpose & Background (brief)', null, false);
  para(form, id + '-7. あなたの役割・担当したこと／Your Role or Responsibilities', null, false);
  para(form, id + '-8. 工夫・課題と対応方法／Challenges & How You Solved Them', null, false);
  para(form, id + '-9. 得られた成果や学び／Outcome & Learning', null, false);
}
