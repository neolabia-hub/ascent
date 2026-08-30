-- PRESENTACION como tipo propio de contenido y de paquete.
--
-- No es un DOCUMENT: un documento se lee en un visor y lo unico honesto que se registra es que la
-- persona confirmo haberlo leido. Una presentacion se convierte a una imagen por diapositiva y se
-- reproduce con el reproductor del producto, asi que SI se puede medir que diapositiva vio, cuanto
-- tiempo y hasta donde llego. Esa diferencia es la que la vuelve evidencia, y por eso es un tipo
-- aparte y no una variante de DOCUMENT.
--
-- Anadir valores a un enum de Postgres no reescribe ninguna fila ni bloquea la tabla.

-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'PRESENTATION';

-- AlterEnum
ALTER TYPE "PackageKind" ADD VALUE 'PRESENTATION';
