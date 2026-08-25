# Sprint 2 — Catalogo formativo

**Fecha:** 2026-08-25 · **Commit:** `5d98b99` (+ cierre posterior) · **Estado:** terminado y verificado

## 1. Objetivo

Construir **el contenido**: que un administrador arme una actividad formativa con lecciones,
video y evaluacion, la publique, y que lo publicado quede congelado para siempre.

**Criterio de aceptacion (el que define el sprint):** crear la Induccion General con leccion y
evaluacion, publicarla, y comprobar que **editarla crea una version 2 sin tocar la version 1**.

**Fuera de alcance a proposito:** asignar la formacion a las personas y que alguien la realice
(Sprints 3 y 4). Aqui se construye el contenido, no su entrega.

## 2. El problema que resuelve el versionado

Un auditor pregunta: *"esta persona aprobo esta induccion en marzo. Muestreme exactamente que
contenido vio y que examen presento."*

Si el contenido fuera editable, esa pregunta no tiene respuesta. Peor: si alguien sube la nota
minima de 70 a 80, los aprobados con 75 quedarian reprobados retroactivamente.

Por eso el sprint gira alrededor de una regla: **lo publicado es inmutable**.

### Como funciona

```
Version 1 (borrador)          -> se edita libremente
      |
      | PUBLICAR
      v
Version 1 (publicada)         -> CONGELADA:
                                 - las lecciones se copian a copias inmutables
                                 - se congela el temario y la nota minima
                                 - toda edicion se rechaza
      |
      | "editar" (en realidad: crear la siguiente)
      v
Version 2 (borrador)          -> copia editable; la version 1 NO se toca
```

Al publicar tambien se decide **que pasa con quienes ya estan inscritos**: los que no han
empezado pasan a la nueva (opcion por defecto), los que van a mitad terminan en la anterior, o
reinician. En cualquier caso, **quienes ya completaron conservan su registro intacto**.

## 3. Que se construyo

### Catalogo formativo
Actividades con su tipo, proceso, modalidad y alcance (normas, servicios, regionales, cargos).
Cada actividad guarda sus versiones; cada version, sus contenidos ordenables: leccion, video,
documento, evaluacion, encuesta, enlace o paquete SCORM.

Publicar valida **antes** de congelar: rechaza versiones vacias, contenidos sin material
asignado, y evaluaciones que pidan mas preguntas de las que existen.

### Lecciones en tarjetas
La unidad de contenido del producto: una leccion es una pila de tarjetas de menos de cinco
minutos. Seis tipos: texto con imagen, video corto, quiz de refuerzo, tarjeta de dos caras,
encuesta rapida y completar la palabra faltante.

El editor muestra una **vista previa de celular permanente**, porque la mayoria del personal
operativo va a ver esto en el telefono. Si un video pasa de 90 segundos, avisa: la investigacion
muestra que la atencion se agota ahi.

### Banco de preguntas y evaluaciones
- Las preguntas se **versionan**: editar una crea la version siguiente, y los intentos ya
  realizados conservan la que respondieron. (Moodle, en cambio, obliga a borrar los intentos para
  poder corregir un enunciado; aqui eso nunca hace falta.)
- Los examenes toman **N preguntas al azar** de una categoria y barajan las opciones, de modo que
  dos personas no ven el mismo examen y no sirve pasarse la hoja de respuestas.

### Almacenamiento de archivos
Con adaptador: disco en desarrollo, Cloudflare R2 en produccion (elegido por su egress cero; ver
`03-infraestructura-produccion.md`). La validacion es por **firma binaria del archivo**, no por
su extension ni por lo que declare el navegador: un ejecutable renombrado a `.png` se rechaza.

## 4. Decisiones tomadas

| Decision | Por que |
|---|---|
| **Al publicar se clonan las lecciones** | Es lo unico que garantiza de verdad la inmutabilidad. Si la version publicada apuntara a la leccion viva, editarla cambiaria el pasado |
| **La respuesta correcta vive en un solo modulo** | `question-payload.ts` es el unico lugar que sabe donde esta. `toLearnerView()` es la unica via de servir una pregunta y elimina la respuesta y la retroalimentacion por opcion. Hay una prueba que falla si alguien la filtra |
| **Los examenes son aleatorios por defecto** | Un examen fijo se memoriza y se comparte. La aleatoriedad es lo que hace que la nota signifique algo |
| **SCORM queda preparado, no implementado** | Es un formato viejo, pesado y hostil al movil, util solo para reutilizar cursos comprados. Implementar su motor son semanas de trampas. La estructura ya lo soporta; se cablea si el cliente confirma que tiene contenido en ese formato |
| **Validacion por firma binaria** | La extension y el tipo declarado los controla el atacante |

## 5. Como se verifico

- **Prueba del criterio de aceptacion, por HTTP y en navegador:** se creo la actividad con
  leccion, video y examen aleatorio; se publico; se comprobo que la version publicada rechaza
  toda edicion; que la leccion quedo congelada e inmutable; que la version 2 nacio con copias
  editables; y **que tras editar la version 2, la leccion de la version 1 conserva sus 4
  tarjetas originales**. Esa ultima comprobacion es el sprint entero en una linea.
- **18 pruebas unitarias**, incluidas las de seguridad: que la vista del aprendiz nunca expone la
  respuesta correcta ni la retroalimentacion que la delata, y que la validacion por firma
  binaria rechaza ejecutables, scripts y archivos vacios.
- **7 pruebas de extremo a extremo** en navegador (las 5 del Sprint 1 mas 2 nuevas), en verde.
- Lint, typecheck y build en verde.

## 6. Cierre de un hueco detectado al auditar

Al revisar el estado antes del Sprint 3 se encontro que **aprobar una solicitud no aplicaba el
cambio**: el registro de "quien sabe ejecutar cada tipo de solicitud" existia pero ningun modulo
se habia registrado. El analista pedia, el administrador aprobaba, y no pasaba nada. Ademas, al
intentar publicar recibia un error de permisos seco, sin ofrecerle el camino correcto.

Se corrigio:
- Publicar ahora **decide segun el permiso**: quien puede publicar, publica; quien no, genera una
  solicitud con justificacion, y la interfaz lo dice con claridad ("Enviar a aprobacion").
- Al aprobar, el sistema **publica de verdad**. Si la publicacion falla, la solicitud NO queda
  aprobada: nunca hay un "aprobado" que en realidad no ocurrio.

Verificado de punta a punta: el analista arma la version, pide publicacion (la version sigue en
borrador), el administrador ve la solicitud, la aprueba, **la version queda publicada y la
leccion congelada**, y el analista recibe su notificacion.

Tambien se cablo **Sentry** (reporte de errores), que estaba previsto desde el Sprint 1.

## 7. Pendiente

| Pendiente | Criticidad | Cuando |
|---|---|---|
| Adaptador de Cloudflare R2 | Media | Sprint de despliegue. Lanza un error explicito a proposito, para que sea imposible desplegar sin completarlo |
| Cache de permisos y colas en Redis | Media | Cuando el volumen lo pida; hoy el despachador de correo usa tareas programadas en proceso |
| Generar la especificacion de la API desde los contratos Zod | Baja | Util al integrar terceros |
| Confirmar con el cliente si usa contenido SCORM | Abierta | Define si el motor se implementa |
