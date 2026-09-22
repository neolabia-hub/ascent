-- EL TRASPASO ENTRE QUIEN HACE LA FORMACION Y QUIEN LA APRUEBA
--
-- El analista ya podia crear sin publicar —esa compuerta existe desde el principio— pero no habia
-- forma de decir «termine, revisalo». El administrador tenia que adivinar que mirar y cuando, y al
-- aprobar el plan estaria aprobando a ciegas formaciones que nunca reviso.
--
-- Esto NO es una compuerta nueva: publicar sigue exigiendo `catalog:publish`. Es el traspaso, que
-- es otra cosa y es la que faltaba.
--
-- `review_status` es un sub-estado de DRAFT. Nace en SIN_ENVIAR para TODAS las versiones que ya
-- existen —incluidas las publicadas y las retiradas, donde no significa nada y no se lee— porque
-- es exactamente lo que eran hasta hoy: borradores en los que alguien trabajaba, sin traspaso.
-- Ninguna version cambia de comportamiento.
--
-- Solo AÑADE columnas con defecto: no toca una sola fila de datos y se puede aplicar con el
-- sistema arriba. Idempotente, como manda el RUNBOOK.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewStatus') THEN
    CREATE TYPE "ReviewStatus" AS ENUM ('SIN_ENVIAR', 'EN_REVISION', 'APROBADA', 'DEVUELTA');
  END IF;
END
$$;

ALTER TABLE "activity_versions"
  ADD COLUMN IF NOT EXISTS "review_status" "ReviewStatus" NOT NULL DEFAULT 'SIN_ENVIAR',
  ADD COLUMN IF NOT EXISTS "submitted_by" UUID,
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by" UUID,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "review_note" TEXT;

-- Lo que consulta la bandeja del administrador: «que hay esperando revision», por tenant.
CREATE INDEX IF NOT EXISTS "activity_versions_tenant_review_idx"
  ON "activity_versions" ("tenant_id", "review_status");
