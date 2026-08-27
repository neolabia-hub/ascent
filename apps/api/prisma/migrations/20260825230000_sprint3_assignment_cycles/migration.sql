-- Sprint 3 — rondas de obligacion (motor de requisitos).

-- Ancla de la recurrencia: "cada 12 meses DESDE QUE la persona la completo". Sin este dato la
-- ronda siguiente tendria que anclarse al vencimiento, lo que castiga a quien se adelanta.
-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- Barrido de vencimientos del cron (status + fecha por tenant).
-- CreateIndex
CREATE INDEX "assignments_tenant_id_status_due_at_idx" ON "assignments"("tenant_id", "status", "due_at");

-- Idempotencia del motor: una obligacion por requisito, persona y ronda. Las asignaciones
-- manuales y las del plan llevan rule_id NULL y no entran en la restriccion (en Postgres los
-- NULL no colisionan), que es justo lo que se quiere: esas se controlan en el servicio.
-- CreateIndex
CREATE UNIQUE INDEX "assignments_rule_id_user_id_cycle_number_key" ON "assignments"("rule_id", "user_id", "cycle_number");
