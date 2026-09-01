-- LA CASCADA DE LA CONSTANCIA (Decision #111).
--
-- La columna nacio como BOOLEAN NOT NULL DEFAULT false, y eso estaba mal: obligaba a marcar la
-- casilla formacion por formacion, y lo que se olvida no existe. Con doscientas formaciones, la
-- mitad acabaria sin constancia por descuido, y el descuido se descubre el dia de la auditoria.
--
-- Pasa a NULLABLE con TRES estados, que es la misma cascada que ya gobierna la nota minima, los
-- intentos y el minimo de video visto (Decision #27):
--
--   NULL   hereda del TIPO (`activity_types.config.issuesCertificate`). Es el caso normal.
--   true   esta formacion SI, aunque su tipo diga que no.
--   false  esta formacion NO, aunque su tipo diga que si.
--
-- POR QUE EL TIPO ES EL SITIO CORRECTO: la respuesta no es por formacion, es por CLASE de
-- formacion. Una pildora de tres minutos no acredita nada —emitir un papel por ella devalua el
-- papel y llena el expediente de ruido—, mientras una induccion o una capacitacion del plan
-- acreditan siempre porque son justo lo que el auditor pide. Eso no cambia entre las doscientas
-- formaciones de una empresa: cambia entre sus seis tipos.
--
-- Y LA DESVIACION HACE FALTA en los dos sentidos: una charla de diez minutos marcada como
-- extraordinaria no merece papel, y una pildora que resulta ser el refuerzo anual de alturas si.

ALTER TABLE "activities" ALTER COLUMN "issues_certificate" DROP NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "issues_certificate" DROP DEFAULT;

-- Lo ya creado pasa a "hereda del tipo": es lo que habria pasado si la columna hubiera nacido
-- bien. Ninguna formacion existente tenia la casilla marcada a mano —se creo hace una hora—, asi
-- que no se pierde ninguna decision de nadie.
UPDATE "activities" SET "issues_certificate" = NULL;

-- En la VERSION se queda NOT NULL a proposito: ahi ya no hay herencia que resolver. El snapshot
-- guarda el resultado de la cascada, no la pregunta.
