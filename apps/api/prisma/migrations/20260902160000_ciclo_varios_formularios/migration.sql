-- UN CICLO, VARIOS FORMULARIOS (Decision #139).
--
-- Hasta aqui un ciclo apuntaba a UN formulario y guardaba UNA copia congelada. Tener el de
-- conductores y el de analistas en la misma campana obligaba a abrir dos ciclos, y eso partia el
-- consolidado en dos. La relacion pasa a tabla propia y la copia congelada se muda con ella.
--
-- La migracion NO pierde nada: cada ciclo existente se convierte en un ciclo con un solo
-- formulario, y sus evaluaciones quedan apuntando a el.
--
-- Tras aplicarla hay que correr `pnpm db:rls`: la tabla nueva tiene tenant_id y la policy se
-- crea recorriendo las tablas que la tienen.

-- 1) La tabla nueva.
CREATE TABLE "performance_cycle_forms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "form_snapshot" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_cycle_forms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "performance_cycle_forms_tenant_id_idx" ON "performance_cycle_forms"("tenant_id");
CREATE UNIQUE INDEX "performance_cycle_forms_cycle_id_form_id_key" ON "performance_cycle_forms"("cycle_id", "form_id");

ALTER TABLE "performance_cycle_forms" ADD CONSTRAINT "performance_cycle_forms_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_cycle_forms" ADD CONSTRAINT "performance_cycle_forms_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "performance_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Cada ciclo que ya existia pasa a ser un ciclo con un formulario, con su copia congelada
--    intacta: lo que se pregunto en una campana cerrada tiene que seguir leyendose igual.
INSERT INTO "performance_cycle_forms" ("id", "tenant_id", "cycle_id", "form_id", "form_snapshot", "display_order")
SELECT gen_random_uuid(), "tenant_id", "id", "form_id", "form_snapshot", 0
FROM "performance_cycles";

-- 3) Cada evaluacion apunta al formulario con el que se respondio. Se anade anulable, se rellena,
--    y solo entonces se exige: al reves, la columna NOT NULL no cabria en una tabla con filas.
ALTER TABLE "performance_reviews" ADD COLUMN "cycle_form_id" UUID;

UPDATE "performance_reviews" r
SET "cycle_form_id" = cf."id"
FROM "performance_cycle_forms" cf
WHERE cf."cycle_id" = r."cycle_id";

-- Si algo quedara sin rellenar, la migracion tiene que morir aqui y no dejar evaluaciones
-- huerfanas de formulario: una evaluacion sin saber que se pregunto no se puede ni leer.
ALTER TABLE "performance_reviews" ALTER COLUMN "cycle_form_id" SET NOT NULL;

ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_form_id_fkey" FOREIGN KEY ("cycle_form_id") REFERENCES "performance_cycle_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Y el ciclo deja de saber de formularios: ahora lo dice la tabla intermedia.
ALTER TABLE "performance_cycles" DROP CONSTRAINT "performance_cycles_form_id_fkey";
ALTER TABLE "performance_cycles" DROP COLUMN "form_id", DROP COLUMN "form_snapshot";
