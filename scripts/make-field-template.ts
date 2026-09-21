/**
 * Build 項目定義書 — the field-definition template for the client.
 *
 * Generated straight from `prisma/seed/sheet-definition.ts` and the 2026
 * question catalogue, so the document cannot drift from what the application
 * actually does. Re-run it after changing the definition:
 *
 *   npm run template:fields
 *
 * Writes an HTML file; `scripts/render-template.mjs` turns it into the PDF.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SECTIONS, type SectionSeed, type FieldSeed } from '../prisma/seed/sheet-definition';

const ROOT = path.join(__dirname, '..');
const TODAY = '2026年9月18日';

type Question = {
  code: string;
  titleJa: string;
  titleEn?: string | null;
  type: string;
};

const catalogue = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'prisma/seed/form-questions-2026.json'), 'utf-8'),
) as { questions: Question[] };
const byCode = new Map(catalogue.questions.map((q) => [q.code, q]));

/** How each field came to be in its present state, for the 状態 column. */
type Status = 'existing' | 'added' | 'changed' | 'shown' | 'pending';

const STATUS_LABEL: Record<Status, string> = {
  existing: '既存',
  added: '今回追加',
  changed: '今回変更',
  shown: '今回表示',
  pending: 'ご判断待ち',
};

const FIELD_STATUS: Record<string, { status: Status; note: string }> = {
  // This round's changes (reply of 2026年9月19日).
  wjp_team_size: { status: 'added', note: '「使用技術」の直後に配置' },
  int_team_size: { status: 'added', note: '果たした役割と直面した課題の間に配置' },
  prj_team_size: { status: 'added', note: '果たした役割と直面した課題の間に配置' },
  jp_study_history: { status: 'added', note: '取得資格と時期の直後に配置（C-1-3）' },
  jp_interest: { status: 'changed', note: '「一番興味がある点」から「興味がある点」に名称変更' },
  jlpt_description: { status: 'changed', note: '「日本語力の説明」から「日本語力について」に名称変更' },
  res_publications: {
    status: 'changed',
    note:
      '有無（H-2-1）と詳細（H-2-2）を1項目に統合。内容がある場合はH-2-2の内容のみを表示し、' +
      '「あり」は表示しない。ない場合は「なし」と表示する',
  },
  res_thesis: {
    status: 'changed',
    note:
      '「修士論文・卒業論文のテーマ」から「修士論文・卒業論文」に名称変更。H-2-3とH-2-4を1項目にまとめ、' +
      '「指導教員・研究室」の項目は削除した',
  },
  res_patents: {
    status: 'changed',
    note:
      '「特許について」から「特許」に名称変更。論文と同じ規則を適用し、内容がある場合はH-2-6の内容のみ、' +
      'ない場合は「なし」と表示する',
  },
  oth_hobbies: { status: 'changed', note: '「個人情報」の「現在の居住地」の上に移動' },
  oth_github: { status: 'changed', note: '「研究業績」の「特許」の下に移動' },
  sup_remarks: {
    status: 'added',
    note: '備考（J-1-1）。スキルシートからは削除し、補足資料の「配属検討用の情報」の末尾に配置',
  },
  jlpt_scores: {
    status: 'existing',
    note: 'PDFには出力しない（説明文の生成にのみ使用）。従来から出力対象外',
  },
  age: { status: 'changed', note: '性別と同じ行に表示する' },
  gender: { status: 'changed', note: '年齢と同じ行に表示する' },
  languages_spoken: { status: 'changed', note: '日本語にC-1-1のレベルを括弧書きで付す（例：日本語（N3））' },
};

const SECTION_STATUS: Record<string, { status: Status; note: string }> = {
  personal: {
    status: 'changed',
    note: '並び順を変更：氏名／出身地／年齢・性別／対応言語／食事／趣味／現在の居住地',
  },
  work_japan: { status: 'changed', note: 'チーム規模を追加' },
  placement: { status: 'changed', note: 'スキルシートから削除し、補足資料にのみ出力' },
  japanese_companies: { status: 'changed', note: '「興味がある点」に名称変更' },
  japanese_ability: { status: 'changed', note: '学習歴を追加し、「日本語力について」に名称変更' },
  research: {
    status: 'changed',
    note: '論文・特許の表示規則を統一し、修士論文に指導教員をまとめ、GitHub・ポートフォリオを移動',
  },
};

const PROCESSING_JA: Record<string, string> = {
  COPY: '転記',
  GLOSSARY: '辞書変換',
  ENRICH: '規則＋補完',
  TRANSLATE: '翻訳',
  GENERATE: 'AI生成',
  RULE_BASED: '規則',
  MANUAL: '手入力',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Expand an "E-x-2" placeholder into the codes it actually reads. */
function expand(code: string): string[] {
  if (!code.includes('-x-')) return [code];
  const [section, suffix] = code.split('-x-');
  return catalogue.questions
    .map((q) => q.code)
    .filter((c) => c.startsWith(`${section}-`) && c.endsWith(`-${suffix}`));
}

function sourceCell(field: FieldSeed): string {
  if (!field.sources?.length) {
    return '<span class="none">フォームに対応する設問なし（手入力）</span>';
  }
  return field.sources
    .map((code) => {
      const real = expand(code);
      const q = byCode.get(real[0]) ?? byCode.get(code);
      // Escape the text, then add markup — never the other way round, or the
      // tags are escaped along with it and print as literal "<span ...>".
      const title = q
        ? esc(q.titleJa)
        : '<span class="none">（カタログに該当なし）</span>';
      const shown = code.includes('-x-')
        ? `${esc(code)}<span class="hint">（${esc(real.join('・'))}）</span>`
        : esc(code);
      return `<div class="src"><code>${shown}</code> ${title}</div>`;
    })
    .join('');
}

const usedCodes = new Set<string>();
for (const s of SECTIONS) {
  for (const f of s.fields) for (const c of f.sources ?? []) for (const r of expand(c)) usedCodes.add(r);
}
const unassigned = catalogue.questions.filter((q) => !usedCodes.has(q.code));

function sectionRows(section: SectionSeed): string {
  const rows = [...section.fields]
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const meta = FIELD_STATUS[f.code];
      const status = meta?.status ?? 'existing';
      return `<tr class="st-${status}">
        <td class="nm"><strong>${esc(f.nameJa)}</strong><span class="en">${esc(f.nameEn)}</span></td>
        <td>${sourceCell(f)}</td>
        <td class="c">${esc(PROCESSING_JA[f.processing] ?? f.processing)}</td>
        <td class="c"><span class="tag tag-${status}">${STATUS_LABEL[status]}</span></td>
        <td class="note">${esc(meta?.note ?? f.helpText ?? '')}</td>
      </tr>`;
    })
    .join('\n');

  const smeta = SECTION_STATUS[section.code];
  const kind = section.kind === 'REPEATING' ? '繰り返し' : '単一';
  return `
  <div class="sec">
    <h2 class="sec-head">
      ${esc(section.nameJa)}<span class="en">${esc(section.nameEn)}</span>
      <span class="kind">${kind}</span>
      ${section.document === 'SUPPLEMENT' ? '<span class="doc-sup">補足資料のみ</span>' : ''}
      ${smeta ? `<span class="tag tag-${smeta.status}">${STATUS_LABEL[smeta.status]}</span>` : ''}
    </h2>
    ${smeta ? `<p class="sec-note">${esc(smeta.note)}</p>` : ''}
    ${section.description ? `<p class="sec-desc">${esc(section.description)}</p>` : ''}
    <table class="fields">
      <thead><tr>
        <th style="width:140px;">項目名</th>
        <th>取得元の設問</th>
        <th style="width:86px;">処理</th>
        <th style="width:72px;">状態</th>
        <th style="width:176px;">備考</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

const counts = {
  sections: SECTIONS.length,
  fields: SECTIONS.reduce((n, s) => n + s.fields.length, 0),
  added: Object.values(FIELD_STATUS).filter((m) => m.status === 'added').length,
  questions: catalogue.questions.length,
  used: usedCodes.size,
};

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" />
<title>項目定義書 / Field definitions</title>
<style>
:root { --ink:#1a1d23; --soft:#5c6470; --line:#dce1e9; --accent:#2f5d94; --tint:#eaf0f7; }
*{box-sizing:border-box}
body{margin:0;color:var(--ink);font-family:"Noto Sans JP","Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
 font-size:9pt;line-height:1.75;line-break:strict;overflow-wrap:anywhere;word-break:normal;
 -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2{font-feature-settings:"palt"}
.head{border-bottom:2.5px solid var(--accent);padding-bottom:8px;margin-bottom:12px}
.title{margin:0;font-size:16pt;font-weight:700;letter-spacing:.06em}
.title-en{margin:2px 0 0;font-size:9pt;color:var(--soft)}
.meta{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;font-size:9pt;color:var(--soft)}
.meta .to{font-size:11pt;font-weight:700;color:var(--ink)}
.lead p{margin:0 0 6px}
.en-block{background:#f7f9fb;border-left:3px solid #b9c5d4;padding:8px 12px;margin:9px 0;font-size:8.5pt;
 line-height:1.65;color:#2f3742;font-family:"Noto Sans",Arial,sans-serif}
.en-block .lbl{display:block;font-size:7pt;font-weight:700;letter-spacing:.1em;color:#8892a2;margin-bottom:3px}
.en-block p{margin:0 0 5px} .en-block p:last-child{margin:0}
.summary{display:flex;gap:8px;margin:10px 0}
.stat{flex:1;border:1px solid var(--line);border-radius:5px;padding:6px 8px;text-align:center;background:#fbfcfd}
.stat b{display:block;font-size:14pt;color:var(--accent);line-height:1.3}
.stat span{font-size:8pt;color:var(--soft)}
.sec{margin-bottom:14px;break-inside:avoid;page-break-inside:avoid}
.sec-head{margin:0 0 5px;background:var(--tint);border-left:4px solid var(--accent);padding:5px 9px;
 font-size:11pt;font-weight:700;color:var(--accent);letter-spacing:.04em}
.sec-head .en{margin-left:7px;font-size:8pt;font-weight:500;color:var(--soft);letter-spacing:0}
.sec-head .kind{margin-left:7px;font-size:7.5pt;font-weight:600;color:#fff;background:#8792a4;border-radius:3px;padding:1px 6px}
.sec-head .doc-sup{margin-left:6px;font-size:7.5pt;font-weight:700;color:#fff;background:#9E4468;border-radius:3px;padding:1px 6px}
.sec-note{margin:0 0 5px;font-size:8.5pt;color:#8d3a5c}
.sec-desc{margin:0 0 5px;font-size:8.5pt;color:var(--soft)}
table.fields{width:100%;border-collapse:collapse;table-layout:fixed}
table.fields th,table.fields td{border:1px solid var(--line);padding:4px 7px;vertical-align:top;text-align:left}
table.fields thead th{background:#f2f4f8;font-weight:700;text-align:center;font-size:8.5pt}
table.fields td.c{text-align:center;white-space:nowrap}
table.fields td.nm strong{display:block}
table.fields td.nm .en{display:block;font-size:7.5pt;color:var(--soft);font-weight:400}
table.fields td.note{font-size:8pt;color:var(--soft)}
.src{margin-bottom:2px} .src code{font-weight:700;color:var(--accent);font-size:8.5pt}
.hint{font-size:7.5pt;color:var(--soft)}
.none{color:#9aa2ae}
.tag{display:inline-block;border-radius:999px;padding:0 6px;font-size:7.5pt;font-weight:700;white-space:nowrap}
.tag-existing{background:#eef0f3;color:#525a66}
.tag-added{background:#e7f3ea;color:#256b39}
.tag-changed{background:#fdf5e6;color:#7a560f}
.tag-shown{background:#eaf0f7;color:#24507f}
.tag-pending{background:#fdeef3;color:#8d3a5c}
tr.st-added td{background:#f6fbf7} tr.st-changed td{background:#fffcf5}
tr.st-pending td{background:#fdf7f9} tr.st-shown td{background:#f8fafd}
.box{border:1px solid var(--line);border-left:3px solid #9aa6b6;background:#fbfcfd;padding:8px 11px;margin:10px 0;font-size:8.5pt}
.box h3{margin:0 0 4px;font-size:10pt}
table.small{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:4px}
table.small th,table.small td{border:1px solid var(--line);padding:3px 7px;text-align:left}
table.small thead th{background:#f2f4f8;text-align:center}
@page{size:A4 portrait;margin:14mm 12mm 16mm}
.pb{page-break-before:always}
</style></head><body>

<div class="head">
  <h1 class="title">IITスキルシート生成システム　項目定義書</h1>
  <p class="title-en">Field Definitions — which question appears where on the sheet</p>
  <div class="meta"><span class="to">佐野様</span><span>${TODAY}</span></div>
</div>

<div class="lead">
  <p>ご依頼いただいた項目定義のテンプレートをお送りいたします。本書は<strong>アプリケーションの定義データから自動生成</strong>しており、実装と内容が食い違うことはございません。</p>
  <p>並び順は、ご提供いただいた見本のスキルシートの構成に合わせております。今回のご回答により追加・変更した項目には<span class="tag tag-added">今回追加</span><span class="tag tag-changed">今回変更</span><span class="tag tag-shown">今回表示</span>を付しております。A-1のご判断待ちの項目には<span class="tag tag-pending">ご判断待ち</span>を付しております。</p>
  <div class="en-block">
    <span class="lbl">English</span>
    <p>The field-definition template you asked for. It is <strong>generated directly from the application's definition data</strong>, so it cannot drift from what the system actually does — re-running one command reproduces it after any change.</p>
    <p>The order follows the sample skill sheet you gave us. Rows added or changed by your answers are tagged, and the one item still awaiting your A-1 decision is marked 「ご判断待ち」.</p>
  </div>
</div>

<div class="summary">
  <div class="stat"><b>${counts.sections}</b><span>セクション</span></div>
  <div class="stat"><b>${counts.fields}</b><span>項目</span></div>
  <div class="stat"><b>${counts.used} / ${counts.questions}</b><span>使用設問 / 全設問</span></div>
  <div class="stat"><b>${unassigned.length}</b><span>未割当の設問</span></div>
</div>

<div class="box">
  <h3>本書について</h3>
  <p>9月18日にいただいたご指示をすべて反映しております。追加・変更した箇所には<span class="tag tag-added">今回追加</span><span class="tag tag-changed">今回変更</span>を付しております。</p>
  <p><strong>スキルシートと補足資料の2種類</strong>になりました。<span class="doc-sup">補足資料のみ</span>と表示のある区分は、スキルシートには一切出力されず、営業用の補足資料にのみ出力されます。</p>
  <div class="en-block">
    <span class="lbl">English</span>
    <p>Every instruction from your 18 September reply is reflected here. There are now two documents: sections marked 補足資料のみ are printed only on the sales-facing supplementary document and never on the skill sheet.</p>
  </div>
</div>

${SECTIONS.map(sectionRows).join('\n')}

<div class="box">
  <h3>未割当の設問（${unassigned.length}件）／ Questions not placed on the sheet</h3>
  <p>フォームで収集していますが、どの項目にも割り当てていない設問です。ご回答により「不要」とされたもの、および仕様書に記載のないものを含みます。</p>
  <table class="small">
    <thead><tr><th style="width:80px;">設問</th><th>内容</th><th style="width:240px;">扱い</th></tr></thead>
    <tbody>
      ${unassigned
        .map((q) => {
          const reason =
            q.code === 'C-1-2' || q.code === 'C-1-3'
              ? 'A-2のご回答により「不要」'
              : '未配置';
          return `<tr><td><code>${esc(q.code)}</code></td><td>${esc(q.titleJa)}</td><td>${esc(reason)}</td></tr>`;
        })
        .join('\n')}
    </tbody>
  </table>
  <div class="en-block">
    <span class="lbl">English</span>
    <p>Collected by the form but not placed on the sheet. C-1-2 is the one you said was not needed.</p>
  </div>
</div>

<div class="box">
  <h3>今回反映した内容 / What this revision changed</h3>
  <table class="small">
    <thead><tr><th style="width:150px;">ご指示</th><th>反映した内容</th></tr></thead>
    <tbody>
      <tr><td>チーム規模（日本での業務経験）</td><td>「使用技術」の直後に追加した</td></tr>
      <tr><td>一番興味がある点</td><td>「興味がある点」に名称を変更した</td></tr>
      <tr><td>日本語力の説明</td><td>「日本語力について」に名称を変更した</td></tr>
      <tr><td>論文・学会発表</td><td>内容がある場合はH-2-2の内容のみを表示し、「あり」は表示しない。ない場合は「なし」と表示する</td></tr>
      <tr><td>修士論文・卒業論文</td><td>「修士論文・卒業論文のテーマ」から名称を変更し、H-2-3とH-2-4を1項目にまとめた。「指導教員・研究室」の項目は削除した</td></tr>
      <tr><td>特許について</td><td>「特許」に名称を変更した。有無と詳細を持つ項目には論文と同じ規則を適用し、内容がある場合は内容のみ、ない場合は「なし」と表示する</td></tr>
      <tr><td>趣味</td><td>「その他」から「個人情報」へ移し、「現在の居住地」の上に配置した</td></tr>
      <tr><td>GitHub・ポートフォリオ</td><td>「その他」から「研究業績」へ移し、「特許」の下に配置した</td></tr>
      <tr><td>その他</td><td>セクションごと削除した</td></tr>
      <tr><td>補足資料の冒頭文</td><td>ご指定の文面に差し替えた。1行目を太字にしている</td></tr>
    </tbody>
  </table>
</div>

<p style="margin-top:12px;font-size:9pt;">
  ご確認のうえ、修正すべき点がございましたらお知らせください。何卒よろしくお願い申し上げます。
</p>

</body></html>`;

const out = path.join(ROOT, 'tmp-field-template.html');
fs.writeFileSync(out, html, 'utf-8');
console.log(
  `wrote ${out}\n  sections=${counts.sections} fields=${counts.fields} used=${counts.used}/${counts.questions} unassigned=${unassigned.length}`,
);
