-- LAS TRES VIAS DE EVIDENCIA (Decision #157).
--
-- Hasta aqui una ejecucion solo se podia cerrar de UNA forma: la persona entrando a la plataforma
-- y completando el contenido. En una empresa bajo SG-SST la mayor parte del plan anual se dicta en
-- salon —charlas de seguridad vial, brigadas, lo que trae la ARL— y de eso no queda contenido que
-- completar: queda una LISTA DE ASISTENCIA firmada. Sin esto, todo lo dictado presencialmente
-- contaba como incumplido, y el indicador de cumplimiento —que es la razon de ser del producto—
-- enseñaba cero de todo lo que de verdad se hizo.
--
--   A. En plataforma      contenido + examen                -> ya existia
--   B. Lista de asistencia jornada presencial, la dicte quien la dicte
--   C. Papel de un tercero certificado de un organismo acreditado
--
-- Nada que rellenar: todas las columnas son opcionales y lo ya cerrado por la via A no cambia.

-- B. La asistencia, por persona.
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "attended_at" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "attendance_by" UUID;

-- B. El acta firmada: UNA por jornada, no una por persona.
ALTER TABLE "offerings" ADD COLUMN IF NOT EXISTS "attendance_sheet_key" TEXT;

-- C. El papel del tercero: UNO por persona, cada quien con su numero.
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "ext_cert_issuer" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "ext_cert_number" TEXT;
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "ext_cert_issued_at" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "ext_cert_valid_until" TIMESTAMP(3);
ALTER TABLE "enrollments" ADD COLUMN IF NOT EXISTS "ext_cert_file_key" TEXT;

-- C. Y lo que el motor necesita leer sin ir hasta la inscripcion: hasta cuando vale de verdad.
-- La regla general (Decision #111) sigue siendo que la vigencia sale de la recurrencia; esto es la
-- excepcion del papel de un tercero, donde la fecha no la pone la empresa sino quien lo expidio.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "valid_until_override" TIMESTAMP(3);

-- Lo que se vence, mirando hacia adelante: es la consulta del informe de Vencimientos.
CREATE INDEX IF NOT EXISTS "assignments_tenant_valid_until_override_idx"
  ON "assignments" ("tenant_id", "valid_until_override");
