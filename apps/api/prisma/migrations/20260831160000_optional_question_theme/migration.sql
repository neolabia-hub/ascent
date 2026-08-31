-- EL TEMA DE UNA PREGUNTA PASA A SER OPCIONAL (Decision #84).
--
-- Era obligatorio, y por eso la primera pregunta del producto tenia una ceremonia delante:
-- salirse a otra pestana, crear una "categoria", volver. El tema solo hace falta cuando se
-- quiere un BLOQUE AL AZAR —que saca N preguntas de un tema—; una pregunta escrita a mano
-- para un examen concreto no pertenece a ninguna coleccion y forzarla a una las inventaba.
ALTER TABLE "questions" ALTER COLUMN "category_id" DROP NOT NULL;

-- COMO SE VE EL EXAMEN, configurable desde la evaluacion (Decision #85).
--
-- Va en `assessments` y no en `assessment_versions`: el acento, la transicion y el ritmo no son
-- evidencia. Cambiar un color no cambia que se pregunto ni como se califico, asi que no puede
-- exigir una version nueva ni poner en duda un intento ya rendido.
ALTER TABLE "assessments" ADD COLUMN "presentation" JSONB NOT NULL DEFAULT '{}';
