-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES', 'ENGINEER', 'VIEWER');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'PARAGRAPH', 'RADIO', 'CHECKBOX', 'LIST', 'GRID', 'DATE', 'SCALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SectionKind" AS ENUM ('SINGLE', 'REPEATING');

-- CreateEnum
CREATE TYPE "Processing" AS ENUM ('COPY', 'GLOSSARY', 'ENRICH', 'TRANSLATE', 'GENERATE', 'RULE_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "Editing" AS ENUM ('MANUAL_ONLY', 'PROMPT_AND_MANUAL');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('STRING', 'TEXT', 'STRING_LIST', 'GRID', 'NUMBER', 'DATE');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('CSV', 'XLSX', 'SHEETS_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "SheetStatus" AS ENUM ('DRAFT', 'AWAITING_REVIEW', 'FINAL');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('IMPORT', 'AI_GENERATE', 'RULE_GENERATE', 'MANUAL_EDIT', 'REVERT', 'LOCK', 'UNLOCK', 'REVIEW');

-- CreateEnum
CREATE TYPE "SheetDocument" AS ENUM ('SKILL_SHEET', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "RecordKind" AS ENUM ('EDUCATION', 'INTERNSHIP', 'PROJECT', 'WORK_EXPERIENCE');

-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('IMPORTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "GlossaryCategory" AS ENUM ('UNIVERSITY', 'MAJOR', 'DEGREE', 'STATE', 'TECH_TERM', 'HIGH_SCHOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "JlptLevel" AS ENUM ('N1', 'N2', 'N3', 'N4', 'N5');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "personId" TEXT,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "personId" TEXT,
    "summary" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_revisions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceFile" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_questions" (
    "id" TEXT NOT NULL,
    "formRevisionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "titleJa" TEXT NOT NULL,
    "titleEn" TEXT,
    "helpText" TEXT,
    "type" "QuestionType" NOT NULL DEFAULT 'TEXT',
    "sectionLabel" TEXT,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gridRows" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gridColumns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responseHeader" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_sections" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "kind" "SectionKind" NOT NULL DEFAULT 'SINGLE',
    "document" "SheetDocument" NOT NULL DEFAULT 'SKILL_SHEET',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "hideWhenEmpty" BOOLEAN NOT NULL DEFAULT false,
    "recordKind" "RecordKind",
    "maxDisplayed" INTEGER NOT NULL DEFAULT 3,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_fields" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "processing" "Processing" NOT NULL DEFAULT 'COPY',
    "editing" "Editing" NOT NULL DEFAULT 'MANUAL_ONLY',
    "valueType" "ValueType" NOT NULL DEFAULT 'STRING',
    "includeInPdf" BOOLEAN NOT NULL DEFAULT true,
    "displayToggle" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "generationPrompt" TEXT,
    "targetLengthMin" INTEGER,
    "targetLengthMax" INTEGER,
    "glossaryCategory" "GlossaryCategory",
    "ruleKey" TEXT,
    "helpText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_field_sources" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "questionId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sheet_field_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "fullNameEnglish" TEXT NOT NULL,
    "fullNameKatakana" TEXT,
    "email" TEXT,
    "dateOfBirth" DATE,
    "cohort" TEXT,
    "photoKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "formRevisionId" TEXT NOT NULL,
    "importedById" TEXT,
    "source" "ImportSource" NOT NULL DEFAULT 'CSV',
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "unmappedHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_responses" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "personId" TEXT,
    "responseKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_sheets" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_versions" (
    "id" TEXT NOT NULL,
    "skillSheetId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "SheetStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "finalisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_values" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "recordId" TEXT,
    "recordKey" TEXT NOT NULL DEFAULT '',
    "valueJa" TEXT,
    "valueJson" JSONB,
    "sourceText" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "isDisplayed" BOOLEAN NOT NULL DEFAULT true,
    "generatedAt" TIMESTAMP(3),
    "generatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_value_history" (
    "id" TEXT NOT NULL,
    "fieldValueId" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "previousJa" TEXT,
    "valueJa" TEXT,
    "valueJson" JSONB,
    "prompt" TEXT,
    "model" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_value_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_records" (
    "id" TEXT NOT NULL,
    "skillSheetId" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL,
    "origin" "RecordOrigin" NOT NULL DEFAULT 'IMPORTED',
    "sourcePrefix" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_presets" (
    "id" TEXT NOT NULL,
    "skillSheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '既定',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "hiddenFieldCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "display_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_displays" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "isDisplayed" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "record_displays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_entries" (
    "id" TEXT NOT NULL,
    "category" "GlossaryCategory" NOT NULL,
    "english" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "japanese" TEXT NOT NULL,
    "gloss" TEXT,
    "region" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jlpt_results" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "level" "JlptLevel" NOT NULL,
    "examYear" INTEGER NOT NULL,
    "examMonth" INTEGER NOT NULL,
    "total" INTEGER,
    "languageKnowledge" INTEGER,
    "reading" INTEGER,
    "languageAndReading" INTEGER,
    "listening" INTEGER,
    "passed" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jlpt_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_history" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "presetId" TEXT,
    "exportedById" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "person_memos" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "person_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_tokenHash_key" ON "login_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "login_tokens_userId_idx" ON "login_tokens"("userId");

-- CreateIndex
CREATE INDEX "login_tokens_expiresAt_idx" ON "login_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_personId_createdAt_idx" ON "audit_logs"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "form_revisions_code_key" ON "form_revisions"("code");

-- CreateIndex
CREATE INDEX "form_questions_formRevisionId_order_idx" ON "form_questions"("formRevisionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "form_questions_formRevisionId_code_key" ON "form_questions"("formRevisionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_sections_code_key" ON "sheet_sections"("code");

-- CreateIndex
CREATE INDEX "sheet_sections_order_idx" ON "sheet_sections"("order");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_fields_code_key" ON "sheet_fields"("code");

-- CreateIndex
CREATE INDEX "sheet_fields_sectionId_order_idx" ON "sheet_fields"("sectionId", "order");

-- CreateIndex
CREATE INDEX "sheet_field_sources_questionCode_idx" ON "sheet_field_sources"("questionCode");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_field_sources_fieldId_questionCode_key" ON "sheet_field_sources"("fieldId", "questionCode");

-- CreateIndex
CREATE UNIQUE INDEX "people_employeeNumber_key" ON "people"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "people_email_key" ON "people"("email");

-- CreateIndex
CREATE INDEX "people_cohort_idx" ON "people"("cohort");

-- CreateIndex
CREATE INDEX "form_responses_personId_idx" ON "form_responses"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "form_responses_importBatchId_responseKey_key" ON "form_responses"("importBatchId", "responseKey");

-- CreateIndex
CREATE UNIQUE INDEX "skill_sheets_personId_key" ON "skill_sheets"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_sheets_currentVersionId_key" ON "skill_sheets"("currentVersionId");

-- CreateIndex
CREATE INDEX "sheet_versions_status_idx" ON "sheet_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_versions_skillSheetId_versionNo_key" ON "sheet_versions"("skillSheetId", "versionNo");

-- CreateIndex
CREATE INDEX "field_values_versionId_idx" ON "field_values"("versionId");

-- CreateIndex
CREATE INDEX "field_values_fieldId_idx" ON "field_values"("fieldId");

-- CreateIndex
CREATE INDEX "field_values_recordId_idx" ON "field_values"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "field_values_versionId_fieldId_recordKey_key" ON "field_values"("versionId", "fieldId", "recordKey");

-- CreateIndex
CREATE INDEX "field_value_history_fieldValueId_createdAt_idx" ON "field_value_history"("fieldValueId", "createdAt");

-- CreateIndex
CREATE INDEX "sheet_records_skillSheetId_kind_idx" ON "sheet_records"("skillSheetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "display_presets_skillSheetId_name_key" ON "display_presets"("skillSheetId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "record_displays_presetId_recordId_key" ON "record_displays"("presetId", "recordId");

-- CreateIndex
CREATE INDEX "glossary_entries_category_idx" ON "glossary_entries"("category");

-- CreateIndex
CREATE UNIQUE INDEX "glossary_entries_category_english_key" ON "glossary_entries"("category", "english");

-- CreateIndex
CREATE INDEX "jlpt_results_personId_idx" ON "jlpt_results"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "jlpt_results_personId_level_examYear_examMonth_key" ON "jlpt_results"("personId", "level", "examYear", "examMonth");

-- CreateIndex
CREATE INDEX "export_history_versionId_createdAt_idx" ON "export_history"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "person_memos_personId_createdAt_idx" ON "person_memos"("personId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_formRevisionId_fkey" FOREIGN KEY ("formRevisionId") REFERENCES "form_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_fields" ADD CONSTRAINT "sheet_fields_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sheet_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_field_sources" ADD CONSTRAINT "sheet_field_sources_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "sheet_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_field_sources" ADD CONSTRAINT "sheet_field_sources_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "form_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_formRevisionId_fkey" FOREIGN KEY ("formRevisionId") REFERENCES "form_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_sheets" ADD CONSTRAINT "skill_sheets_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_sheets" ADD CONSTRAINT "skill_sheets_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "sheet_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_versions" ADD CONSTRAINT "sheet_versions_skillSheetId_fkey" FOREIGN KEY ("skillSheetId") REFERENCES "skill_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_versions" ADD CONSTRAINT "sheet_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_versions" ADD CONSTRAINT "sheet_versions_finalisedById_fkey" FOREIGN KEY ("finalisedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "sheet_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "sheet_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "sheet_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_value_history" ADD CONSTRAINT "field_value_history_fieldValueId_fkey" FOREIGN KEY ("fieldValueId") REFERENCES "field_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_value_history" ADD CONSTRAINT "field_value_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_records" ADD CONSTRAINT "sheet_records_skillSheetId_fkey" FOREIGN KEY ("skillSheetId") REFERENCES "skill_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "display_presets" ADD CONSTRAINT "display_presets_skillSheetId_fkey" FOREIGN KEY ("skillSheetId") REFERENCES "skill_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_displays" ADD CONSTRAINT "record_displays_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "display_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_displays" ADD CONSTRAINT "record_displays_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "sheet_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jlpt_results" ADD CONSTRAINT "jlpt_results_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "sheet_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "display_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_memos" ADD CONSTRAINT "person_memos_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_memos" ADD CONSTRAINT "person_memos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
