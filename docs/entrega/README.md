# La entrega a TRANSPRENSA

Todo lo que se le manda al cliente el día que se le entrega la plataforma, y con qué se genera.

**Empezar por [`00-antes-de-enviar.md`](00-antes-de-enviar.md).** Son doce comprobaciones y las seis
primeras bloquean: hay datos de prueba en producción, un buzón de soporte que no atiende nadie y dos
credenciales que hay que rotar. Ninguna de esas tres se arregla después de haber enviado el correo.

---

## Qué hay aquí

| Archivo | Qué es | Formatos |
|---|---|---|
| [`bienvenida.html`](bienvenida.html) | **La pieza principal.** Los accesos, qué resuelve la plataforma, la evidencia que cubre cada norma, el plan de los primeros treinta días y las guías. Pensada para verse en pantalla | `.html` `.pdf` |
| [`acta-de-entrega.html`](acta-de-entrega.html) | El documento formal, para firma. Alcance, verificaciones, exclusiones, obligaciones de cada parte, soporte y datos personales | `.html` `.docx` `.pdf` |
| [`anexo-tecnico.html`](anexo-tecnico.html) | Ficha técnica y de servicio: dónde vive, cómo está protegido, copias, retención, requisitos y cumplimiento normativo | `.html` `.docx` `.pdf` |
| [`correo-entrega.html`](correo-entrega.html) | El correo de entrega, listo para guardar como plantilla de Gmail | `.html` |
| [`correo-credenciales.html`](correo-credenciales.html) | El correo de las credenciales. **Va aparte del anterior**, y no es manía: un correo se reenvía entero y el reenvío no pregunta. El de entrega está hecho para que circule; este no debe circular | `.html` |
| [`00-antes-de-enviar.md`](00-antes-de-enviar.md) | Lo que hay que cerrar antes de enviar | — |

Y **fuera del repositorio**, en `C:\Users\Prueba\Documents\ASCENT - ENTREGA TRANSPRENSA\`:

| Archivo | Qué es |
|---|---|
| `ficha-de-acceso.html` | Las credenciales de administración, qué pasa en el primer ingreso y cómo se dan accesos al resto |

> **Está fuera a propósito, no por desorden.** Lleva una contraseña dentro, y una credencial que
> llega a un repositorio ya no se arregla borrando el commit: hay que rotarla, porque alguien pudo
> indexarla. Es la misma regla que sigue `ASCENT - CREDENCIALES Y ACCESOS.md`.

---

## Cómo se generan los formatos

```powershell
.\scripts\convertir.ps1                       # los tres oficiales, a .docx y .pdf
.\scripts\convertir.ps1 -SoloPdf              # solo los PDF
.\scripts\convertir.ps1 -Archivos ".\docs\entrega\bienvenida.html" -SoloPdf
```

**Ni Word ni LibreOffice.** El camino evidente era abrir el HTML con Word por COM y hacer «guardar
como»; en esta máquina Word **abre** los archivos pero no puede **guardarlos** —falla igual con un
documento en blanco, que es lo que hace un Office sin licencia activa— y LibreOffice no está
instalado. Así que:

- El **`.docx`** lo escribe [`scripts/html-a-docx.mjs`](../../scripts/html-a-docx.mjs): genera el
  OOXML a mano, sin ninguna dependencia. Corre igual en cualquier máquina y en integración continua.
- El **`.pdf`** lo imprime **Chrome sin ventana**, que respeta el diseño de verdad —Fraunces
  incluida—, así que sale mejor de lo que habría salido pasando por Word.

---

## Cómo se sube el correo a Gmail

Gmail no es un navegador: al pegar tira el `<style>` de la cabecera y no carga tipografías web. Por
eso `correo-entrega.html` está escrito con tablas y todo el CSS en línea, y por eso **se copia
renderizado, no como código**:

1. Abrir `correo-entrega.html` **en Chrome**.
2. `Ctrl+A`, `Ctrl+C`.
3. Gmail → **Redactar** → `Ctrl+V`.
4. Rellenar los huecos amarillos **y quitarles el resaltado**.
5. **⋮** (abajo a la derecha) → **Plantillas** → **Guardar borrador como plantilla**.

Asunto sugerido — el primero es el que mejor funciona, porque dice lo que pasó y no lo que
queremos que sienta:

- `TRANSPRENSA: su plataforma de formación ya está en línea`
- `Entrega de la plataforma de formación — accesos y primeros pasos`
- `Ascent para TRANSPRENSA: acceso, documentación y arranque`

**El correo no lleva ninguna imagen, a propósito.** Gmail las bloquea hasta que el destinatario pulsa
«mostrar imágenes», y un correo de entrega que llega roto la primera vez ya no se arregla. Todo lo
que se ve son bloques de color y texto.

---

## El orden de la entrega

1. Cerrar las seis bloqueantes de [`00-antes-de-enviar.md`](00-antes-de-enviar.md).
2. Rellenar los huecos y regenerar los formatos.
3. **Enviar el correo** con `bienvenida.pdf`, `acta-de-entrega.pdf`, `acta-de-entrega.docx`,
   `anexo-tecnico.pdf` y las guías.
4. **Por el canal aparte** —WhatsApp o llamada—, la ficha de acceso y la contraseña temporal.
5. **La sesión de arranque**, de una hora: entrar juntos, dejar la marca configurada y cargar las
   primeras personas en vivo. Es lo que convierte una entrega en una puesta en marcha.
6. Cuando vuelva el acta firmada, guardarla aquí.

---

## Sobre el diseño

Estos documentos **no** usan la identidad de las guías (Manrope e Inter sobre gris frío), y no es
capricho. Una guía se consulta muchas veces; una entrega se lee una vez, con alguien mirando por
encima del hombro. Así que:

- **Índigo `#1E0958`** — el color que la propia empresa tiene configurado como principal en su
  plataforma. No es un color nuestro: es el suyo.
- **Papel crema `#F7F5F2`** en vez de gris. Un documento, no una pantalla.
- **Serif de display (Fraunces)** — lo que separa un acta de un informe interno.
- **Los anillos concéntricos** de la portada son los mismos de la pantalla de ingreso: en este
  producto significan *algo avanza*. No es un adorno importado.

Los tokens llevan los nombres del sistema de diseño de la aplicación a propósito.

---

## Lo siguiente: que esto viva dentro de Ascent

`bienvenida.html` está escrita para convertirse en un **módulo dentro del producto** —una pantalla de
bienvenida y documentación que el cliente abra desde su propia plataforma, sin buscar un correo de
hace seis meses—. Por eso está en HTML y no en Word: se pasa a `apps/web` como una vista más.

Lo que habría que hacer:

- Una ruta en el grupo de administración (`/bienvenida` o dentro de *Ayuda*).
- Cambiar los colores literales por los tokens del tenant, que ya existen: la banda de portada saldría
  con el color de **cada** empresa, no con el de TRANSPRENSA.
- Los datos fijos —dirección, fecha de puesta en producción, contacto de soporte— salen del tenant en
  vez de estar escritos.
- Las guías, enlazadas desde ahí, y ya se acabó el «¿dónde estaba el manual?».

Y desde ese momento la entrega del **segundo** cliente cuesta una tarde: cambiar los datos de la
portada y volver a correr `convertir.ps1`.

### Y después, el asistente

La idea de poner ahí dentro un asistente que responda dudas **encaja justo con este orden, y no al
revés**: primero el módulo de documentación, después el asistente encima.

El motivo es que un asistente de soporte necesita algo que leer, y ese algo son estas páginas más
las guías. Hacerlo al contrario —el asistente primero, contra el código o contra nada— da respuestas
que suenan bien y no son ciertas, que en un producto que va a auditoría es peor que no responder.

> Hay un compromiso ya escrito que depende de esto: el acta promete **asistente automático 24/7**
> fuera del horario de atención. Ver `00-antes-de-enviar.md` §2 bis antes de firmar.
