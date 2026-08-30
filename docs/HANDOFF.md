# NEO PULSE — HANDOFF (diario de sesiones)

Lo que se hizo cada dia, que quedo abierto y por que. **Se ANEXA por arriba**: la sesion mas
reciente primero, para que abrir el archivo responda de una la pregunta que uno se hace al
sentarse — "¿en que iba esto?".

Que va en cada documento, para no duplicar:

| Documento | Responde |
|---|---|
| **Este** | En que iba, que quedo a medias y con que continuar |
| `docs/RUNBOOK.md` | Como se opera y que se aprendio rompiendo algo. Solo se anade |
| `docs/arquitectura.md` | Como funciona el sistema HOY. Se corrige |
| `docs/glosario.md` | Que significa cada palabra del negocio |
| `docs/sprints/` | Historia por sprint. Envejece a proposito |
| `CLAUDE.md` | El modelo completo y las decisiones irreversibles |

Regla: si algo de aqui deja de ser cierto, no se corrige — se escribe la sesion siguiente. Esto es
un diario, no una referencia.

---

## 2026-08-29 (noche) — Cinco sesiones confirmadas, y el plan que ya se puede tirar

### Lo primero: el trabajo tiene puntos de retorno

Los **118 archivos sin confirmar** de cinco sesiones estan en **nueve commits tematicos** (entorno,
esquema, convocatorias, presentacion, reproductor, alcance, plan, audiencias, personas, docs), cada
uno revisable y reversible por separado. Donde un fichero llevaba cambios de dos temas, lo dice su
mensaje. **El repositorio NO tiene remoto**: los commits viven solo en este disco.

### Borrar y corregir un plan (Decisiones #62 y #63)

Era el pendiente numero uno y ya esta. Lo que se discutio y cambio la forma del arreglo: **la
frontera no es el ESTADO del plan, es si alguien EMPEZO**.

- Borrador → se borra.
- Aprobado o en ejecucion **sin que nadie haya abierto nada** → se borra, revocando sus
  obligaciones, con motivo, y diciendo en pantalla cuantas antes de pulsar.
- Con alguien que ya empezo → no. Ese avance es de una persona.
- Cerrado → nunca.

La regla vive pura en `plans/plan-deletion.ts` (9 pruebas). Se borra desde el LISTADO ademas de
desde la ficha, porque los planes que estorban son los de prueba y son varios.

Y la **cabecera** se corrige aunque este aprobado, con motivo: nombre, objetivo, metas y alcance son
texto, y lo que obliga a la gente son los renglones. El endpoint existia desde el Sprint 3 y
**ninguna pantalla lo llamaba**. El ANO solo en borrador: ancla el vencimiento de cada renglon.

### Un fallo latente que destapo la prueba

La convocatoria recien publicada **no aparecia** en el desplegable del plan. Nada que ver con lo de
arriba: el cajon pide 100 y el servidor ordenaba por fecha DESC, que en Postgres pone los NULOS
primero — 52 convocatorias sin fecha ocupaban la cabeza y la nueva caia en la posicion 103. Misma
familia que los cinco de la sesion anterior: el sintoma es "no aparece" y la causa esta lejos. En
el RUNBOOK, con el conteo que lo caza.

### Lo que se hablo y NO se construyo

- **El pendiente del alcance por area sobre PERSONAS esta mal planteado.** Acotar las personas al
  area del analista le romperia su propio indicador: una formacion de SARLAFT se le exige a
  comercial, cartera y logistica, asi que quien la administra tiene que poder ver a esa gente. Lo
  propuesto en su lugar: en Personas, filtro por area **por defecto y quitable**; en reportes,
  recortar por lo que administra (procesos, que ya funciona) y no por area; restriccion dura solo
  donde se decide SOBRE la persona, y eso es un permiso, no un alcance. **Sin decidir.**
- **El responsable no se congela en la VERSION.** Al crear una capacitacion ya se copia por valor
  el del proceso (`activities.service.ts`), asi que cambiar el responsable del proceso no reescribe
  lo existente — eso ya funciona. Pero `activity_versions` no guarda responsable: si alguien edita
  la actividad, la v1 publicada en marzo pasa a mostrar al nuevo. Propuesto: congelarlo al publicar,
  y que las NOTIFICACIONES sigan yendo al responsable vigente. **Sin construir.**
- **Anular un plan aprobado por error cuando ya hay gente empezando.** Hoy no hay salida: o se
  cancela renglon a renglon, o se cierra — y "cerrado" significa otra cosa. Es un hueco de estado.

### Verificado

`tsc`, `eslint` y `nest build` en verde; **165/165 unitarias** (9 nuevas de la regla de borrado);
**15/15 e2e**, incluido el caso nuevo de corregir y eliminar un plan en borrador.

---

## 2026-08-29 — Alcance, plan vivo, a quien se le exige, y cinco fallos que escondian datos

Sesion larga. Empezo por el alcance del Analista y acabo destapando una familia de fallos que
tenian pantallas enteras vacias sin que nadie lo supiera.

### Como levantar todo (cambio importante)

```powershell
.\scripts\mirar.ps1     # TU stack: web 3200 / api 3012, en desarrollo
```
→ **http://localhost:3200/login?tenant=transprensa** · admin `999999999` / `Transprensa2026*`

**Ahora hay dos stacks a proposito.** El de mirar (3200/3012, carpeta `.next-mirar`) y el de las
pruebas (3100/3002, `.next`). Antes compartian puerto: cada `pnpm build` y cada corrida de e2e
tumbaba la aplicacion que el cliente estaba usando, y salia `ERR_CONNECTION_REFUSED` cada rato.
La cuenta `888888888` es de las pruebas: **navegar con ella las rompe**.

### Alcance: quien ve que

`analyst_scopes` existia desde el Sprint 1, se guardaba y **no la leia ninguna consulta**: un
analista de SST abria el catalogo y veia las 52 capacitaciones de toda la empresa. Ahora se aplica
en catalogo, convocatorias y plan, y tambien al crear o MOVER algo de proceso (Decision #54).

La duda que costo mas conversacion fue **area vs. proceso**, y la conclusion es que NO se unifican:
el area es donde trabaja una PERSONA, el proceso es de que trata una CAPACITACION. Una formacion
de SARLAFT se le exige a comercial, cartera y logistica a la vez, asi que "SARLAFT" como area
seria el par de personas que lo llevan, no su audiencia. Lo que se anadio es la jerarquia: el
proceso cuelga de un area (`processes.area_id`, editable en Configuracion → Procesos), y entonces
el alcance por AREA alcanza todos sus procesos y el alcance por PROCESO solo el suyo (#57).

El alcance se da ahora **en el alta de la persona**, con un campo "Gestiona" de tres opciones. Se
muestra —y su valor por defecto se decide— por los PERMISOS que concede el rol elegido, nunca por
su nombre: un cliente puede llamar al suyo "Coordinador HSE" (#58, y la Decision #19 de siempre).

### El plan, que estaba demasiado apretado

La Decision #40 decia "el plan aprobado no se edita" y era correcta en la intencion: sus renglones
ya obligan a gente. Pero si en agosto abren una regional, esa jornada **tiene** que entrar en el
plan del ano; prohibirlo no evitaba el cambio, lo sacaba del sistema. Ahora se puede AGREGAR con
justificacion —y el renglon nace obligando— pero BORRAR sigue siendo solo de borrador (#55).
Ajustar los proyectados congelados tambien se puede, con motivo auditado (#56).

"Por mes" pasa a llamarse **Cronograma** y cada jornada se arrastra de mes, lo que la marca
REPROGRAMADA.

### A quien se le exige: un solo sitio

Habia que elegir los cargos **dos veces** —en la ficha para que salieran los proyectados y en
Quienes para crear la obligacion— y las dos listas se separaban en cuanto alguien tocaba una. De
la ficha salieron cargos, servicios y regionales; queda la norma, como clasificacion. Los
proyectados se derivan ahora de **quienes ya estan obligados**, asi que numerador y denominador
hablan de la misma gente por construccion (#59).

Y un fallo grave que salio de una pregunta del cliente —"si elijo cargo Auxiliar y regional
Antioquia, ¿cuenta a todos o solo a los de esa regional?"—: contaba a **todos, y encima a todo
Antioquia**, porque los criterios iban en un unico `OR`. Ahora se cruzan (#60), reutilizando
`buildAudienceWhere`, que es la misma pregunta que ya resolvian bien las audiencias.

La persona tiene **servicio**, opcional, y es un criterio mas de audiencia y asignacion (#61).

### Carga masiva

Plantilla en **XLSX** con una segunda hoja de instrucciones; acepta el **nombre o el codigo** en
cargo, area, regional y servicio ("Logistica" y "LOGISTICA" valen igual), asi que el cliente sube
el Excel que ya tiene sin aprender codigos. Los errores dicen **fila y columna** exactas.

### Los cinco fallos que escondian datos

Todos comparten forma: el sintoma era "esta vacio" y la causa estaba lejos.

| Fallo | Se veia como |
|---|---|
| `listUsers({ pageSize: 200 })` contra un tope de 100 → **422 siempre** | **tres** desplegables vacios: personas, responsable e **instructor** |
| `.catch(() => undefined)` tragandose ese 422 | ningun mensaje, en ninguno de los tres |
| Los "campos extra" de los catalogos no eran genericos | elegir un area guardaba en el tipo de cargo |
| Un `Buffer` devuelto por Nest sale como JSON | la plantilla bajaba con 200 y Excel decia "corrupto" |
| El e2e dejaba sus requisitos VIGENTES | 41 corridas → cada alta nacia con **41 obligaciones**; ahora 1, y de 697 ms a 213 ms |

El ultimo se cazo con `scripts/cazar-obligaciones.mjs` (40 altas por la API midiendo), no repitiendo
la prueba de navegador a ciegas. Todos estan en el RUNBOOK con como reconocerlos.

### Lo que queda, por orden

1. **Borrar / modificar un plan.** No se pueden eliminar los de prueba; es lo que mas estorba hoy.
2. **El alcance por area todavia NO filtra PERSONAS**: un jefe de SGI sigue viendo usuarios y
   reportes de toda la empresa. Falta cruzar `users.area_id` con su alcance. El selector de
   personas de Quienes se deja SIN acotar a proposito: SARLAFT puede ir dirigida a comerciales.
3. **Horas por norma**: `norms.annual_hours_required` se guarda y **nadie la lee**. Con las horas
   de intensidad de la convocatoria se podria decir "acumulo 8 de las 10 horas de BPM de este
   ano", que es lo que pregunta el auditor de Resolucion 2674. Hoy es una semilla, no un indicador.
4. Lista de planes mas visual, columnas movibles en la vista Tabla, filtros mas finos.
5. **Reabrir un plan cerrado: decidido que NO.** Cerrar es lo que lo convierte en evidencia.

### Y lo que no se puede seguir aplazando

**Mas de 100 archivos sin confirmar en git**, de cinco sesiones, en
`feat/sprint-4-experiencia-aprendiz`. Es mucho trabajo bueno sin un solo punto de retorno. Lo
primero de la proxima sesion deberia ser confirmarlo por bloques tematicos —alcance, plan,
audiencias, carga masiva— y no en un unico commit que no se pueda revisar ni revertir por partes.

---

## 2026-08-28 (cierre) — Controles del reproductor y descarga configurable

Ronda de ajuste fino sobre lo de la tarde, casi toda con el cliente mirando la pantalla:

- **Un indicador de avance por pregunta.** Habia tres barras midiendo lo mismo (barra superior,
  linea bajo ella, anillo del indice). Quedan dos: el anillo, y dentro del escenario el avance en
  la unidad de cada tipo.
- **El mando de las diapositivas es una sola pieza** —atras, pista, posicion, adelante— en vez de
  un boton de ancho completo. La pista **previsualiza la lamina al pasar por encima**, que es lo
  que permite encontrar una concreta sin ir de una en una, y en la ultima la flecha se convierte
  en el boton de cierre dentro del mismo mando.
- **La descarga del original es una decision del administrador** (`config.allowDownload`): una
  presentacion se convierte para poder medirla, y entregar ademas el PPT es una eleccion, no un
  efecto colateral. En un documento de apoyo el valor por defecto es que si.
- **La pestana de material es FIJA y ensena siempre lo mismo**: los documentos de la formacion,
  estes donde estes. Antes se colaba el original de la pieza actual y por eso parecia vacia en el
  video y llena en la presentacion.
- Barra superior sin borde ni fondo propios en el reproductor; sin aspa de salir (la flecha de la
  izquierda ya sale); el control de plegar el indice a la izquierda del bloque de la persona; y la
  racha con la llama respirando.
- El indice ya no ensena barra de desplazamiento (`.scroll-hidden`).

**Ronda final de acabado** (con el cliente mirando):

- **Fuera la linea divisoria** entre el contenido y las pestanas: un degradado que se apaga solo.
  Lo que separa es el aire, no una raya de borde a borde.
- **Las pestanas son pastillas con icono y van a la IZQUIERDA**, alineadas con el contenido.
  Centradas y estrechas dejaban un hueco enorme y parecian flotar sin dueno.
- **El boton del video solo es ancho mientras MIDE**; al abrirse se estrecha, y eso es parte de lo
  que hace notar que ya se puede seguir. Con flecha que se adelanta al pasar el raton, igual que
  en la leccion y en la presentacion.
- **La linea de tiempo de la leccion se RELLENA** tramo a tramo de izquierda a derecha, en vez de
  cambiar de color de golpe.
- **La previsualizacion de la pista se acota a los bordes**: centrada a secas, en la primera y en
  la ultima la mitad se salia y la lamina se veia estrecha.
- **Alto acotado para el video** (`max-h-68vh`): un video vertical grabado con el telefono ocupaba
  tres pantallas y habia que desplazarse para ver sus propios controles.
- **La barra de desplazamiento oculta es la del CONTENIDO**, que era la que molestaba.

**Material de apoyo: FIJO, decidido.** La pestana esta siempre, ensene o no algo, y ensena lo mismo
en todas las partes: los documentos de la formacion. Dos razones: una franja que cambia de forma
segun donde estes obliga a reaprender la pantalla en cada paso, y "esta formacion no trae material"
es informacion util —dice que no hay nada que buscar—. Lo que la hacia parecer rota era que antes
se colaba ahi el archivo de la pieza actual.

**Verificado.** `tsc`, `eslint` y `nest build` en verde; 130/130 unitarias; 12/12 e2e (pasan todas;
en dos corridas completas con la maquina cargada cayeron una o dos por tiempo y volvieron a pasar
en aislamiento — son intermitencias de carga, no regresiones).

**Que queda abierto de esta ronda.**
- **Subir material de apoyo SUELTO**, sin que sea una parte de la formacion. Hoy el material son
  piezas de tipo DOCUMENT. El modelo ya tiene la tabla `documents` (entidad + archivo) para
  colgarlo de la actividad sin que ocupe un renglon del temario: es la via, y no esta construida.
- La leccion de tarjetas sigue sin pestanas.
- Sin e2e de presentaciones ni LibreOffice en la imagen de produccion.

---

## 2026-08-28 (noche) — El reproductor, terminado: la presentacion de verdad y el pulso en los controles

**Lo que se cerro.**

- **La presentacion ya se puede ver, y por poco no se veia.** Se monto una de punta a punta contra
  la API real (subir, convertir, publicar version, migrar la convocatoria) y salieron **laminas en
  blanco**: fondos si, texto no. Dos causas encadenadas —pdf.js necesita que se le den las 14
  fuentes estandar como RUTA DE DISCO, y el arreglo no compilaba porque uso `import.meta` en un
  paquete que se construye a CommonJS, asi que el servidor siguio corriendo el `dist` viejo sin que
  nada lo dijera—. Todo en el RUNBOOK. **Ojo: las presentaciones subidas antes hay que volver a
  subirlas**; las diapositivas se convierten una vez.
- **La lamina cabe sin scroll y ocupa la pantalla.** Se pedia a lo ancho con proporcion fija, asi
  que una lamina apaisada calculaba mas alto que la ventana. Ahora la caja manda.
- **La evaluacion tenia un fallo visible** (lo encontro el cliente): caia en el reproductor de
  archivos y decia "este contenido no tiene material cargado" con un boton de "Ya lo lei". Ahora
  tiene antesala propia (Decision #53): nota minima, intentos usados y que al agotarlos se bloquea.
- **"Terminar" solo cuando de verdad se termina.** Con cinco partes por delante el rotulo hacia
  creer que la formacion quedaba cumplida.

**Diseno: oficio, no decoracion.** Se pidio algo "mas wow" y se descarto la estetica de auroras y
gradientes (razones en `ideas-producto.md` idea 7). En su lugar:

- **El boton ES el medidor** (`Button.meterPct`): en un video medible el relleno avanza con lo
  visto y se abre con un latido al llegar al minimo. Sustituye a tres elementos que decian lo
  mismo —barra, texto explicativo y boton gris—.
- **Profundidad de verdad en todos los botones**: realce interior arriba, elevacion al pasar,
  hundido real al pulsar. Afecta a toda la aplicacion, no solo al reproductor.
- **UN INDICADOR POR PREGUNTA.** Habia tres barras midiendo lo mismo. Quedan dos y responden cosas
  distintas: el anillo del indice (cuanto llevas de la FORMACION, y late al completar una parte) y,
  dentro del escenario, el avance en la unidad de cada tipo —riel de tramos en presentacion y en
  leccion, relleno del boton en video—.
- **Riel de tramos** en vez de puntos y pastilla flotante: navegacion, mapa y contador en un solo
  elemento. Flechas sobre la lamina con fondo oscuro translucido, porque una lamina es casi siempre
  blanca y una flecha clara no se veia. Flechas del teclado. Entrada de la lamina segun la
  direccion en que se avanza.
- **La barra superior es la del resto de la aplicacion** (avisos, cuenta) con la racha al lado de
  los avisos, fuera del menu donde no la veia nadie. Solo cambia que el saludo cede el sitio al
  nombre de la formacion y a la salida.

**Ademas.** El minimo de video visto es ahora un ajuste del tenant (Decision #52), con su campo en
Preferencias y la cascada resuelta en el servidor.

**Como se verifico.** `tsc`, `eslint` y `nest build` en verde; **130/130 unitarias** (5 nuevas de
la cascada); **12/12 e2e**; y a mano en la aplicacion real: video de YouTube, leccion de tarjetas y
presentacion de 6 diapositivas con texto.

**Que queda abierto.**
- La leccion de tarjetas sigue sin las pestanas de Resumen y Material (la pila ocupa el alto).
- La imagen de produccion no lleva LibreOffice: sin el, solo PDF.
- No hay e2e de presentaciones: exige un PDF de prueba en el repositorio.

---

## 2026-08-28 (tarde) — El reproductor deja de ser una pantalla pelada

**De donde venia.** El reproductor se presentaba sin nada alrededor: ni carril ni barra. La razon
estaba escrita en el contrato de diseno —cada elemento de navegacion mientras se cursa es una
invitacion a irse— y en escritorio costaba mas de lo que ahorraba: en una formacion de siete
partes, para saber donde uno esta y cuanto le falta habia que SALIRSE a mirarlo. El panel de
contenido existia, pero era una lista de titulos.

**Lo que se hizo** (Decision #49).

- **Tres columnas**: carril de la aplicacion plegado a iconos (64 px, se despliega a mano y no al
  pasar el raton), escenario, e indice de la formacion a la derecha (340 px, plegable, y la
  preferencia se recuerda). `components/modules/learner/player-chrome.tsx`.
- **El indice a la DERECHA y no a la izquierda**, que era la duda: al plegarlo el escenario crece
  hacia ese lado y su borde izquierdo no se mueve. Con el indice a la izquierda, mostrarlo u
  ocultarlo desplazaria el video entero de sitio a mitad de una leccion.
- **El indice dice de que tamano es cada parte ANTES de entrar** —"Leccion · 8 tarjetas · 5 min",
  "Presentacion · 11 diapositivas", "Evaluacion · nota minima 90%"— con iconos por tipo y tres
  estados distinguibles. Lo completado es verde y **lo actual es el color primario del tenant**:
  pintarlos del mismo tono (el primer intento) hacia que el indice dejara de responder de un
  vistazo lo unico que se le pide.
- **No se inventan minutos.** De un video subido no se conoce la duracion hasta reproducirlo, y un
  numero redondo inventado es peor que no decir nada. `openEnrollment` cuenta tarjetas y
  diapositivas de verdad.
- **Pestanas fijas bajo el escenario** con contenido de la pieza actual: *Resumen* (de que va, que
  se exige para darla por vista y de que proceso y norma sale) y *Material de apoyo* (los
  documentos de la formacion, por URL firmada, sin salir del reproductor).
- **Las piezas ya tienen descripcion propia** (Decision #51): columna nueva `description` en
  `activity_contents`, copiada al versionar y editable desde los dos cajones de autoria. Antes la
  unica descripcion del modelo era la de la ACTIVIDAD, y quien entraba a la parte 4 de 7 veia un
  video sin saber que iba a ver.

**La pregunta que quedaba: ¿la evaluacion aparte o bajo el contenido?** Aparte, a pantalla
completa (Decision #50). No es estetica: el examen MIDE, y dejar el video a la vista mientras se
responde lo convierte en un examen a libro abierto —con nota minima del 90% y ante un auditor—.
Ademas tiene intentos limitados y bloqueo: es otro modo y la pantalla debe decirlo. La encuesta de
satisfaccion, que no mide a nadie sino que califica la capacitacion y al capacitador, si ira como
una pestana mas bajo el contenido cuando se construya en el Sprint 5.

**Como se verifico.**
- `tsc` y `eslint` en verde; **125/125 unitarias**; **12/12 e2e en navegador**.
- **A mano en la aplicacion real**, con el aprendiz del seed: video de YouTube (medicion,
  requisito y pestanas) y leccion de tarjetas (pila, indice desplegado con sus tarjetas). Se
  encontro y arreglo ahi mismo que bajar a las pestanas se llevaba la barra y el indice: la raiz
  era `min-h-screen` y tenia que ser `h-screen overflow-hidden` con `min-h-0` en la columna. Esta
  en el RUNBOOK, porque es la trampa que se repite.

**Que queda abierto.**
- **La presentacion no se pudo ver en pantalla**: no hay ninguna en la base de esta maquina, y
  montarla exige crear actividad, publicar, convocar e inscribir. El escenario de diapositivas
  quedo acotado a `68vh` con las pestanas debajo, pero eso NO esta comprobado con los ojos.
- **La leccion de tarjetas no lleva pestanas**: la pila ocupa el alto y meterle secciones debajo
  pelearia con su lectura. Queda por decidir donde va la descripcion de una leccion.
- **Notas del aprendiz: no se construyeron, y creo que no deben construirse todavia** —exigen
  tabla, API y cola sin senal para un valor delgado en piezas de 3 a 7 minutos—. La franja de
  pestanas queda preparada para que entren sin rediseno.
- **Los botones y el progreso se ven genericos**, dicho por el cliente al ver esto. Hay una
  propuesta pendiente de aprobar: NO auroras ni gradientes (el contrato de diseno los prohibe y en
  un registro que va a auditoria restan credibilidad), sino la firma que la marca ya tiene escrita
  y no usa —el anillo que late al completar, el boton que se convierte en su propio medidor de
  avance, la linea de progreso con su punto guia—.

---

## 2026-08-28 — La presentacion como tipo de contenido propio

**De donde venia.** El cliente sube lo que le llega: la ARL manda su presentacion el dia antes de
la capacitacion. Hasta hoy eso entraba como `DOCUMENT` —un archivo en un visor— y de ahi no salia
ninguna evidencia: la persona hace scroll y la plataforma solo puede registrar que confirmo
haberlo abierto. Pedirle al administrador que la rehaga a tarjetas no iba a pasar.

**Lo que se hizo.** `PRESENTATION` es un tipo de contenido propio (Decision #47). Al subirla se
convierte en **una imagen por diapositiva** y se reproduce con el reproductor del producto, asi
que si se puede registrar cual vio y cuanto tiempo.

- **Conversion** (`storage/slide-converter.service.ts`): PDF siempre, en proceso, con
  `pdfjs-dist` + `@napi-rs/canvas` y sin binarios del sistema; PPT/PPTX/ODP a traves de
  LibreOffice en modo consola. Salida en **WebP** —en PNG cada diapositiva pesaba 1,4 MB— a 1600 px
  de ancho, tope de 200 diapositivas.
- **Si el servidor no tiene LibreOffice, la pantalla lo dice ANTES de elegir el archivo**
  (`GET /media/presentation/capabilities`, Decision #48) y ofrece la salida real: exportar a PDF
  desde PowerPoint.
- **El original se guarda igual.** Es el documento que entrego el proveedor y una auditoria puede
  pedirlo tal cual; lo que se reproduce son siempre las diapositivas.
- **Reproductor** (`learner/slide-runner.tsx`): una diapositiva a la vez, con el mismo lenguaje
  que la pila de tarjetas. El porcentaje cuenta diapositivas DISTINTAS vistas, no la posicion: ir
  y volver no infla nada. Se completa viendolas todas.
- **Las diapositivas no son paquetes propios**: cuelgan de la clave del original
  (`<clave>.slides/NNN.webp`) y se autorizan contra el `manifest` del padre. Esa decision es una
  frontera de seguridad y por eso vive aparte, en `storage/slide-storage.ts`.
- **El DOCUMENTO se reposiciono** en el selector como *"Documento de apoyo"*: manual, politica o
  instructivo para consultar. Sigue existiendo; ya no es donde acaba una presentacion por descarte.

**Lo que se cerro al final de la sesion (pruebas y documentacion).**
- Las dos reglas nuevas salieron del servicio a modulos puros y probados, como `nudge.ts` y
  `version-migration.ts`: `learning/progress-rules.ts` (cuando una pieza cuenta como cumplida y
  que queda escrito de ella) y `storage/slide-storage.ts` (que imagen se puede servir). **27
  pruebas nuevas**, incluidas las que rechazan una clave inventada bajo la carpeta de una
  presentacion valida y la que comprueba que una DECLARACION no asciende a MEDIDA.
- Al extraer la regla se vio que la rama de `PRESENTATION` era identica al criterio por defecto:
  se quito el caso especial y se dejo el porque escrito, que es lo unico que hacia falta.
- **Un hueco encontrado y cerrado**: al salir de una presentacion a medias no se guardaba nada
  —`leave()` solo contemplaba lecciones—, asi que quien vio ocho de once diapositivas volvia a
  cero. Ahora se guarda igual que en una leccion.

**Como se verifico.**
- `tsc` y `eslint` en verde (api, web y shared).
- **125/125 unitarias** (eran 98; 27 nuevas).
- **12/12 e2e en navegador**: no cubren la presentacion (ver abajo), pero comprueban que el
  reproductor de tarjetas y el resto de flujos no se rompieron al extraer las reglas.
- De punta a punta contra la API real, a mano: una presentacion de **11 diapositivas** tardo
  **~6 s** en convertirse y se sirvio en WebP a **~59 KB** por diapositiva.

**Que queda abierto.**
- **No hay e2e de presentaciones.** Exige un PDF de prueba en el repositorio y, para el camino de
  PowerPoint, LibreOffice en la integracion continua. Se verifico a mano; el procedimiento esta en
  el RUNBOOK.
- **La imagen de produccion de la API todavia no lleva LibreOffice**: sin el, PPT/PPTX/ODP se
  rechazan con un mensaje que pide el PDF. Anotado en la deuda de `arquitectura.md`.
- Las diapositivas **no se cachean para uso sin senal**, igual que los videos y documentos.
- Nada de esto entra en los sprints 5 y 6, que siguen pendientes.

**Ojo para la proxima sesion.** La ruta de LibreOffice se resuelve UNA vez por proceso y se
recuerda **incluido el fallo**: si lo instalas con la API levantada, hay que reiniciarla o seguira
diciendo que no esta. Y sigue en pie el aviso anterior: el servidor de :3002 puede ser un `dist`
viejo; si una ruta nueva responde 404 en vez de 401, reconstruir con
`pnpm --filter @neo-pulse/api build`.

---

## 2026-08-27 (tarde) — Cerrar los dos pendientes del arreglo de medios

**De donde venia.** La sesion anterior arreglo que ningun archivo subido se viera (URL firmadas,
Decision #43) y de paso dejo dos huecos anotados como deuda de criticidad Media. Esta sesion los
cierra. No hubo migracion de base de datos: el esquema del Sprint 0 ya traia todo lo necesario.

**1. La convocatoria ya puede apuntar a la version vigente** (Decision #45).
Publicar la v2 de una formacion no tocaba a las convocatorias: seguian entregando la v1 retirada,
sin nada en pantalla que lo dijera, y la `migration_policy` que se elegia al publicar era un campo
decorativo que no leia ningun codigo.

- `GET /offerings/:id/version-upgrade` — que pasaria: version destino, politica y el reparto de
  inscritos (pasan / se quedan / cerradas / ya en la nueva / en conflicto). Las casillas suman el
  total a proposito: quien autoriza no puede ver cuatro cifras que se solapan.
- `POST /offerings/:id/migrate-version` — lo aplica. Misma compuerta que publicar
  (`offerings:publish`, con aprobacion si no se tiene). La version destino viaja explicita.
- La regla de a quien mueve vive en `apps/api/src/offerings/version-migration.ts`, pura y con
  9 pruebas. Es el limite entre actualizar contenido y borrarle el avance a alguien.
- En pantalla: aviso en la ficha de la convocatoria con la consecuencia escrita en castellano,
  panel con las cifras antes de mover a nadie, y marca en el listado y en la pestana de
  Programacion de la formacion (que es donde se nota: se acaba de publicar la version al lado).

**2. Un video de YouTube ya se puede comprobar** (Decisiones #44 corregida y #46).
La deuda daba por imposible medir un video enlazado. Lo es con un `<iframe>` pelado, no con la API
del reproductor de YouTube. Ahora se cuentan los mismos segundos distintos que en un archivo
propio y el paso se bloquea hasta el minimo de la formacion. Si el script de YouTube no carga en
8 segundos, degrada al boton de confianza en vez de dejar a nadie sin poder avanzar. Vimeo y el
resto siguen siendo declaracion. El avance viaja marcado `MEASURED` / `DECLARED`.

**3. De paso.** `pnpm db:verify-rls` no existia en la raiz aunque el RUNBOOK lo prescribia: se
agrego el atajo.

**Como se verifico.**
- `tsc` y `eslint` en verde (api, web y shared).
- 98/98 unitarias (13 nuevas: 9 de la regla de migracion, mas las de reparto y particion).
- Aislamiento multi-tenant: `pnpm db:verify-rls`, los 3 chequeos OK.
- 12/12 e2e en navegador, incluido `e2e/convocatoria-version.spec.ts` (publicar v2 -> aviso ->
  actualizar -> la convocatoria entrega la v2 y el aviso desaparece).
- La medicion de YouTube se comprobo **a mano en la aplicacion real**, porque exige red y el
  reproductor de un tercero: con la reproduccion en 3:08 de un video de 3:13, el contador marcaba
  75% y "Terminar" seguia bloqueado. Adelantar deja hueco y no cuenta. El procedimiento esta en
  el RUNBOOK.

**Que queda abierto.** Nada de estos dos frentes. Sigue pendiente el resto de la deuda declarada
en `docs/arquitectura.md` seccion 10 — sobre todo la precarga sin senal y el cacheo de video, que
esperan a conocer el peso real del contenido de Transprensa — y los sprints 5 y 6.

**Ojo para la proxima sesion.** El servidor de la API que quedo escuchando en :3002 puede ser un
`dist` viejo (`node dist/main.js`, no `nest start --watch`): si una ruta nueva responde 404 en vez
de 401, es eso. Reconstruir con `pnpm --filter @neo-pulse/api build` y reiniciarlo. El servidor web
de :3100 si es `next dev` y recarga solo — no correr `next build` mientras esta arriba (RUNBOOK).

---

## Antes del 2026-08-27

No hay diario: este archivo se creo el 2026-08-27, aunque el RUNBOOK ya lo anunciaba. La historia
anterior esta en `docs/sprints/` (sprints 0 a 4, todos terminados) y en el historial de commits,
que en este proyecto lleva el porque de cada cambio y no solo el que.
