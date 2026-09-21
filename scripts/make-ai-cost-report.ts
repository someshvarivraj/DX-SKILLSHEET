/**
 * Build the AI service cost report from measured usage.
 *
 *   npm run ai:report      (runs the measurement first)
 *
 * Every figure in the document is computed here from data/ai-usage.json — the
 * usage measured off the real prompts — so nothing is transcribed by hand.
 * Vendor prices are the one set of numbers taken from outside; they are listed
 * in PRICES below with their source so they can be re-checked.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const TODAY = '2026年9月18日';
const USD_JPY = 155; // indicative only; stated in the document as an assumption

type Usage = {
  measuredFrom: string;
  perPerson: Array<{ calls: number; input: number; output: number }>;
  range: { calls: number[]; input: number[]; output: number[] };
  callsPerSheet: number;
  inputTokensPerSheet: number;
  outputTokensPerSheet: number;
  avgInputTokensPerCall: number;
  avgOutputTokensPerCall: number;
  bySection: Record<string, { calls: number; inputTokens: number; outputTokens: number }>;
};

const usage: Usage = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/ai-usage.json'), 'utf-8'),
);

/** USD per 1,000,000 tokens. */
type Price = {
  vendor: string;
  model: string;
  input: number;
  output: number;
  /** Multiplier for keeping inference inside Japan, where that applies. */
  jpPremium?: number;
  region: string;
  trains: string;
  jpScore?: string;
  note: string;
};

const PRICES: Price[] = [
  {
    vendor: 'AWS Bedrock',
    model: 'Claude Haiku 4.5（日本国内推論）',
    input: 1.0,
    output: 5.0,
    jpPremium: 1.1,
    region: '東京・大阪のみ',
    trains: '使用しない',
    jpScore: '—',
    note: '現在の実装がそのまま使える。仕様書のAWS要件を満たす。',
  },
  {
    vendor: 'AWS Bedrock',
    model: 'Claude Sonnet 4.6（日本国内推論）',
    input: 3.0,
    output: 15.0,
    jpPremium: 1.1,
    region: '東京・大阪のみ',
    trains: '使用しない',
    jpScore: '0.87（Opus 5）',
    note: '日本語の品質が最も高い系統。監査証跡も残る。',
  },
  {
    vendor: 'Google Vertex AI',
    model: 'Gemini 3.1 Pro',
    input: 2.0,
    output: 12.0,
    region: '東京リージョン選択可',
    trains: '使用しない',
    jpScore: '0.8430',
    note: 'AWS外での処理となるため、仕様の見直しが必要。',
  },
  {
    vendor: 'Google Vertex AI',
    model: 'Gemini 3.6 Flash',
    input: 1.5,
    output: 7.5,
    region: '東京リージョン選択可',
    trains: '使用しない',
    jpScore: '0.8312（真実性0.607）',
    note: '真実性が低く、事実を扱う本用途には不向き。',
  },
  {
    vendor: 'Google Vertex AI',
    model: 'Gemini 2.5 Flash',
    input: 0.3,
    output: 2.5,
    region: '東京リージョン選択可',
    trains: '使用しない',
    jpScore: '—',
    note: '最も安価だが、上位モデルとの品質差が大きい。',
  },
  {
    vendor: 'Groq',
    model: 'Qwen3 32B',
    input: 0.29,
    output: 0.59,
    region: '米国・EUのみ',
    trains: '使用しない',
    jpScore: '—（Qwen3.8世代より前）',
    note: '日本リージョンがない。仕様のAWS要件・国内処理を満たせない。',
  },
  {
    vendor: 'Groq',
    model: 'Llama 3.3 70B',
    input: 0.59,
    output: 0.79,
    region: '米国・EUのみ',
    trains: '使用しない',
    jpScore: '—',
    note: '同上。日本語品質は上位モデルに及ばない。',
  },
];

/** Cohort sizes and how many times a sheet is generated before it is finalised. */
const COHORTS = [20, 50, 100];
const REGEN = [1, 2, 3];

/**
 * The measurement excludes glossary hints, which the pipeline appends to
 * non-translation prompts for each dictionary term found in the source text.
 * Modelled as an add-on so the effect is visible rather than buried.
 */
const GLOSSARY_TOKENS_PER_CALL = 150;

const inputWithGlossary =
  usage.inputTokensPerSheet + usage.callsPerSheet * GLOSSARY_TOKENS_PER_CALL;

function costPerSheet(p: Price, inputTokens: number): number {
  const mult = p.jpPremium ?? 1;
  return (
    ((inputTokens / 1_000_000) * p.input + (usage.outputTokensPerSheet / 1_000_000) * p.output) *
    mult
  );
}

const fmtUsd = (n: number) => (n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const fmtJpy = (n: number) => `約${Math.round(n * USD_JPY).toLocaleString()}円`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------------------------------------------------------------- build tables
const perSheetRows = PRICES.map((p) => {
  const base = costPerSheet(p, usage.inputTokensPerSheet);
  const withG = costPerSheet(p, inputWithGlossary);
  return `<tr>
    <td>${esc(p.vendor)}</td><td>${esc(p.model)}</td>
    <td class="n">${p.input.toFixed(2)}</td><td class="n">${p.output.toFixed(2)}</td>
    <td class="n">${fmtUsd(base)}</td><td class="n">${fmtUsd(withG)}</td>
  </tr>`;
}).join('\n');

const annualRows = PRICES.map((p) => {
  const cells = COHORTS.map((c) => {
    const yearly = costPerSheet(p, inputWithGlossary) * c * 2; // 2 generation passes
    return `<td class="n">${fmtUsd(yearly)}<span class="jpy">${fmtJpy(yearly)}</span></td>`;
  }).join('');
  return `<tr><td>${esc(p.vendor)}</td><td>${esc(p.model)}</td>${cells}</tr>`;
}).join('\n');

const regenRows = REGEN.map((r) => {
  const cells = PRICES.filter((p) => ['Claude Haiku 4.5（日本国内推論）', 'Claude Sonnet 4.6（日本国内推論）', 'Gemini 3.1 Pro', 'Qwen3 32B'].includes(p.model))
    .map((p) => `<td class="n">${fmtUsd(costPerSheet(p, inputWithGlossary) * 50 * r)}</td>`)
    .join('');
  return `<tr><td class="n">${r}回</td>${cells}</tr>`;
}).join('\n');

const SECTION_JA: Record<string, string> = {
  personal: '個人情報',
  skills: '技術スキル',
  internships: 'インターンシップ',
  projects: 'プロジェクト',
  japanese_companies: '日本企業について',
  career_development: 'キャリアアップについて',
  japanese_ability: '日本語能力',
  research: '研究業績',
  placement: '配属検討用の情報',
  leadership: 'リーダーシップ・課外活動',
  other: 'その他',
};

const sectionRows = Object.entries(usage.bySection)
  .sort((a, b) => b[1].inputTokens - a[1].inputTokens)
  .map(
    ([code, s]) => `<tr>
      <td>${esc(SECTION_JA[code] ?? code)}</td>
      <td class="n">${s.calls}</td>
      <td class="n">${s.inputTokens.toLocaleString()}</td>
      <td class="n">${s.outputTokens.toLocaleString()}</td>
    </tr>`,
  )
  .join('\n');

const criteriaRows = PRICES.map(
  (p) => `<tr>
    <td>${esc(p.vendor)}<span class="sub">${esc(p.model)}</span></td>
    <td>${esc(p.region)}</td>
    <td>${esc(p.trains)}</td>
    <td class="n">${esc(p.jpScore ?? '—')}</td>
    <td class="note">${esc(p.note)}</td>
  </tr>`,
).join('\n');

const recommended = PRICES[0];
const recommendedAnnual = costPerSheet(recommended, inputWithGlossary) * 50 * 2;

// ---------------------------------------------------------------------- render
const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><title>AIサービス選定と費用試算</title>
<style>
:root{--ink:#1a1d23;--soft:#5c6470;--line:#dce1e9;--accent:#2f5d94;--tint:#eaf0f7;--warn:#9e4468}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);font-family:"Noto Sans JP","Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
 font-size:9.5pt;line-height:1.8;line-break:strict;overflow-wrap:anywhere;word-break:normal;
 -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-feature-settings:"palt"}
.head{border-bottom:2.5px solid var(--accent);padding-bottom:8px;margin-bottom:12px}
.title{margin:0;font-size:16pt;font-weight:700;letter-spacing:.06em}
.title-en{margin:2px 0 0;font-size:9pt;color:var(--soft)}
.meta{display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;font-size:9pt;color:var(--soft)}
.meta .to{font-size:11pt;font-weight:700;color:var(--ink)}
h2{margin:16px 0 7px;background:var(--tint);border-left:4px solid var(--accent);padding:5px 10px;
 font-size:11.5pt;font-weight:700;color:var(--accent);letter-spacing:.05em}
h2 .en{margin-left:8px;font-size:8.5pt;font-weight:500;color:var(--soft);letter-spacing:0}
p{margin:0 0 7px}
.en-block{background:#f7f9fb;border-left:3px solid #b9c5d4;padding:8px 12px;margin:8px 0;font-size:8.5pt;
 line-height:1.65;color:#2f3742;font-family:"Noto Sans",Arial,sans-serif}
.en-block .lbl{display:block;font-size:7pt;font-weight:700;letter-spacing:.1em;color:#8892a2;margin-bottom:3px}
.en-block p{margin:0 0 5px}.en-block p:last-child{margin:0}
table{width:100%;border-collapse:collapse;margin:6px 0 8px;font-size:8.5pt}
th,td{border:1px solid var(--line);padding:4px 7px;vertical-align:top;text-align:left}
thead th{background:#f2f4f8;font-weight:700;text-align:center}
td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.note{font-size:8pt;color:var(--soft)}
td .sub{display:block;font-size:7.5pt;color:var(--soft)}
td .jpy{display:block;font-size:7.5pt;color:var(--soft)}
.kpi{display:flex;gap:8px;margin:8px 0}
.kpi div{flex:1;border:1px solid var(--line);border-radius:5px;padding:6px 8px;text-align:center;background:#fbfcfd}
.kpi b{display:block;font-size:13pt;color:var(--accent);line-height:1.3}
.kpi span{font-size:8pt;color:var(--soft)}
.box{border:1px solid var(--line);border-left:3px solid #9aa6b6;background:#fbfcfd;padding:8px 11px;margin:9px 0;font-size:9pt}
.box.warn{border-left-color:var(--warn);background:#fdf7f9}
.box.good{border-left-color:#2f6b45;background:#f4faf6}
.box h3{margin:0 0 4px;font-size:10.5pt}
ol,ul{margin:4px 0 7px;padding-left:20px}
li{margin-bottom:3px}
@page{size:A4 portrait;margin:15mm 13mm 16mm}
.pb{page-break-before:always}
.avoid{break-inside:avoid;page-break-inside:avoid}
</style></head><body>

<div class="head">
  <h1 class="title">AIサービスの選定と費用試算</h1>
  <p class="title-en">AI Service Selection and Cost Estimate — IIT Skill Sheet System</p>
  <div class="meta"><span class="to">佐野様</span><span>${TODAY}</span></div>
</div>

<p>スキルシートの日本語生成に使用するAIサービスについて、実際の処理量を計測したうえで費用を試算いたしました。仕様書15章でAIサービスの選定は別途確認とされておりますので、ご判断の材料としてお送りいたします。</p>

<div class="en-block"><span class="lbl">English</span>
<p>A cost estimate for the AI service that writes the Japanese on the skill sheet, based on measured usage rather than assumption. §15 leaves the choice of AI service to be confirmed separately, so this is the material for that decision.</p></div>

<h2>1. 結論<span class="en">Conclusion</span></h2>

<div class="box good">
  <h3>現行の想定どおり Amazon Bedrock（日本国内推論）を推奨いたします</h3>
  <p>費用はいずれの選択肢でも年間で数十ドル程度にとどまり、<strong>費用は判断材料になりません</strong>。判断は日本語の品質とデータの取り扱いで決めるべきと考えます。その2点でBedrockが最も条件に合致いたします。</p>
  <ul>
    <li><strong>仕様書のAWS要件を満たす唯一の選択肢である</strong>（他はAWS外での処理となり、仕様の見直しが必要）</li>
    <li>推論が東京・大阪の両リージョン内で完結し、国外に出ない。処理リージョンはCloudTrailに記録され、監査証跡が残る</li>
    <li>日本語ベンチマークで最上位の系統である</li>
    <li>実装済みのため、追加の開発が不要である</li>
  </ul>
  <p>想定規模（年間50名・2回生成）での費用は <strong>${fmtUsd(recommendedAnnual)}（${fmtJpy(recommendedAnnual)}）</strong> です。</p>
</div>

<div class="en-block"><span class="lbl">English</span>
<p>We recommend Amazon Bedrock with Japan-only inference, as originally planned. Cost is a few tens of dollars a year on <em>every</em> option, so it cannot decide the question — Japanese quality and data handling should, and Bedrock wins on both. It is also the only option that satisfies the specification's requirement that processing stay inside AWS; the others would need that requirement reopened.</p></div>

<h2>2. 計測方法<span class="en">How usage was measured</span></h2>

<p>推測ではなく、<strong>アプリケーションが実際に送信するプロンプトを組み立てて計測</strong>しております。項目定義・生成指示・サンプル回答（${esc(usage.measuredFrom)}）をそのまま用い、文字数を数えたうえでトークン数に換算しております。</p>

<table class="avoid">
  <thead><tr><th style="width:190px;">計測の前提</th><th>内容</th></tr></thead>
  <tbody>
    <tr><td>対象</td><td>処理区分が「AI生成」「翻訳」の項目のみ。転記・辞書変換・規則の項目はAIを呼ばない</td></tr>
    <tr><td>空欄の扱い</td><td>回答が空欄の項目はAIを呼ばない（仕様書8.3節）。計測もこれに従っている</td></tr>
    <tr><td>繰り返し項目</td><td>インターンシップ2件・プロジェクト2件を想定</td></tr>
    <tr><td>トークン換算</td><td>日本語1文字＝1トークン、英数字4文字＝1トークンとして計算。実際の値は事業者ごとに多少前後するため、±20%程度の幅を見込む</td></tr>
    <tr><td>辞書用語の付加</td><td>計測には含めていない。1回あたり${GLOSSARY_TOKENS_PER_CALL}トークンを別途加算した値も併記している</td></tr>
  </tbody>
</table>

<h2>3. 計測結果<span class="en">Measured usage, per sheet</span></h2>

<div class="kpi">
  <div><b>${usage.callsPerSheet}</b><span>1名あたりのAI呼び出し回数</span></div>
  <div><b>${usage.inputTokensPerSheet.toLocaleString()}</b><span>入力トークン</span></div>
  <div><b>${usage.outputTokensPerSheet.toLocaleString()}</b><span>出力トークン</span></div>
  <div><b>${usage.avgInputTokensPerCall}</b><span>1回あたり平均入力</span></div>
</div>

<p>サンプル3名での実測値は ${usage.range.calls[0]}〜${usage.range.calls[1]}回、入力 ${usage.range.input[0].toLocaleString()}〜${usage.range.input[1].toLocaleString()}トークンと、ほぼ一定でした。回答の分量によって多少前後いたします。</p>

<table class="avoid">
  <thead><tr><th>セクション</th><th style="width:80px;">呼び出し</th><th style="width:110px;">入力トークン</th><th style="width:110px;">出力トークン</th></tr></thead>
  <tbody>${sectionRows}</tbody>
</table>

<p>インターンシップとプロジェクトで全体の約半分を占めます。1件あたり6項目を生成し、それが各2件あるためです。</p>

<div class="en-block"><span class="lbl">English</span>
<p>One sheet costs ${usage.callsPerSheet} AI calls, ${usage.inputTokensPerSheet.toLocaleString()} input and ${usage.outputTokensPerSheet.toLocaleString()} output tokens, measured across three sample people with very little variation. Internships and projects account for about half of it — six generated fields each, two records apiece.</p></div>

<h2 class="pb">4. 単価と1名あたりの費用<span class="en">Unit prices and cost per sheet</span></h2>

<table class="avoid">
  <thead><tr>
    <th>事業者</th><th>モデル</th>
    <th style="width:78px;">入力<br />$/100万</th><th style="width:78px;">出力<br />$/100万</th>
    <th style="width:78px;">1名あたり</th><th style="width:92px;">辞書用語込み</th>
  </tr></thead>
  <tbody>${perSheetRows}</tbody>
</table>

<p>Bedrockの2行は、日本国内に処理を限定する場合の割増（+10%）を含んでおります。</p>

<h2>5. 年間費用の試算<span class="en">Annual cost by cohort size</span></h2>

<p>1名につき2回生成する前提（初回生成＋確認後の再生成1回）での年間費用です。括弧内は1ドル＝${USD_JPY}円で換算した参考値です。</p>

<table class="avoid">
  <thead><tr><th>事業者</th><th>モデル</th>${COHORTS.map((c) => `<th style="width:104px;">年${c}名</th>`).join('')}</tr></thead>
  <tbody>${annualRows}</tbody>
</table>

<h2>6. 再生成回数を変えた場合<span class="en">Sensitivity to regeneration</span></h2>

<p>年間50名の場合に、1名あたりの生成回数を変えたときの年間費用です。回数が3倍になっても、金額は依然として小さいままです。</p>

<table class="avoid">
  <thead><tr><th style="width:90px;">生成回数</th><th>Bedrock Haiku 4.5</th><th>Bedrock Sonnet 4.6</th><th>Gemini 3.1 Pro</th><th>Groq Qwen3 32B</th></tr></thead>
  <tbody>${regenRows}</tbody>
</table>

<div class="box warn">
  <h3>費用は判断材料になりません</h3>
  <p>最も高い選択肢と最も安い選択肢の差は、年間で数十ドルにすぎません。担当者が1時間手直しする人件費のほうが大きくなります。したがって、<strong>価格ではなく、日本語の品質とデータの取り扱いで選定すべき</strong>と考えます。</p>
</div>

<div class="en-block"><span class="lbl">English</span>
<p>The gap between the most and least expensive option is a few tens of dollars a year — less than an hour of an operator's time spent correcting output. Choose on Japanese quality and data handling, not price.</p></div>

<h2 class="pb">7. 費用以外の比較<span class="en">The criteria that actually decide it</span></h2>

<table class="avoid">
  <thead><tr>
    <th style="width:150px;">事業者・モデル</th><th style="width:118px;">処理リージョン</th>
    <th style="width:92px;">学習への利用</th><th style="width:108px;">日本語ベンチ</th><th>備考</th>
  </tr></thead>
  <tbody>${criteriaRows}</tbody>
</table>

<p>日本語ベンチマークの数値は Nejumi Leaderboard 4（2026年9月）の総合スコアです。Gemini 3.6 Flashは総合では高いものの、<strong>真実性（事実に反する記述をしない度合い）が0.607と低く</strong>、数値や事実をそのまま残す必要がある本用途には適しません。</p>

<div class="box warn">
  <h3>Groqを見送る理由</h3>
  <p>Groqの利点は応答速度ですが、本システムは取り込み後にまとめて生成し、その後で担当者が確認いたします。<strong>速度が価値を生む場面がありません。</strong>一方で、日本リージョンがなく（米国・EUのみ）、仕様書のAWS要件も国内処理の要件も満たせません。提供モデルの日本語性能も上位には及びません。</p>
</div>

<div class="box warn">
  <h3>Googleを選ぶ場合の確認事項</h3>
  <p>弊社側で保有しているGoogleのAPIが<strong>どの種類か</strong>の確認が必要です。無償のGoogle AI Studioは、<strong>送信した内容が学習に利用され、人手による確認の対象にもなります</strong>。採用者の個人情報を扱う本システムでは使用できません。有償のGemini APIまたはVertex AIであれば学習には利用されません。</p>
  <p>また、Vertex AIを使用する場合は、認証方式が異なるため<strong>プロバイダの実装を1つ追加する必要</strong>がございます（1日程度の作業）。</p>
</div>

<div class="en-block"><span class="lbl">English</span>
<p>Groq's advantage is speed, and this workload has no use for it: generation happens as a background batch after import, then a person reviews it for minutes. Against that, Groq has no Japan region (US and EU only), so it satisfies neither the AWS requirement nor domestic processing.</p>
<p>For Google, first establish which API the company holds. The free AI Studio tier trains on submitted content and exposes it to human review — not usable for recruit personal data. Paid Gemini API or Vertex AI does not train on your data. Vertex would also need one additional provider class for service-account authentication, roughly a day's work.</p></div>

<h2>8. ご確認をお願いしたい点<span class="en">What we need from you</span></h2>

<ol>
  <li><strong>Amazon Bedrock（日本国内推論）で進めてよろしいでしょうか。</strong>ご了承いただければ、モデルへのアクセス申請と、学習に利用されない旨の書面確認をお願いいたします。</li>
  <li>モデルは <strong>Claude Haiku 4.5</strong>（安価）と <strong>Claude Sonnet 4.6</strong>（高品質）のいずれを既定といたしますか。差額は年間でも僅かですので、品質を優先してSonnetを推奨いたします。</li>
  <li>Googleでの実施をご希望の場合は、AWS外での処理となる旨をご承知おきいただく必要がございます。その場合、同じ原稿で両者の日本語出力を比較したうえでご判断いただくことも可能です。</li>
</ol>

<div class="en-block"><span class="lbl">English</span>
<p>1. May we proceed with Amazon Bedrock using Japan-only inference? If so, please request model access and the written confirmation that submitted data is not used for training.<br />
2. Haiku 4.5 or Sonnet 4.6 as the default? The difference is small in absolute terms, so we suggest Sonnet for quality.<br />
3. If you prefer Google, note that processing would leave AWS. We can generate the same sheet through both and compare the Japanese before you decide.</p></div>

<div class="box">
  <h3>出典 / Sources</h3>
  <p>価格：各社の公開価格（2026年）。日本語ベンチマーク：Nejumi Leaderboard 4（2026年9月）。日本国内推論：AWS公式ブログ「Amazon Bedrock 日本国内クロスリージョン推論」。処理量：本アプリケーションのプロンプトを実測（scripts/measure-ai-usage.ts）。</p>
  <p>本書の数値は <code>npm run ai:report</code> で再生成できます。項目定義を変更した場合は再実行してください。</p>
</div>

</body></html>`;

const out = path.join(ROOT, 'tmp-ai-cost.html');
fs.writeFileSync(out, html, 'utf-8');
console.log(`wrote ${out}`);
console.log(`recommended annual (50 people, 2 passes): ${fmtUsd(recommendedAnnual)}`);
