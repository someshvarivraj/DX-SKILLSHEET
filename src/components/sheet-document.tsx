/**
 * The skill sheet itself.
 *
 * This single component renders both the on-screen preview and the PDF, which
 * is how §11.2's "the preview and the PDF always match" is guaranteed: there is
 * only one layout, not two. Layout follows the five sample sheets supplied with
 * the specification (§11.5).
 *
 * Typography follows Japanese conventions rather than the browser defaults:
 *   - 禁則処理 (`line-break: strict`) so a line never begins with 、。）」 etc.
 *   - labels are left-aligned, so a label that wraps does not centre its tail
 *   - `palt` kerning on headings, which is what Japanese sites use to stop
 *     full-width characters looking loosely spaced
 *   - Japanese emphasises with weight, never italics
 *
 * Every rule is scoped to `.sheet`. The preview screen injects this stylesheet
 * into the running app, so an unscoped `body` rule would restyle the whole
 * admin UI around it.
 */

import type { SectionView, SheetModel } from '@/lib/sheet/model';

/**
 * One accent per section, so a reader can find a section by colour alone.
 * Muted and low-saturation on purpose: these are printed on A4 and photocopied,
 * and saturated fills turn to mud in greyscale. Related sections deliberately
 * share a hue (志向 and キャリアアップ, 興味ある分野 and 日本企業について) so the
 * sheet reads as grouped rather than as a rainbow.
 */
export const SECTION_COLOURS: Record<string, { accent: string; tint: string }> = {
  personal: { accent: '#3D5A8A', tint: '#EAEFF7' },
  aspirations: { accent: '#2E6F66', tint: '#E5F0EE' },
  education: { accent: '#2F6BA8', tint: '#E5EFF9' },
  skills: { accent: '#9E4468', tint: '#F8E9F0' },
  internships: { accent: '#3E7A52', tint: '#E8F3EB' },
  projects: { accent: '#67589B', tint: '#EDEBF7' },
  // Work done in Japan sits in the same 'experience' hue family as
  // internships, a shade deeper, so the two read as related.
  work_japan: { accent: '#2F6B45', tint: '#E4F0E8' },
  japanese_ability: { accent: '#A94F46', tint: '#F9ECEA' },
  research: { accent: '#46688C', tint: '#E9F0F6' },
  interests: { accent: '#A0662C', tint: '#F7EFE4' },
  japanese_companies: { accent: '#A0662C', tint: '#F7EFE4' },
  career_development: { accent: '#2E6F66', tint: '#E5F0EE' },
  placement: { accent: '#4E6A7A', tint: '#EBF0F3' },
  leadership: { accent: '#6B7A3E', tint: '#F0F3E6' },
  other: { accent: '#5C6472', tint: '#EDEFF2' },
};

const sectionColourRules = Object.entries(SECTION_COLOURS)
  .map(
    ([code, { accent, tint }]) =>
      `.sheet .sec-${code} { --accent: ${accent}; --accent-tint: ${tint}; }`,
  )
  .join('\n');

export const SHEET_STYLES = `
.sheet {
  --ink: #1a1d23;
  --ink-soft: #5c6470;
  --line: #c3cad5;
  --line-soft: #dce1e9;
  --label-bg: #f4f6fa;
  --accent: #5C6472;
  --accent-tint: #EDEFF2;

  color: var(--ink);
  font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP",
    "Noto Sans CJK JP", "Yu Gothic", YuGothic, Meiryo, sans-serif;
  /* 10.5pt is the usual body size for a Japanese business document; the old
     9.5pt was below what reads comfortably in print. */
  font-size: 10.5pt;
  line-height: 1.8;
  text-align: left;
  /* 禁則処理: never start a line with 、。）」, never end one with （「. */
  line-break: strict;
  /* Break inside a long Latin run (an email, a URL, a library name) only when
     it would otherwise overflow its cell. */
  overflow-wrap: anywhere;
  word-break: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
${sectionColourRules}
.sheet *, .sheet *::before, .sheet *::after { box-sizing: border-box; }

/* Japanese sets emphasis in weight; italics are not used. */
.sheet :is(em, i, cite, dfn, address) { font-style: normal; font-weight: 700; }

.sheet-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 2px solid #2f3742;
  padding-bottom: 6px;
  margin-bottom: 10px;
}
.sheet-title {
  margin: 0;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-feature-settings: "palt";
}
.sheet-title .en {
  margin-left: 10px;
  font-size: 8.5pt;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.sheet .privacy-note {
  margin: 0;
  font-size: 8.5pt;
  color: var(--ink-soft);
  white-space: nowrap;
}

.sheet table.sheet-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin-bottom: 12px;
}
/* Child combinators, not descendants: a plain "table.sheet-table td" rule also
   matches the cells of the nested ".value-grid" tables, which boxed every grid
   row in its own border. */
.sheet table.sheet-table > tbody > tr > th,
.sheet table.sheet-table > tbody > tr > td {
  border: 1px solid var(--line-soft);
  padding: 7px 10px;
  vertical-align: top;
  text-align: left;
  line-break: strict;
  overflow-wrap: anywhere;
  word-break: normal;
}

/* Labels are left-aligned so that a label long enough to wrap
   (「プログラミング言語」,「主要スキルと習熟度」) keeps its second line flush
   with the first instead of centring it. */
.sheet th.label,
.sheet th.sub-label,
.sheet th.group-label {
  background: var(--label-bg);
  font-weight: 600;
  text-align: left;
  color: #2b313b;
  font-feature-settings: "palt";
}
.sheet th.label { width: 150px; }
.sheet th.sub-label { width: 172px; }
/* The grouped block (志向) has no band row of its own, so its spanning label is
   what carries the section's accent colour. */
.sheet th.group-label {
  width: 76px;
  vertical-align: middle;
  background: var(--accent-tint);
  color: var(--accent);
  border-left: 4px solid var(--accent);
  font-weight: 700;
  letter-spacing: 0.06em;
}
/* Where supported, break a Japanese label at a phrase boundary rather than
   wherever the box happens to end. Chromium ships this; others ignore it. */
@supports (word-break: auto-phrase) {
  .sheet th.label,
  .sheet th.sub-label,
  .sheet th.group-label { word-break: auto-phrase; }
}

/* Section band: the coloured rule that opens each section. */
.sheet tr.band th {
  background: var(--accent-tint);
  color: var(--accent);
  border-left: 4px solid var(--accent);
  border-bottom: 1px solid var(--accent);
  font-weight: 700;
  font-size: 11.5pt;
  letter-spacing: 0.06em;
  padding: 7px 10px;
  font-feature-settings: "palt";
}
.sheet tr.band th .en {
  margin-left: 8px;
  font-size: 8.5pt;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--ink-soft);
}
/* Per-record heading inside a repeating section. */
.sheet tr.record-band th {
  background: #fbfcfd;
  color: var(--accent);
  border-left: 3px solid var(--accent);
  font-weight: 700;
  font-size: 10.5pt;
  letter-spacing: 0.04em;
  padding: 5px 10px;
}

/* Section headings are centred; field labels are not.
   A heading names the block it opens and never wraps, so centring it reads as
   deliberate. A field label sits beside its value and can wrap, which is why
   those stay flush left (see the note above th.label).
   The selectors are written out in full because the general cell rule above is
   more specific than a short ".sheet tr.band th" would be, and would otherwise
   win and keep these left-aligned. */
.sheet table.sheet-table > tbody > tr.band > th,
.sheet table.sheet-table > tbody > tr.record-band > th,
.sheet table.sheet-table > tbody > tr > th.group-label {
  text-align: center;
}

.sheet .photo-cell {
  width: 112px;
  text-align: center;
  vertical-align: middle;
  padding: 5px;
}
.sheet .photo-cell img {
  width: 98px;
  height: 124px;
  object-fit: cover;
  border: 1px solid var(--line);
}
.sheet .photo-placeholder {
  width: 98px;
  height: 124px;
  border: 1px dashed var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8.5pt;
  color: #949ba6;
  margin: 0 auto;
}

.sheet .value-grid { width: 100%; border-collapse: collapse; }
.sheet .value-grid td { border: 0; padding: 3px 0; vertical-align: top; }
.sheet .value-grid tr + tr td { border-top: 1px dotted #e2e7ee; }
.sheet .value-grid td.k { width: 58%; padding-right: 10px; color: #39404b; }
.sheet .name-main { font-weight: 700; font-size: 13pt; letter-spacing: 0.02em; }
.sheet .name-sub { font-weight: 500; font-size: 9.5pt; color: var(--ink-soft); }
.sheet .empty-note { color: #99a0ab; }

@page { size: A4 portrait; margin: 16mm 14mm 18mm; }
@media print {
  .sheet tr, .sheet td, .sheet th {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* A section heading stranded at the foot of a page is the classic print
     defect; keep it with the row that follows it. */
  .sheet tr.band, .sheet tr.record-band {
    page-break-after: avoid;
    break-after: avoid;
  }
  .sheet table.sheet-table { page-break-inside: auto; }
}
`;

/**
 * Split a stored value into the lines that should actually print.
 *
 * Values written before the mock provider's figure bug was fixed can still hold
 * a stray blank line, and a line can begin with punctuation that Japanese
 * forbids at the start of a line (禁則処理). Both are folded away here as well
 * as at write time, so sheets already in the database print correctly without
 * having to be regenerated.
 */
export function toDisplayLines(value: string): string[] {
  const lines: string[] = [];
  for (const raw of value.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (lines.length > 0 && /^[、。，．・）」』】〕｝》]/.test(line)) {
      lines[lines.length - 1] += line;
      continue;
    }
    lines.push(line);
  }
  return lines;
}

function renderValue(value: string, json: unknown, valueType: string) {
  if (valueType === 'GRID' && Array.isArray(json)) {
    const rows = json as Array<{ row: string; value: string }>;
    return (
      <table className="value-grid">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="k">{r.row}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (valueType === 'STRING_LIST' && Array.isArray(json)) {
    return <>{(json as string[]).join('、')}</>;
  }
  const lines = toDisplayLines(value);
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function SectionBand({ section, span = 3 }: { section: SectionView; span?: number }) {
  return (
    <tr className="band">
      <th colSpan={span}>
        {section.nameJa}
        {section.nameEn ? <span className="en">{section.nameEn}</span> : null}
      </th>
    </tr>
  );
}

/** The class that carries a section's accent colour. */
function sectionClass(code: string): string {
  return `sheet-table sec-${code}`;
}

/**
 * Personal block: identity fields plus the photo, as in the samples.
 *
 * Sano-san set the order — 氏名 / 出身地 / 年齢・性別 / 対応言語 / 食事 / 現在の居住地 —
 * and asked for age and gender to share one line. They stay two separate fields
 * in the definition so each can be edited and unticked on its own; the pairing
 * is a layout decision and lives here.
 */
const AGE_GENDER = ['age', 'gender'] as const;

function PersonalBlock({ section, photoUrl }: { section: SectionView; photoUrl?: string | null }) {
  const byCode = (code: string) => section.fields.find((f) => f.code === code);
  const age = byCode('age');
  const gender = byCode('gender');

  // One row carrying both, when either is shown.
  const ageGenderRow =
    age || gender
      ? {
          id: 'age-gender',
          label: [age?.nameJa, gender?.nameJa].filter(Boolean).join('・'),
          value: [age?.valueJa, gender?.valueJa].filter(Boolean).join('　'),
        }
      : null;

  const identity = section.fields.filter((f) =>
    ['employee_number', 'full_name', 'hometown'].includes(f.code),
  );
  const rest = section.fields.filter(
    (f) =>
      !['employee_number', 'full_name', 'hometown', 'photo', ...AGE_GENDER].includes(f.code),
  );
  // The photo spans the identity rows plus the combined age/gender row.
  const rowCount = Math.max(identity.length + (ageGenderRow ? 1 : 0), 1);

  return (
    <table className={sectionClass(section.code)}>
      <colgroup>
        <col style={{ width: '150px' }} />
        <col />
        <col style={{ width: '116px' }} />
      </colgroup>
      <tbody>
        <SectionBand section={section} />
        {identity.map((field, index) => (
          <tr key={field.id}>
            <th className="label">{field.code === 'employee_number' ? 'No.' : field.nameJa}</th>
            <td className={field.code === 'full_name' ? 'name-main' : undefined}>
              {renderValue(field.valueJa, field.valueJson, field.valueType)}
            </td>
            {index === 0 ? (
              <td className="photo-cell" rowSpan={rowCount}>
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" />
                ) : (
                  <div className="photo-placeholder">写真</div>
                )}
              </td>
            ) : null}
          </tr>
        ))}
        {ageGenderRow ? (
          <tr key={ageGenderRow.id}>
            <th className="label">{ageGenderRow.label}</th>
            <td>{ageGenderRow.value}</td>
          </tr>
        ) : null}
        {rest.map((field) => (
          <tr key={field.id}>
            <th className="label">{field.nameJa}</th>
            <td colSpan={2}>{renderValue(field.valueJa, field.valueJson, field.valueType)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Career aspirations: a grouped block with one spanning label, as in the samples. */
function GroupedBlock({ section }: { section: SectionView }) {
  return (
    <table className={sectionClass(section.code)}>
      <colgroup>
        <col style={{ width: '72px' }} />
        <col style={{ width: '172px' }} />
        <col />
      </colgroup>
      <tbody>
        {section.fields.map((field, index) => (
          <tr key={field.id}>
            {index === 0 ? (
              <th className="group-label" rowSpan={section.fields.length}>
                {section.nameJa}
              </th>
            ) : null}
            <th className="sub-label">{field.nameJa}</th>
            <td>{renderValue(field.valueJa, field.valueJson, field.valueType)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RepeatingBlock({ section }: { section: SectionView }) {
  if (section.code === 'education') {
    return (
      <table className={sectionClass(section.code)}>
        <colgroup>
          {/* Wide enough that a full 「2022年8月 - 2026年5月」 and 「学士（工学）」
              each stay on one line rather than breaking mid-parenthesis. */}
          <col style={{ width: '178px' }} />
          <col />
          {/* 成績 sits beside the school name, as Sano-san asked. Wide enough
              that a full 「CGPA 8.7 / 10」 stays on one line. */}
          <col style={{ width: '116px' }} />
          <col style={{ width: '106px' }} />
        </colgroup>
        <tbody>
          <SectionBand section={section} span={4} />
          {section.records.map((record) => {
            const get = (code: string) =>
              record.fields.find((f) => f.code === code)?.valueJa ?? '';
            return (
              <tr key={record.id}>
                <td>{get('edu_years')}</td>
                <td>
                  {get('edu_institution')}
                  {get('edu_major') ? (
                    <>
                      <br />
                      専攻: {get('edu_major')}
                    </>
                  ) : null}
                </td>
                <td>{get('edu_score')}</td>
                <td>{get('edu_degree')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <table className={sectionClass(section.code)}>
      <colgroup>
        <col style={{ width: '150px' }} />
        <col />
        <col style={{ width: '0' }} />
      </colgroup>
      <tbody>
        <SectionBand section={section} />
        {section.records.map((record, index) => (
          <RecordRows
            key={record.id}
            sectionName={section.nameJa}
            index={index + 1}
            fields={record.fields}
          />
        ))}
      </tbody>
    </table>
  );
}

function RecordRows({
  sectionName,
  index,
  fields,
}: {
  sectionName: string;
  index: number;
  fields: SectionView['fields'];
}) {
  return (
    <>
      <tr className="record-band">
        <th colSpan={3}>{`${sectionName} ${index}`}</th>
      </tr>
      {fields.map((field) => (
        <tr key={field.id}>
          <th className="label">{field.nameJa}</th>
          <td colSpan={2}>{renderValue(field.valueJa, field.valueJson, field.valueType)}</td>
        </tr>
      ))}
    </>
  );
}

function SimpleBlock({ section }: { section: SectionView }) {
  return (
    <table className={sectionClass(section.code)}>
      <colgroup>
        <col style={{ width: '150px' }} />
        <col />
        <col style={{ width: '0' }} />
      </colgroup>
      <tbody>
        <SectionBand section={section} />
        {section.fields.map((field) => (
          <tr key={field.id}>
            <th className="label">{field.nameJa}</th>
            <td colSpan={2}>{renderValue(field.valueJa, field.valueJson, field.valueType)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkillSheetDocument({
  model,
  photoUrl,
}: {
  model: SheetModel;
  photoUrl?: string | null;
}) {
  return (
    <div className="sheet">
      <header className="sheet-header">
        <h1 className="sheet-title">
          スキルシート
          <span className="en">Skill Sheet</span>
        </h1>
        <p className="privacy-note">※個人情報につき、お取り扱いにはご注意願います。</p>
      </header>
      {model.sections.map((section) => {
        if (section.code === 'personal') {
          return <PersonalBlock key={section.id} section={section} photoUrl={photoUrl} />;
        }
        if (section.code === 'aspirations') {
          return <GroupedBlock key={section.id} section={section} />;
        }
        if (section.kind === 'REPEATING') {
          return <RepeatingBlock key={section.id} section={section} />;
        }
        return <SimpleBlock key={section.id} section={section} />;
      })}
    </div>
  );
}
