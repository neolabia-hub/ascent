-- CreateIndex
CREATE INDEX "activities_tenant_id_active_updated_at_idx" ON "activities"("tenant_id", "active", "updated_at");

-- CreateIndex
CREATE INDEX "activities_tenant_id_activity_type_id_idx" ON "activities"("tenant_id", "activity_type_id");

-- CreateIndex
CREATE INDEX "activities_tenant_id_process_id_idx" ON "activities"("tenant_id", "process_id");

-- CreateIndex
CREATE INDEX "activity_contents_activity_version_id_display_order_idx" ON "activity_contents"("activity_version_id", "display_order");

-- CreateIndex
CREATE INDEX "activity_versions_activity_id_status_idx" ON "activity_versions"("activity_id", "status");

-- CreateIndex
CREATE INDEX "assessment_sections_assessment_version_id_display_order_idx" ON "assessment_sections"("assessment_version_id", "display_order");

-- CreateIndex
CREATE INDEX "assessment_versions_assessment_id_status_idx" ON "assessment_versions"("assessment_id", "status");

-- CreateIndex
CREATE INDEX "attempt_questions_attempt_id_display_order_idx" ON "attempt_questions"("attempt_id", "display_order");

-- CreateIndex
CREATE INDEX "attempts_enrollment_id_attempt_number_idx" ON "attempts"("enrollment_id", "attempt_number");

-- CreateIndex
CREATE INDEX "certificates_tenant_id_user_id_issued_at_idx" ON "certificates"("tenant_id", "user_id", "issued_at");

-- CreateIndex
CREATE INDEX "certification_grants_tenant_id_user_id_status_idx" ON "certification_grants"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "certification_grants_tenant_id_valid_until_idx" ON "certification_grants"("tenant_id", "valid_until");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_user_id_status_idx" ON "enrollments"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_offering_id_status_idx" ON "enrollments"("offering_id", "status");

-- CreateIndex
CREATE INDEX "lesson_cards_lesson_id_display_order_idx" ON "lesson_cards"("lesson_id", "display_order");

-- CreateIndex
CREATE INDEX "lessons_tenant_id_status_updated_at_idx" ON "lessons"("tenant_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "offerings_tenant_id_status_scheduled_date_idx" ON "offerings"("tenant_id", "status", "scheduled_date");

-- CreateIndex
CREATE INDEX "offerings_activity_version_id_idx" ON "offerings"("activity_version_id");

-- CreateIndex
CREATE INDEX "question_versions_question_id_version_number_idx" ON "question_versions"("question_id", "version_number");

-- CreateIndex
CREATE INDEX "questions_tenant_id_category_id_active_idx" ON "questions"("tenant_id", "category_id", "active");

-- CreateIndex
CREATE INDEX "users_tenant_id_active_full_name_idx" ON "users"("tenant_id", "active", "full_name");

-- CreateIndex
CREATE INDEX "users_tenant_id_area_id_idx" ON "users"("tenant_id", "area_id");
