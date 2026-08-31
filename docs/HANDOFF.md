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

## 2026-08-31 (tarde) — Las evaluaciones dejan de tener dos escaleras, y "Hoy" deja de ser una lista

### Por donde empezo: "esto esta mal, no me gusta"

Lo dijo el cliente de la pantalla de evaluaciones, y al mirarla de cerca no era estetica. Eran
cinco cosas y las cinco estructurales:

1. **El banco de preguntas era una pestana de primer nivel.** Nadie entra al modulo queriendo
   "administrar un banco": entra queriendo armar un examen. Es el error mas citado de Moodle, y
   Canvas lo repitio partiendo Question Banks e Item Banks en dos sistemas que ni se hablan.
2. **El editor vivia en un cajon lateral de 420 px.** Escribir una pregunta es EL acto principal
   de la pantalla, no un recado.
3. **La pregunta en el examen era una linea de texto.** Ni opciones ni cual era la correcta:
   revisar veinte preguntas antes de publicar eran veinte viajes a otra pantalla, asi que nadie
   las revisaba.
4. **El examen eran DOS listas** —las elegidas arriba, los bloques al azar en otra tarjeta abajo—
   y el orden entre ellas no se podia ni expresar. Quien lo responde lo vive como UNA secuencia.
5. **Habia un editor de pregunta duplicado**: el cajon del listado no usaba `question-editor.tsx`.
   Ya habian divergido.

Y un peaje: para escribir la primera pregunta habia que salirse a crear una "categoria".

### El banco: la pregunta era "¿sirve o lo quito?"

Lo pregunto asi: *"si tiene beneficio el banco de preguntas o biblioteca si si, si no quitarlo"*.
La respuesta honesta es que el banco tiene DOS beneficios reales y ninguno justifica ser un sitio
al que ir:

- sin el no existe el **bloque al azar**, que es lo que evita que 116 personas se pasen la hoja de
  respuestas el primer dia;
- guarda el **versionado de preguntas** (Decision #6): corregir un enunciado hoy no reescribe lo
  que alguien respondio el ano pasado.

Los dos siguen enteros. Lo que se retiro es el DESTINO. **Decision #84**: fuera la pestana, el tema
pasa a ser OPCIONAL y se crea tecleandolo, y reutilizar vive DENTRO de la evaluacion. La base lo
confirmaba: de 18 categorias, 17 eran basura del e2e y solo una tenia contenido real.

### Como quedo: rail, lienzo y ajustes

Tres zonas, cada una respondiendo una pregunta distinta: el RAIL dice "¿que hay y que me falta?"
(la secuencia numerada, con las preguntas a medias marcadas sin abrirlas); el LIENZO dice "¿como
va a quedar?" (la pregunta con la forma exacta que tendra para quien la responda, y se escribe
encima); los AJUSTES dicen "¿como se comporta?".

Y **un bloque al azar es un paso mas de la secuencia**, no otra lista: por dentro se guarda como
secciones intercaladas con su `displayOrder`. El servidor ya lo soportaba; faltaba una pantalla
capaz de decirlo. **No queda ni un cajon en el camino normal**: traer del banco tambien es un paso
del rail cuyo lienzo es el buscador, y ahi la pregunta se VE entera antes de meterla.

### Vista del empleado, y el diseno configurable (Decision #85)

*"La interfaz de aprendiz debe ser lo mejor tipo Typeform, transiciones, dinamica y wow; desde
admin configuracion como diseno, colores o animaciones."*

Sale `ExamStage`, y lo importante es que **lo usan las DOS pantallas**: el reproductor real y la
vista previa del administrador. Si fueran dos implementaciones, la previa mentiria en cuanto una
cambiara — y una vista previa que miente es peor que no tenerla, porque se publica confiando en
ella. Se previsualiza en escritorio y en un marco de telefono de 390 px, y por eso el escenario
recibe `wide` como PROP y no lo deduce de puntos de ruptura: dentro de un monitor, un `lg:` creeria
que el telefono simulado tiene sitio para el panel lateral.

La presentacion (acento, transicion, ritmo, auto-avance, fondo) vive en la EVALUACION y no en su
version: **el color no es evidencia**. No cambia que se pregunto ni como se califico, asi que
retocarlo no puede exigir publicar de nuevo.

### Mas tipos de pregunta (Decision #86)

*"Debe tener buena variedad, mas de lo normal que simplemente opciones, como completar huecos."*
Y detras habia algo mas grande que la variedad: **con solo opcion multiple, media formacion de SST
se pregunta mal**. Un bloqueo LOTO es una SECUENCIA y las cuatro opciones llevan la respuesta
escrita; una distancia de seguridad se acierta por descarte; una senal se reconoce, no se elige de
una lista.

Entran cuatro, los cuatro de calificacion automatica y sin subir archivos: **completar huecos,
ordenar los pasos, emparejar y numerica con tolerancia**. Senalar sobre una imagen queda para
despues (arrastra subida de foto y zonas en coordenadas relativas).

Detalles que costaron pensarlos:
- **ORDER y MATCH se barajan SIEMPRE**, elija lo que elija el administrador: servirlos en su orden
  es dar la respuesta hecha. **FILL_BLANK no se baraja NUNCA**: sus "opciones" son los huecos.
- **Ni ordenar ni emparejar se arrastran.** No es una version pobre del arrastre: es la que
  funciona con guantes, con lector de pantalla y dentro de una pagina que se desplaza.
- La comparacion de huecos ignora tildes y mayusculas a proposito: suspender a un conductor por
  escribir "arnes" sin tilde seria medir ortografia en vez de seguridad.

### Las dos pruebas que encontraron bugs reales

Escribirlas no fue tramite. **La primera**: el normalizador de huecos tenia `/s+/g` en vez de
`/\s+/g` —el escapado se comio la barra— y reemplazaba la letra "s". **La segunda**: reutilizar una
pregunta del banco perdia sus opciones, porque el paso se armaba con el RESUMEN de la lista en vez
de pedir la pregunta entera. Reutilizar significaba reescribirla.

### La contradiccion de fondo, y su cirugia (Decision #87)

Auditando el ciclo de calificacion aparecio algo peor que un fallo de pantalla:

> Publicar la v2 de una evaluacion ponia la v1 en RETIRED, pero el contenido de la formacion seguia
> apuntando a la v1 — y `attempts.start` exige PUBLISHED. **El examen dejaba de poder abrirse** para
> todas las formaciones publicadas que la usaran.

Comprobado contra la base: no habia pasado todavia porque nadie habia publicado una segunda version
de una evaluacion. Pero el boton que lo dispara es justo el que se acababa de hacer prominente.

Y al preguntarse *"¿es necesario el versionado de evaluaciones?"* la respuesta fue que no, por una
razon que se ve al mirar el archivo de al lado: **las lecciones NO se versionan aparte** —publicar
la formacion las CLONA congeladas— mientras las evaluaciones tenian su propia escalera. Dos
soluciones distintas al mismo problema, en la misma tabla, sin sincronizar. De ahi salian los
cuatro danos: el de arriba, los intentos que se reseteaban al publicar una version nueva, la
completitud que se invalidaba, y el administrador sosteniendo dos escaleras a la vez.

**Ahora una evaluacion es un objeto plano, como una leccion.** Se edita siempre y publicar la
FORMACION congela una copia (`sourceId` distingue la editable de la copia). Desaparecen "Publicar",
"Descartar" y "Nueva version" de la evaluacion: tener dos botones de publicar era la contradiccion.
Lo que protege el historico sigue siendo `question_versions`, que es donde siempre estuvo.

La migracion no borro nada a ciegas: las versiones que no eran la vigente se convirtieron en copias
congeladas para que los contenidos y los intentos que les apuntaban siguieran apuntando a algo real.
**0 huerfanos**, 10 intentos y 30 contenidos repuntados.

### Y donde vive el tope de intentos, que era otra pregunta suya

*"Quien pierda los intentos no puede, pero la formacion en si tiene intentos, ¿de donde es mejor?"*

La cadena ya existia y es correcta: `evaluacion ?? formacion ?? valor por defecto del tenant`. Lo
que faltaba era decirlo: la pantalla no explicaba que vacio significa "lo que diga la formacion".
**La formacion es el sitio bueno** porque lo que se bloquea es la MATRICULA, que es por formacion; y
una formacion puede llevar varias evaluaciones — si cada una trae su tope, "¿cuantas oportunidades
tiene esta persona?" no tiene una sola respuesta. El campo de la evaluacion se gana su sitio solo
como piso mas estricto ("alturas siempre 90%").

### "Hoy" deja de ser una lista de deberes (Decisiones #88, #89, #90)

*"Quiero que hoy sea estilo streaming tipo Netflix."* Detras de eso hay algo real: nadie abre por
gusto una lista de obligaciones, pero todo el mundo abre una biblioteca.

**Las portadas (#88).** Ya existia una portada GENERADA determinista desde el id. Se conserva como
base y la foto pasa a ser una MEJORA que se pinta encima: si fuera obligatoria, el primer dia media
biblioteca estaria en gris —el analista de SST no es fotografo— y habria un requisito estetico
delante de publicar una capacitacion obligatoria. `coverKey` vive en la ACTIVIDAD, no en su version:
una foto no es evidencia.

**Los filtros son por ESTADO y no por tipo (#89)**, y es la decision de fondo. "Induccion" o
"Alturas" es como lo clasifica quien administra; la pregunta de quien entra a las 6 de la manana con
el celular es otra: *"¿que hago hoy?"*. El tipo se usa mas abajo, para agrupar las filas, que es
donde clasificar si ayuda a encontrar.

**Y una correccion que hizo el cliente y tenia razon:** la primera version pintaba "Hoy" oscura
siempre, con paleta propia. Se veia bien y estaba mal —*"principalmente tema claro y oscuro... no
puede ser un color de fondo de ninguno de los dos"*—: el modo aprendiz ya tiene claro y oscuro, y
una pantalla que se los salta deja el producto con dos criterios. Ademas ponia superficie de color
donde el resto usa neutros. **Lo cinematografico lo pone la portada, que es una foto y funciona
igual sobre blanco que sobre negro.** El azul y el verde de la empresa son ACENTO: lo activo, lo
elegido, el boton. Nunca fondo.

**El sistema, no solo el contenedor (#90).** Barra lateral con el mismo fondo que el cuerpo,
separada por linea y no por cambio de tono. Barra superior **sin fondo ninguno** y repartida en TRES
zonas —saludo | buscador | acciones—: antes eran dos y en un monitor ancho dejaba un vacio enorme en
medio con el bloque de la persona flotando lejos de las dos esquinas. El buscador de la barra
lateral se retira: quedaba duplicado a diez centimetros del otro.

**La gamificacion se agrupa en la barra lateral**, y es la respuesta a *"¿hago un panel izquierdo
con el perfil o las alertas?"*. Un panel nuevo no: seria una tercera columna que roba ancho a los
carruseles justo en el portatil de 1280, y duplicaria lo que la barra de arriba ya tiene. Dentro de
la barra que ya existe si: no cuesta un pixel y es donde la referencia pone su bloque. Y JUNTOS —la
racha era una pastilla suelta arriba, y un numero con una llama al lado no dice que es una racha ni
que se pierde manana—.

**Las tarjetas dejan de ser caratulas estrechas.** Un poster 2:3 de 150 px se veia bien y no servia:
ahi no cabe nada mas que el titulo, y aqui la decision no se toma por la imagen —una foto de bodega
no distingue una formacion de otra— sino por lo que dice al lado. Ahora dicen tipo, duracion,
vencimiento y **los puntos que gana**, que viajan desde el servidor: prometer 50 y dar 30 seria peor
que no prometer nada.

Y los colores del tenant pasan a ser los del logo: azul marino `#16265C` y verde `#1FA23A`. El
acento era naranja y no era de nadie.

### Lo aprendido rompiendo algo

- **Las pruebas e2e corren contra `.next`, el stack de mirar contra `.next-mirar`.** Un `pnpm build`
  no actualiza lo que sirve `mirar.ps1`, y al reves. Se perdio un rato depurando un "bug" que era
  simplemente el bundle anterior: hay que volver a ejecutar el script para ver un cambio.
- **`String.replace` con `$` en el reemplazo**, otra vez. Y esta vez el escapado de `\s` dentro de
  un script generado se comio la barra invertida y produjo una regex que borraba la letra "s". La
  prueba lo cazo; sin ella habria suspendido a gente por escribir "seis meses".

### Verificado

`lint`, `typecheck` y `build` en verde. **238/238 unitarias** (29 nuevas: los cuatro tipos de
pregunta calificados caso por caso, y la ida y vuelta del payload comprobando que la respuesta
correcta NO se escapa por ninguno de los cuatro caminos nuevos). **21/21 e2e**, con dos reescritas
para la interfaz nueva.

Migraciones aplicadas: `optional_question_theme`, `more_question_types`, `flat_assessments`,
`activity_cover`.

### LO QUE SIGUE

**Lo primero al retomar:** `alcance-analista` y `sprint-1 personas` fallan de forma intermitente por
**53 reglas de audiencia activas** acumuladas en la base de desarrollo (44 cuelgan de una sola
audiencia de pruebas, "Toda la empresa 40511390"): crear UNA persona dispara 53 rondas del motor y
expira. Es el mismo incidente del 2026-08-31 por la manana. Se RETIRAN, no se borran.

**La UI del aprendiz esta a medias.** Hecho: `/hoy`, la barra lateral, la barra superior, las
portadas y la gamificacion. Falta: `/mi-formacion`, `/repaso`, `/perfil`, la navegacion inferior del
telefono y afinar tipografia y botones como sistema.

**Y el hueco que detecto el cliente y no se cerro:** editar preguntas por tema. Hoy se pueden VER
por tema (al reutilizar) pero solo se editan abriendo una evaluacion que las contenga, y corregir
una no llega a las demas. Lo correcto no es devolver la pestana sino poner la biblioteca donde surge
la pregunta: en el lienzo del bloque al azar, un "ver las N preguntas de este tema" que liste y deje
editar ahi mismo.

Del listado anterior siguen abiertos: el editor de la ENCUESTA de satisfaccion (hueco gemelo del que
se cerro), evaluacion de DESEMPENO, editar una convocatoria PUBLICADA, la carrera de respuestas en
las listas, el Sprint 5 (asistencia, certificados, encuestas) y las aprobaciones.

---


## 2026-08-31 — Un plan por ano, y "capacitacion del plan" deja de ser una promesa vacia

### La pregunta del cliente, que era dos fallos

*"Cuando se crea un tipo de formacion del plan, ¿que se crea, un plan o una capacitacion dentro
del plan? Debe ser una capacitacion del plan, no un plan. El plan es por ano."*

Las dos mitades eran ciertas, y ninguna estaba bien resuelta.

**1. El tipo prometia algo que no cumplia.** Crear una formacion de tipo "Capacitacion del plan"
crea una formacion suelta y nada mas. `participates_in_plan` estaba sembrado desde el Sprint 1 y
**lo leia UNA sola linea del panel**: la que pinta "Cuenta para los indicadores del plan anual" al
elegir el tipo. Era falso. Los indicadores del plan solo miran obligaciones nacidas de un RENGLON
suyo (regla de oro 2), asi que una capacitacion del plan que nadie programa no cuenta ni para el
cumplimiento ni para la cobertura, y en el listado se ve exactamente igual que una que si esta.
Es la misma familia que `defaultAssignmentMode` y `annual_hours_required`: config que se guarda y
no gobierna nada.

**2. El plan NO era por ano.** La clave era `(tenant, ano, NOMBRE)`, asi que "Plan 2026", "Plan
anual 2026" y "Plan SST 2026" convivian, cada uno con su aprobacion, sus proyectados congelados y
su propio porcentaje. El auditor pregunta por el plan de 2026 y habia tres numeros distintos sin
forma de saber cual vale. Ademas contradecia lo que `CLAUDE.md` 3.10 ya decia: los planes SST,
PESV y BASC son la VISTA POR PROCESO del mismo plan, y esa pestana ya existe.

### Lo que se hizo (Decision #71)

**Un plan por ano**: `UNIQUE(tenant_id, year)`. El nombre baja a rotulo corregible y viene
propuesto ("Plan anual de capacitacion 2026"); si se teclea un ano que ya tiene plan, se dice
ANTES de pulsar y se ofrece abrirlo, en vez de contestar 409 al enviar.

**La ficha de la formacion dice donde esta respecto al plan**, encima de las pestanas: fuera del
plan, o dentro y en que meses. Y ofrece "Programar en el plan 2026", que crea la convocatoria y el
renglon en un acto sin salir de la ficha. **No se automatiza a proposito**: el MES lo decide el
analista y no hay forma de adivinarlo. Lo que no podia seguir es que el paso fuera mudo — el mismo
remedio que "Dejarla disponible" para el candado.

**Y el plan lleva el tipo puesto de vuelta**: "Capacitacion nueva" desde el plan ya no abre el
desplegable de tipos en blanco, va con `tipo=PLAN`. Quien pulsa eso dentro del plan de 2026 esta
creando una capacitacion del plan; dejarlo en blanco invitaba a crearla como extraordinaria, que
se ve igual en el listado y no cuenta para nada del plan.

### Dos cosas mas que salio a la luz al recorrer el ciclo entero

**Cancelar un renglon no retiraba sus obligaciones.** `updateItem` con `CANCELLED` solo cambiaba
el renglon: las metricas dejaban de contarlo (`computePlanMetrics` filtra los cancelados) y su
gente se quedaba con la formacion pendiente, venciendo el ultimo dia de un mes cuya jornada ya no
se iba a dictar. Ahora se RETIRAN —`WITHDRAWN_PLAN_ITEM_CANCELLED`, estado nuevo—, no se borran:
a esas personas se les anuncio la formacion y el aviso sigue en su bandeja, asi que sin la traza
"me asignaron X y no esta" no tiene respuesta. **Lo ya empezado no se toca**: ese avance es suyo.
Cae solo de todas las consultas porque lo abierto se pide por lista blanca.

**El desplegable recortado, por TERCERA vez.** `NewOfferingDrawer` buscaba el tipo de la
capacitacion en `listActivities({ pageSize: 100 })`, tambien cuando la version venia fija. A partir
de la actividad 101 no la encontraba y armaba el formulario con los valores por defecto: una
capacitacion del plan dejaba de pedir fecha, lugar e instructor, en silencio. Ahora el tipo y la
modalidad VIAJAN con la version fija, y el servidor los manda en el plan.

### Lo que NO era un fallo, y se retira

Se anoto que el aviso del plan (`PLAN_ASSIGNMENTS_CREATED`) va con `referenceId: null` y no lleva
a ningun sitio. Es falso: `notification-kind.ts` lo manda a `/mi-formacion`, y es lo correcto —el
aviso nombra VARIAS formaciones, asi que apuntar a una seria elegir mal—.

### Lo aprendido rompiendo algo (dos, y las dos caras)

**`String.replace` con `$` + comilla invertida en el reemplazo duplico un archivo entero.** El
texto de reemplazo contenia `new RegExp(\`${planUrl}$\`)`, y ese `$` pegado a la comilla es un
patron de sustitucion que inserta "todo lo anterior". El archivo paso de 320 a 638 lineas y el
compilador señalo una linea que estaba perfecta, 300 mas abajo.

**Y al deshacerlo, `git checkout -- e2e/sprint-3.spec.ts` se llevo los cambios SIN CONFIRMAR de la
sesion anterior.** En este repo hay trabajo sin confirmar casi siempre, asi que ese comando es mas
peligroso aqui que en un arbol limpio. Se recuperaron los 7 bloques desde la transcripcion de la
sesion anterior (`~/.claude/projects/<proyecto>/<uuid>.jsonl` guarda cada comando con su texto), y
se comprobo que la reconstruccion era exacta contra dos fuentes independientes: los numeros de
linea que Playwright habia impreso ayer y los leidos hoy antes de perderlo. Ambas cosas estan en el
RUNBOOK con su regla.

### El plan, terminado: la meta es un numero y el alta pregunta lo mismo que la edicion

Lo pidio el cliente en tres frases y las tres apuntaban al mismo sitio: *"al crear el plan debe
pedir lo mismo que al editar, esta mas completo"*, *"el ano debe ser un seleccionar"*, *"meta es un
porcentaje de eficiencia que se quiere alcanzar, importante para metricas"*.

- **El alta pide lo mismo que la edicion**: ano, nombre, meta, objetivo y alcance. Antes pedia
  tres campos y los otros dos habia que acordarse de anadirlos despues desde "Editar" — y un campo
  que solo existe en una de las dos pantallas se queda vacio para siempre.
- **El ano se ELIGE.** Es lo que identifica al plan, solo hay un punado de valores posibles (dos
  atras, el que corre y el siguiente) y **los anos que ya tienen plan no se ofrecen**: tecleandolo
  se podia poner 2062 sin que nada lo notara, o elegir un ano ocupado para que lo rechazaran.
- **`goals` (texto libre) pasa a `goal_pct` (1..100).** Un indicador sin meta —"62% de
  cumplimiento"— deja al lector sin saber si eso esta bien, que es justo lo que el auditor viene a
  preguntar. Se mide contra el CUMPLIMIENTO (ejecutadas / programadas), el indicador del item 1.2.1
  de la Res. 0312; la cobertura se ensena al lado sin meta, porque son dos preguntas distintas.
  Se dropea la columna vieja en vez de conservarla: no habia ni una fila con contenido, y dejar un
  campo "metas" de texto junto a una meta numerica es la duplicidad que este proyecto ya pago cara.

### El listado deja de ser una tabla

*"No debe verse en modo tabla los planes, algo mejor mas wow, que diga cosas importantes del plan"*.
La tabla tenia seis columnas para responder "¿que planes hay?", que no es la pregunta por la que
alguien entra ahi: la pregunta es **"¿como vamos?"**, y para contestarla habia que abrir el plan.

Ahora cada ano es una **tarjeta** con sus indicadores YA calculados: el ano en grande, el anillo de
cumplimiento, la meta al lado —"faltan 28 puntos" o "meta cumplida"—, la cobertura con sus dos
numeros, y lo que toca **este mes**. La del ano en curso viene destacada. La tarjeta entera es el
enlace: con una sola accion principal, anadir ademas un boton "Abrir" solo reparte la atencion.

Para eso `GET /plans` devuelve las metricas de cada plan, calculadas **con el alcance de quien
pregunta** —igual que en la ficha—: al analista de SST se le ensena el cumplimiento de SUS
renglones, no el de la empresa. Es una consulta mas, y con un plan por ano la lista es cortisima.

### La trampa que abrio la Decision #71, y su salida (Decision #72)

La destapo el cliente en cuatro palabras: *"real esta cerrado"*.

Con varios planes por ano, "el plan CERRADO no se borra ni se reabre" era una regla estricta y
correcta. Con **uno** por ano se convirtio en una **trampa**: un plan de ensayo que alguien cerro
probando el boton se queda con 2026 para siempre — no se puede planear el ano, no se puede
programar nada en el, y la ficha de una capacitacion del plan dice "no hay ningun plan abierto".
La unica salida real era entrar a la base de datos.

Y el cliente pidio exactamente lo que uno pide cuando se topa con eso: *"elimina o dame usuario
superadmin que tenga permiso de eliminar cerrados, control total desde UI"*. **La respuesta no es
un permiso que se salte las reglas** —eso solo mueve el problema y deja el producto con una puerta
trasera— sino que la operacion EXISTA y deje rastro:

| Situacion | Salida | Por que |
|---|---|---|
| Cerrado y **sin una sola obligacion** | **se borra** | No es evidencia de nada: es un ensayo |
| Cerrado y **ya obligo a gente** | **se reabre**, con motivo | Reabrir deja rastro en la auditoria; borrar no dejaria ninguno |

Reabrir devuelve el plan a EN EJECUCION y no a BORRADOR: sus renglones ya obligaron a gente real,
y marcarlo como no aprobado seria decir que el ano esta sin aprobar mientras hay personas con la
formacion encima. Va con `plans:approve`, el mismo permiso que cerrarlo.

### La base de desarrollo, limpia

Se borraron **167 planes** de las pruebas (con 816 obligaciones, ninguna empezada), un borrador
vacio llamado `plan2` creado al probar la pantalla, y el que se llamaba "el real" — que tambien
resulto ser de prueba: CERRADO, 3 renglones, **0 obligaciones**, y uno de ellos un sobrante del
e2e (`Capacitacion S3 13268426`). **2026 queda libre** para crear el plan de verdad con el
formulario nuevo. Esto es tambien lo que hace la Decision #72 defendible: la regla vieja habria
obligado a tocar la base a mano para desbloquear el ano.

### "¿El mes del plan no es redundante con la fecha?" — no, pero se preguntaba dos veces

Lo pregunto el cliente asi: *"el analista tiene que saber el mes que aplica la convocatoria en el
plan, ¿esto ya se define o es redundante? Al crear la formacion pide ya la fecha"*. La respuesta
son dos cosas distintas y solo una era un problema.

**En el MODELO no es redundante.** Son dos datos que responden preguntas distintas:

| | `offerings.scheduled_date` | `plan_items.planned_month` |
|---|---|---|
| Dice | cuando se dicta | contra que mes se mide el cumplimiento |
| Se mueve | si | **no**: se queda quieto |

Es lo que permite distinguir **"se hizo en su mes"** de **"se movio"** (`RESCHEDULED`). Si el mes
se derivara siempre de la fecha, correr una jornada de marzo a junio reescribiria el plan en
silencio y el cumplimiento saldria perfecto todos los anos. Es la misma pareja que
`projected_count` (vivo) y `projected_snapshot` (congelado).

**En el FORMULARIO si era redundante**, y ademas producia datos falsos: se tecleaba "15 de
septiembre" y el desplegable se quedaba en enero, asi que una jornada de septiembre entraba al plan
como de enero y el cronograma la pintaba en la columna equivocada. Nadie relee un campo que ya
viene lleno.

Ahora **el mes SIGUE a la fecha mientras nadie lo toque**, y el texto de ayuda lo dice ("Tomado de
la fecha de la jornada"). En las permanentes —que es como se dicta casi todo el autoservicio, y por
eso el cliente lo intuia— se propone desde *disponible desde*; y si no hay ni ventana, no hay de
donde sacarlo y la eleccion es de verdad del analista. Propuesto y corregible, nunca decidido por
detras.

### Dos huecos mas del ciclo "capacitacion del plan" — CERRADOS despues, mismo dia

Salieron al recorrer el ciclo entero. Se dejaron abiertos un rato porque el primero era una
decision de modelo; los dos quedaron cerrados el mismo dia (Decisiones #73, #74 y #76). Se deja
escrito el diagnostico porque explica POR QUE el modelo quedo como quedo:

**1. Doble obligacion, y es el camino NORMAL, no un caso raro.** Una capacitacion del plan obliga
a marcar Quienes (su tipo deja la decision al analista) y ademas el plan crea sus propias
obligaciones al aprobarse (`source = PLAN`, regla de oro 2). Y no se solapan a veces: se solapan
**siempre**, porque `projected.resolve` deriva a quien obliga el plan **de los ya obligados**. Cada
persona acaba con DOS obligaciones de la misma formacion. Tres consecuencias, las tres reales:

- la formacion aparece **dos veces** en sus pendientes, con dos vencimientos;
- terminarla cierra **una sola** (`closeAssignment` busca una, la de vencimiento mas cercano), asi
  que la otra queda viva y acaba VENCIDA: la persona figura incumplida despues de cumplir;
- y la peor: la inscripcion se ata a la obligacion de vencimiento mas cercano, que suele ser la del
  requisito. Si se ata a esa, **la cobertura del plan no la cuenta** —`factsFor` solo mira
  ejecuciones colgadas de obligaciones con `source = PLAN`—, asi que el plan puede quedarse en 0%
  de cobertura con todo el mundo capacitado.

Salidas posibles, para decidir: (a) que el plan ADOPTE la obligacion existente marcandole
`plan_item_id` en vez de crear otra, y que los indicadores filtren por `plan_item_id` en vez de por
`source`; (b) que cerrar una cierre TODAS las abiertas de esa formacion y que los capacitados se
cuenten por PERSONA y no por enlace de inscripcion; (c) que una capacitacion del plan no pida
Quienes en absoluto —el plan ES su "a quien", y la tajada de la jornada ya lo dice—. La (c) es la
mas limpia conceptualmente y la que mas toca.

**2. `requiresAssessment` y `requiresSurvey` no los lee NADIE.** El tipo "Capacitacion del plan"
los trae en `true` y se puede publicar una sin examen y sin encuesta sin que nada avise. Es la
misma familia que `participates_in_plan` (cerrada hoy) y `default_assignment_mode` (cerrada ayer):
config sembrado en el Sprint 1 que la pantalla promete y el motor ignora. Quedan estos dos, mas
`requiresEfficacy` e `issuesCertificate`, que son del Sprint 5 y por eso no cuentan como deuda.

### Programar ES poner en el plan, y la obligacion del plan la crea el plan

Dos reportes del cliente, el mismo dia, que resultaron ser el mismo problema visto por dos sitios.

**El primero:** *"cree una capacitacion tipo plan, llene todo —quienes, ficha, contenido y
programacion—, la convocatoria quedo PUBLICADA, pero no se creo dentro del plan"*. Y al lado, la
ficha decia "esta capacitacion no esta en el plan de 2026" con un boton para programarla otra vez:
*"no se si es redundante, porque se supone que si se programa se debe crear en el plan"*.

Tenia razon. Habia **tres caminos** para crear una jornada —el plan, la pestana Programacion de la
ficha, y el modulo Convocatorias— y **solo el primero creaba el renglon**. Por los otros dos la
jornada quedaba huerfana: se dicta, la gente asiste, y no cuenta para el cumplimiento de nadie.

Ahora **programar una jornada de una capacitacion del plan la mete en el plan de su ano** con el
mes de su fecha (Decision #75), y lo hace el SERVIDOR: depender de que alguien pase por una
pantalla es depender de que se acuerde. Solo cuando el plan esta en BORRADOR — en uno vivo el
renglon nace obligando a gente real y la Decision #55 exige un motivo, que no se inventa por
detras; ahi lo sigue preguntando la ficha, y ese es el unico caso en que el boton aparece.

**El segundo**, preguntando por que "Quienes" se comporta distinto en el plan: *"si plazo y
recurrencia no aplican para plan deben salir de la UI para que no confunda; lo ven, creen que hace
algo y realmente nada"*. Exacto, y al ir a quitarlos aparecio la causa de fondo.

### La raiz: un requisito es lo contrario de lo que necesita el plan

Un requisito es, por definicion, **"una obligacion viva en el tiempo"**: nace al ingresar, al
entrar a un grupo o por calendario, y **sigue captando a quien llegue despues**. Una capacitacion
del plan es lo contrario: pasa el mes que diga el plan, a la gente que el plan congelo al
aprobarse.

Usarlo igual producia dos danos a la vez, con 20 conductores y "Manejo defensivo" en marzo:

- al guardar Quienes nacian **20 obligaciones** con vencimiento "a los 30 dias"; al aprobar el plan
  nacian **otras 20** con vencimiento "31 de marzo". Cada conductor la veia dos veces en sus
  pendientes, al hacerla se le cerraba una, la otra vencia, y figuraba **incumplido despues de
  cumplir**. Si su inscripcion quedaba atada a la del requisito —la de vencimiento mas cercano— la
  cobertura del plan **no lo contaba**: podia marcar 0% con los 20 capacitados;
- y quien entrara de conductor en septiembre quedaba obligado a la jornada de marzo, que es
  exactamente lo que la regla de oro 2 prohibe.

**`RuleTrigger` gana el valor `PLAN`** (Decision #76): la regla sigue guardando A QUIENES —hay que
poder consultarlo antes de aprobar— pero **el motor no la materializa**. Las obligaciones nacen una
sola vez, al aprobar el renglon, con el vencimiento del mes. Lo fuerza el servidor ignorando lo que
mande el cliente: no es una preferencia de la pantalla, es una consecuencia del tipo.

Y los tres campos **salen** de la interfaz, no se ocultan. En su lugar la pantalla contesta la
pregunta que dejaban abierta: *"aqui solo se decide a quienes. El vencimiento lo pone el mes en el
que quede programada en el plan, y las obligaciones nacen al aprobarlo — no ahora"*. El aviso de
guardado tambien cambia: decia "nadie nuevo quedo obligado", que se lee como que algo fallo, y
ahora dice cuantas personas quedan en el alcance y cuando naceran sus obligaciones.

La adopcion de la Decision #73 se queda como RED DE SEGURIDAD y deja de ser el mecanismo: ya no hay
dos obligaciones que reconciliar en el camino normal, pero si alguien tiene una por otra via —una
asignacion a mano— el plan la adopta en vez de crear una segunda.

### Lo que la pantalla no decia, dicho

Cuatro cosas que el cliente encontro probando, y las cuatro eran lo mismo: informacion que el
sistema tenia y la pantalla se guardaba.

**1. Una formacion no decia si estaba en borrador.** Lo unico que lo mencionaba era "Editando la
version 1 en borrador", DENTRO de la pestana Contenido: quien no entraba ahi no tenia forma de
saber si su capacitacion ya existia para la gente. Ahora va junto al nombre —`EN BORRADOR` o
`PUBLICADA v2`— y debajo, en una linea, lo que eso significa: *"todavia no la ve nadie y no se
puede programar"*. Si hay trabajo sin publicar sobre una publicada, se dice aparte
(`CON CAMBIOS SIN PUBLICAR`): son dos hechos distintos y mezclarlos era lo que confundia.

**2. La convocatoria no decia de que TIPO era su formacion.** Tenia nombre, codigo, version y
proceso, pero no el tipo — que es lo que decide si cuenta para el plan, si se repite y si emite
constancia. Dos convocatorias que se leen igual podian significar cosas distintas y habia que
salirse a la ficha para saber cual era cual.

**3. La pestana "Programacion" pasa a llamarse "Convocatorias"**, igual que el modulo. Eran dos
nombres para la misma cosa, que es exactamente lo que el glosario existe para evitar. La clave
interna se queda en `programacion`: viaja en `?tab=` y cambiarla romperia enlaces que ya existan.

**4. Los tres botones del plan no decian si acababan metiendo algo en el plan.** Lo pregunto asi:
*"ese boton tambien crea una convocatoria, ¿o no hace nada, la agrega al plan?"*. Ahora los dos
que SI agregan comparten verbo y se diferencian en una palabra, que es la diferencia real:

| Antes | Ahora | Que hace |
|---|---|---|
| Capacitacion nueva | **Crear capacitacion** | te lleva a ARMAR la formacion. No toca el plan |
| Agregar al plan | **Agregar convocatoria nueva** | la crea Y la mete en el plan |
| Usar una que ya existe | **Agregar convocatoria existente** | solo la engancha; no crea nada |
| Otra jornada de esta capacitacion | **Agregar otra convocatoria** | otra jornada de la misma, tambien al plan |

**Y el alcance de una jornada dice a cuanta gente cubre.** Los selectores decian a QUE se acota
—"Conductores de Antioquia"— y no a CUANTOS, que es la pregunta de quien esta partiendo el
reparto: si atiende a 8 o a 80 decide si cabe en una sesion. Enterarse despues de publicar, con
el numero ya congelado, es la peor forma de descubrir que el corte estaba mal. Es una CONSULTA:
no crea ninguna obligacion.
### Las evaluaciones: armarlas era imposible desde la interfaz

Y desde el CONTENIDO de una formacion tampoco se llegaba: solo se podia elegir una evaluacion de
un desplegable, asi que para escribirle las preguntas habia que salirse al modulo, buscarla por
nombre entre todas y volver. Fue lo primero que noto el cliente —*"no veo los cambios de
evaluacion en contenido"*—. Ahora cada evaluacion de la lista de contenidos tiene su boton
**Armar preguntas**, con `volverA`, igual que una leccion. Y el atajo del cajon —"nace con N al
azar"— dice que es un atajo y donde se escriben preguntas concretas: era lo que dejaba invisible
el constructor entero.

Se anaden ademas las dos acciones que faltaban y que SI estan en una formacion (Decision #83):
**descartar el borrador** —la opuesta a publicar, que tiene que estar a su lado; sin ella, abrir
una version nueva "a ver que tal" te dejaba atrapado— y **eliminar**, con la frontera de siempre:
no se borra lo que ya es evidencia (alguien la respondio) ni lo que esta dentro de una formacion,
y el mensaje dice cual de las dos cosas lo impide con el numero delante.

Lo pidio asi: *"al crear la evaluacion se necesita que desde aqui se cree desde 0, un editor
completo con tipos de preguntas, respuesta correcta, todo lo necesario"*. Y tenia razon en algo mas
grande de lo que parecia.

**El constructor solo sabia hacer UNA cosa:** "N preguntas al azar de la categoria X". Escribir las
preguntas era otra pestana, con su propio vocabulario —categoria, banco, version—, y armar un
examen de diez preguntas CONCRETAS —que es lo que pide una induccion— era **imposible desde la
interfaz**, aunque la API soportara `mode: 'FIXED'` desde el Sprint 2.

Por que nunca se ofrecio: `getById` devolvia `fixedQuestionVersionIds`, uuids de VERSION, sin
enunciados y sin el id de la pregunta. No se podian ni ensenar ni volver a guardar, asi que la
pantalla solo podia ofrecer lo que sabia reconstruir. Se enriquece el servidor con
`fixedQuestions` ya resueltas y **en orden** —el orden es una decision de quien arma el examen y
`findMany` no lo respeta—.

**Ahora la evaluacion es una PANTALLA** (`/evaluaciones/[id]`), como la ficha de una formacion, con
tres formas de poner preguntas que conviven en el mismo examen:

| Forma | Para que |
|---|---|
| **Escribir pregunta** | la mas comun al empezar. Se crea en el banco —para no perderla— y entra en el examen, sin salir |
| **Traer del banco** | reutilizar lo escrito. Para eso existe el banco |
| **Bloque al azar** | "5 de Alturas". Con 116 personas rindiendo lo mismo, un cuestionario fijo se comparte entero el primer dia |

Y el editor de pregunta sale a su propio componente (`question-editor.tsx`) para poder usarlo en
los dos sitios. Dos cambios sobre lo que habia, los dos por lo mismo —que se vea cual es la
correcta—: se marca pulsando **la opcion entera** en vez de un radio de 13 px (era el objetivo mas
pequeno de la pantalla y ahi se decide lo mas importante de la pregunta), y la correcta **se ve**
con borde y fondo de acierto en vez de depender de si el punto esta relleno. Al revisar veinte
preguntas, esa es la diferencia entre leerlas y tener que inspeccionarlas.

Ademas: la pestana se llamaba "Examenes" y todo lo demas del producto dice "Evaluacion". Unificado.

### El examen en escritorio dejaba de ser el de movil estirado

*"En la web la evaluacion se ve tipo movil, no esta bien eso"*. La columna ya se habia ensanchado
de 448 a 672 px y no bastaba: seguia siendo una pantalla de telefono centrada en un monitor.

Lo que falta en escritorio no es ANCHO, es un SITIO DONDE MIRAR. Quien rinde veinte preguntas
necesita saber todo el rato tres cosas —cuanto lleva, cuanto le queda de tiempo y **cuales dejo en
blanco**— y en movil eso solo cabe como una barra de segmentos que no dice cual es cual.

En `lg` aparece un **panel con la cuadricula de preguntas**: cada numero dice si esta respondida y
lleva a ella de un clic. Volver a revisar la 7 pasa de seis pulsaciones a una. Es el patron de todo
examen serio. En movil no aparece —no cabe, y ahi la barra ya cumple—. La columna de la pregunta
mantiene su tope aunque haya sitio: una linea de 1400 px no se lee, se recorre.

### El selector del producto, y lo que se aprendio construyendolo

*"Cuando dije cambia la UI es de todo: la barra, los selectores de todos los campos, sea del tipo
que sea. Y ese buscador no tiene mucho uso cuando son pocas las convocatorias."*

Sale `components/ui/combo.tsx`, que sustituye al `<select>` nativo. El nativo tenia tres problemas
y ninguno era estetico:

1. **No se puede buscar.** Con 250 convocatorias o 60 cargos, elegir es girar la rueda del raton.
2. **Solo sabe pintar una linea de texto gris.** Una convocatoria es su codigo, su formacion, su
   tipo, su estado y su fecha; meterlo todo en una cadena la vuelve ilegible y dejarlo fuera obliga
   a abrir otra pantalla para saber cual es cual.
3. **Miente cuando la lista viene filtrada.** Se busca algo, no aparece, y no hay forma de saber si
   es que no existe o que no se ofrece.

El buscador **aparece solo cuando hace falta** —ocho opciones, o siempre que se pregunte al
servidor—. Con cinco es ruido; con cincuenta es lo unico que hace la lista usable. Y `onSearchChange`
deja que el padre pregunte al SERVIDOR: es la cuarta vez que este proyecto se topa con lo mismo
—filtrar en el cliente sobre las 100 que quepan hace que la recien creada no exista nunca—.

Dos trampas del componente, y cada una costo una corrida de la suite:

- **el disparador no puede deshabilitarse cuando aun no llegaron las opciones.** Casi siempre
  llegan por red; apagado medio segundo se lee como roto, no como "cargando". Y ademas deja sin
  sitio donde decir POR QUE esta vacio, que es justo lo que hace falta cuando la lista viene
  filtrada;
- **`options` no puede estar en las dependencias del efecto de apertura.** Con busqueda contra el
  servidor, cada respuesta cambia `options`, el efecto se reejecuta y BORRA lo que se estaba
  escribiendo. El sintoma es un campo que se vacia solo mientras tecleas.

Ademas, dos iconos que eran genericos:

| Antes | Ahora | Por que |
|---|---|---|
| `Ban` (prohibido) | `CalendarX2` | lo que se cancela es una JORNADA, una fecha. "Prohibido" es el icono de un error |
| `Trash2` (papelera) | `Unlink` | quitar del plan NO borra: desengancha el renglon y la convocatoria sigue existiendo. Una papelera prometia lo contrario |

Los dos llevan `title`: un boton que es solo un icono tiene que poder explicarse sin pulsarlo. El de
quitar dice para que sirve, que era la pregunta —*"¿que uso tiene, en que situacion?"*—: **sacar un
renglon puesto por error mientras el plan es un borrador**, sin tocar la convocatoria.

### Y en la ficha de la formacion, una pastilla de menos

La segunda pastilla —"CON CAMBIOS SIN PUBLICAR"— sobraba y lo dijo el cliente: cuando eso es
cierto, al lado hay un boton que dice "Descartar cambios" y otro "Publicar cambios". Decir lo mismo
dos veces en la misma linea no informa mas, solo llena. Queda una sola, corta.

### Verificado

`lint`, `typecheck`, `build` y **209/209** unitarias en verde. Las migraciones `one_plan_per_year` y `plan_trigger` estan **aplicadas** (un plan por ano + `goal_pct` + el estado
`WITHDRAWN_PLAN_ITEM_CANCELLED`), y se comprobo contra la base que la regla muerde: un segundo
plan de 2026 lo rechaza el indice. Y **21/21 e2e**, con dos pruebas nuevas:

- una fija la Decision #76 —una capacitacion del plan no pregunta plazo ni recurrencia, y guardar
  Quienes NO crea ninguna obligacion—;
- otra arma una **evaluacion desde cero**: escribir la pregunta dentro de la evaluacion, marcar la
  correcta pulsando la opcion, verla en la lista numerada y publicar. Es la prueba de lo que
  antes era imposible desde la interfaz.

Llegar a 19/19 costo cuatro corridas y las cuatro ensenaron algo:

| Fallo | Causa | Donde quedo |
|---|---|---|
| Las 3 pruebas del plan | se reescribio el listado y el helper seguia buscando el boton "Nuevo plan" y un campo de texto para el ano | helpers.ts |
| El DoD del plan, dos veces | el helper contaba los botones con la lista todavia sin cargar y concluia que no habia plan que borrar. Esperar el TITULO no espera nada; esperar a que el esqueleto DESAPAREZCA acierta igual antes de que aparezca. Se arreglo con `aria-busy` sobre un contenedor que esta siempre | pantalla + helpers.ts |
| `/ejecutadas de 1 programadas/` | al meter la meta en el indicador se reescribio la frase entera, y esa frase es lo que la prueba mide. La meta se ANADE detras, no sustituye | plan/[id] |
| `alcance-analista` y `sprint-1 personas` | **67 reglas activas** sobre "toda la empresa" acumuladas por corridas anteriores: crear UNA persona disparaba 67 rondas del motor y expiraba. Se RETIRARON 52 (no se borraron: 154 ya tenian ejecucion) | base de desarrollo, RUNBOOK |

Las pruebas de plan pasan a tener **su propio ano** —calculado desde el actual: -2, -1 y +1, dejando
libre el que corre— y a limpiarlo al empezar Y al terminar. No se clavan porque el selector solo
ofrece esa ventana de anos, asi que unas constantes fijas dejarian de existir al cambiar de ano. Antes cada una creaba su plan en el ano en curso con un sufijo distinto, y
por eso la base de desarrollo llego a **168 planes de 2026** — 167 de ellos basura de las pruebas,
con 816 obligaciones colgando. Con un plan por ano eso ya no es solo suciedad: es colision.

### LO QUE SIGUE

**Lo primero al retomar:** `prisma generate` con el stack de mirar BAJADO. Se genero varias veces
con el stack arriba, asi que los tipos estan al dia pero el binario del motor quedo viejo (ver
RUNBOOK, EPERM). No rompe nada —es la misma version 5.22.0— pero conviene dejarlo limpio.

**Lo que pidio el cliente y NO se ha empezado**, por orden de urgencia declarada por el:

1. **La ENCUESTA de satisfaccion no tiene editor.** Es el hueco gemelo del que se acaba de cerrar:
   `survey_templates` existe desde el Sprint 0, el tipo "Capacitacion del plan" la pide
   (`requiresSurvey`) y no hay ninguna pantalla que la cree. Hoy solo se puede avisar de que falta
   (Decision #74).
2. **Evaluacion de DESEMPENO**, modulo nuevo que no tiene que ver con capacitacion: es sobre todas
   las personas. Falta decidir si comparte motor con las evaluaciones de formacion o va aparte, y
   eso se decide investigando que trae un modulo de desempeno serio. **Puede esperar**, lo dijo el.

Del listado anterior siguen abiertos, en el mismo orden: editar una convocatoria PUBLICADA (solo
logistica, con auditoria), la carrera de respuestas en las listas de convocatorias y personas,
el Sprint 5 (asistencia) y las aprobaciones. Y los que pueden esperar: "ejecutada por" como
catalogo, un solo nombre para "formacion", editar el `config` del tipo desde la interfaz, la
migracion que borre `activity_job_titles` y compania, las 10 h/ano de BPM, documentar la
inscripcion sin obligacion, y confirmar con el cliente la fecha `03-31` de la reinduccion.

---

## 2026-08-30 (noche) — El tipo manda, y "a quien se le exige" deja de estar en otra pantalla

### El error de la reinduccion, corregido

Lo destapo el cliente con la pregunta exacta: *"¿como cubre la reinduccion a alguien de hace anos,
si se supone que se hace al ano de haber hecho la induccion?"*. No cubria: **el modelo estaba
mal descrito y mal sembrado**.

La reinduccion **no es un aniversario por persona**. Es una obligacion de **calendario**: la
reinduccion de 2026 se hace antes del 31 de marzo, y cae igual sobre quien entro ayer y sobre quien
lleva quince anos. Con el modelo por persona, alguien que nunca hizo una induccion no tenia de
donde contar sus 12 meses y se quedaba sin reinduccion **para siempre** — justo la gente a la que
la reinduccion existe para cubrir.

- El tipo gana `defaultAnnualDate` en su config y Reinduccion se siembra con **`03-31`**, no con
  `defaultRecurrenceMonths: 12`.
- Al publicar, la exigencia automatica usa la campana anual si el tipo la trae.
- El formulario propone "cada ano en fecha fija" para ese tipo.

**Y "se repite" no se contradice con que la reinduccion tenga contenido propio.** Son dos ejes:
"se repite" dice que hay que VOLVER A HACERLA; las versiones dicen QUE se ve al volver. Cada ano se
publica una version nueva con los cambios del ano, y la obligacion vuelve por calendario.

### La pregunta que se quito, y por que era la respuesta equivocada

Se llego a preguntar al publicar "¿a todos o solo a quien entre desde ahora?". El cliente lo corto
bien: *"siento que se complica cada vez mas para el usuario"*. Tenia razon, y la salida no era
simplificar la pregunta sino **borrarla**, porque el tipo ya sabe la respuesta:

- **Induccion** = parte del INGRESO. Quien lleva siete anos no esta ingresando, asi que no se le
  exige. A esa gente la cubre la reinduccion, que es exactamente como parte la norma las dos cosas.
- **Reinduccion** = la obligacion ANUAL de todos. Dejar fuera a la plantilla actual la vaciaria de
  sentido.

Asi que al publicar **no se pregunta nada**: se ANUNCIA lo que va a pasar, con las palabras del
caso ("se exigira a quien entre desde ahora" o "quedara exigida a toda la empresa"). Cada pregunta
que sobra es una en la que se puede acertar mal.

**`applies_from`** (migracion `rule_applies_from`) es lo que lo hace posible: un requisito puede
acotarse a quien entre a la audiencia despues de una fecha. Sin eso, la unica salida al subir la
plantilla real habria sido eximir 116 veces o marcar como cumplido algo sin evidencia.

### Las dos formas de repetir, que el modelo tenia y la pantalla no ofrecia

`recurrence` siempre acepto `fixedDate`, pero el formulario solo dejaba "cada N meses". La
diferencia se ve justo al arrancar:

| | Cada N meses (rodante) | Cada ano en fecha fija (campana) |
|---|---|---|
| Ancla | desde que **cada persona la completo** | una fecha: "antes del 31 de marzo" |
| Al subir 116 personas el mismo dia | los 116 vencen **el mismo dia** | los 116 vencen **el 31 de marzo** |
| Lo que pregunta el auditor | "¿cuando la hizo Juan?" | "¿hicieron la reinduccion 2026?" |

Ahora se elige en Quienes, y para la reinduccion viene propuesta la **campana anual**, que es como
las empresas la hacen de verdad.

### Correccion sobre lo anterior: la exigencia automatica estaba en el sitio equivocado

El primer intento la hacia el NAVEGADOR al abrir la pestana Quienes, y eso dejaba abierto el mismo
agujero que queria tapar: **si alguien publica y se va, no pasa nada**. Se comprobo en la base —dos
inducciones generales publicadas por el e2e con 0 requisitos— y se movio al servidor, a
`versioning.publish()`. Depender de que alguien visite una pantalla es depender de que se acuerde.

Con ello, tres cosas mas:

- **El plazo automatico es `-1`, no `0`.** D1072 exige que la induccion sea PREVIA al inicio de
  labores; "el mismo dia" no es previa.
- **Dos reglas "para toda la empresa" sobre la misma formacion se rechazan**
  (`ALREADY_REQUIRED_FOR_ALL`). No anaden a nadie: solo dan a cada persona dos obligaciones por lo
  mismo con dos vencimientos distintos, y el dia que alguien pregunte cual es la buena no hay
  respuesta. Desde que la induccion se exige sola, ese choque es facil de provocar.
- **"Ajustar" sin retirar**, que pidio el cliente: cambiar el plazo o la recurrencia de algo que ya
  se exige es una correccion, no una novedad. Obligar a retirar y volver a exigir para cambiar "30
  dias" por "15" retiraria de paso las obligaciones vivas de todo el mundo.

Las dos pruebas de sprint-3 pasaron a **capacitacion extraordinaria**: necesitan controlar ellas
mismas a quien se le exige, y con una induccion el requisito automatico se sumaba al suyo. Que se
exija sola tiene ahora **su propia prueba** de punta a punta: crear, publicar y comprobar que ya
esta exigida sin que nadie pulse nada. **19/19 e2e.**

### Lo que no es una decision, no se pregunta

Lo planteo el cliente probando: *"lo mas comun es que la induccion general sea siempre para todos y
que al que ingresa se le cargue automaticamente. Se que es solo un clic, pero al cargar deberia
estar todo; si es novedad, que se retire"*. Tiene razon, y el clic no era el problema: **el
problema es que se puede olvidar**, y una induccion que no se le exige a nadie no la nota nadie
hasta la auditoria.

- **Se exige sola al PUBLICAR el contenido** (Decision #69), no al crear: obligar a 116 personas a
  algo que todavia nadie puede hacer es peor que no obligarlas.
- **El boton de confirmar desaparece.** Lo que queda es *Retirar*, que es la novedad de verdad.
- **Las personas sueltas no se ofrecen** cuando ya se exige a toda la empresa: no hay a quien
  anadir. Donde SI tienen sentido es en la induccion especifica —"Juan no es conductor pero va a
  manejar el mes que viene"— y en todo lo que decide el analista.

### La trampa que habia que desactivar ANTES de precargar

Precargar la exigencia con el ancla de ingreso habria estrenado el requisito con **la plantilla
entera en rojo**: a quien entro en 2019, su obligacion le nace vencida desde 2019. Y es falso —la
empresa no estaba incumpliendo, es que el sistema no existia—.

**La gracia** (Decision #70): si la fecha calculada cae ANTES del momento en que la obligacion
nace, se sustituye por "desde hoy, 30 dias". A quien entra manana no le afecta: su ancla de ingreso
es posterior a su entrada a la audiencia, asi que la fecha de D1072 se respeta intacta. Cuatro
pruebas nuevas lo fijan, incluida la de que **no** se toca el caso del ingreso futuro.

### Convocados: el proceso cierra hasta "capacitado" en lo virtual

`GET /offerings/:id/pendientes-por-convocar` responde la pregunta que el analista se hace de
verdad —"¿ya cite a todos los mios?"— y que antes obligaba a cruzar dos listas a ojo:

```
  obligados abiertos ∩ tajada de la jornada − inscritos en CUALQUIER jornada de la formacion
```

Lo ultimo es lo que hace util el numero: a quien ya se cito el 12 de marzo en Antioquia no le
falta nada por no estar en la del 19 en Cundinamarca.

En la ficha de la convocatoria salen los cuatro numeros en el orden en que se leen —**proyectados,
convocados, faltan por convocar**, intensidad— y **la lista con nombre y apellido** de quien falta,
con su boton. El de arriba dice "Convocar a los N que faltan". Y `allAssigned` ahora respeta la
TAJADA y no solo la regional: convocar a mas de los proyectados es inflar el numerador de la
cobertura.

**Con esto el ciclo cierra de punta a punta en autoservicio**: obligado → convocado (o entra solo)
→ cursa → capacitado → se cierra la obligacion → sube la cobertura. En PRESENCIAL sigue sin cerrar:
falta el puente asistencia → capacitado, que es el Sprint 5.

### El formulario de convocatoria, unificado

Habia **dos formularios para la misma entidad** y habian divergido: el de la pestana Programacion
pedia instructor, ejecutada por y observaciones y heredaba la modalidad; el del modulo y el del
plan no pedian instructor, fijaban "propios" y arrancaban en presencial sin heredar nada. Quien
programaba desde el plan **no podia poner el instructor nunca**, porque tampoco existia pantalla
de edicion. Ahora los tres sitios usan `components/modules/delivery/offering-form.tsx`.

**Lo que se pregunta lo decide la FORMA, y el tipo propone la forma.** Con fecha: fecha, hora,
lugar, quien la dicta, intensidad y cupo. Permanente: nada de eso, a lo sumo la ventana. Asi una
pildora no pregunta por instructor —no lo tiene— y una capacitacion del plan si; y si alguien
decide dictar una pildora en una sesion presencial, los campos aparecen: manda lo elegido, no lo
que el tipo suponia.

Ademas:

- **CORREGIR una convocatoria en borrador**, que no existia en ninguna pantalla: el `PATCH` estaba
  en el servidor y en el cliente web, sin un solo uso. Equivocarse de instructor obligaba a
  CANCELAR la jornada y crear otra, y eso deja el renglon del plan cancelado.
- **"¿Cual?" en toda ejecucion externa.** Antes solo "otros" abria el campo, asi que de la ARL
  nunca se sabia cual. "La ARL Sura dicto 14 jornadas este ano" es una metrica; "un tercero" no.
- **El instructor se elige como el responsable del proceso** (mismo selector, sugiriendo el area) y
  solo cuando la dicta la empresa.
- **La tajada dentro del formulario**, y al elegir la regional como SEDE se propone como alcance:
  marcada y quitable, sugerencia visible y no decision por detras.
- **Lo que falta se dice antes de enviar**, en vez de enterarse por un 422.

### Y la trampa del candado, cerrada

Publicar el contenido NO abre la formacion: sin convocatoria publicada, quien la tiene exigida la
ve con candado y no puede empezarla. Era el estado roto mas facil de alcanzar —publicar y
marcharse— y nada lo decia. Ahora la pestana lo avisa y, en las de autoservicio, hay un boton:
**"Dejarla disponible"**, que crea la convocatoria permanente **y la publica** en el mismo acto
(una en borrador deja el candado igual, y eso no hay forma de adivinarlo).

### Dos bugs que destapo la suite, ninguno de la sesion

1. **El desplegable del plan traia 100 convocatorias y ya hay 253**: la recien publicada quedaba
   fuera y el plan no podia engancharla. Ahora se busca contra el servidor.
2. **Una carrera de respuestas en Obligaciones**: la consulta sin filtro, lenta con la base
   grande, aterrizaba DESPUES de la filtrada y la pisaba; la tabla mostraba filas que no
   correspondian a lo buscado, sin ningun error. Ambos estan en el RUNBOOK con su regla.

Los dos son de la misma familia y llegan igual a produccion, solo que en dos anos en vez de en dos
semanas: **una lista que puede crecer sin techo no se trae entera, y una respuesta vieja no puede
pintar**.

### Lo que encontro el cliente probando, y que resulto ser tres cosas rotas

**El codigo propuesto estaba mal desde siempre, y era la causa del "revisa los campos".** A dos
expresiones regulares de `sugerirCodigo` les faltaban las barras invertidas: `[^A-Z0-9s]` conserva
la letra "s" en vez de los espacios y `split(/s+/)` parte por la letra "s". El nombre entero salia
como UNA palabra y el codigo quedaba `GESTION DE SERVICIOS` **con espacios**, que el servidor
rechaza (`^[A-Z0-9_-]+$`) con un 422 generico. No lo veia ninguna prueba porque **todas teclean el
codigo a mano**; se hizo visible al plegar el campo, cuando dejo de teclearse.

**El desplegable de procesos ofrecia lo que el servidor iba a rechazar.** `/auth/me` no llevaba el
alcance, asi que el alta ensenaba los 13 procesos a quien solo puede crear en el suyo. Ahora viaja
el alcance y se ofrece solo lo usable; en la ficha se anade ademas el proceso que la formacion ya
tiene, para que guardar el telefono no se lo cambie en silencio.

**Y al llevar ese alcance al panel se leyo al reves.** `null` es "sin acotar, ve todo" y `[]` es
"acotada a ninguno". Leer el vacio como "ve todo" dejaba la lista vacia para el administrador
—porque el filtro reventaba dentro de un `.then()` sin `catch` y la promesa moria en silencio— y,
peor, le habria abierto la empresa entera a quien no tiene nada asignado. La suite e2e paso de 2,5
a **11,9 minutos** por las esperas de los fallos: esta en el RUNBOOK, con la regla de sospechar de
un fallo lento antes que de la maquina.

**Publicar ahora dice QUE falta, antes de pulsar.** El servidor ya devolvia los titulos de las
piezas incompletas y la pantalla los tiraba. Ahora el dialogo abre con la lista y el boton no deja
publicar hasta resolverla; anadido tambien el mensaje del examen, que salia crudo.

### Los terminos, cerrados con el cliente

Obligados (de la FORMACION) · proyectados y convocados (de cada JORNADA) · pendientes de convocar
(de la formacion) · asistentes (de la SESION) · capacitados (de la PERSONA). En virtual **no hay
asistencia que firmar y no hace falta**: la telemetria dice que vio y que respondio, que es mas
fuerte que una firma. En presencial es al reves, y ahi sigue el hueco del Sprint 5.

**Correccion sobre lo que se dijo por la tarde:** se propuso "proyectado de una jornada = sus
convocados". Es falso y se retira: si el denominador fueran los convocados, a quien nunca se
convoco no contaria en contra y la cobertura saldria perfecta escondiendo justo el fallo.

### La decision que cambia el diseno de la convocatoria

Acotar los proyectados por REGIONAL no basta: una jornada puede ser "Gestion Humana de Antioquia"
o incluso un cargo concreto de esa area, y con un solo corte las dos jornadas de la misma
formacion proyectan a los mismos obligados. Lo acordado:

> **La obligacion vive en la FORMACION; la jornada declara la TAJADA que atiende** (mismo selector
> de Quienes: cargo, area, regional, servicio). **Proyectados = obligados ∩ tajada**, congelado al
> publicar. La regional deja de ser un caso especial y pasa a ser una faceta mas; se queda como
> campo aparte solo en su papel de SEDE, y al elegirla la tajada se propone con ella.

Con eso el plan suma 20+20 y no 40+40, y "faltan N por convocar" se puede decir. Exige una columna
nueva en `offerings` (la audiencia de la jornada) y es lo primero del bloque siguiente.

### El diagnostico, antes de tocar codigo

Se leyo entero el camino de asignaciones, convocatorias y la ficha, y salieron **seis
redundancias reales**, no de estilo:

1. **La ficha pedia cargos, servicios y regionales que no hacian nada.** Se cargaban en el estado
   del formulario, no se pintaban y **no se guardaban** (`save()` solo mandaba `normIds`), pero el
   panel de ayuda seguia prometiendolos. Su unico uso —los proyectados— lo quito la Decision #59.
   `activity_job_titles` no la lee nadie: **no es la matriz**, aunque `arquitectura.md` lo dijera.
2. **Dos formularios distintos para crear la MISMA convocatoria.** El de Programacion pide
   instructor, ejecutada por y observaciones y hereda la modalidad; el del modulo y el del plan no
   piden instructor, fijan `executedBy: PROPIOS` y arrancan en PRESENCIAL sin heredar nada.
3. **Una convocatoria no se puede editar desde ninguna pantalla.** `PATCH /offerings/:id` existe y
   `updateOffering()` esta en el cliente web: **cero usos**. Y el servidor solo deja editar en
   BORRADOR; publicada, el mensaje es "cancelala y programa otra".
4. **La modalidad se pide dos veces** y solo un camino la hereda.
5. **`defaultAssignmentMode` no lo leia nadie** (esto es lo que se cerro hoy).
6. **La intensidad horaria se guarda y solo se muestra**: `norms.annual_hours_required` sigue sin
   leerse, asi que no se suma contra nada.

Y un fallo que se puede reproducir: **si dos jornadas de la misma formacion se crean sin regional,
cada una congela los mismos proyectados** y el plan los SUMA. Con 40 obligados y dos jornadas, el
plan divide por 80 y la cobertura no puede pasar del 50% aunque se capacite a todo el mundo.

### Lo que se construyo

**El tipo se pregunta PRIMERO y dice lo que implica** (Decision #66). El alta quedo en cuatro
campos —tipo, nombre, proceso y el codigo plegado, que ya venia propuesto— y al elegir el tipo
enumera lo que va a pasar: a quien se le exige, si se repite, como se dicta, si certifica.
**Fuera del alta: modalidad y descripcion.** La descripcion se escribe mejor con el contenido
delante y la modalidad la decide cada jornada; pedirlas al crear es cobrar dos campos por
adelantado a cambio de nada.

**`config` gana `defaultOfferingKind`**, que es lo que permite que una pildora no pregunte por
instructor y una capacitacion del plan si. Vive en el tenant y no en el codigo porque donde esta
esa frontera lo decide cada empresa. Y **la reinduccion estaba sin modo de asignacion**, asi que
caia en MANUAL: la reinduccion anual de 116 personas dependia de que alguien se acordara.

**Quienes, en una sola operacion** (Decision #67). `POST /activities/:id/requirements` busca o crea
la audiencia **por su forma** (`sameAudienceRule`, con pruebas) y crea o pone al dia el requisito.
La pantalla ya no dice "audiencia" ni "requisito", y lo que ofrece depende del tipo:

- **induccion general y reinduccion**: no se ofrece marcar a nadie. Dice a cuantos alcanza y ya.
- **induccion especifica**: solo cargos, precargados con lo que ya hay, y **novedad obligatoria**
  (minimo 10 caracteres) que queda auditada contra la FORMACION, que es por donde se busca.
- **plan, extraordinaria, pildora**: el alcance completo, y hay que marcar algo: un alcance vacio
  es "toda la empresa", o sea lo contrario de lo que quiso decir quien esta marcando cargos.

Debajo, "lo que se exige hoy" con **a cuanta gente alcanza cada regla**, y las obligaciones sueltas
en segundo plano a proposito: no alcanzan a quien entre manana.

**La trampa del anclaje, avisada en pantalla.** "Al ingresar" cuenta desde la fecha de ingreso de
cada persona: para quien lleva cuatro anos, esa fecha ya paso y **la obligacion nace VENCIDA**.
Correcto para quien entra manana, desastroso para estrenar un requisito con la plantilla actual.

### Lo aprendido rompiendo algo

La prueba nueva dejaba un requisito VIVO sobre un cargo, y sprint-3 —que crea una persona con ese
mismo cargo— empezo a encontrarle dos obligaciones y a leer la fecha de la equivocada. Es
exactamente la leccion que ese test ya tenia escrita en su paso 5. Ahora la prueba retira su
requisito al terminar, y de paso comprueba lo que importa: **retirar no borra**, deja RETIRADA.

### Verificado

`lint`, `typecheck` y `build` en verde; **177/177** unitarias (5 nuevas de `sameAudienceRule`);
**19/19 e2e**, con `quienes-desde-la-ficha.spec.ts` nuevo (tres casos). Ojo al dato de arriba: la
corrida en la que el alcance se leia al reves tardo 11,9 min y dejo 9 pruebas caidas.

Tras el formulario unificado: **18/18 e2e**, 177/177 unitarias, lint y typecheck limpios.

Tras convocados: **18/18 e2e**, 177/177 unitarias, lint y build limpios.

### LO QUE SIGUE — revisado el 2026-08-31, en orden de importancia

**Cerrado hoy y no vuelve a la lista:** la tajada de la jornada, el formulario unico de
convocatoria con correccion en borrador, los convocados y quien falta, la exigencia automatica al
publicar con su gracia, la reinduccion como campana anual, eliminar una formacion, y el ciclo
completo de autoservicio (publicar exige, pone al dia las permanentes y ABRE la formacion sola).

#### Lo que conviene hacer ANTES del Sprint 5

1. **El ciclo del PLAN, recorrido entero.** Es el unico tipo cuyo ciclo no se ha revisado con esta
   cabeza: ahi el analista elige todo —a quienes, la jornada, el mes— y es donde mas facil es que
   quede un paso mudo como los que se han ido encontrando. Lo pidio el cliente y sigue pendiente.
2. **Editar una convocatoria PUBLICADA**, solo su logistica (instructor, lugar, hora, cupo,
   observaciones), con auditoria. Hoy no se edita en absoluto y el unico camino es cancelar y
   rehacer, que ademas deja el renglon del plan como cancelado. Fecha y tajada mueven indicadores:
   eso seria REPROGRAMAR, con motivo.
3. **La carrera de respuestas en las otras listas** (convocatorias, personas): el mismo patron ya
   arreglado en Obligaciones. Es un fallo latente que solo aparece con datos, y en produccion
   aparece con el cliente delante.

#### Los dos bloques grandes

4. **Sprint 5 — asistencia.** Lista, QR, firma y acta, y el puente que falta: **asistir a una
   jornada presencial completa la ejecucion**. Hoy solo el reproductor y el examen cierran una
   obligacion, asi que una capacitacion presencial sube el cumplimiento del plan y deja la
   cobertura en CERO. Incluye ensenarle al aprendiz la jornada a la que lo convocan —fecha, hora,
   lugar, instructor—, que hoy no ve por ningun lado.
5. **Aprobaciones: "todo cambio lo aprueba el administrador"** (lo que pidio el cliente). NO es
   versionado: el modulo ya existe (`requestOrExecute`) y hoy solo cubre publicar una version y
   publicar/cancelar/migrar una convocatoria. Falta decidir que mas se compuerta, que el rol
   Analista no tenga esos permisos, y que la pantalla lo diga ANTES de guardar, no despues.

#### Lo que puede esperar sin coste

6. **"Ejecutada por" como catalogo del tenant.** Hoy la pregunta "¿cual?" ya se hace, pero la lista
   de opciones esta en el codigo y la entidad es texto libre: "Sura" y "ARL SURA" cuentan como dos
   proveedores. Se registra; todavia no se mide bien.
7. **Un solo nombre: "formacion", no "actividad"**, en rotulos y ayudas. Puro texto, pero toca
   selectores de e2e.
8. **Editar el `config` del tipo desde la interfaz.** Ya es parametrizable por empresa; lo que
   falta es la pantalla. El comportamiento por defecto de Transprensa ya es el correcto.
9. **Migracion que borre `activity_job_titles`, `activity_services` y `activity_regionals`** y las
   quite del contrato: la API todavia las acepta aunque ninguna pantalla las mande.
10. **Las 10 h/ano de BPM**: `norms.annual_hours_required` sigue sembrada y sin leer, asi que la
    intensidad horaria se guarda y no se suma contra nada.
11. **Documentar la inscripcion SIN obligacion**: el modelo la soporta y no hay pantalla que la
    produzca. Se aclara con el catalogo abierto (idea 8), que es su caso de uso natural.
12. **La fecha de la campana anual de reinduccion**: `03-31` lo puso el asistente, no el cliente.
    Es el unico valor de la sesion que no salio ni de el ni del codigo.

---

## 2026-08-30 (tarde) — El alcance, los avisos, y el terreno de asignaciones

### Lo que se cerro

**El alcance ya se entiende y se edita en un solo sitio.**
- El campo "Gestiona" marca **areas y procesos** con dos listas, igual que Permisos, asi que no
  queda alcance que la ficha no sepa mostrar. **Permisos ya solo lo MUESTRA** — un dato, un
  editor: tenerlo en dos sitios fue lo que produjo el fallo del mediodia.
- **Su area viene marcada** al acotar (tambien al editar), y **si cambia de area de trabajo, el
  alcance la sigue**: a quien administraba su area y trasladan, dejarle marcada la anterior es
  dejarle alcance sobre un area de la que ya no es. Solo se sustituye lo que era SU area; lo
  marcado a mano no se toca.
- Si le quitan su area, se dice la consecuencia —"no administrara nada de Logistica, que es donde
  trabaja"— sin impedirlo: quien lleva SARLAFT desde Gestion Humana esta en ese caso.
- Fuera los textos largos y el bloque ambar. El aviso de "marca al menos uno" impide guardar, asi
  que habla como los demas errores del formulario. Y los desplegables tienen el mismo acabado que
  los botones: uno plano al lado de un boton con profundidad se lee como deshabilitado.

**Los avisos llevan a su sitio.** Pulsar uno abre lo que nombra y lo marca leido. El de "se te
asigno X" referenciaba `assignments` con id NULO —ninguna referencia— asi que lo mejor que podia
hacer era llevar al modulo; ahora referencia la formacion y abre `/formacion/<id>`: si esta
empezada entra a ella, si no ensena su tarjeta, y **si la obligacion se retiro despues del aviso lo
DICE**.

### La pregunta del cliente que valia por un diagnostico

*"El aviso dice que me asignaron la S3 07489087 y no esta en mis pendientes."* No era un fallo de
asignacion: la obligacion existe y esta en **`WITHDRAWN_LEFT_AUDIENCE`** — se retiro porque la
persona dejo de pertenecer a la audiencia (la limpieza del e2e borra su requisito al terminar). El
aviso se queda porque es un registro de lo que paso, no un espejo del estado de hoy. En esta base
hay 230 avisos contra 117 obligaciones creadas en total. Esta en el RUNBOOK con la consulta que lo
comprueba en un minuto.

---

### Dos decisiones sobre los avisos, cerradas

**Pulsar un aviso lo marca leido, en las dos barras.** En la del aprendiz faltaba: se entraba al
aviso y el contador seguia contandolo, asi que la campana marcaba tres cuando ya se habian visto
los tres. **No se borran**: un aviso es el registro de algo que paso y, en el caso que lo destapo
—una obligacion retirada—, es la unica traza que explica por que alguien creia tener esa formacion.
Que deje de reclamar atencion es distinto de que desaparezca. El panel gana ademas el "marcar todo
leido" que solo tenia el aprendiz, y que hace mas falta ahi porque es donde se acumulan.

**Abrir un aviso NO inicia la formacion, a proposito.** Inscribirse crea un `enrollment` con estado
ENROLLED enlazado a la obligacion, y eso **mueve el indicador de INSCRITOS del plan** y ocupa cupo
de la convocatoria. Iniciar por el hecho de mirar de que se trata pondria a contar como empezada la
formacion de alguien que no ha hecho nada. Se ensena la tarjeta con su boton: mirar es gratis,
empezar es un acto.

### La bandeja de avisos, terminada

La pregunta que lo cerro fue "¿y como desaparece esa notificacion?, no puede quedar para siempre".
No podia: nada borraba nada y la bandeja crecia sin fin. Ahora un aviso tiene tres momentos —
**aparece, se apaga, se borra** — y cada uno lo dispara algo distinto (tabla completa en
`arquitectura.md` 4.4):

- **La campana ensena lo NO LEIDO.** Lo leido se pliega bajo "Ver leidas (N)": desaparecer de la
  vista y desaparecer de la historia no son lo mismo.
- **Se apaga solo cuando ya no pide nada**: al **cumplir** la formacion y al **retirarse** la
  obligacion (quien sale de la audiencia). Ese segundo caso es el que empezo todo esto.
- **Empezarla NO lo apaga**, a proposito: el aviso puede estar pidiendo que la TERMINES.
- **Se borra**: leido a los 30 dias, sin leer a los 90 (`NotificationRetentionWorker`, diario a las
  3 de la manana). Es seguro porque el aviso es una COPIA de un hecho que vive en `assignments`,
  `audit_logs` y `enrollments`. Caduca el recordatorio, no el registro.
- **Sin boton de "marcar leido" por aviso**: abrirlo ya lo marca. Un boton aparte pide un clic que
  no significa nada para quien lo pulsa — nadie quiere marcar leido, quiere resolver la cosa. Para
  vaciar de golpe esta "marcar todo leido", ahora en las dos barras.

### LO QUE SIGUE: asignaciones, tipos de formacion y convocatorias

Se hablo entero y **no se construyo nada**. Esto es el terreno, para no volver a levantarlo.

**Que es cada cosa** (esta tambien en `arquitectura.md` 4.55): **audiencia** = grupo por reglas, no
obliga; **requisito** = la regla permanente que si obliga, y hacia el futuro; **matriz** = que
exige cada cargo; **obligacion** = el resultado, lo unico que se mide. **Quienes** crea
obligaciones manuales. **Convocatoria** es la jornada, y de ella cuelga la inscripcion.

**El hallazgo:** `activity_types.config` YA trae `defaultAssignmentMode`
(`ON_HIRE` | `BY_JOB_TITLE` | `MANUAL`) y **nadie lo lee**. Es la tercera semilla que se guarda y
no se aplica, despues de `analyst_scopes` y `norms.annual_hours_required`. Lo que deberia
gobernar, y que el cliente pidio en estos terminos:

| Tipo | Quien decide la audiencia | Que deberia hacer "Quienes" |
|---|---|---|
| **Induccion general** | nadie: es para TODOS | precargado y **sin editar**. Marcarlo a mano solo puede salir mal |
| **Induccion especifica** | la **matriz de cargos** | precargado desde el cargo, **editable con novedad justificada** |
| **Reinduccion** | como la general | + su recurrencia (12 meses) |
| **Plan / extraordinaria / pildora** | el analista, caso a caso | **obligatorio marcarlo**: ahi si es su decision |

Y **el tipo deberia preguntarse PRIMERO** al crear una formacion, porque cambia el resto del
formulario. Hoy es un campo mas y por eso todos los tipos preguntan lo mismo.

**La decision que falta, y es del cliente** (sin ella no se toca el modelo): cuando una formacion
tiene dos convocatorias —dos regionales, dos meses—, ¿la convocatoria tiene su propia **lista de
convocados** (de los obligados, quienes van a esta jornada, y el resto queda como "pendiente de
convocar"), o **arrastra a todos los obligados** y solo se registra la asistencia? La recomendacion
dada fue la primera: es lo que permite decir "faltan 23 por convocar" y lo que evita que el reparto
acabe en un Excel al lado.

### Verificado

`tsc`, `eslint` y `nest build` en verde; **172/172** unitarias; **16/16 e2e**. Ojo: `la obligacion
nace sola` tarda ~25 s y alguna asercion tiene 20 s de tope, asi que bajo carga puede caer en la
suite completa y pasar sola en aislamiento — esta en el RUNBOOK.

---

## 2026-08-30 — Quien administra tambien se forma

### El hueco

Las formaciones son para todos, tambien para quien las programa. Pero las dos superficies estaban
**incomunicadas**: ni un solo enlace del panel a `/hoy`, y el rol Analista **no tenia
`enrollments:read_own`** — no podia ver su propia formacion ni escribiendo la URL. El
administrador si podia, pero tampoco tenia por donde llegar.

### Lo que se decidio (Decision #65)

**Una sola cuenta y un conmutador**, no dos usuarios ni una pregunta en el login.

- **Dos cuentas era imposible y ademas daninno**: `users` es unico por (tenant, documento). La
  segunda cuenta exigiria un documento inventado, y ese documento falso entra en la matriz de
  competencia, infla el denominador de cobertura del plan y sale impreso en la constancia.
- **Preguntar el rol al entrar** interroga a la persona cuando menos sabe y rompe los enlaces de
  correo, que apuntan directo al reproductor.
- El conmutador **no cambia permisos**: cambia de sitio.

`enrollments:read_own` se concede ahora a TODOS en el servidor, **despues de los overrides**, asi
que tampoco se puede retirar. Se resuelve ahi y no en el catalogo de roles para que funcione en
cualquier cliente: el que llame "Asistente" a su rol que gestiona no tiene que acordarse de marcar
ninguna casilla. En el cajon de permisos ese permiso aparece como *"Toda persona lo tiene"*, sin
los tres botones — ofrecer "Retirar" sobre algo que el servidor concede igual seria una mentira
silenciosa de las que este producto ya pago varias veces.

El camino de vuelta (aprendiz → panel) solo se ofrece a quien administra algo, y eso se decide por
**descarte de permisos** (`managesAnything`), no por una lista que habria que ampliar cada vez que
el producto crece, ni por el nombre del rol.

### El contador: pendientes, no avisos

La duda era si el numero debia contar notificaciones o formacion pendiente. **No es lo mismo y por
eso conviven**: la campana cuenta lo no leido y se apaga al leerlo; el conmutador cuenta lo que
falta por HACER y no se apaga hasta que se hace. Un contador de avisos llegaria a cero sin que
nadie se hubiera capacitado.

Al verlo en pantalla salio un problema de diseno que no se veia en el codigo: pintar el boton
entero de rojo cuando hay algo vencido lo dejaba **pegado a la campana, que tambien tiene su punto
rojo**, y los dos se leian como el mismo dato. Ahora el rojo esta solo en el contador y el borde lo
insinua.

### El alcance, editable de verdad desde la ficha

Lo encontro el cliente probando: cambias el alcance de area en Permisos, dice que se aplico —y se
aplico—, pero al abrir Editar el campo sigue igual; con los procesos si cuadraba. La causa era que
"Solo su area" asumia que un alcance de area era SIEMPRE la propia area de la persona: miraba si
HABIA filas, nunca cuales, y al guardar escribia el area de la persona. **Guardar un telefono
reescribia el alcance.**

El primer arreglo mostro ese caso como "a medida" y no lo tocaba al guardar. Al probarlo con el
cliente quedo claro que seguia siendo confuso —"otra area", "2 areas", y sin poder cambiarlo ahi—,
asi que el campo pasa a ser **lo mismo que en Permisos**: dos opciones (toda la empresa / solo lo
que le marques) y **dos listas**, areas y procesos, que se pueden marcar a la vez. Ya no hay
alcance que la ficha no sepa representar.

Dos detalles que importan:
- Al acotar se **sugiere su area**, marcada y quitable. Sugerencia visible, no decision por detras.
- **No deja guardar "acotado" sin marcar nada**: cero filas significa ver todo, o sea lo contrario
  de lo que se acaba de pedir. Esa trampa estaba a un clic.

### El contador del conmutador, otra vez

El cliente pregunto lo obvio mirandolo: el conmutador decia 9+ y la campana 9, y las nueve eran de
formacion. ¿Sobra uno? No sobra —uno cuenta lo no leido y el otro lo no hecho— pero se veian
iguales. Ahora el conmutador **solo lleva cifra cuando hay algo VENCIDO**; con pendientes al dia,
un punto. Tener formacion pendiente es normal; tenerla vencida es lo que hay que mirar hoy.

### Verificado

`tsc`, `eslint` y `nest build` en verde; **172/172** unitarias; **16/16 e2e** (uno nuevo: ida y
vuelta entre las dos superficies). Y a ojo, en la aplicacion real de `mirar.ps1`, con capturas de
las dos barras.

### Lo que queda de esto

- El **rol Analista del seed** sigue sin `enrollments:read_own` en su lista, y da igual porque el
  servidor lo concede; pero si algun dia se quita la regla implicita, hay que acordarse.
- El conmutador del panel no distingue **vencidas de pendientes** en el numero: solo cambia de
  color. Con el detalle en el tooltip basta por ahora.

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

### El responsable, congelado en la version (Decision #64)

Aplicado lo que se hablo. Ahora hay **tres niveles** y cada uno responde una pregunta distinta: el
del PROCESO (quien lo lleva hoy), el de la ACTIVIDAD (quien responde hoy por esa formacion, copiado
por valor al crearla) y el de la VERSION (quien respondia **cuando se publico**). El tercero es el
que faltaba y es el que ve un auditor.

Cambiar el responsable solo se permite **con un borrador de version abierto** — o sea, al crear la
formacion desde cero o tras abrir una version nueva. Sin borrador, el servidor responde
`RESPONSIBLE_LOCKED` y la pantalla deshabilita el campo **diciendo la salida**, sin esconderlo:
quien entra a la ficha tiene que poder ver quien responde. Las notificaciones de incumplimiento
siguen yendo al responsable **vigente**: para avisar sirve quien esta hoy.

Migracion `20260829210000_version_responsible`. Las versiones ya publicadas se quedan en NULL: no
se puede inventar un dato historico que nadie registro.

### Y otro "no aparece", el tercero

Al crear una persona no salia en el listado: alfabetico y paginado de 20, con 46 personas de prueba
la nueva caia en la pagina 3. Ahora la pantalla filtra por su documento al crearla. En el RUNBOOK,
junto al de las convocatorias — son la misma familia y ya van tres.

### Verificado

`tsc`, `eslint` y `nest build` en verde; **172/172 unitarias** (9 del borrado del plan + 7 del
responsable); **15/15 e2e**, incluido el caso nuevo que corrige y elimina un plan en borrador.

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
