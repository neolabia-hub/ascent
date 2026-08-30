-- La pieza de contenido puede llevar una DESCRIPCION propia.
--
-- Hasta ahora una parte de la formacion solo tenia titulo, y el reproductor no podia decir de que
-- va el video que alguien esta a punto de ver: la unica descripcion del modelo era la de la
-- ACTIVIDAD entera, que es otra cosa. Quien entra a la parte 4 de 7 no quiere saber de que va la
-- induccion: quiere saber de que va ESTA parte.
--
-- Va como columna y no dentro de `config` a proposito: `config` guarda AJUSTES (minimo de
-- reproduccion, segundos minimos, url externa) y esto es CONTENIDO editorial que la persona lee.
-- Mezclarlos haria que el dia que haya que buscar texto, exportarlo o limitarlo, haya que hurgar
-- dentro de un JSON.
--
-- Nullable: las formaciones que ya existen siguen siendo validas sin descripcion, y la pantalla
-- no muestra un hueco cuando falta.

-- AlterTable
ALTER TABLE "activity_contents" ADD COLUMN "description" TEXT;
