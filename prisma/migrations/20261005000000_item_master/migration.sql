-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('TEXT', 'PARAGRAPH', 'RADIO', 'LIST', 'CHECKBOX', 'DATE', 'GRID', 'NUMBER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'REPLACED');

-- CreateEnum
CREATE TYPE "QuestionSetStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ResponseSource" AS ENUM ('APP', 'IMPORT');

-- DropForeignKey
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_formRevisionId_fkey";

-- AlterTable
ALTER TABLE "import_batches" ADD COLUMN     "questionSetId" TEXT,
ALTER COLUMN "formRevisionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "item_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_subcategories" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRepeating" BOOLEAN NOT NULL DEFAULT false,
    "maxEntries" INTEGER NOT NULL DEFAULT 10,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleJa" TEXT NOT NULL,
    "titleEn" TEXT,
    "helpJa" TEXT,
    "helpEn" TEXT,
    "exampleJa" TEXT,
    "exampleEn" TEXT,
    "type" "ItemType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowOther" BOOLEAN NOT NULL DEFAULT false,
    "gridRows" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gridColumns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validation" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_group_types" (
    "itemId" TEXT NOT NULL,
    "groupTypeId" TEXT NOT NULL,

    CONSTRAINT "item_group_types_pkey" PRIMARY KEY ("itemId","groupTypeId")
);

-- CreateTable
CREATE TABLE "question_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupTypeId" TEXT NOT NULL,
    "status" "QuestionSetStatus" NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sourceFile" TEXT,
    "copiedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_set_subcategories" (
    "setId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "showIf" JSONB,

    CONSTRAINT "question_set_subcategories_pkey" PRIMARY KEY ("setId","subcategoryId")
);

-- CreateTable
CREATE TABLE "question_set_items" (
    "setId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "showIf" JSONB,
    "formCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "formHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "question_set_items_pkey" PRIMARY KEY ("setId","itemId")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "personId" TEXT,
    "status" "ResponseStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ResponseSource" NOT NULL DEFAULT 'APP',
    "importBatchId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "entry" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_categories_key_key" ON "item_categories"("key");

-- CreateIndex
CREATE INDEX "item_categories_order_idx" ON "item_categories"("order");

-- CreateIndex
CREATE UNIQUE INDEX "item_subcategories_key_key" ON "item_subcategories"("key");

-- CreateIndex
CREATE INDEX "item_subcategories_categoryId_order_idx" ON "item_subcategories"("categoryId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "items_key_key" ON "items"("key");

-- CreateIndex
CREATE INDEX "items_subcategoryId_order_idx" ON "items"("subcategoryId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "group_types_key_key" ON "group_types"("key");

-- CreateIndex
CREATE INDEX "question_set_items_setId_order_idx" ON "question_set_items"("setId", "order");

-- CreateIndex
CREATE INDEX "responses_personId_createdAt_idx" ON "responses"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "responses_setId_idx" ON "responses"("setId");

-- CreateIndex
CREATE INDEX "answers_itemId_idx" ON "answers"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_responseId_itemId_entry_key" ON "answers"("responseId", "itemId", "entry");

-- AddForeignKey
ALTER TABLE "item_subcategories" ADD CONSTRAINT "item_subcategories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "item_subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_group_types" ADD CONSTRAINT "item_group_types_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_group_types" ADD CONSTRAINT "item_group_types_groupTypeId_fkey" FOREIGN KEY ("groupTypeId") REFERENCES "group_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_groupTypeId_fkey" FOREIGN KEY ("groupTypeId") REFERENCES "group_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "question_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_subcategories" ADD CONSTRAINT "question_set_subcategories_setId_fkey" FOREIGN KEY ("setId") REFERENCES "question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_subcategories" ADD CONSTRAINT "question_set_subcategories_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "item_subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_setId_fkey" FOREIGN KEY ("setId") REFERENCES "question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_setId_fkey" FOREIGN KEY ("setId") REFERENCES "question_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_formRevisionId_fkey" FOREIGN KEY ("formRevisionId") REFERENCES "form_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "question_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

