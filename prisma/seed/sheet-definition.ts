/**
 * Initial skill-sheet definition — spec chapter 6.
 *
 * IMPORTANT: this file is SEED DATA ONLY. It writes the first version of the
 * section and field definition tables. After seeding, everything here is edited
 * from the admin screen (/admin/fields), not from code. When next year's form
 * changes, an operator adds or edits rows — the application is not touched.
 *
 * `x` inside a source code (E-x-6) is a placeholder resolved per record using
 * SheetRecord.sourcePrefix, so "E-1" and "E-2" feed the same field definition.
 */

export type SectionSeed = {
  code: string;
  nameJa: string;
  nameEn: string;
  order: number;
  kind: 'SINGLE' | 'REPEATING';
  recordKind?: 'EDUCATION' | 'INTERNSHIP' | 'PROJECT' | 'WORK_EXPERIENCE';
  /**
   * Which printed document the section belongs to. 配属検討用の情報 and the
   * sales notes go on the supplementary document only — Sano-san asked for them
   * to be taken off the skill sheet entirely.
   */
  document?: 'SKILL_SHEET' | 'SUPPLEMENT';
  isVisible?: boolean;
  hideWhenEmpty?: boolean;
  maxDisplayed?: number;
  description?: string;
  fields: FieldSeed[];
};

export type FieldSeed = {
  code: string;
  nameJa: string;
  nameEn: string;
  order: number;
  sources?: string[];
  processing:
    | 'COPY'
    | 'GLOSSARY'
    | 'ENRICH'
    | 'TRANSLATE'
    | 'GENERATE'
    | 'RULE_BASED'
    | 'MANUAL';
  editing?: 'MANUAL_ONLY' | 'PROMPT_AND_MANUAL';
  valueType?: 'STRING' | 'TEXT' | 'STRING_LIST' | 'GRID' | 'NUMBER' | 'DATE';
  includeInPdf?: boolean;
  displayToggle?: boolean;
  isRequired?: boolean;
  generationPrompt?: string;
  targetLengthMin?: number;
  targetLengthMax?: number;
  glossaryCategory?:
    | 'UNIVERSITY'
    | 'MAJOR'
    | 'DEGREE'
    | 'STATE'
    | 'TECH_TERM'
    | 'HIGH_SCHOOL'
    | 'OTHER';
  ruleKey?: string;
  helpText?: string;
};

/** Shared preamble for every AI-generated field (spec ch.8 and ch.9). */
export const BASE_STYLE_PROMPT = `あなたはインド工科大学出身の技術者のスキルシートを作成する担当者である。
英文の回答を日本語に書き直す。読み手は技術の専門家とは限らないため、専門家以外にも伝わる表現にする。

必ず守ること:
- 常体（だ・である調）で書く。敬体（です・ます調）は使用しない。
- 回答に書かれていない内容を推測で補わない。
- ツール名・企業名・固有名詞・本文中の数値は削除しない。数値は必ず本文に残す。
- 初出の専門用語には短い補足を括弧書きで添える（補足文が指定されている場合はその文言を使用する）。
- 略語は初出時に正式名称を併記する。
- 大学の課題なのか企業での実務なのかが分かるように書く。
- 英文特有の前置きや修辞は削り、事実を先に書く。
- 句読点は全角の「、」「。」、数字と英字は半角、日本語と英数字の間に空白を入れない。
- 「堪能」「流暢」のような根拠の曖昧な評価語は使用しない。
- 回答が空欄または「なし／None」の場合は、何も生成せず空文字を返す。`;

export const SECTIONS: SectionSeed[] = [
  // =========================================================================
  // 6.1 個人情報
  // =========================================================================
  {
    code: 'personal',
    nameJa: '個人情報',
    nameEn: 'Personal Information',
    order: 10,
    kind: 'SINGLE',
    fields: [
      {
        code: 'employee_number',
        nameJa: '社員番号',
        nameEn: 'Employee number',
        order: 10,
        processing: 'MANUAL',
        helpText: '社員マスタから取得。フォームには存在しない項目。',
      },
      {
        code: 'full_name',
        nameJa: '氏名',
        nameEn: 'Name',
        order: 20,
        sources: ['A-1-2', 'A-1-1'],
        processing: 'ENRICH',
        ruleKey: 'full_name_combined',
        isRequired: true,
        helpText:
          'カタカナと英語を併記する。カタカナは中黒「・」で区切る。表示形式：ソメシュヴァリ・ヴラージ／Someshvari Vrai',
      },
      {
        code: 'age',
        nameJa: '年齢',
        nameEn: 'Age',
        order: 40,
        sources: ['A-1-4'],
        processing: 'RULE_BASED',
        ruleKey: 'age_from_dob',
        helpText: '生年月日から算出する。生年月日そのものはPDFに出力しない（仕様書13章）。',
      },
      {
        // Added on Sano-san's instruction (reply to A-2): show as answered.
        code: 'gender',
        nameJa: '性別',
        nameEn: 'Gender',
        order: 45,
        sources: ['A-1-3'],
        processing: 'COPY',
        helpText: '回答された内容をそのまま表示する。',
      },
      {
        code: 'hometown',
        nameJa: '出身地',
        nameEn: 'Hometown',
        order: 30,
        sources: ['A-1-6'],
        processing: 'ENRICH',
        ruleKey: 'hometown_with_region',
        glossaryCategory: 'STATE',
        helpText:
          '都市名・州名・地域区分を組み合わせて表示する。例：パラディップ・オディシャ州（東インド）。地域区分は辞書の対応表から機械的に決定し、AIには判定させない。',
      },
      {
        // Moved here from the その他 section on Sano-san's instruction, placed
        // directly above 現在の居住地.
        code: 'oth_hobbies',
        nameJa: '趣味',
        nameEn: 'Hobbies',
        order: 65,
        sources: ['J-1-3'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt:
          '体言止めで書く。例：Reading books→読書、Listening to music→音楽鑑賞、Going for walks→散歩。適切な熟語がない場合は可能な限り体言止めに近い表現にする。複数ある場合は全角の読点「、」で区切る。',
        targetLengthMax: 60,
      },
      {
        // Added on Sano-san's instruction (reply to A-2). This asks where the
        // person will live after arriving in Japan, so it is blank for everyone
        // at the time they fill in the form and is filled in later by hand.
        code: 'current_location',
        nameJa: '現在の居住地',
        nameEn: 'Current location',
        order: 70,
        sources: ['A-1-5'],
        processing: 'COPY',
        helpText:
          '来日後の居住地を想定した項目である。回答時点では全員空欄になるため、確定後に手入力する。',
      },
      {
        code: 'languages_spoken',
        nameJa: '対応言語',
        nameEn: 'Languages spoken',
        order: 50,
        sources: ['C-1-1', 'C-1-4', 'C-1-5', 'C-1-6'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt:
          '母語・英語・日本語・その他の順に、対応可能な言語を列挙する。日本語については、C-1-1の取得レベルを括弧書きで添える。例：英語、ヒンディー語、日本語（N3）。日本語以外の言語にはレベルを付けない。',
        targetLengthMax: 60,
      },
      {
        code: 'dietary',
        nameJa: '食事に関する情報',
        nameEn: 'Dietary information',
        order: 60,
        sources: ['A-1-7', 'A-1-8'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        displayToggle: true,
        generationPrompt:
          '食事の区分と具体的な可否を1つの欄にまとめる。受入企業が社員食堂や会食を手配するための情報である。例：ベジタリアン（卵・牛乳は可。牛・豚・鶏は不可）／ノンベジタリアン（牛のみ不可）',
        targetLengthMax: 80,
      },
      {
        code: 'photo',
        nameJa: 'プロフィール写真',
        nameEn: 'Profile photo',
        // First in 個人情報: on the editing screen the photo uploader appears
        // where this field is, and the printed sheet puts the photo at the top
        // beside the name (Sano-san's review, 2026-09-23 item 7).
        order: 5,
        processing: 'MANUAL',
        helpText: 'アプリ画面からアップロードする。差し替え可能。',
      },
    ],
  },

  // =========================================================================
  // 6.2 志向
  // =========================================================================
  {
    code: 'aspirations',
    nameJa: '志向',
    nameEn: 'Career Aspirations',
    order: 20,
    kind: 'SINGLE',
    fields: [
      {
        code: 'desired_industry',
        nameJa: '希望業界',
        nameEn: 'Desired industry',
        order: 10,
        sources: ['G-1-2'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      // Sano-san's reply to A-1: list G-1-1A〜C as first, second and third
      // choice, in that order, rather than merging them into one line — the
      // ranking is information the merged list threw away.
      {
        code: 'desired_job_type_1',
        nameJa: '希望職種（第1希望）',
        nameEn: 'Desired job type (1st choice)',
        order: 20,
        sources: ['G-1-1A'],
        processing: 'COPY',
      },
      {
        code: 'desired_job_type_2',
        nameJa: '希望職種（第2希望）',
        nameEn: 'Desired job type (2nd choice)',
        order: 21,
        sources: ['G-1-1B'],
        processing: 'COPY',
      },
      {
        code: 'desired_job_type_3',
        nameJa: '希望職種（第3希望）',
        nameEn: 'Desired job type (3rd choice)',
        order: 22,
        sources: ['G-1-1C'],
        processing: 'COPY',
      },
      {
        code: 'target_role',
        nameJa: '目指す役割',
        nameEn: 'Target role',
        order: 30,
        sources: ['G-1-4'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'work_style',
        nameJa: 'ワークスタイル',
        nameEn: 'Work style',
        order: 40,
        sources: ['G-1-3'],
        // Sano-san's reply to A-1 asks for G-1-2, G-1-3 and G-1-4 to be shown
        // as answered, so the selected options are copied rather than rewritten
        // into prose by the AI.
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
    ],
  },

  // =========================================================================
  // 6.3 学歴（繰り返し）
  // =========================================================================
  {
    code: 'education',
    nameJa: '学歴',
    nameEn: 'Education',
    order: 30,
    kind: 'REPEATING',
    recordKind: 'EDUCATION',
    maxDisplayed: 4,
    description:
      '修士・学士・高校を別の行として保持する。回答者が在籍期間を誤って記入している例があるため、画面から修正できること。',
    fields: [
      {
        code: 'edu_years',
        nameJa: '年',
        nameEn: 'Years',
        order: 10,
        sources: ['B-1-5', 'B-2-5', 'B-3-4'],
        processing: 'COPY',
        helpText: '例：2023年07月 – 2025年07月',
      },
      {
        code: 'edu_institution',
        nameJa: '大学名',
        nameEn: 'Institution',
        order: 20,
        sources: ['B-1-4', 'B-2-4', 'B-3-3'],
        processing: 'GLOSSARY',
        glossaryCategory: 'UNIVERSITY',
        helpText:
          '選択式の8校は選択肢の日本語をそのまま転記する。「その他」欄の自由記述のみ辞書で変換する。',
      },
      {
        // Added on Sano-san's instruction (reply to A-2): show the academic
        // score to the right of the school name. The three sources are the
        // score question for each education row (master's / bachelor's / other);
        // the pipeline picks whichever belongs to the row being printed.
        code: 'edu_score',
        nameJa: '成績',
        nameEn: 'Academic score',
        order: 25,
        sources: ['B-1-6', 'B-2-6', 'B-3-5'],
        processing: 'COPY',
        helpText:
          'CGPAまたはPercentageを回答どおり表示する。日本のGPAとは尺度が異なるため、換算はしない。',
      },
      {
        code: 'edu_major',
        nameJa: '専攻名',
        nameEn: 'Major',
        order: 30,
        sources: ['B-1-3', 'B-2-3', 'B-3-2'],
        processing: 'GLOSSARY',
        glossaryCategory: 'MAJOR',
        helpText: '自由記述のため辞書が必須。',
      },
      {
        code: 'edu_degree',
        nameJa: '学位',
        nameEn: 'Degree',
        order: 40,
        sources: ['B-1-1', 'B-1-2(B)', 'B-1-2(M)', 'B-3-1'],
        processing: 'COPY',
        glossaryCategory: 'DEGREE',
        helpText:
          '修士は B-1-2(M)、学士は B-1-2(B)、高校は B-3-1 から取得する。「その他」欄の自由記述のみ辞書で変換する。',
      },
    ],
  },

  // =========================================================================
  // 6.4 技術スキル
  // =========================================================================
  {
    code: 'skills',
    nameJa: '技術スキル',
    nameEn: 'Technical Skills',
    order: 40,
    kind: 'SINGLE',
    description:
      '採用者には機械系・材料系が含まれるため、CAD・CAE・電気制御・材料分析の欄が必要。該当項目がすべて「使用経験なし」の場合、その欄は非表示にする。',
    fields: [
      {
        code: 'skill_programming',
        nameJa: 'プログラミング言語',
        nameEn: 'Programming languages',
        order: 10,
        sources: ['D-1-1'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_dev_tools',
        nameJa: '開発ツール',
        nameEn: 'Development tools',
        order: 20,
        sources: ['D-1-2', 'D-1-3', 'D-1-4', 'D-1-5', 'D-1-6', 'D-1-7', 'D-1-8'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_cad',
        nameJa: 'CAD・3Dモデリング',
        nameEn: 'CAD and 3D modelling',
        order: 30,
        sources: ['D-1-9'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_cae',
        nameJa: 'CAE・解析',
        nameEn: 'CAE and simulation',
        order: 40,
        sources: ['D-1-10'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_control',
        nameJa: '電気・制御・FA',
        nameEn: 'Electrical, control and FA',
        order: 50,
        sources: ['D-1-11'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_materials',
        nameJa: '材料分析',
        nameEn: 'Materials characterisation',
        order: 60,
        sources: ['D-1-12'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_drawing',
        nameJa: '製図・図面',
        nameEn: 'Engineering drawing',
        order: 70,
        sources: ['D-1-13'],
        processing: 'COPY',
        valueType: 'STRING_LIST',
      },
      {
        code: 'skill_top5',
        nameJa: '主要スキルと習熟度',
        nameEn: 'Top skills and proficiency',
        order: 80,
        sources: ['D-1-14'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '回答に挙げられたスキルと習熟度を表形式に整形する。1行につき「スキル名：習熟度」の形式とし、習熟度は回答の番号を次の日本語に置き換える。①授業で習った ②学生プロジェクトで使用 ③インターン・実務で使用 ④他人に教えられる。スキル名は辞書の日本語表記に合わせる。回答にないスキルを追加しない。',
      },
    ],
  },

  // =========================================================================
  // 6.5 インターンシップ（繰り返し）
  // =========================================================================
  {
    code: 'internships',
    nameJa: 'インターンシップ',
    nameEn: 'Internships',
    order: 50,
    kind: 'REPEATING',
    recordKind: 'INTERNSHIP',
    maxDisplayed: 3,
    description:
      '1人あたり10件程度まで登録でき、スキルシートに表示するのは最大3件。企業名と期間はAIが書き換えないこと。',
    fields: [
      {
        code: 'int_title',
        nameJa: 'タイトル',
        nameEn: 'Title',
        order: 10,
        sources: ['E-x-1'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt:
          'インターンの主題が一読で分かる日本語のタイトルにする。平易化はするが、内容を推測で補わない。括弧書きで補足を添えてよい。',
        targetLengthMax: 60,
      },
      {
        code: 'int_company',
        nameJa: '企業',
        nameEn: 'Company',
        order: 20,
        sources: ['E-x-2'],
        processing: 'COPY',
        helpText: '企業名はAI再生成の対象外。手修正のみ可能。',
      },
      {
        code: 'int_period',
        nameJa: '期間',
        nameEn: 'Period',
        order: 30,
        sources: ['E-x-3'],
        processing: 'COPY',
        helpText: '期間はAI再生成の対象外。例：2024年07月 – 2024年08月',
      },
      {
        code: 'int_technologies',
        nameJa: '使用技術',
        nameEn: 'Technologies',
        order: 40,
        sources: ['E-x-5'],
        processing: 'GLOSSARY',
        glossaryCategory: 'TECH_TERM',
        valueType: 'STRING_LIST',
      },
      {
        code: 'int_summary',
        nameJa: '概要',
        nameEn: 'Summary',
        order: 50,
        sources: ['E-x-6'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt: 'インターンの目的と対象を1〜2文で説明する。',
        targetLengthMin: 60,
        targetLengthMax: 150,
      },
      {
        code: 'int_description',
        nameJa: '具体的な内容',
        nameEn: 'Description',
        order: 60,
        sources: ['E-x-6', 'E-x-7'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '何をどの順番で行ったかが追える書き方にする。手法名や成果だけを列挙せず、本人が実際に何をしたかを書く。専門用語は使ってよいが、初出時に補足を添える。',
        targetLengthMin: 200,
        targetLengthMax: 300,
      },
      {
        code: 'int_role',
        nameJa: '果たした役割',
        nameEn: 'Role',
        order: 70,
        sources: ['E-x-8'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt: '本人が担当した範囲と責任を書く。',
        targetLengthMin: 80,
        targetLengthMax: 150,
      },
      {
        // Added on Sano-san's instruction: between 果たした役割 and 直面した課題.
        code: 'int_team_size',
        nameJa: 'チーム規模',
        nameEn: 'Team size',
        order: 75,
        sources: ['E-x-4'],
        processing: 'COPY',
      },
      {
        code: 'int_challenges',
        nameJa: '直面した課題',
        nameEn: 'Challenges',
        order: 80,
        sources: ['E-x-9'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt: '直面した課題と、それにどう対応したかを書く。',
        targetLengthMin: 100,
        targetLengthMax: 200,
      },
      {
        code: 'int_outcome',
        nameJa: '得られた成果',
        nameEn: 'Outcome',
        order: 90,
        sources: ['E-x-10'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '成果と学びを書く。回答に数値があれば必ず本文に残す。平易化や短縮を理由に数値を落とさない。',
        targetLengthMin: 100,
        targetLengthMax: 200,
      },
    ],
  },

  // =========================================================================
  // 6.6 プロジェクト（繰り返し）
  // =========================================================================
  {
    code: 'projects',
    nameJa: 'プロジェクト',
    nameEn: 'Projects',
    order: 60,
    kind: 'REPEATING',
    recordKind: 'PROJECT',
    maxDisplayed: 3,
    fields: [
      {
        code: 'prj_title',
        nameJa: 'タイトル',
        nameEn: 'Title',
        order: 10,
        sources: ['F-x-1'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt:
          'プロジェクトの主題が一読で分かる日本語のタイトルにする。内容を推測で補わない。',
        targetLengthMax: 60,
      },
      {
        code: 'prj_period',
        nameJa: '期間',
        nameEn: 'Period',
        order: 20,
        sources: ['F-x-2'],
        processing: 'COPY',
        helpText: '期間はAI再生成の対象外。',
      },
      {
        code: 'prj_technologies',
        nameJa: '使用技術',
        nameEn: 'Technologies',
        order: 30,
        sources: ['F-x-4'],
        processing: 'GLOSSARY',
        glossaryCategory: 'TECH_TERM',
        valueType: 'STRING_LIST',
      },
      {
        code: 'prj_summary',
        nameJa: '概要',
        nameEn: 'Summary',
        order: 40,
        sources: ['F-x-5'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        generationPrompt: 'プロジェクトの目的と対象を1〜2文で説明する。',
        targetLengthMin: 60,
        targetLengthMax: 150,
      },
      {
        code: 'prj_description',
        nameJa: '具体的な内容',
        nameEn: 'Description',
        order: 50,
        sources: ['F-x-5', 'F-x-6'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '何をどの順番で行ったかが追える書き方にする。大学の課題か実務かが分かるようにする。',
        targetLengthMin: 200,
        targetLengthMax: 300,
      },
      {
        code: 'prj_role',
        nameJa: '果たした役割',
        nameEn: 'Role',
        order: 60,
        sources: ['F-x-7'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt: '本人が担当した範囲と責任を書く。',
        targetLengthMin: 80,
        targetLengthMax: 150,
      },
      {
        // Added on Sano-san's instruction: between 果たした役割 and 直面した課題.
        code: 'prj_team_size',
        nameJa: 'チーム規模',
        nameEn: 'Team size',
        order: 65,
        sources: ['F-x-3'],
        processing: 'COPY',
      },
      {
        code: 'prj_challenges',
        nameJa: '直面した課題',
        nameEn: 'Challenges',
        order: 70,
        sources: ['F-x-8'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt: '直面した課題と、それにどう対応したかを書く。',
        targetLengthMin: 100,
        targetLengthMax: 200,
      },
      {
        code: 'prj_outcome',
        nameJa: '得られた成果',
        nameEn: 'Outcome',
        order: 80,
        sources: ['F-x-9'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '成果と学びを書く。回答に数値があれば必ず本文に残す。',
        targetLengthMin: 100,
        targetLengthMax: 200,
      },
    ],
  },

  // =========================================================================
  // 日本での業務経験（繰り返し）
  //
  // Added on Sano-san's instruction (reply to D-1). Unlike every other
  // repeating section this one has no form question behind it: the form is
  // filled in before joining, whereas these records are added afterwards, by
  // the engineer, as they finish work at a customer site. Every field is
  // therefore MANUAL — there is nothing to import or translate.
  // =========================================================================
  {
    code: 'work_japan',
    nameJa: '日本での業務経験',
    nameEn: 'Work Experience in Japan',
    order: 65,
    kind: 'REPEATING',
    recordKind: 'WORK_EXPERIENCE',
    maxDisplayed: 10,
    hideWhenEmpty: true,
    description:
      '入社後に本人が追加する欄。フォームには対応する設問がないため、すべて手入力である。',
    fields: [
      {
        code: 'wjp_site',
        nameJa: '就業先・現場',
        nameEn: 'Site',
        order: 10,
        processing: 'MANUAL',
        helpText: '配属先の企業名または現場名を入力する。',
      },
      {
        code: 'wjp_period',
        nameJa: '期間',
        nameEn: 'Period',
        order: 20,
        processing: 'MANUAL',
        helpText: '例：2026年4月 - 2026年9月',
      },
      {
        code: 'wjp_role',
        nameJa: '担当業務',
        nameEn: 'Role',
        order: 30,
        processing: 'MANUAL',
        valueType: 'TEXT',
      },
      {
        code: 'wjp_technologies',
        nameJa: '使用技術',
        nameEn: 'Technologies used',
        order: 40,
        processing: 'MANUAL',
      },
      {
        // Added on Sano-san's instruction, immediately after 使用技術. The same
        // question is asked of internships and projects (int_team_size /
        // prj_team_size); this is its counterpart for work done in Japan.
        code: 'wjp_team_size',
        nameJa: 'チーム規模',
        nameEn: 'Team size',
        order: 45,
        processing: 'MANUAL',
        helpText: '例：5名（うち日本人3名）',
      },
      {
        code: 'wjp_outcome',
        nameJa: '成果・学んだこと',
        nameEn: 'Outcome',
        order: 50,
        processing: 'MANUAL',
        valueType: 'TEXT',
      },
    ],
  },


  // =========================================================================
  // 6.8 日本企業について
  // =========================================================================
  {
    code: 'japanese_companies',
    nameJa: '日本企業について',
    nameEn: 'About Japanese Companies',
    order: 80,
    kind: 'SINGLE',
    fields: [
      {
        code: 'jp_interest',
        nameJa: '興味がある点',
        nameEn: 'Most interesting aspect',
        order: 10,
        sources: ['I-1-1', 'I-1-2'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '日本企業に興味を持った理由を、本人の言葉にもとづいて1つの文章にまとめる。',
        targetLengthMin: 80,
        targetLengthMax: 150,
      },
      {
        code: 'jp_learn',
        nameJa: '習得したいこと',
        nameEn: 'What they want to learn',
        order: 20,
        sources: ['I-1-2', 'I-1-3'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '学びたい点とやってみたい仕事を、1つの文章にまとめる。',
        targetLengthMin: 80,
        targetLengthMax: 150,
      },
    ],
  },

  // =========================================================================
  // 6.9 キャリアアップについて
  // =========================================================================
  {
    code: 'career_development',
    nameJa: 'キャリアアップについて',
    nameEn: 'Career Development',
    order: 90,
    kind: 'SINGLE',
    fields: [
      {
        code: 'work_values',
        nameJa: '働く上での価値観',
        nameEn: 'Work values',
        order: 10,
        sources: ['G-1-5'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          '選択された価値観を1つの文章にまとめる。選択肢を並べず、文章にする。例：チームワークを重視し、安定した環境のもとで技術力と自己成長を追求すること、そして多文化の中で互いに学び合うことを大切にしたいと考えている。',
        targetLengthMin: 80,
        targetLengthMax: 150,
      },
    ],
  },

  // =========================================================================
  // 6.10 日本語能力
  // =========================================================================
  {
    code: 'japanese_ability',
    nameJa: '日本語能力',
    nameEn: 'Japanese Language Ability',
    order: 100,
    kind: 'SINGLE',
    description:
      'スキルシートに掲載するのは取得資格と時期、およびスコアから生成した説明文の2つ。スコアそのものは掲載しない。',
    fields: [
      {
        code: 'jlpt_qualification',
        nameJa: '取得資格と時期',
        nameEn: 'Qualification and date',
        order: 10,
        sources: ['C-1-1', 'C-2-1'],
        processing: 'RULE_BASED',
        ruleKey: 'jlpt_qualification',
        helpText: '例：2025年12月にN3取得',
      },
      {
        // Added on Sano-san's instruction: immediately after 取得資格と時期.
        code: 'jp_study_history',
        nameJa: '日本語の学習歴',
        nameEn: 'Japanese study history',
        order: 15,
        sources: ['C-1-3'],
        processing: 'COPY',
      },
      {
        code: 'jlpt_description',
        nameJa: '日本語力について',
        nameEn: 'Description of ability',
        order: 20,
        sources: ['C-2-2', 'C-2-3', 'C-2-4', 'C-2-5', 'C-2-6'],
        // Sano-san's reply to B-2 corrected an earlier misreading on our side:
        // the AI *is* to be used here. What must stay mechanical is the
        // judgement — pass or fail, and which sections cleared their minimum —
        // so the rule below still runs and its findings are handed to the AI as
        // 確定事実, which the prompt forbids it from contradicting.
        processing: 'GENERATE',
        ruleKey: 'jlpt_description',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        targetLengthMin: 100,
        targetLengthMax: 200,
        generationPrompt:
          '<確定事実>に示したJLPTの区分別得点をもとに、日本語能力の説明文を書く。' +
          '言語知識・読解・聴解の3区分のうち、どこが強くどこが弱いかが文章に表れるようにする。' +
          '総合点が同じでも区分の構成が異なれば異なる文章になること。全員に同じ文章を出さない。' +
          '弱い区分については、業務のどの場面で支障が出るかを具体的に述べる。' +
          '聴解が弱い場合は、来日後の生活のなかで改善が見込まれる旨を添える。' +
          '合否および点数は確定事実のとおりに書き、独自に判定し直さない。',
        helpText:
          '合否判定は規則で機械的に確定し（仕様書10章）、その確定事実をAIに渡して文章化する。' +
          '区分ごとの得点の偏りが文章に反映される。判定そのものはAIに委ねない。',
      },
      {
        code: 'jlpt_scores',
        nameJa: '各スコア',
        nameEn: 'Individual scores',
        order: 40,
        sources: ['C-2-2', 'C-2-3', 'C-2-4', 'C-2-5', 'C-2-6'],
        processing: 'COPY',
        valueType: 'GRID',
        includeInPdf: false,
        helpText: '説明文の生成に使用する。PDFには出力しない。',
      },
    ],
  },

  // =========================================================================
  // 6.11 研究業績（該当がなければセクションごと非表示）
  // =========================================================================
  {
    code: 'research',
    nameJa: '研究業績',
    nameEn: 'Research Output',
    order: 110,
    kind: 'SINGLE',
    hideWhenEmpty: true,
    description: '該当するデータが1件もない場合はセクションごと非表示にする（初期設定）。',
    fields: [
      {
        // 有無 + 詳細 merged into one field. Sano-san's rule, which now applies
        // to every pair of this shape on the sheet: where there is something to
        // report, print the detail alone — the 有無 answer adds nothing the
        // detail does not already say; where there is nothing, print 「なし」.
        code: 'res_publications',
        nameJa: '論文・学会発表',
        nameEn: 'Publications',
        order: 10,
        sources: ['H-2-1', 'H-2-2'],
        processing: 'RULE_BASED',
        ruleKey: 'publications_combined',
        valueType: 'TEXT',
        helpText:
          '内容がある場合はH-2-2の内容のみを表示する。ない場合は「なし」と表示する。詳細は要約しない。',
      },
      {
        // H-2-3 (theme) and H-2-4 (supervisor and laboratory) merged into one
        // field on Sano-san's instruction; the separate 指導教員・研究室 field
        // is gone. The supervisor and laboratory are proper nouns, so the rule
        // below hands them to the AI as 確定事実 rather than letting it compose
        // them.
        code: 'res_thesis',
        nameJa: '修士論文・卒業論文',
        nameEn: 'Thesis',
        order: 30,
        sources: ['H-2-3', 'H-2-4'],
        processing: 'GENERATE',
        ruleKey: 'thesis_supervisor_fact',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt:
          'テーマ名と研究内容を、専門家以外にも伝わる日本語で3〜4行にまとめる。' +
          '最後に改行し、確定事実に示された指導教員・研究室の行をそのまま記載する。',
        targetLengthMin: 100,
        targetLengthMax: 220,
      },
      {
        code: 'res_patents',
        nameJa: '特許',
        nameEn: 'Patents',
        order: 50,
        sources: ['H-2-5', 'H-2-6'],
        processing: 'RULE_BASED',
        ruleKey: 'patents_combined',
        valueType: 'TEXT',
        helpText:
          '内容がある場合はH-2-6の内容のみを表示する。ない場合は「なし」と表示する。要約しないこと。',
      },
      {
        // Moved here from the その他 section on Sano-san's instruction, placed
        // directly below 特許.
        code: 'oth_github',
        nameJa: 'GitHub・ポートフォリオ',
        nameEn: 'GitHub or portfolio',
        order: 60,
        sources: ['J-1-2'],
        processing: 'COPY',
        displayToggle: true,
      },
    ],
  },

  // =========================================================================
  // 6.12 配属検討用の情報（項目ごとに表示/非表示を切り替え）
  // =========================================================================
  {
    code: 'placement',
    nameJa: '配属検討用の情報',
    nameEn: 'Information for Placement Decisions',
    // Sano-san's instruction: taken off the skill sheet and printed only on the
    // supplementary document for sales.
    document: 'SUPPLEMENT',
    order: 120,
    kind: 'SINGLE',
    description:
      '提出先によっては掲載したくない場合があるため、項目ごとにチェックボックスで表示を切り替えられること。',
    fields: [
      {
        code: 'plc_desired_role_other',
        nameJa: '該当職種がない場合の希望',
        nameEn: 'Desired role if none listed matches',
        order: 10,
        sources: ['G-1-6'],
        processing: 'TRANSLATE',
        valueType: 'TEXT',
        displayToggle: true,
      },
      {
        code: 'plc_outside_major',
        nameJa: '専攻外分野への配属許容度',
        nameEn: 'Openness to work outside their major',
        order: 20,
        sources: ['G-1-7'],
        processing: 'COPY',
        valueType: 'GRID',
        displayToggle: true,
      },
      {
        code: 'plc_working_styles',
        nameJa: '勤務スタイルの受容度',
        nameEn: 'Acceptable working styles',
        order: 30,
        sources: ['G-1-8'],
        processing: 'COPY',
        valueType: 'GRID',
        displayToggle: true,
      },
      {
        code: 'plc_common_tasks',
        nameJa: '日本企業に多い業務課題への対応',
        nameEn: 'Willingness for common tasks',
        order: 40,
        sources: ['G-1-9'],
        processing: 'COPY',
        valueType: 'GRID',
        displayToggle: true,
      },
      {
        // 備考 (J-1-1). Sano-san asked for it on the supplementary document,
        // then asked for its own heading to go: 「営業用メモ」 sat directly
        // above 「営業メモ」 and the two read as the same thing. It is one more
        // piece of information for the placement decision, so it belongs in
        // this section rather than in a heading of its own.
        code: 'sup_remarks',
        nameJa: '備考',
        nameEn: 'Remarks',
        order: 50,
        sources: ['J-1-1'],
        processing: 'TRANSLATE',
        valueType: 'TEXT',
        displayToggle: true,
        helpText: 'フォームの備考（J-1-1）。補足資料にのみ出力する。',
      },
    ],
  },

  // =========================================================================
  // Additional — questions the form collects but spec ch.6 does not place.
  // Seeded as hidden so nothing is silently dropped; an operator can switch
  // the section on if these should appear. See docs/SPEC-QUESTIONS.md Q4.
  // =========================================================================
  {
    code: 'leadership',
    nameJa: 'リーダーシップ・課外活動',
    nameEn: 'Leadership and Extracurriculars',
    order: 130,
    kind: 'SINGLE',
    // Sano-san's reply to A-2: H-1-1 and H-1-2 are needed, so this section is
    // shown. Whether an individual field prints is decided per person by its
    // display checkbox (see the note on writeFieldValue).
    isVisible: true,
    hideWhenEmpty: false,
    description: 'H-1-1・H-1-2。佐野様のご回答により掲載する。',
    fields: [
      {
        code: 'ldr_student_groups',
        nameJa: '学生団体・プロジェクトリーダー等',
        nameEn: 'Student groups and project leadership',
        order: 10,
        sources: ['H-1-1'],
        processing: 'GENERATE',
        editing: 'PROMPT_AND_MANUAL',
        valueType: 'TEXT',
        generationPrompt: '担った役割と規模が分かるように平易な日本語でまとめる。',
        targetLengthMax: 200,
      },
      {
        code: 'ldr_awards',
        nameJa: '発表・受賞・チームマネジメント経験',
        nameEn: 'Presentations, awards and team management',
        order: 20,
        sources: ['H-1-2'],
        processing: 'TRANSLATE',
        valueType: 'TEXT',
      },
    ],
  },
];
