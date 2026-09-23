-- One-off backfill for 日本語能力 > 各スコア (field code jlpt_scores).
--
-- Until 2026-09-23 this field was always saved empty: it is fed by five
-- single-answer questions (C-2-2〜C-2-6) and the copy step only read
-- grid-shaped answers. The code is fixed, but values saved before the fix stay
-- empty until something regenerates them. This fills exactly those empty
-- values from each person's latest form response, in the same format the
-- fixed code produces:
--
--   総合点：134点（180点満点）
--   言語知識（文字・語彙・文法）：52点（60点満点）
--   読解：48点（60点満点）
--   聴解：34点（60点満点）
--
-- Safe to run more than once: only empty values are touched. The field is
-- not printed on the PDF (includeInPdf = false), so a finalised sheet's PDF
-- does not change; on a finalised version the value is marked as reviewed so
-- the sheet is not reported as having unchecked items.

WITH fld AS (
  SELECT id FROM sheet_fields WHERE code = 'jlpt_scores'
),
resp AS (
  SELECT DISTINCT ON (fr."personId") fr."personId", fr.answers
  FROM form_responses fr
  WHERE fr."personId" IS NOT NULL
  ORDER BY fr."personId", fr."createdAt" DESC
),
norm AS (
  -- Full-width digits to ASCII, then the first run of digits in each answer.
  SELECT
    "personId",
    substring(translate(answers->>'C-2-2', '０１２３４５６７８９', '0123456789') from '[0-9]+') AS total,
    substring(translate(answers->>'C-2-3', '０１２３４５６７８９', '0123456789') from '[0-9]+') AS knowledge,
    substring(translate(answers->>'C-2-4', '０１２３４５６７８９', '0123456789') from '[0-9]+') AS reading,
    substring(translate(answers->>'C-2-5', '０１２３４５６７８９', '0123456789') from '[0-9]+') AS knowledge_reading,
    substring(translate(answers->>'C-2-6', '０１２３４５６７８９', '0123456789') from '[0-9]+') AS listening
  FROM resp
),
calc AS (
  SELECT
    "personId",
    array_to_string(
      array_remove(
        ARRAY[
          CASE WHEN total IS NOT NULL THEN '総合点：' || total::int || '点（180点満点）' END,
          CASE WHEN knowledge IS NOT NULL THEN '言語知識（文字・語彙・文法）：' || knowledge::int || '点（60点満点）' END,
          CASE WHEN reading IS NOT NULL THEN '読解：' || reading::int || '点（60点満点）' END,
          CASE WHEN knowledge_reading IS NOT NULL THEN '言語知識・読解：' || knowledge_reading::int || '点（120点満点）' END,
          CASE WHEN listening IS NOT NULL THEN '聴解：' || listening::int || '点（60点満点）' END
        ],
        NULL
      ),
      E'\n'
    ) AS txt
  FROM norm
)
UPDATE field_values fv
SET "valueJa" = calc.txt,
    "isReviewed" = fv."isReviewed" OR v.status = 'FINAL',
    "updatedAt" = now()
FROM sheet_versions v
JOIN skill_sheets s ON s.id = v."skillSheetId"
JOIN calc ON calc."personId" = s."personId"
WHERE fv."versionId" = v.id
  AND fv."fieldId" IN (SELECT id FROM fld)
  AND coalesce(fv."valueJa", '') = ''
  AND calc.txt <> ''
RETURNING s."personId", v."versionNo", v.status, fv."valueJa";
