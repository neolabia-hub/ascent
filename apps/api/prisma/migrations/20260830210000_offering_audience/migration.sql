-- LA TAJADA DE LA JORNADA (Decision #68).
--
-- `offerings.audience_id` dice a QUE PARTE de los obligados atiende esta convocatoria. NULL =
-- atiende a todos, que es el comportamiento de siempre y por eso la columna es opcional y no
-- necesita relleno.
--
-- Sin esto, dos jornadas de la misma formacion proyectan a los mismos obligados y el plan los
-- SUMA: 40 obligados repartidos en dos jornadas salian como 80 proyectados, y la cobertura no
-- podia pasar del 50% aunque se capacitara a todo el mundo.
ALTER TABLE "offerings" ADD COLUMN "audience_id" UUID;

ALTER TABLE "offerings" ADD CONSTRAINT "offerings_audience_id_fkey"
  FOREIGN KEY ("audience_id") REFERENCES "audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "offerings_audience_id_idx" ON "offerings"("audience_id");

-- DERIVA PREVIA, que esta migracion aprovecha para cerrar:
--
-- 1. `processes.responsible_user_id` declaraba la relacion en el esquema y la base no tenia la
--    clave foranea, asi que nada impedia dejar ahi el id de una persona borrada.
ALTER TABLE "processes" ADD CONSTRAINT "processes_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. El indice de (tenant, servicio) lo creo a mano la migracion `user_service` y nunca se
--    declaro en el esquema. Ya esta declarado; aqui solo se renombra al nombre que Prisma espera,
--    porque si no, la proxima migracion generada lo habria BORRADO sin que nadie lo notara.
ALTER INDEX "users_tenant_service_idx" RENAME TO "users_tenant_id_service_id_idx";
