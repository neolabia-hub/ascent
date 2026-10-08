-- Una inscripcion POR RONDA, no una por convocatoria (2026-10-06).
--
-- Con una convocatoria permanente, la segunda vez de una formacion que se repite caia en la
-- inscripcion del año anterior, ya terminada, y no se podia volver a cursar. Cada ronda abre ahora
-- su propia fila en la misma convocatoria; la anterior queda intacta como evidencia.
--
-- Solo estructura: las inscripciones que existen quedan en la ronda 1, que es lo que son. No se
-- toca ningun dato de parametrizacion.
ALTER TABLE "enrollments" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "enrollments_offering_id_user_id_key";
CREATE UNIQUE INDEX "enrollments_offering_id_user_id_round_key" ON "enrollments"("offering_id", "user_id", "round");
