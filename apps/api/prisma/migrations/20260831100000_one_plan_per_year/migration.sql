-- UN PLAN POR ANO (Decision #71).
--
-- La clave era (tenant, ano, NOMBRE), asi que "Plan 2026", "Plan anual 2026" y "Plan SST 2026"
-- convivian como planes distintos, cada uno con su aprobacion, sus proyectados congelados y su
-- propio porcentaje de cumplimiento. El auditor pregunta por el plan de 2026 y encontraba tres
-- respuestas sin forma de saber cual es la buena. Y los planes SST/PESV/BASC no son planes: son
-- la vista por proceso del mismo plan anual, que ya existe en la pantalla (CLAUDE.md 3.10).
--
-- NO DEDUPLICA NADA a proposito. Si en una base quedan dos planes del mismo ano, esta migracion
-- FALLA y hay que decidir a mano cual sobrevive: borrar el plan del ano de alguien —con sus
-- renglones y las obligaciones de su gente— no es algo que deba pasar dentro de un despliegue.
DROP INDEX "training_plans_tenant_id_year_name_key";

CREATE UNIQUE INDEX "training_plans_tenant_id_year_key" ON "training_plans"("tenant_id", "year");

-- CANCELAR UN RENGLON RETIRA SUS OBLIGACIONES.
--
-- Hasta ahora cancelar un renglon solo lo sacaba del indicador: las obligaciones que habia creado
-- seguian vivas en la bandeja de la gente, venciendo el ultimo dia de un mes cuya jornada ya no
-- se iba a dictar. Se RETIRAN, no se borran, porque a esas personas se les anuncio la formacion y
-- el aviso sigue en su bandeja: sin la traza no hay forma de explicarles que paso.
ALTER TYPE "AssignmentStatus" ADD VALUE 'WITHDRAWN_PLAN_ITEM_CANCELLED';

-- LA META DEL PLAN, DE TEXTO A NUMERO.
--
-- `goals` era texto libre y por eso no se podia comparar contra nada: el plan ensenaba "62% de
-- cumplimiento" y el lector no tenia forma de saber si eso estaba bien. La meta es el porcentaje
-- que la empresa se compromete a alcanzar, y con ella el indicador puede decir si se llega o no.
--
-- Se DROPEA en vez de conservarse porque no habia ni una fila con contenido y porque dejar un
-- campo de texto llamado "metas" al lado de una meta numerica es exactamente la duplicidad que
-- este proyecto ya pago cara: dos sitios donde escribir lo mismo acaban discrepando.
ALTER TABLE "training_plans" DROP COLUMN "goals";

ALTER TABLE "training_plans" ADD COLUMN "goal_pct" INTEGER;
