-- DESDOBLAR «COMO SE ACREDITA» EN DOS PREGUNTAS (PENDIENTES 2.7)
--
-- `closes_by_attendance` respondia a la vez QUE ACREDITA y SI SE TOMA LISTA. Pegadas asi, elegir
-- una descartaba la otra, y no cabia el caso que pidio el cliente: una formacion con evaluacion que
-- se acredita por contenido y AUN ASI toma lista —QR, firma o acta— como constancia de que la
-- persona estuvo. Tampoco cabia «asistio Y aprobo», que es lo que pide un auditor en una presencial
-- con examen.
--
-- Pasa a ser:
--   completion_requirement  ATTENDANCE | CONTENT | BOTH   (NULL = lo que diga la modalidad)
--   takes_attendance        boolean                        (NULL = se toma si la lista acredita)
--
-- ─── LA TRADUCCION NO CAMBIA EL SIGNIFICADO DE NINGUNA JORNADA YA DICTADA ───
--
--   true  -> ATTENDANCE   cerraba con la lista, y sigue cerrando con la lista
--   false -> CONTENT      cerraba con el contenido, y sigue cerrando con el contenido
--   NULL  -> NULL         seguia el defecto de su modalidad, y lo sigue siguiendo
--
-- Es total y sin perdida: no hay ningun valor de la columna vieja que no tenga destino exacto. Y
-- `takes_attendance` nace NULL en todas, que se resuelve a «se toma lista si la lista acredita» —
-- exactamente lo que hacia el sistema antes de esto.
--
-- Idempotente, como manda el RUNBOOK: se prueba desde una base VACIA antes de subirla.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompletionRequirement') THEN
    CREATE TYPE "CompletionRequirement" AS ENUM ('ATTENDANCE', 'CONTENT', 'BOTH');
  END IF;
END
$$;

ALTER TABLE "offerings" ADD COLUMN IF NOT EXISTS "completion_requirement" "CompletionRequirement";
ALTER TABLE "offerings" ADD COLUMN IF NOT EXISTS "takes_attendance" BOOLEAN;

-- El traspaso solo corre si la columna vieja todavia existe (y solo sobre filas sin traducir).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offerings' AND column_name = 'closes_by_attendance'
  ) THEN
    UPDATE "offerings"
       SET "completion_requirement" = CASE WHEN "closes_by_attendance" THEN 'ATTENDANCE'::"CompletionRequirement"
                                           ELSE 'CONTENT'::"CompletionRequirement" END
     WHERE "closes_by_attendance" IS NOT NULL
       AND "completion_requirement" IS NULL;

    ALTER TABLE "offerings" DROP COLUMN "closes_by_attendance";
  END IF;
END
$$;
