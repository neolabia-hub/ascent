-- MAS TIPOS DE PREGUNTA (Decision #86).
--
-- Lo pidio el cliente asi: *"debe tener buena variedad de preguntas, que sea mas de lo normal que
-- simplemente opciones, como la que usan en lecciones de completar huecos"*. Y tenia razon por
-- una razon que va mas alla de la variedad: con solo opcion multiple, media formacion de SST se
-- pregunta mal. Un bloqueo LOTO es una SECUENCIA, y preguntarla con cuatro opciones regala la
-- respuesta; "a cuantos metros es obligatorio el arnes" con las opciones a la vista se acierta
-- descartando; y una senal de transito se reconoce, no se elige de una lista.
--
-- Los cuatro se corrigen SOLOS y ninguno necesita subir archivos. Senalar sobre una imagen queda
-- para despues: arrastra la subida de la foto y las zonas en coordenadas relativas.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'FILL_BLANK';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'ORDER';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'MATCH';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'NUMERIC';
