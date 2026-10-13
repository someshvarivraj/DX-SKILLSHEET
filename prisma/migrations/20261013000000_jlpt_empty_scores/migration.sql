-- JLPT scores the form did not give were stored as 0 instead of empty (the
-- 2026 form asks only the level). Every such candidate then read as having
-- failed: 「N4を受験したが、総合点が合格点（90点）に届いていない」. No real
-- result has a section — let alone a total — of 0, so 0 means "not given".
UPDATE "jlpt_results" SET
  "total"              = NULLIF("total", 0),
  "languageKnowledge"  = NULLIF("languageKnowledge", 0),
  "reading"            = NULLIF("reading", 0),
  "languageAndReading" = NULLIF("languageAndReading", 0),
  "listening"          = NULLIF("listening", 0)
WHERE 0 IN ("total", "languageKnowledge", "reading", "languageAndReading", "listening");

-- 日本語力について written from those zeros says the person failed. Where the
-- person has no scores at all, replace that claim with what is known — the
-- level — as the rule writes it when scores are missing. Locked values and
-- finalised versions are left alone; entering the scores on the editing
-- screen (日本語能力 > 各スコア) rewrites the text properly.
WITH unscored AS (
  SELECT "personId", min("level"::text) AS level   -- 'N1' < 'N2' …: the highest level
  FROM "jlpt_results"
  GROUP BY "personId"
  HAVING bool_and("total" IS NULL AND "languageKnowledge" IS NULL AND "reading" IS NULL
                  AND "languageAndReading" IS NULL AND "listening" IS NULL)
),
wrong AS (
  SELECT fv."id", fv."valueJa" AS previous, u.level || 'を取得している。' AS fixed
  FROM "field_values" fv
  JOIN "sheet_fields" f ON f."id" = fv."fieldId" AND f."code" = 'jlpt_description'
  JOIN "sheet_versions" v ON v."id" = fv."versionId" AND v."status" <> 'FINAL'
  JOIN "skill_sheets" s ON s."id" = v."skillSheetId"
  JOIN unscored u ON u."personId" = s."personId"
  WHERE NOT fv."isLocked"
    AND (fv."valueJa" ~ '(合格点|基準点).{0,20}(届いていない|達していない|満たしていない|下回)' OR fv."valueJa" LIKE '%不合格%')
),
updated AS (
  UPDATE "field_values" fv
  SET "valueJa" = w.fixed, "isReviewed" = false, "updatedAt" = now()
  FROM wrong w
  WHERE fv."id" = w."id"
  RETURNING fv."id"
)
INSERT INTO "field_value_history" ("id", "fieldValueId", "changeType", "previousJa", "valueJa", "createdAt")
SELECT gen_random_uuid()::text, w."id", 'RULE_GENERATE', w.previous, w.fixed, now()
FROM wrong w
JOIN updated u ON u."id" = w."id";
