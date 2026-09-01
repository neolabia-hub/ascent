-- LA EFICACIA SE DECIDE POR FORMACION, NO POR TIPO (Decision #118).
--
-- ─── LO QUE DESTAPO EL CLIENTE ───
--
-- *"En el plan puede haber situaciones donde no se requiere y en otras si; pero si el plan la
-- tiene marcada aplicara a todos."* Exacto, y por eso el tipo NO es el sitio correcto para esta.
--
-- ─── POR QUE LA SATISFACCION SI VA POR TIPO Y LA EFICACIA NO ───
--
-- La satisfaccion pregunta *"¿estuvo bien esta capacitacion?"*. Eso se quiere saber SIEMPRE, de
-- todo lo que se dicte, y por eso el criterio es de la clase: todas las del plan la llevan.
--
-- La eficacia pregunta *"¿cambio como trabaja esta persona?"*. Y eso depende de la NATURALEZA de
-- la formacion concreta, no de su clase. Dentro del mismo tipo "Capacitacion del plan" conviven:
--
--   Trabajo seguro en alturas   -> la eficacia importa: o usa el arnes como le ensenaron, o no.
--   Actualizacion documental    -> preguntarle al jefe a los 30 dias si "aplica" no significa nada.
--
-- Marcarla en el tipo mandaria las dos, y la segunda es ruido: un jefe que recibe cuarenta
-- encuestas al mes las responde en fila, y eso convierte el indicador de transferencia en una
-- columna de "si" que no midio nada. La eficacia solo vale si son pocas y se piensan.
--
-- ─── MISMA FORMA QUE LA CONSTANCIA ───
--
-- Tres estados y cascada, igual que `issues_certificate` (Decision #111): asi el producto tiene UN
-- patron para "esto lo decide el tipo salvo que la formacion diga otra cosa" y no dos.
--
--   NULL   hereda del tipo. Por defecto el tipo dira que no, que es lo sano.
--   true   esta formacion SI mide eficacia.
--   false  esta formacion NO, aunque su tipo diga que si.

ALTER TABLE "activities" ADD COLUMN "requires_efficacy" BOOLEAN;

-- El SNAPSHOT: lo que rige el intento. Si viviera solo en la actividad, desmarcarla manana dejaria
-- sin explicacion las encuestas de eficacia ya programadas y respondidas.
ALTER TABLE "activity_versions" ADD COLUMN "requires_efficacy" BOOLEAN NOT NULL DEFAULT false;
