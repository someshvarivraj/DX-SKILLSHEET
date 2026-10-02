-- A field that still holds someone's data can no longer be deleted by a plain
-- DELETE (directly, or through its section): the database refuses instead of
-- cascading. The admin screen deletes the values explicitly after confirmation.
ALTER TABLE "field_values" DROP CONSTRAINT "field_values_fieldId_fkey";
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "sheet_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
