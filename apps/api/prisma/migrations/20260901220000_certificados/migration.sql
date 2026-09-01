-- CERTIFICADOS: la evidencia que se lleva el auditor (Sprint 5, Decision #110).
--
-- Las tablas ya existian desde el Sprint 0 (`certificates`, `certificate_templates`), sembradas y
-- sin usar. Lo que faltaba era decir QUE FORMACIONES los emiten, y eso no puede ser una casilla
-- suelta en la actividad: tiene que viajar en el SNAPSHOT de la version publicada.
--
-- POR QUE EN LA VERSION Y NO SOLO EN LA ACTIVIDAD. Si viviera solo en la actividad, desmarcar la
-- casilla manana cambiaria el pasado: dejaria de poder explicarse por que hay veinte constancias
-- emitidas de algo que "no emite constancias". La regla del proyecto (Decision #27) es que la
-- version publicada congela lo que regia el intento, y esto rige el intento.
--
-- LAS HORAS TAMBIEN VIAJAN. Es el dato que el auditor suma —"¿cuantas horas de capacitacion en
-- alturas tiene esta persona?"— y el que aparece impreso en el papel. Cambiar la duracion de una
-- formacion no puede reescribir las horas de las constancias ya entregadas.

-- La casilla EDITABLE, en la actividad. Se resuelve al publicar y se copia a la version.
ALTER TABLE "activities" ADD COLUMN "issues_certificate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activities" ADD COLUMN "certificate_hours" INTEGER;

-- El SNAPSHOT, en la version. Lo que de verdad manda al emitir.
ALTER TABLE "activity_versions" ADD COLUMN "issues_certificate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "activity_versions" ADD COLUMN "certificate_hours" INTEGER;

-- UNA CONSTANCIA POR EJECUCION, garantizado por la base de datos y no por el codigo.
--
-- La emision se dispara al completar, y completar se puede evaluar mas de una vez —el reproductor
-- reintenta, dos pestanas terminan a la vez, un reenvio offline llega tarde—. Sin esta restriccion
-- bastaba una carrera para que la misma persona acabara con dos constancias de la misma formacion,
-- con dos numeros de serie distintos, y ninguna forma de saber cual es la buena.
--
-- Es PARCIAL (`WHERE enrollment_id IS NOT NULL`) porque hay constancias que no nacen de una
-- ejecucion: las de una certificacion otorgada por trayectoria (`grant_id`), donde no hay
-- inscripcion que las ate.
CREATE UNIQUE INDEX "certificates_enrollment_unique"
  ON "certificates"("tenant_id", "enrollment_id")
  WHERE "enrollment_id" IS NOT NULL;

-- Se busca por codigo en la pantalla publica de verificacion; es la consulta mas caliente del
-- endpoint abierto a internet.
CREATE INDEX IF NOT EXISTS "certificates_verification_code_idx" ON "certificates"("verification_code");
