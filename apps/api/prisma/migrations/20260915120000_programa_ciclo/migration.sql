ALTER TABLE "path_enrollments" ADD COLUMN "cycle_number" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "path_enrollments_path_id_user_id_key";

CREATE UNIQUE INDEX "path_enrollments_path_id_user_id_cycle_number_key"
  ON "path_enrollments"("path_id", "user_id", "cycle_number");

CREATE INDEX "path_enrollments_tenant_id_path_id_user_id_idx"
  ON "path_enrollments"("tenant_id", "path_id", "user_id");
