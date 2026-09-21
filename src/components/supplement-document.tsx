/**
 * 補足資料 — the sales-facing supplementary document.
 *
 * Sano-san asked for 配属検討用の情報 to come off the skill sheet and be
 * exportable on its own, together with the remarks answer and free notes about
 * the person. Nothing printed here appears on the skill sheet, and the document
 * says so on its face so that a reader who has both in hand is never in doubt
 * about which one can be shown to a customer.
 *
 * It reuses the skill sheet's stylesheet so the two look like one family, with
 * a small number of additions for the notice band and the memo list.
 */

import type { SectionView, SheetModel } from '@/lib/sheet/model';
import { SHEET_STYLES } from './sheet-document';

export type MemoView = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string | null;
};

export const SUPPLEMENT_STYLES = `
${SHEET_STYLES}

.sheet .supplement-notice {
  border: 1.5px solid #9E4468;
  background: #F9EDF1;
  color: #7c3552;
  border-radius: 4px;
  padding: 7px 11px;
  margin: 0 0 12px;
  font-size: 9.5pt;
  font-weight: 600;
  line-height: 1.7;
}
.sheet .supplement-notice .sub {
  /* Second line of the notice: same size as the first, weight normal. Only the
     first line is bold (Sano-san's wording). */
  display: block;
  font-weight: 400;
  font-size: 9.5pt;
  color: #7c3552;
  margin-top: 2px;
}
.sheet .person-line {
  display: flex;
  gap: 14px;
  align-items: baseline;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}
.sheet .person-line .nm { font-size: 13pt; font-weight: 700; }
.sheet .person-line .no { font-size: 9.5pt; color: var(--ink-soft); }

.sheet table.memo-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.sheet table.memo-table > tbody > tr > th,
.sheet table.memo-table > tbody > tr > td {
  border: 1px solid var(--line-soft);
  padding: 7px 10px;
  vertical-align: top;
  text-align: left;
  line-break: strict;
  overflow-wrap: anywhere;
}
.sheet table.memo-table th.when {
  width: 132px;
  background: var(--label-bg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sheet table.memo-table th.when .who {
  display: block;
  font-weight: 400;
  font-size: 8pt;
  color: var(--ink-soft);
}
.sheet .memo-empty {
  border: 1px dashed var(--line);
  border-radius: 4px;
  padding: 10px;
  text-align: center;
  color: #949ba6;
  font-size: 9pt;
  margin-bottom: 12px;
}
`;

function formatStamp(d: Date): string {
  const date = new Date(d);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function SupplementSection({ section }: { section: SectionView }) {
  return (
    <table className={`sheet-table sec-${section.code}`}>
      <colgroup>
        <col style={{ width: '178px' }} />
        <col />
        <col style={{ width: '0' }} />
      </colgroup>
      <tbody>
        <tr className="band">
          <th colSpan={3}>
            {section.nameJa}
            {section.nameEn ? <span className="en">{section.nameEn}</span> : null}
          </th>
        </tr>
        {section.fields.map((field) => (
          <tr key={field.id}>
            <th className="label">{field.nameJa}</th>
            <td colSpan={2}>
              {field.valueType === 'GRID' && Array.isArray(field.valueJson) ? (
                <table className="value-grid">
                  <tbody>
                    {(field.valueJson as Array<{ row: string; value: string }>).map((r, i) => (
                      <tr key={i}>
                        <td className="k">{r.row}</td>
                        <td>{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                field.valueJa
                  .split('\n')
                  .map((line, i, arr) => (
                    <span key={i}>
                      {line}
                      {i < arr.length - 1 ? <br /> : null}
                    </span>
                  ))
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SupplementDocument({
  model,
  memos,
}: {
  model: SheetModel;
  memos: MemoView[];
}) {
  return (
    <div className="sheet">
      <header className="sheet-header">
        <h1 className="sheet-title">
          補足資料
          <span className="en">Supplementary Information</span>
        </h1>
        <p className="privacy-note">※社内限り。取り扱いにご注意願います。</p>
      </header>

      {/* Wording supplied by Sano-san; the first line is bold, the second is not. */}
      <p className="supplement-notice">
        本資料は、配属検討用の情報・備考・営業メモです。お客様にお渡しするものではありません。
        <span className="sub">
          メモ欄は気づいたことや今後の提案に参考になると思われる申し送り事項等を記載してください。
        </span>
      </p>

      <div className="person-line">
        <span className="nm">{model.person.fullNameKatakana ?? model.person.fullNameEnglish}</span>
        <span className="no">{model.person.fullNameEnglish}</span>
        {model.person.employeeNumber ? (
          <span className="no">No.{model.person.employeeNumber}</span>
        ) : null}
      </div>

      {model.sections.map((section) => (
        <SupplementSection key={section.id} section={section} />
      ))}

      <table className="sheet-table sec-placement memo-table">
        <tbody>
          <tr className="band">
            <th colSpan={2}>
              営業メモ<span className="en">Notes</span>
            </th>
          </tr>
          {memos.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ textAlign: 'center', color: '#949ba6' }}>
                メモはまだ登録されていません。
              </td>
            </tr>
          ) : (
            memos.map((memo) => (
              <tr key={memo.id}>
                <th className="when">
                  {formatStamp(memo.createdAt)}
                  {memo.authorName ? <span className="who">{memo.authorName}</span> : null}
                </th>
                <td>
                  {memo.body.split('\n').map((line, i, arr) => (
                    <span key={i}>
                      {line}
                      {i < arr.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
