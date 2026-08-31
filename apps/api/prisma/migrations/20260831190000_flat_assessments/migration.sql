-- UNA EVALUACION DEJA DE TENER VERSIONES PROPIAS (Decision #87).
--
-- Tenia su propia escalera (`assessment_versions`), que era una SEGUNDA solucion al mismo problema
-- que la version de la FORMACION ya resolvia. Las dos escaleras no estaban sincronizadas, y de ahi
-- salian cuatro danos —uno capaz de romper el examen en produccion: publicar la v2 ponia la v1 en
-- RETIRED mientras el contenido de la formacion seguia apuntando a la v1, y `attempts.start` exige
-- PUBLISHED—.
--
-- Ahora se hace lo mismo que con las lecciones, que nunca dieron ninguno de esos problemas: la
-- evaluacion se edita libremente y publicar la FORMACION congela una copia.
--
-- QUE PASA CON LO QUE YA HAY. Nada se pierde y nada se borra a ciegas:
--   * cada evaluacion se queda con las reglas de su version VIGENTE (la publicada; si no, la
--     ultima), que es la que estaba gobernando de verdad;
--   * las versiones que NO son la vigente se convierten en evaluaciones propias con estado
--     PUBLISHED —copias congeladas— para que los contenidos y los intentos que les apuntaban
--     sigan apuntando a algo real. Un intento del ano pasado tiene que seguir teniendo detras la
--     evaluacion que se sirvio;
--   * los intentos ya guardan su propio snapshot en `attempt_questions`, asi que el historico de
--     "que se pregunto y que se respondio" no depende de esto en absoluto (Decision #7).

-- ─────────────── 1. Las reglas suben a `assessments` ───────────────

ALTER TABLE "assessments" ADD COLUMN "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "assessments" ADD COLUMN "time_limit_min" INTEGER;
ALTER TABLE "assessments" ADD COLUMN "max_attempts" INTEGER;
ALTER TABLE "assessments" ADD COLUMN "grading_policy" "GradingPolicy" NOT NULL DEFAULT 'HIGHEST';
ALTER TABLE "assessments" ADD COLUMN "passing_score" INTEGER;
ALTER TABLE "assessments" ADD COLUMN "shuffle_questions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assessments" ADD COLUMN "shuffle_options" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "assessments" ADD COLUMN "review_policy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "assessments" ADD COLUMN "source_id" UUID;
ALTER TABLE "assessments" ADD COLUMN "created_by" UUID;
ALTER TABLE "assessments" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- La version VIGENTE de cada evaluacion: la que apunta `current_version_id`; si no hay, la
-- publicada; si tampoco, la de numero mas alto. Es la que estaba gobernando.
CREATE TEMPORARY TABLE _vigente AS
SELECT DISTINCT ON (av.assessment_id)
       av.assessment_id, av.id AS version_id, av.time_limit_min, av.max_attempts,
       av.grading_policy, av.passing_score, av.shuffle_questions, av.shuffle_options,
       av.review_policy, av.status
FROM assessment_versions av
JOIN assessments a ON a.id = av.assessment_id
ORDER BY av.assessment_id,
         (av.id = a.current_version_id) DESC,
         (av.status = 'PUBLISHED') DESC,
         av.version_number DESC;

UPDATE assessments a SET
  time_limit_min    = v.time_limit_min,
  max_attempts      = v.max_attempts,
  grading_policy    = v.grading_policy,
  passing_score     = v.passing_score,
  shuffle_questions = v.shuffle_questions,
  shuffle_options   = v.shuffle_options,
  review_policy     = v.review_policy,
  -- La editable queda en BORRADOR salvo que su version vigente estuviera publicada.
  status            = CASE WHEN v.status = 'PUBLISHED' THEN 'PUBLISHED'::"VersionStatus" ELSE 'DRAFT'::"VersionStatus" END
FROM _vigente v
WHERE v.assessment_id = a.id;

-- ─────────────── 2. Las versiones NO vigentes se vuelven copias congeladas ───────────────
-- Asi, lo que les apuntaba sigue apuntando a algo real en vez de quedarse huerfano.

CREATE TEMPORARY TABLE _copia AS
SELECT av.id AS version_id, gen_random_uuid() AS nueva_id
FROM assessment_versions av
WHERE av.id NOT IN (SELECT version_id FROM _vigente);

INSERT INTO assessments (
  id, tenant_id, title, status, time_limit_min, max_attempts, grading_policy, passing_score,
  shuffle_questions, shuffle_options, review_policy, presentation, source_id, created_at, updated_at
)
SELECT c.nueva_id, av.tenant_id,
       a.title || ' (v' || av.version_number || ')',
       'PUBLISHED'::"VersionStatus",
       av.time_limit_min, av.max_attempts, av.grading_policy, av.passing_score,
       av.shuffle_questions, av.shuffle_options, av.review_policy, a.presentation,
       a.id, av.created_at, CURRENT_TIMESTAMP
FROM _copia c
JOIN assessment_versions av ON av.id = c.version_id
JOIN assessments a ON a.id = av.assessment_id;

-- Un mapa de version -> evaluacion, para repuntar todo lo demas de una sola vez.
CREATE TEMPORARY TABLE _mapa AS
SELECT version_id, assessment_id AS destino FROM _vigente
UNION ALL
SELECT version_id, nueva_id AS destino FROM _copia;

-- ─────────────── 3. Secciones ───────────────

ALTER TABLE "assessment_sections" ADD COLUMN "assessment_id" UUID;
UPDATE assessment_sections s SET assessment_id = m.destino
FROM _mapa m WHERE m.version_id = s.assessment_version_id;
DELETE FROM assessment_sections WHERE assessment_id IS NULL;
ALTER TABLE "assessment_sections" ALTER COLUMN "assessment_id" SET NOT NULL;

ALTER TABLE "assessment_sections" DROP CONSTRAINT IF EXISTS "assessment_sections_assessment_version_id_fkey";
DROP INDEX IF EXISTS "assessment_sections_assessment_version_id_display_order_idx";
ALTER TABLE "assessment_sections" DROP COLUMN "assessment_version_id";
CREATE INDEX "assessment_sections_assessment_id_display_order_idx"
  ON "assessment_sections"("assessment_id", "display_order");
ALTER TABLE "assessment_sections"
  ADD CONSTRAINT "assessment_sections_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────── 4. Contenidos de la formacion ───────────────

ALTER TABLE "activity_contents" ADD COLUMN "assessment_id" UUID;
UPDATE activity_contents c SET assessment_id = m.destino
FROM _mapa m WHERE m.version_id = c.assessment_version_id;

ALTER TABLE "activity_contents" DROP CONSTRAINT IF EXISTS "activity_contents_assessment_version_id_fkey";
ALTER TABLE "activity_contents" DROP COLUMN "assessment_version_id";
ALTER TABLE "activity_contents"
  ADD CONSTRAINT "activity_contents_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────── 5. Intentos ───────────────

ALTER TABLE "attempts" ADD COLUMN "assessment_id" UUID;
UPDATE attempts t SET assessment_id = m.destino
FROM _mapa m WHERE m.version_id = t.assessment_version_id;
DELETE FROM attempts WHERE assessment_id IS NULL;
ALTER TABLE "attempts" ALTER COLUMN "assessment_id" SET NOT NULL;

ALTER TABLE "attempts" DROP CONSTRAINT IF EXISTS "attempts_assessment_version_id_fkey";
DROP INDEX IF EXISTS "attempts_enrollment_id_assessment_version_id_attempt_number_key";
ALTER TABLE "attempts" DROP COLUMN "assessment_version_id";
CREATE UNIQUE INDEX "attempts_enrollment_id_assessment_id_attempt_number_key"
  ON "attempts"("enrollment_id", "assessment_id", "attempt_number");
ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────── 6. Fuera la escalera vieja ───────────────

ALTER TABLE "assessments" DROP CONSTRAINT IF EXISTS "assessments_current_version_id_fkey";
DROP INDEX IF EXISTS "assessments_current_version_id_key";
ALTER TABLE "assessments" DROP COLUMN "current_version_id";
DROP TABLE "assessment_versions";

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "assessments_tenant_id_status_updated_at_idx"
  ON "assessments"("tenant_id", "status", "updated_at");
CREATE INDEX "assessments_source_id_idx" ON "assessments"("source_id");

-- Las copias congeladas heredan la politica de aislamiento como cualquier otra fila: la tabla ya
-- la tiene. No hace falta tocar RLS.
