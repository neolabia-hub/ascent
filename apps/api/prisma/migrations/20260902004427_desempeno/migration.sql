-- CreateEnum
CREATE TYPE "PerformanceScale" AS ENUM ('ONE_TO_FIVE', 'ONE_TO_TEN', 'YES_NO', 'TEXT_ONLY');

-- CreateEnum
CREATE TYPE "PerformanceCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PerformanceReviewerRole" AS ENUM ('SELF', 'MANAGER');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED');

-- DropForeignKey
-- IF EXISTS: en una base nueva esta restriccion no existe y sin el la migracion muere aqui.
ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_category_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "areas_responsible_user_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "certificates_verification_code_idx";

-- AlterTable
ALTER TABLE "platform_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "performance_competencies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scale" "PerformanceScale" NOT NULL DEFAULT 'ONE_TO_FIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "suggested_activity_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_forms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_form_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "performance_form_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_form_job_titles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,

    CONSTRAINT "performance_form_job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_cycles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "form_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "PerformanceCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "self_evaluation" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_employee" BOOLEAN NOT NULL DEFAULT true,
    "requires_signature" BOOLEAN NOT NULL DEFAULT true,
    "form_snapshot" JSONB,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "evaluator_user_id" UUID NOT NULL,
    "reviewer_role" "PerformanceReviewerRole" NOT NULL,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'PENDING',
    "score" DECIMAL(4,2),
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "signed_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_answers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "competency_name" TEXT NOT NULL,
    "value" INTEGER,
    "comment" TEXT,

    CONSTRAINT "performance_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_competencies_tenant_id_active_idx" ON "performance_competencies"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "performance_competencies_tenant_id_code_key" ON "performance_competencies"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "performance_forms_tenant_id_active_idx" ON "performance_forms"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "performance_form_items_tenant_id_idx" ON "performance_form_items"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_form_items_form_id_competency_id_key" ON "performance_form_items"("form_id", "competency_id");

-- CreateIndex
CREATE INDEX "performance_form_job_titles_tenant_id_idx" ON "performance_form_job_titles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_form_job_titles_form_id_job_title_id_key" ON "performance_form_job_titles"("form_id", "job_title_id");

-- CreateIndex
CREATE INDEX "performance_cycles_tenant_id_status_idx" ON "performance_cycles"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_tenant_id_evaluator_user_id_status_idx" ON "performance_reviews"("tenant_id", "evaluator_user_id", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_tenant_id_subject_user_id_idx" ON "performance_reviews"("tenant_id", "subject_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_cycle_id_subject_user_id_reviewer_role_key" ON "performance_reviews"("cycle_id", "subject_user_id", "reviewer_role");

-- CreateIndex
CREATE INDEX "performance_answers_tenant_id_idx" ON "performance_answers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "performance_answers_review_id_competency_id_key" ON "performance_answers"("review_id", "competency_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "question_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_competencies" ADD CONSTRAINT "performance_competencies_suggested_activity_id_fkey" FOREIGN KEY ("suggested_activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_form_items" ADD CONSTRAINT "performance_form_items_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "performance_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_form_items" ADD CONSTRAINT "performance_form_items_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "performance_competencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_form_job_titles" ADD CONSTRAINT "performance_form_job_titles_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "performance_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_form_job_titles" ADD CONSTRAINT "performance_form_job_titles_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_cycles" ADD CONSTRAINT "performance_cycles_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "performance_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_answers" ADD CONSTRAINT "performance_answers_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
