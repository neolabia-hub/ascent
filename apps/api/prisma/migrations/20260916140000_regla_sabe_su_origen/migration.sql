-- DE DONDE SALIO UNA REGLA DE ASIGNACION (2026-09-16).
--
-- NULL = la declaro alguien sobre la FORMACION (pestaña Quienes, matriz por cargo, o el motor al
-- publicar un tipo que se exige solo). Con valor = la creo el boton "Asignar programa" de ese
-- programa.
--
-- HOY NO SE LEE EN NINGUN SITIO y no cambia ningun comportamiento. Se anade ahora porque es el
-- unico dato de este asunto que **no se puede reconstruir mirando atras**: sin el, una regla creada
-- por un programa y una creada a mano son la misma fila, para siempre. Cada dia que pasa sin esta
-- columna es un dia de reglas a ciegas.
--
-- Es lo que hace falta para poder preguntar algun dia "¿que modulos me exige EL PROGRAMA?", que es
-- lo que hoy bloquea tres cosas a la vez: compleccion por persona (tronco comun + rama por cargo),
-- suprimir la constancia individual por persona sin duplicar papeles, y que el informe sepa a quien
-- le aplica de verdad un programa.
--
-- ON DELETE SET NULL: borrar el programa no puede dejar a nadie sin la formacion que ya se le
-- exigia. Se pierde el rastro del origen, que es lo secundario.
ALTER TABLE "assignment_rules" ADD COLUMN "source_path_id" UUID;

ALTER TABLE "assignment_rules"
  ADD CONSTRAINT "assignment_rules_source_path_id_fkey"
  FOREIGN KEY ("source_path_id") REFERENCES "learning_paths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Para la consulta que este dato existe para permitir: "las reglas de este programa".
CREATE INDEX "assignment_rules_source_path_id_idx" ON "assignment_rules"("source_path_id");
