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
-- IDEMPOTENTE DESDE EL 2026-09-09. La migracion `20260902010000_area_un_solo_responsable` corre
-- ANTES que esta —01:00 frente a 12:00— y necesita la columna, asi que la crea ella si falta. Aqui
-- se acepta encontrarla hecha en vez de reventar: el resultado es el mismo por los dos caminos, y
-- asi ninguna base —la de desarrollo, la del piloto o la del proximo cliente— depende de en que
-- orden le tocaron las cosas.
ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "responsible_user_id" UUID;

-- Postgres no tiene `ADD CONSTRAINT IF NOT EXISTS`, de ahi el bloque.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_responsible_user_id_fkey') THEN
    ALTER TABLE "areas"
      ADD CONSTRAINT "areas_responsible_user_id_fkey"
      FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "areas_responsible_user_id_idx" ON "areas"("responsible_user_id");
