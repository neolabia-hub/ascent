-- CONVALIDAR: QUIEN LLEGA YA CERTIFICADO DE OTRO EMPLEO (`PENDIENTES` 2.3).
--
-- ─── EL CASO ───
--
-- Se contrata a alguien que ya trae su certificado de alturas del empleo anterior, vigente hasta
-- 2027. Le nace la obligacion por su cargo y hoy NO HAY POR DONDE decir "ya esta certificada": se
-- queda pendiente para siempre, o alguien inventa una jornada para poder cerrarla — que es peor,
-- porque mete en el plan una jornada que nadie dicto.
--
-- Es la VIA C del modelo (Decision #157), la unica de las tres que no tenia donde vivir.
--
-- ─── POR QUE EN LA OBLIGACION Y NO EN UNA INSCRIPCION ───
--
-- Porque no hay inscripcion: `enrollments.offering_id` es OBLIGATORIO y aqui no hubo jornada. Se
-- miro tambien `certification_grants`, que parecia el sitio, y exige `source_enrollment_id`: el
-- mismo problema. La OBLIGACION es la unica fila que existe sin jornada — y ademas es la que el
-- auditor ya rastrea y la que el motor lee para saber cuando vuelve a deberse.
--
-- ─── POR QUE COLUMNAS PROPIAS Y NO `waived_reason` ───
--
-- Porque CONVALIDAR NO ES EXIMIR, y confundirlos falsea el expediente. `WAIVED` le dice al auditor
-- "la dejamos pasar"; convalidar dice "la hizo, en otro sitio, y aqui esta el papel". La segunda es
-- cumplimiento y la primera es una excepcion: meterlas en la misma columna obligaria a leer un texto
-- libre para saber cual de las dos fue, y ningun informe puede hacer eso.
--
-- Por eso la obligacion convalidada queda COMPLETED —porque lo esta— con su papel al lado, y no
-- WAIVED.
--
-- ─── LO QUE NO HACE FALTA AÑADIR ───
--
-- `valid_until_override` ya existe y ya significa "hasta cuando vale de verdad, cuando lo dice un
-- papel" (Decision #157). Un papel de otro empleo es exactamente eso, asi que se reutiliza: la
-- vigencia sigue viviendo en un solo sitio y el motor no tiene que aprender un caso nuevo.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "ext_cert_issuer" TEXT;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "ext_cert_number" TEXT;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "ext_cert_file_key" TEXT;

-- QUIEN LO ACEPTO Y POR QUE. Aceptar el papel de otra empresa es un juicio sobre un documento
-- —¿lo expidio un organismo acreditado? ¿sigue vigente? ¿cubre lo mismo?— y esa decision tiene
-- nombre y fecha, como todo lo que en este producto sustituye a una evidencia propia.
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "convalidated_by" UUID;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "convalidated_reason" TEXT;

-- Para el informe de Vencimientos: pregunta por las obligaciones convalidadas de un tenant.
CREATE INDEX IF NOT EXISTS "assignments_convalidadas_idx" ON "assignments" ("tenant_id", "ext_cert_number");
