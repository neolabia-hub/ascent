-- COMPETENCIAS COMUNES + DEL CARGO, EN DOS CAPAS (Decision #141).
--
-- Un formulario puede heredar las competencias de otro: uno se marca como base —las
-- organizacionales de la empresa— y los de cargo anaden las suyas. Sin esto, las comunes hay que
-- repetirlas dentro de cada formulario de cargo, y con cuarenta cargos cambiar una obliga a editar
-- cuarenta formularios.
--
-- Anulable y sin valor por defecto: los formularios que existen no heredan de nadie y siguen
-- funcionando exactamente igual. No hay nada que rellenar.
--
-- ON DELETE SET NULL y no CASCADE: borrar la plantilla comun no puede llevarse por delante los
-- formularios de cargo. Se quedan con lo suyo, que es lo peor que puede pasar y aun asi es
-- recuperable.
ALTER TABLE "performance_forms" ADD COLUMN "base_form_id" UUID;

ALTER TABLE "performance_forms"
  ADD CONSTRAINT "performance_forms_base_form_id_fkey"
  FOREIGN KEY ("base_form_id") REFERENCES "performance_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un formulario no puede heredar de si mismo. La cadena de mas de un nivel la corta el servicio
-- (solo se ofrecen como base los que no heredan de nadie); esto para lo que ninguna interfaz debe
-- poder crear jamas.
ALTER TABLE "performance_forms"
  ADD CONSTRAINT "performance_forms_base_no_es_si_mismo" CHECK ("base_form_id" IS NULL OR "base_form_id" <> "id");
