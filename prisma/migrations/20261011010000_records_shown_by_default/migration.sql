-- Repeating sections can show their entries on the sheet by default
-- (Sano-san, 2026-10-11). On for education, internships and projects.
ALTER TABLE "sheet_sections" ADD COLUMN "showRecordsByDefault" BOOLEAN NOT NULL DEFAULT false;
UPDATE "sheet_sections" SET "showRecordsByDefault" = true
WHERE "code" IN ('education', 'internships', 'projects');

-- Entries created before this were all hidden, so these sections printed
-- nothing unless each entry was ticked by hand. Where nobody has ticked any
-- entry of that kind yet, tick the ones that have content, up to the
-- section's limit. A display set where someone already chose is left alone.
WITH untouched AS (
  SELECT rd."presetId", r."kind"
  FROM "record_displays" rd
  JOIN "sheet_records" r ON r."id" = rd."recordId"
  WHERE r."deletedAt" IS NULL
  GROUP BY rd."presetId", r."kind"
  HAVING bool_or(rd."isDisplayed") = false
),
candidates AS (
  SELECT rd."id",
         row_number() OVER (PARTITION BY rd."presetId", r."kind" ORDER BY rd."order", r."order", r."createdAt") AS n,
         s."maxDisplayed"
  FROM "record_displays" rd
  JOIN "sheet_records" r ON r."id" = rd."recordId"
  JOIN untouched u ON u."presetId" = rd."presetId" AND u."kind" = r."kind"
  JOIN "sheet_sections" s ON s."recordKind" = r."kind" AND s."showRecordsByDefault"
  JOIN "skill_sheets" sh ON sh."id" = r."skillSheetId"
  WHERE r."deletedAt" IS NULL
    AND EXISTS (
      SELECT 1 FROM "field_values" fv
      WHERE fv."recordId" = r."id"
        AND fv."versionId" = sh."currentVersionId"
        AND btrim(coalesce(fv."valueJa", '')) <> ''
    )
)
UPDATE "record_displays" SET "isDisplayed" = true
FROM candidates c
WHERE "record_displays"."id" = c."id" AND c.n <= c."maxDisplayed";
