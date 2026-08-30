-- Fecha de nacimiento de la persona.
--
-- Opcional a proposito: hay empresas que no la piden al vincular, y una columna obligatoria
-- bloquearia la carga masiva de un cliente entero por un dato que no usa todavia.
ALTER TABLE "users" ADD COLUMN "birth_date" DATE;
