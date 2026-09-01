-- LA PLANTILLA DE CONSTANCIA DEJA DE SER HTML (Decision #112).
--
-- ─── LO QUE HABIA PLANEADO Y POR QUE NO SE SOSTIENE ───
--
-- `html_template` venia del Sprint 0: el cliente disenaria su constancia escribiendo HTML y el
-- servidor lo renderizaria. Tres problemas, y el tercero es el que decide:
--
--   1. Un coordinador de SST no escribe HTML. Cuando el cliente dice "nosotros lo disenamos"
--      quiere decir que tiene un arte hecho en Canva o Illustrator. Con la plantilla en HTML, quien
--      acabaria disenando la constancia seriamos nosotros cada vez que pidan mover un logo.
--   2. Renderizar HTML a PDF exige Chromium headless: ~300 MB y lento en el servidor de 1 vCPU.
--   3. HTML ajeno ejecutado por nuestro servidor es superficie de ataque. Un
--      `<img src="http://169.254.169.254/...">` dentro de la plantilla es una peticion hecha DESDE
--      DENTRO, con acceso a la red interna. Sanearlo es trabajo que no le aporta nada al cliente.
--
-- ─── LO QUE SE HACE EN SU LUGAR ───
--
-- El cliente sube su ARTE como imagen (lo que ya tiene hecho) y las FIRMAS como PNG con fondo
-- transparente. Nosotros colocamos encima los campos variables. Sin Chromium, sin HTML ajeno, y el
-- dia que quieran cambiar el diseno suben otra imagen sin que nadie toque codigo.
--
-- `html_template` SE ELIMINA en vez de quedarse sin usar. La regla de no borrar columnas protege
-- DATOS; aqui no hay ninguno —cero plantillas creadas— y dejar una columna NOT NULL muerta obliga
-- a rellenarla con basura en cada alta.

ALTER TABLE "certificate_templates" DROP COLUMN "html_template";

-- EL ARTE. Nulo mientras no lo suban: la plantilla se crea, se le pone nombre y despues se sube el
-- fondo. Sin fondo no se puede activar (lo comprueba el servicio), pero si guardar a medias.
ALTER TABLE "certificate_templates" ADD COLUMN "background_key" TEXT;

-- ORIENTACION de la hoja. Casi todas las constancias son horizontales, pero no todas.
ALTER TABLE "certificate_templates" ADD COLUMN "landscape" BOOLEAN NOT NULL DEFAULT true;

-- DONDE VA CADA CAMPO. Coordenadas en PORCENTAJE de la hoja, no en milimetros ni en pixeles:
-- el arte que suba el cliente puede venir a cualquier resolucion —una imagen de 1000 px o de
-- 4000— y en porcentaje la posicion sigue siendo la misma. Ademas es lo que la pantalla de
-- colocacion maneja de forma natural al arrastrar.
--
-- Origen ARRIBA-IZQUIERDA, como la pantalla. El PDF cuenta desde abajo y la conversion se hace al
-- dibujar: hacerla al reves obligaria a quien coloca los campos a pensar al reves.
ALTER TABLE "certificate_templates" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '{}';
