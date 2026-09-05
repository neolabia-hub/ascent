-- LA ASISTENCIA SE MUEVE A LA TABLA QUE YA EXISTIA PARA ELLA.
--
-- La migracion anterior (20260905120000) le puso `attended_at` y `attendance_by` a `enrollments`
-- sin ver que **`attendance_records` ya estaba en el esquema desde el Sprint 5** —con los tres
-- estados (PRESENT/ABSENT/JUSTIFIED), el metodo (INSTRUCTOR/QR/SIGNATURE), la justificacion, la
-- firma y quien la marco— y vacia porque nadie la escribia. Y al lado, `session_acts` para el acta.
--
-- Dos casas para el mismo hecho es el problema que este proyecto ya conoce por el otro lado: el
-- informe de Vencimientos leyendo `certification_grants`, que tampoco escribia nadie. Se corrige
-- ahora, con la tabla vacia, y no cuando haya un ano de asistencias repartidas entre dos sitios.
--
-- Lo que se queda en `enrollments` es lo que SI es suyo: los datos del certificado del tercero, que
-- pertenecen a la ejecucion de esa persona y no a la sesion.
ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "attended_at";
ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "attendance_by";

-- Lo que se busca de verdad: "la asistencia de esta jornada" y "las de esta persona".
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_offering_idx"
  ON "attendance_records" ("tenant_id", "offering_id");
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_user_idx"
  ON "attendance_records" ("tenant_id", "user_id");
