-- QUIEN RESPONDIA por la version cuando se publico (Decision #64).
--
-- El responsable ya se copiaba POR VALOR del proceso a la actividad al crearla, asi que cambiar
-- el responsable de SARLAFT no reescribia las capacitaciones existentes. Faltaba el otro nivel:
-- la VERSION publicada no guardaba nada, de modo que editar la actividad cambiaba en silencio
-- quien figuraba como responsable de la v1 publicada en marzo — y esa version es evidencia.
--
-- Se rellena al publicar. Las versiones ya publicadas se quedan en NULL: no se puede inventar un
-- dato historico que nadie registro, y la lectura cae al responsable vigente de la actividad
-- diciendo que es el actual.
ALTER TABLE "activity_versions" ADD COLUMN "responsible_user_id" UUID;

ALTER TABLE "activity_versions"
  ADD CONSTRAINT "activity_versions_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
