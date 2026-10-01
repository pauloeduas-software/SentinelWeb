-- CreateEnum
CREATE TYPE "CustomFieldElement" AS ENUM ('TEXT', 'TEXTAREA', 'LISTBOX', 'CHECKBOX', 'RADIO', 'DATE');

-- CreateEnum
CREATE TYPE "CustomFieldFormat" AS ENUM ('ANY', 'NUMERIC', 'ALPHA', 'ALPHANUMERIC', 'EMAIL', 'URL', 'IP', 'IPV4', 'IPV6', 'MAC', 'DATE', 'BOOLEAN', 'REGEX');

-- AlterTable
ALTER TABLE "asset_models" ADD COLUMN     "customFieldsetId" UUID;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "customFieldsetId" UUID;

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "element" "CustomFieldElement" NOT NULL DEFAULT 'TEXT',
    "format" "CustomFieldFormat" NOT NULL DEFAULT 'ANY',
    "regexPattern" TEXT,
    "listValues" TEXT[],
    "helpText" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "showInListView" BOOLEAN NOT NULL DEFAULT false,
    "displayInUserView" BOOLEAN NOT NULL DEFAULT false,
    "showInEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fieldsets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_fieldsets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fieldset_fields" (
    "fieldsetId" UUID NOT NULL,
    "fieldId" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_fieldset_fields_pkey" PRIMARY KEY ("fieldsetId","fieldId")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_slug_key" ON "custom_fields"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fieldsets_name_key" ON "custom_fieldsets"("name");

-- CreateIndex
CREATE INDEX "custom_fieldset_fields_fieldId_idx" ON "custom_fieldset_fields"("fieldId");

-- CreateIndex
CREATE INDEX "asset_models_customFieldsetId_idx" ON "asset_models"("customFieldsetId");

-- CreateIndex
CREATE INDEX "assets_customFields_idx" ON "assets" USING GIN ("customFields" jsonb_ops);

-- CreateIndex
CREATE INDEX "categories_customFieldsetId_idx" ON "categories"("customFieldsetId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_customFieldsetId_fkey" FOREIGN KEY ("customFieldsetId") REFERENCES "custom_fieldsets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_customFieldsetId_fkey" FOREIGN KEY ("customFieldsetId") REFERENCES "custom_fieldsets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fieldset_fields" ADD CONSTRAINT "custom_fieldset_fields_fieldsetId_fkey" FOREIGN KEY ("fieldsetId") REFERENCES "custom_fieldsets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fieldset_fields" ADD CONSTRAINT "custom_fieldset_fields_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

