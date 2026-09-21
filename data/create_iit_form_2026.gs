/**
 * 2026 IIT Questionnaire for Skill Sheet — 改訂版フォーム自動生成スクリプト
 * ---------------------------------------------------------------------------
 * 使い方 / How to use
 *   1. https://script.google.com を開き、「新しいプロジェクト」を作成
 *   2. エディタの中身をすべて削除し、このファイルの内容を貼り付ける
 *   3. 関数 createForm を選択して「実行」をクリック（初回のみ権限承認が必要）
 *   4. 実行ログに表示される編集用URLを開くと、新しいフォームが完成しています
 *
 * 注意 / Note
 *   このスクリプトは「新しいフォーム」を作成します。2025年版フォームと
 *   その回答データはそのまま残ります。
 * ---------------------------------------------------------------------------
 */

// ===========================================================================
// メイン
// ===========================================================================
function createForm() {
  var form = FormApp.create('2026 IIT Questionnaire for Skill Sheet');
  form.setTitle('2026 IIT Questionnaire for Skill Sheet');
  form.setDescription(
    '【Disclaimer】\n' +
    'This questionnaire is conducted to understand your preferences and career goals in order ' +
    'to prevent mismatches. However, please note that your responses may not always be ' +
    'reflected exactly as requested. Particularly in Japanese companies, there is a tendency ' +
    'for more projects in product development than in research and development. Nevertheless, ' +
    'considering technological advancements and market changes, there is a potential increase ' +
    'in global hiring across various fields and industries in the future. Therefore, please ' +
    'provide your honest preferences in alignment with your career plans.\n\n' +
    '【ディスクレーマー】\n' +
    '本アンケートは、ミスマッチを防ぐために皆さんの希望とキャリア目標を把握することを目的として' +
    '実施します。ただし、ご回答が必ずしもそのまま反映されるとは限らない点をご了承ください。\n\n' +
    '【Deadline for Responses】__ __ IST EOD (punctuality)\n' +
    '*Your responses will be used to create materials for companies.'
  );
  form.setProgressBar(true);
  form.setCollectEmail(true);

  radio(form, 'Have you confirmed the above disclaimer?／上記のディスクレーマーを確認しましたか？',
        null, ['Yes／はい'], true, false);

  // -------------------------------------------------------------------------
  // A. 基本情報
  // -------------------------------------------------------------------------
  sec(form, 'A. 基本情報／Basic Information');
  txt(form, 'A-1-1. 氏名（英）／Full Name (English)', null, true);
  txt(form, 'A-1-2. 氏名（カタカナ）／Full Name (Katakana)', null, true);
  radio(form, 'A-1-3. 性別／Gender', null,
        ['男性／Male', '女性／Female', '回答しない／Prefer not to say'], true, false);
  form.addDateItem().setTitle('A-1-4. 生年月日／Date of Birth').setRequired(true);
  txt(form, 'A-1-5. 現在の居住地／Current Location',
      '※日本に来てから記入してください。市・町・村の名称を記入。／' +
      'Please fill in after arriving in Japan. Enter the city, town, or village name.', false);
  txt(form, 'A-1-6. 出身地（州・都市）／Hometown (State and City)',
      '※インドのどの州のどこの出身かを記入してください（例：Rajasthan, Jodhpur／' +
      'Uttar Pradesh, Lucknow）。／Please enter the state and the city or town you are from.',
      true);
  radio(form, 'A-1-7. 食事に関する制限／Dietary Requirements',
      '本項目は、来日後の生活支援・社員食堂の手配・出張時の食事対応のために伺うものです。' +
      '選考や評価には一切使用しません。\n' +
      'This question is asked solely to arrange meals — company cafeteria, business trips, and ' +
      'daily living support after your arrival in Japan. It is never used for evaluation or ' +
      'selection purposes.',
      ['ベジタリアン（卵は食べない）／Vegetarian (no egg)',
       'ベジタリアン（卵は食べる）／Vegetarian (egg allowed)',
       'ヴィーガン（乳製品も食べない）／Vegan (no dairy)',
       'ノンベジタリアン（牛肉は食べない）／Non-vegetarian (no beef)',
       'ノンベジタリアン（豚肉は食べない）／Non-vegetarian (no pork)',
       'ノンベジタリアン（牛肉・豚肉ともに食べない）／Non-vegetarian (no beef, no pork)',
       'ノンベジタリアン（特に制限なし）／Non-vegetarian (no restrictions)',
       'ハラル対応が必要／Halal food required'], true, true);
  para(form, 'A-1-8. 食べられないもの・アレルギー／Foods You Cannot Eat & Allergies',
      '※アレルギー、宗教上の理由、体質など、理由は問いません。特になければ「なし／None」と' +
      '記入してください。／Allergies, religious reasons, or personal constitution — no need to ' +
      'explain the reason. Write "None" if there are none.', true);

  // -------------------------------------------------------------------------
  // B. 学歴（修士／学士で分岐）
  // -------------------------------------------------------------------------
  sec(form, 'B. 学歴／Education');
  var level = form.addMultipleChoiceItem()
      .setTitle('B-1-1. 学歴レベル／Education Level')
      .setRequired(true);

  var pgBachelor = sec(form, '学士の方／For Bachelor\u2019s Students');
  drop(form, 'B-1-2(B). 学位／Degree', null,
       ['B.Tech（Bachelor of Technology）', 'その他／Other'], true);

  var pgMaster = sec(form, '修士の方／For Master\u2019s Students');
  drop(form, 'B-1-2(M). 学位／Degree', null,
       ['M.Tech（Master of Technology）', 'Dual Degree（B.Tech + M.Tech）', 'その他／Other'], true);

  var pgEduDetail = sec(form, 'B-1. 最終学歴の詳細／Details of Your Highest Degree',
    '※修士の場合は修士の情報を、学士の場合は学士の情報を記入してください。' +
    '学士の方は、次のB-2セクションにも同じ内容を記入してください。／' +
    'Master\u2019s students: enter your Master\u2019s details here. Bachelor\u2019s students: ' +
    'enter your Bachelor\u2019s details here and repeat them in section B-2.');

  level.setChoices([
    level.createChoice('修士／Master\u2019s', pgMaster),
    level.createChoice('学士／Bachelor\u2019s', pgBachelor)
  ]);
  pgBachelor.setGoToPage(pgEduDetail);   // 学士は修士ページを飛ばす

  txt(form, 'B-1-3. 専攻／Major',
      '※略称ではなく正式名称で記入してください（例：Mechanical Engineering, ' +
      'Metallurgical and Materials Engineering）。／Please type the full name.', true);
  drop(form, 'B-1-4. 大学名／University', null, UNIVERSITIES, true);
  txt(form, 'B-1-4-2. 「その他」を選んだ場合の大学名／University name (if you chose Other)',
      null, false);
  txt(form, 'B-1-5. 在籍期間／Years Attended',
      '例：2023年8月〜2025年5月（e.g., Aug 2023 – May 2025）', true);
  txt(form, 'B-1-6. 成績／Academic Score',
      '※評価方法とスコアをセットで記入（例：CGPA: 7.6 / Percentage: 92%）／' +
      'Please enter both the grading system and the score.', true);

  sec(form, 'B-2. 学士について／Bachelor\u2019s Degree',
      '※修士の方も、学士の情報を記入してください。／' +
      'Master\u2019s students must also complete this section.');
  txt(form, 'B-2-3. 専攻／Major', null, true);
  drop(form, 'B-2-4. 大学名／University', null, UNIVERSITIES, true);
  txt(form, 'B-2-4-2. 「その他」を選んだ場合の大学名／University name (if you chose Other)',
      null, false);
  txt(form, 'B-2-5. 在籍期間／Years Attended', '例：Aug 2019 – May 2023', true);
  txt(form, 'B-2-6. 成績／Academic Score', null, true);

  sec(form, 'B-3. 高校／High School');
  drop(form, 'B-3-1. 学歴レベル／Education Level', null,
       ['高校／High School・Senior Secondary School', 'その他／Other'], true);
  txt(form, 'B-3-2. 専攻／Major', null, true);
  txt(form, 'B-3-3. 学校名／School Name', null, true);
  txt(form, 'B-3-4. 在籍期間／Years Attended', '例：Aug 2019 – May 2023', true);
  txt(form, 'B-3-5. 成績／Academic Score',
      '※評価方法とスコアをセットで記入してください（例：CGPA: 7.6 / Percentage: 92%）／' +
      'Please enter both the grading system and the score.', true);

  // -------------------------------------------------------------------------
  // C. 言語能力
  // -------------------------------------------------------------------------
  sec(form, 'C. 言語能力／Language Skills');
  radio(form, 'C-1-1. 日本語（JLPT取得済みの最高レベル）／Japanese (Highest JLPT Level Obtained)',
        null, ['N1', 'N2', 'N3', 'N4', 'N5', '取得していない／Not certified'], true, false);
  // ---- C-2. JLPTスコア（新設）----
  // 得点区分はレベルで2種類：N1・N2・N3は3区分、N4・N5は2区分
  radio(form, 'C-2-1. 合格したJLPTの受験時期／Session of the JLPT You Passed',
    '※C-1-1で「取得していない」を選んだ方は「受験していない」を選んでください。／' +
    'If you selected "Not certified" in C-1-1, please choose "Not taken".',
    ['2025年7月／July 2025', '2025年12月／December 2025',
     '2026年7月／July 2026', '2026年12月／December 2026',
     'それ以前／Earlier', '受験していない／Not taken'], true, false);
  txt(form, 'C-2-2. 総合点（180点満点）／Total Score (out of 180)',
    '※合格通知に記載されている数値を半角数字で記入してください。未受験の場合は「-」。／' +
    'Enter the number shown on your result notification. Enter "-" if not applicable.', true);
  txt(form,
    'C-2-3.【N1・N2・N3の方】言語知識（文字・語彙・文法）の得点（60点満点）／' +
    'Language Knowledge (out of 60) — N1, N2, N3 only',
    '※N4・N5の方は「-」と記入してください。／Enter "-" if you took N4 or N5.', true);
  txt(form,
    'C-2-4.【N1・N2・N3の方】読解の得点（60点満点）／Reading (out of 60) — N1, N2, N3 only',
    '※N4・N5の方は「-」と記入してください。／Enter "-" if you took N4 or N5.', true);
  txt(form,
    'C-2-5.【N4・N5の方】言語知識・読解の得点（120点満点）／' +
    'Language Knowledge & Reading (out of 120) — N4, N5 only',
    '※N1・N2・N3の方は「-」と記入してください。／Enter "-" if you took N1, N2 or N3.', true);
  txt(form, 'C-2-6. 聴解の得点（60点満点）／Listening Score (out of 60)',
    '※全レベル共通の項目です。合格通知に記載されている数値を半角数字で記入してください。／' +
    'This applies to all levels. Enter the number shown on your result notification.', true);

  radio(form, 'C-1-2. 次回のJLPT受験予定／Planned JLPT Examination', null,
        ['2026年7月に受験予定／July 2026', '2026年12月に受験予定／December 2026',
         '未定／Undecided', '受験予定なし／Not planning to take the exam'], true, false);
  para(form, 'C-1-3. 日本語の学習歴／Japanese Language Learning Background',
       '※学習期間と学習方法（オンライン講座・学校・独学など）を記入してください。／' +
       'Please describe how long and by what method you have studied Japanese.', false);
  txt(form, 'C-1-4. 英語（TOEFL／IELTS）／English (TOEFL / IELTS)',
      '※スコアや資格があれば取得年とあわせて記入してください。／' +
      'If you have any scores or certifications, please include the year obtained.', false);
  txt(form, 'C-1-5. 母語／Mother Tongue',
      '※例：Hindi, Marwari, Bengali, Telugu, Tamil など。A-1-6（出身地）とあわせて、' +
      '受入時の生活支援や社内でのコミュニケーション配慮に使用します。／' +
      'e.g., Hindi, Marwari, Bengali, Telugu, Tamil. Together with A-1-6 (hometown), this is ' +
      'used to support your settling-in and workplace communication.', true);
  txt(form, 'C-1-6. その他言語／Other Languages',
      '※話せる言語があれば、レベル（日常会話／ビジネス／流暢）とあわせて記入してください。／' +
      'If you speak any other languages, please mention them along with your level ' +
      '(daily conversation, business, fluent).', false);

  // -------------------------------------------------------------------------
  // D. 技術スキル
  // -------------------------------------------------------------------------
  sec(form, 'D. 技術スキル／Technical Skills',
      '※ご自身の専門に該当しない設問は「使用経験なし／None」を選んでください。' +
      'CAD・解析・制御・材料分析の設問（D-1-9以降）を新設しています。／' +
      'Choose "None" for questions outside your field. Questions D-1-9 onward cover CAD, ' +
      'simulation, control, and materials characterization.');

  checks(form, 'D-1-1. プログラミング言語／Programming Languages', null,
    ['Python', 'C', 'C++', 'C#', 'Java', 'JavaScript', 'MATLAB', 'R',
     '使用経験なし／None'], true, true);
  checks(form, 'D-1-2. データベース・クエリ言語／Databases & Querying', null,
    ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', '使用経験なし／None'], false, true);
  checks(form, 'D-1-3. バージョン管理／Version Control', null,
    ['Git／GitHub', '使用経験なし／None'], false, true);
  checks(form, 'D-1-4. コードエディタ・IDE／Code Editors & IDEs', null,
    ['Visual Studio Code（VSCode）', 'IntelliJ／Eclipse',
     'Jupyter Notebook／Google Colab', '使用経験なし／None'], false, true);
  checks(form, 'D-1-5. 機械学習フレームワーク／Machine Learning Frameworks', null,
    ['TensorFlow', 'PyTorch', 'scikit-learn', '使用経験なし／None'], false, true);
  checks(form, 'D-1-6. ロボティクス・ハードウェア／Robotics & Hardware', null,
    ['ROS', 'Arduino', 'Raspberry Pi', 'ESP32／ESP8266', '使用経験なし／None'], false, true);
  checks(form, 'D-1-7. オペレーティングシステム／Operating Systems', null,
    ['Windows', 'Linux（Ubuntu, CentOS など）／Linux (Ubuntu, CentOS, etc.)', 'macOS'], false, false);
  checks(form, 'D-1-8. クラウドプラットフォーム／Cloud Platforms', null,
    ['AWS', 'GCP（Google Cloud Platform）', 'Azure', '使用経験なし／None'], false, true);

  checks(form, 'D-1-9. CAD・3Dモデリング／CAD & 3D Modeling', null,
    ['SolidWorks', 'CATIA', 'Siemens NX', 'PTC Creo', 'Autodesk Inventor', 'Fusion 360',
     'AutoCAD', 'AutoCAD Civil 3D', 'Revit／BIM', 'SketchUp', '使用経験なし／None'], true, true);
  checks(form, 'D-1-10. CAE・解析シミュレーション／CAE & Simulation', null,
    ['ANSYS', 'Abaqus', 'COMSOL Multiphysics', 'MATLAB／Simulink', 'OpenFOAM',
     'Altair HyperMesh', 'Gmsh', 'MSC Adams', '使用経験なし／None'], true, true);
  checks(form, 'D-1-11. 電気・制御・FA／Electrical, Control & Factory Automation',
    '※3期生求人「電気制御設計」に対応する設問です。／' +
    'This question maps to the "Electrical control design" job listing.',
    ['PLC：三菱電機／Mitsubishi Electric', 'PLC：オムロン／Omron', 'PLC：シーメンス／Siemens',
     'PLC：ロックウェル／Rockwell', '制御盤設計／Control panel design',
     'サーボモータ・インバータ／Servo motors & inverters',
     '産業用ロボット（2軸・3軸）／Industrial robots',
     'タッチパネル（HMI）作成／Touch panel (HMI) development',
     '組込みマイコン開発／Embedded microcontroller development',
     '使用経験なし／None'], true, true);
  checks(form, 'D-1-12. 材料分析・材料シミュレーション／Materials Characterization & Simulation',
    null,
    ['SEM（走査型電子顕微鏡）／Scanning Electron Microscope', 'TEM（透過型電子顕微鏡）／Transmission Electron Microscope', 'XRD（X線回折）／X-ray Diffraction', 'EPMA／EDS',
     '引張試験・硬さ試験／Tensile & hardness testing', 'DSC／TGA（熱分析）／Thermal Analysis',
     'Thermo-Calc／CALPHAD', 'JMatPro', '分子動力学（MD）／Molecular Dynamics', '第一原理計算（DFT）／Density Functional Theory',
     'Origin などのデータ解析ソフト／Data analysis software such as Origin', '使用経験なし／None'], true, true);
  checks(form, 'D-1-13. 製図・図面／Engineering Drawing', null,
    ['JIS／ISO 製図の読解／Reading JIS or ISO engineering drawings',
     '幾何公差（GD&T）／Geometric Dimensioning and Tolerancing',
     '電気回路図の読解／Reading electrical schematics',
     '土木・建築図面の読解／Reading civil or architectural drawings',
     'プラント配管図（P&ID）の読解／Reading plant P&ID diagrams',
     '経験なし／None'], true, true);
  para(form, 'D-1-14. 主要スキル上位5件と習熟度／Your Top 5 Skills and Proficiency Levels',
    '最も自信のあるスキル・ツールを5つまで挙げ、それぞれに①〜④の習熟度を付けてください。／' +
    'List up to five skills or tools you are most confident in, and rate each on the scale ' +
    'below.\n' +
    '① 授業で習った／Learned in class\n' +
    '② 学生プロジェクトで使った／Used in a student project\n' +
    '③ インターン・実務で使った／Used in an internship or professional work\n' +
    '④ 他人に教えられる／Able to teach it to others\n' +
    '記入例／Example：SolidWorks ③、ANSYS ②、Python ④、SEM ③、Thermo-Calc ②', true);

  // -------------------------------------------------------------------------
  // E. インターン・就業経験
  // -------------------------------------------------------------------------
  addExperienceSection(form, 'E-1', 'E. インターン・就業経験 パート1／Internship or Work Experience Part 1', true);
  addExperienceSection(form, 'E-2', 'E. インターン・就業経験 パート2／Internship or Work Experience Part 2', false);

  // -------------------------------------------------------------------------
  // F. プロジェクト経験
  // -------------------------------------------------------------------------
  addProjectSection(form, 'F-1', 'F. プロジェクト経験 パート1／Project Experience Part 1', true);
  addProjectSection(form, 'F-2', 'F. プロジェクト経験 パート2／Project Experience Part 2', false);

  // -------------------------------------------------------------------------
  // G. 興味分野・キャリア志向
  // -------------------------------------------------------------------------
  sec(form, 'G. 興味分野・キャリア志向／Interests & Career Aspirations');

  drop(form, 'G-1-1A. 興味ある職種　第一希望／Interested Job Roles — First Priority',
       JOB_HELP, JOB_ROLES, true);
  drop(form, 'G-1-1B. 興味ある職種　第二希望／Interested Job Roles — Second Priority',
       '※第一希望と同じ番号を選ばないでください。／' +
       'Please do not select the same option as your first priority.', JOB_ROLES, true);
  drop(form, 'G-1-1C. 興味ある職種　第三希望／Interested Job Roles — Third Priority',
       '※第一・第二希望と同じ番号を選ばないでください。／' +
       'Please do not select the same option as your first or second priority.', JOB_ROLES, true);

  checks(form, 'G-1-2. 希望業界／Preferred Industry',
    '※「特にこだわらない」を選ぶ場合は、他の項目を選ばないでください。／' +
    'If you select "Not specific", please do not select any other option.',
    ['自動車／Automobile',
     'ロボティクス・FA（工場自動化）／Robotics & Factory Automation',
     '製造業（機械・電子・電気）／Manufacturing (Mechanical / Electronics / Electrical)',
     '素材・鉄鋼・非鉄・化学／Materials, Steel, Non-ferrous Metals & Chemicals',
     'プラントエンジニアリング・重工業（製鉄プラント・船舶用エンジン等）／Plant Engineering & Heavy Industry',
     'エネルギー・電力（水力発電・再生可能エネルギー）／Energy & Power',
     '建設・土木／Construction & Civil Engineering',
     'ITサービス・SIer／IT Services & System Integrators',
     '通信・ネットワーク／Telecommunications & Networking',
     '医療・バイオ／Medical & Biotech',
     '金融・保険／Finance & Insurance',
     '教育・研究／Education & Research',
     'スタートアップ／Startup',
     '公共・社会インフラ／Public Sector & Social Infrastructure',
     '特にこだわらない／Not specific'], true, true);

  checks(form, 'G-1-3. 働き方の志向／Work Style Preference',
    '※「明確に決まっていない」を選ぶ場合は、他の項目を選ばないでください。／' +
    'If you select "Undecided or Still Exploring", please do not select any other option.',
    ['実装・開発中心（手を動かすことが好き）／Hands-on Development-Oriented',
     '設計・要件定義など上流工程志向／Upstream Process-Oriented',
     '課題解決・提案型（問題発見と改善志向）／Problem-Solving & Proposal-Oriented',
     '企画中心（上流設計や構想に興味がある）／Planning-Oriented',
     '研究志向（学術・基礎技術探究）／Research-Oriented',
     'ジェネラリスト（幅広い技術や業務を担当したい）／Generalist',
     '明確に決まっていない・まだ模索中／Undecided or Still Exploring'], true, true);

  checks(form, 'G-1-4. 将来的に目指したい役割／Future Career Goals & Desired Roles',
    '※「専門職スペシャリスト」を選んだ場合は、分野名を「その他」欄に記入してください。／' +
    'If you select "Specialist", please enter the specific field in the "Other" box.',
    ['プロジェクトマネージャー（PM）／Project Manager',
     'システムアーキテクト／System Architect',
     'AIスペシャリスト／AI Specialist',
     'データサイエンティスト／Data Scientist',
     'ソフトウェアエンジニア／Software Engineer',
     'フォワードデプロイドエンジニア（FDE）／Forward Deployed Engineer',
     'モダナイゼーション・システム移行の専門家／Modernization & Migration Specialist',
     '業務改善・DX推進（現場の課題をITで解決する）／Business Process Improvement & DX',
     '設計エンジニア（機械・電気・土木）／Design Engineer (Mechanical / Electrical / Civil)',
     'CAE・シミュレーションエンジニア／CAE & Simulation Engineer',
     '生産技術・製造マネジメント／Manufacturing Engineering & Production Management',
     '品質・信頼性エンジニア／Quality & Reliability Engineer',
     'エンジニアリングマネージャー／Engineering Manager',
     '技術コンサルタント／Technical Consultant',
     '研究職（R&D）／Researcher',
     '専門職スペシャリスト（分野名を「その他」欄に記入）／Specialist (specify the field)',
     'スタートアップ創業・起業／Startup Founder or Entrepreneur',
     '日本の技術資格の取得を目指す（技術士・施工管理技士・電気主任技術者など）／Japanese Professional Certifications',
     '特になし（未定）／None (Undecided)'], true, true);

  checks(form, 'G-1-5. 働く上での価値観／Work Values',
    '※「雇用の安定性」「ワークライフバランス」「報酬・昇給」は別々の価値観です。' +
    '当てはまるものをすべて選んでください。／' +
    'Job security, work-life balance, and compensation are three distinct values. ' +
    'Please select all that apply.',
    ['チームで働きたい・チームワークを大切にしたい／I want to work in a team',
     '社会課題に貢献できる仕事がしたい／I want to work on solving social issues',
     '自分の成長を重視したい／I value personal growth',
     '新しい技術に挑戦したい／I want to challenge new technologies',
     '雇用の安定性を重視したい／I value job security',
     'ワークライフバランスを重視したい（残業の少なさ・休暇の取りやすさ）／I value work-life balance',
     '報酬・昇給を重視したい／I value compensation and salary growth',
     '技術力を磨き続けたい／I want to continuously improve my technical skills',
     '異文化環境の中で成長したい／I want to grow in a multicultural environment'], true, true);

  para(form, 'G-1-6. 該当する職種がなかった場合の希望／If None of the Job Roles Match',
    'G-1-1の職種一覧に、あなたの専門や希望に合うものがなかった場合、' +
    '希望する職種・業務内容を自由に記入してください。特になければ「なし」と記入してください。\n' +
    'If none of the job roles listed in G-1-1 match your background or aspirations, please ' +
    'describe the role or work you would like in your own words. If there is nothing to add, ' +
    'write "None".', true);

  grid(form, 'G-1-7. 専攻外分野への配属許容度／Openness to Assignments Outside Your Major',
    '日本企業では、専攻と完全には一致しない分野に配属されることがあります。' +
    '以下のそれぞれについて、どの程度受け入れられますか。\n' +
    'In Japanese companies, you may be assigned to a field that does not exactly match your ' +
    'major. Please indicate how acceptable each of the following would be.',
    ['機械専攻 → 土木・インフラ設計（BIM・CIM・3DCAD）／Mechanical → Civil & infrastructure design',
     '材料専攻 → 生産技術・品質保証／Materials → Manufacturing engineering & QA',
     '情報系以外 → ソフトウェア開発／Non-IT → Software development',
     '情報系 → 制御・組込みソフト開発／IT → Control & embedded software'],
    GRID_COLS, true);

  grid(form, 'G-1-8. 勤務スタイルの受容度／Acceptable Working Styles', null,
    ['工場・製造現場での勤務／Working at a factory or production site',
     '顧客先での据付・現地試運転立会い（国内出張を伴う）／On-site installation and commissioning',
     '客先常駐／Long-term assignment at a client site'],
    GRID_COLS, true);

  grid(form,
    'G-1-9. 日本企業に多い業務課題への対応／' +
    'Willingness to Take On Common Challenges in Japanese Companies',
    '日本企業の実務では、以下のような業務が大きな割合を占めます。それぞれについて、' +
    'どの程度取り組みたいと思いますか。正直にお答えください。\n' +
    'The following types of work account for a large share of day-to-day engineering in ' +
    'Japanese companies. Please indicate honestly how willing you would be to take each on.',
    ['紙・PDF・Excel帳票などの非構造化データを整理・構造化する業務／Structuring unstructured data',
     '日本語の仕様書・図面・マニュアルを読み解く業務／Reading Japanese specs, drawings and manuals',
     'レガシーシステム（古い言語・古い設備）の保守・改修／Maintaining and updating legacy systems',
     '仕様が固まっていない状態で、関係者と調整しながら進める業務／Working from incomplete specifications',
     '手作業で行われている業務プロセスの自動化／Automating manual business processes'],
    CHALLENGE_COLS, true);

  // -------------------------------------------------------------------------
  // H. リーダーシップ・課外活動
  // -------------------------------------------------------------------------
  sec(form, 'H. リーダーシップ・課外活動・研究業績／' +
      'Leadership, Extracurriculars & Research Output');
  para(form, 'H-1-1. 学生団体・プロジェクトリーダー・イベント運営等／' +
       'Student Groups, Project Leadership & Event Management', null, false);
  para(form, 'H-1-2. 発表・受賞・チームマネジメント経験など／' +
       'Presentations, Awards & Team Management Experience（任意／optional）', null, false);

  radio(form, 'H-2-1. 論文・学会発表の有無／Publications & Conference Presentations', null,
    ['査読付き国際誌に掲載済み／Published in a peer-reviewed international journal',
     '査読付き国際会議で発表済み／Presented at a peer-reviewed international conference',
     '国内（インド）の学会・研究会で発表済み／Presented at a domestic (Indian) conference',
     '投稿済み・査読中／Submitted, currently under review',
     '執筆中・投稿予定／In preparation or planned for submission',
     'なし／None'], true, false);
  para(form, 'H-2-2. 論文・発表の詳細／Details of Your Publications',
    'H-2-1で「なし」以外を選んだ方は、以下を1件ずつ記入してください。複数ある場合は改行して' +
    'ください。／If you selected anything other than "None", please provide the following for ' +
    'each publication:\n' +
    '・著者名と著者順（第一著者かどうか）／Authors and your position in the author list\n' +
    '・タイトル／Title\n' +
    '・掲載誌名・会議名／Journal or conference name\n' +
    '・年／Year\n' +
    '・DOI または URL／DOI or URL\n' +
    '・査読の有無／Peer-reviewed or not\n' +
    '・あなたが担当した部分／Your specific contribution\n\n' +
    '記入例／Example： Debnath, P. (first author), Sharma, R. — "Microstructural evolution in ' +
    'novel maraging steels during heat treatment," Materials Science and Engineering A, 2025, ' +
    'DOI: 10.xxxx/xxxxx, peer-reviewed. Contribution: designed the heat-treatment experiments, ' +
    'performed SEM/XRD analysis, and wrote the first draft.', false);
  para(form, 'H-2-3. 修士論文・卒業論文のテーマ／Master\u2019s or Bachelor\u2019s Thesis Topic',
    '※テーマ名と、研究内容を3〜4行で説明してください。／Please give the title and a ' +
    'three-to-four-line description of the research.', true);
  txt(form, 'H-2-4. 指導教員名・研究室名／Supervisor & Laboratory', null, false);
  radio(form, 'H-2-5. 特許の出願・取得／Patents', null,
    ['取得済み／Granted', '出願済み・審査中／Filed, under examination',
     '出願準備中／Preparing to file', 'なし／None'], true, false);
  para(form, 'H-2-6. 特許の詳細／Details of Your Patents',
    '※H-2-5で「なし」以外を選んだ方は、出願番号・タイトル・共同発明者・あなたの貢献を' +
    '記入してください。／If you selected anything other than "None", please give the ' +
    'application number, title, co-inventors, and your contribution.', false);

  // -------------------------------------------------------------------------
  // I. 日本企業への関心
  // -------------------------------------------------------------------------
  sec(form, 'I. 日本企業への関心／Interest in Japanese Companies');
  para(form, 'I-1-1. 日本企業に興味を持った理由／' +
       'Why are you interested in working for a Japanese company?', null, true);
  checks(form, 'I-1-2. 学びたい点／What aspects do you want to learn?', null,
    ['品質意識の高さ／Strong sense of quality',
     '技術力の蓄積／Accumulated technical expertise',
     '労働文化や組織運営／Work culture & organizational management',
     '現場改善や生産性／On-site improvement & productivity',
     'ものづくりの現場（製造・据付・試運転）／Manufacturing sites'], true, true);
  checks(form, 'I-1-3. 日本企業でやってみたい仕事／Jobs You Want to Try at a Japanese Company',
    null,
    ['ソフトウェア開発（アプリ・業務システムなど）／Software Development',
     '組込み系・ロボティクス開発／Embedded Systems & Robotics Development',
     'データ分析・AIモデル開発／Data Analysis & AI Model Development',
     'CAD設計（機械・電気）／CAD Design (Mechanical / Electrical)',
     '土木・インフラ設計（BIM・CIM）／Civil & Infrastructure Design',
     '材料開発・材料評価／Materials Development & Characterization',
     '制御盤設計・PLCプログラミング／Control Panel Design & PLC Programming',
     '生産技術・製造プロセス改善／Manufacturing Engineering & Process Improvement',
     '品質管理（QA）／Quality Assurance',
     '営業支援・技術営業／Sales Support & Technical Sales',
     'フィールドエンジニア（現場対応）／Field Engineer (On-site Support)',
     '研究開発／Research & Development'], true, true);

  // -------------------------------------------------------------------------
  // J. その他
  // -------------------------------------------------------------------------
  sec(form, 'J. その他／Other');
  para(form, 'J-1-1. 備考・補足（特記事項や伝えたいこと）／Additional Notes or Comments',
       null, false);
  txt(form, 'J-1-2. GitHub・ポートフォリオリンク／GitHub or Portfolio Link (if any)',
      '※ない場合は空欄で構いません。／Leave blank if you do not have one.', false);
  txt(form, 'J-1-3. 趣味、興味あること／What are your hobbies or interests?', null, true);

  Logger.log('編集用URL／Edit URL: ' + form.getEditUrl());
  Logger.log('回答用URL／Response URL: ' + form.getPublishedUrl());
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
