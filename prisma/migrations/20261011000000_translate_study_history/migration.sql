-- 日本語の学習歴 (C-1-3) is English free text: it must be translated, not
-- copied (it printed the English answer). The initial definition was fixed in
-- the seed; this applies the same fix to databases seeded before that, but
-- only where the field is still on its old setting (a choice an operator made
-- on screen is left alone).
UPDATE "sheet_fields"
SET "processing" = 'TRANSLATE', "valueType" = 'TEXT'
WHERE "code" = 'jp_study_history' AND "processing" = 'COPY';
