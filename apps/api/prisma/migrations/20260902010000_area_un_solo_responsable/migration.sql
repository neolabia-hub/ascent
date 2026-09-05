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

-- 1) Lo que hubiera en la columna vieja se conserva. `IS NULL` para no pisar un responsable ya
--    asignado: si los dos tienen valor, manda el que las funciones nuevas ya usan.
UPDATE "areas"
SET "responsible_user_id" = "manager_user_id"
WHERE "responsible_user_id" IS NULL
  AND "manager_user_id" IS NOT NULL;

-- 2) Y ahora si. `IF EXISTS` porque una base creada despues de este cambio no tendra la columna.
ALTER TABLE "areas" DROP COLUMN IF EXISTS "manager_user_id";
