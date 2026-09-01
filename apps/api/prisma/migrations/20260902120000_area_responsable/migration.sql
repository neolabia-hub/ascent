-- QUIEN RESPONDE POR CADA AREA (Decision #115).
--
-- ─── DE DONDE SALE ESTA NECESIDAD ───
--
-- La encuesta de EFICACIA la responde el JEFE de la persona, semanas despues de la formacion: es
-- lo unico que mide si lo aprendido se aplica en el puesto (nivel 3 de Kirkpatrick). Y al llegar
-- ahi apareció el vacio: **el sistema no sabe quien es el jefe de nadie**.
--
-- Lo que habia:
--   `users.area_id`        a que area pertenece cada persona. No dice quien la dirige.
--   `processes.responsible_user_id`  quien responde por un proceso. Es el dueno del PROCESO, no
--                                    el jefe de la persona.
--
-- ─── POR QUE EL AREA Y NO UN "JEFE INMEDIATO" EN CADA PERSONA ───
--
-- Un campo `boss_user_id` en `users` seria mas exacto y hay que llenarlo **seiscientas veces**, y
-- mantenerlo con cada traslado. Lo que no se mantiene queda viejo en silencio, y una encuesta de
-- eficacia enviada al jefe equivocado es peor que no enviarla: la responde alguien que no vio a
-- esa persona trabajar.
--
-- El area son **diez filas**. Se llena una vez, se revisa de un vistazo, y en una empresa de
-- transporte el jefe de area ES el jefe directo de casi todo el mundo. Cuando haga falta mas
-- precision —una estructura matricial de verdad— se anade el campo por persona y este pasa a ser
-- el respaldo. Empezar por lo que se puede mantener.
--
-- ─── ES NULABLE, Y ESO TIENE CONSECUENCIA ───
--
-- Un area sin responsable no rompe nada: simplemente esa gente no recibe encuesta de eficacia, y
-- se ve en la pantalla de areas. Es mejor que inventar un evaluador —el coordinador de SST, por
-- ejemplo— que acabaria evaluando a seiscientas personas que no ha visto trabajar.
ALTER TABLE "areas" ADD COLUMN "responsible_user_id" UUID;

ALTER TABLE "areas"
  ADD CONSTRAINT "areas_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Se busca "las areas que dirige esta persona" al dar de baja a alguien y al listar evaluadores.
CREATE INDEX "areas_responsible_user_id_idx" ON "areas"("responsible_user_id");
