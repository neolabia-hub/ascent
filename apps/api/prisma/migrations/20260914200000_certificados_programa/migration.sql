-- CONSTANCIA DE PROGRAMA (2026-09-14, Decision del 2026-09-14): la evidencia de un programa
-- completo es UNA constancia para el conjunto, no una por modulo (PENDIENTES 11.2).
--
-- Espejo exacto de `enrollment_id` (migracion `20260901220000_certificados`) y por la misma razon:
-- UNA constancia por `PathEnrollment`, garantizado por la base de datos y no por el codigo. El
-- completado de un programa se reevalua cada vez que se cierra uno de sus modulos, asi que el
-- mismo riesgo de doble emision por carrera existe aqui.
ALTER TABLE "certificates" ADD COLUMN "path_enrollment_id" UUID;

-- PARCIAL por la misma razon que la de enrollment_id: hay constancias sin PathEnrollment (las
-- individuales y las otorgadas por trayectoria).
CREATE UNIQUE INDEX "certificates_path_enrollment_unique"
  ON "certificates"("tenant_id", "path_enrollment_id")
  WHERE "path_enrollment_id" IS NOT NULL;
