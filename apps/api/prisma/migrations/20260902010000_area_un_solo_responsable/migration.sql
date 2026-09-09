-- UN SOLO CAMPO PARA "EL JEFE DEL AREA" (Decision #135).
--
-- Habia dos columnas que significaban lo mismo, `manager_user_id` y `responsible_user_id`, y cada
-- funcion leia una distinta: el aviso de "alguien reprobo" miraba la primera y la evaluacion de
-- eficacia la segunda. Ninguna de las dos se podia rellenar desde la interfaz, asi que las dos
-- llevaban desde el Sprint 5 apuntando a un vacio — y no habia error que lo delatara, porque no
-- falla nada cuando simplemente no hay a quien avisar.
--
-- Se escribe a mano y no con `migrate dev` por una razon: borrar una columna sin mas PERDERIA lo que
-- alguien hubiera guardado ahi. Primero se copia, despues se borra.

-- 0) LA COLUMNA SE ASEGURA AQUI (2026-09-09, lo destapo el primer despliegue real).
--
--    Esta migracion USA `areas.responsible_user_id` y la que la CREA —`20260902120000_area_responsable`—
--    lleva una marca de tiempo POSTERIOR: 01:00 frente a 12:00. Prisma aplica por orden de nombre,
--    asi que sobre una base recien creada esta corria primero y moria con
--    `column "responsible_user_id" does not exist`.
--
--    En desarrollo no se vio nunca porque alli la columna ya existia: la base habia crecido a trozos
--    y el orden real de aplicacion no fue el del nombre. **Una cadena de migraciones solo esta
--    probada cuando se corre desde CERO**, y eso no pasa hasta el primer despliegue — que es el peor
--    momento para enterarse.
--
--    Se arregla sin renombrar ni reordenar, que romperia el historial ya aplicado: las dos se
--    vuelven idempotentes. Esta crea la columna si falta; la otra ya no falla si se la encuentra.
--    El resultado final es identico por los dos caminos.
ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "responsible_user_id" UUID;

-- 1) Lo que hubiera en la columna vieja se conserva. `IS NULL` para no pisar un responsable ya
--    asignado: si los dos tienen valor, manda el que las funciones nuevas ya usan.
UPDATE "areas"
SET "responsible_user_id" = "manager_user_id"
WHERE "responsible_user_id" IS NULL
  AND "manager_user_id" IS NOT NULL;

-- 2) Y ahora si. `IF EXISTS` porque una base creada despues de este cambio no tendra la columna.
ALTER TABLE "areas" DROP COLUMN IF EXISTS "manager_user_id";
