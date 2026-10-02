-- The question as each set asks it (wording, options), so another group's or a
-- later year's form never overwrites the item master or an earlier set.
ALTER TABLE "question_set_items" ADD COLUMN "wording" JSONB;
