# Programas

Varias formaciones agrupadas bajo un solo paraguas, **certificadas como un conjunto**.

El cliente lo pidió así: *«quiero que Gestión Humana, Comercial, Logística… se vean y se certifiquen
como un solo programa, no como formaciones sueltas»*. Lo que acredita el papel es haber completado
la **Inducción General entera**, no una de sus partes.

---

## 1. Qué es y qué no es

Un programa **no es una formación**. No tiene contenido, ni evaluación, ni convocatorias, ni tipo.
Es una **capa que observa**: sus módulos siguen siendo formaciones normales, con su propio contenido,
sus intentos y su política de reintentos. Reprobar un módulo es exactamente lo mismo que reprobar
cualquier formación hoy.

Lo único que el programa aporta es **una regla de aprobación sobre el conjunto** y **una constancia
que la acredita**.

Un programa es **opcional**: una formación que no está en ningún programa funciona igual que
siempre, con su certificación individual.

### Lo que el programa NO tiene, a propósito

| | Por qué |
|---|---|
| **Tipo** (`ActivityType`) | Certifica siempre al completarse. El tipo vive en cada módulo: es lo que decide a quién se le exige, si se repite y si lleva papel de un tercero |
| **Recurrencia propia** | No existe «cada cuánto vence este programa». La recurrencia vive en cada módulo, en su `AssignmentRule`. Ver §5 |
| **Contenido** | Lo que se cursa son los módulos |
| **Versiones** | Un programa se edita en caliente. Es una decisión consciente y tiene consecuencias — ver §6 |

---

## 2. El modelo: tablas que ya existían

`LearningPath` / `PathItem` / `PathEnrollment` estaban en Prisma **desde el diseño original del
dominio** y llevaban desde entonces sin una sola línea que las usara. No se inventó una tabla: se
terminó de construir la que ya estaba prevista.

```
LearningPath           el programa            code, name, description, status, active
  └─ PathItem          un módulo dentro       itemType, itemId, displayOrder,
                                              isRequired, sectionName, minRequiredInSection
  └─ PathEnrollment    el avance de alguien   userId, cycleNumber, status, progressPct, completedAt
```

Y dos campos que también estaban anticipados y sin usar: `PathItem.isRequired` (obligatorio, salta
el cupo) y `sectionName` + `minRequiredInSection` (cupo de «N de M»), que son **justo** las dos
piezas del caso real del cliente.

`Certificate.pathEnrollmentId` es el único campo nuevo del modelo (migración
`20260914200000_certificados_programa`): espejo exacto de `enrollmentId`, con el mismo índice único
parcial.

---

## 3. La regla de aprobación

Vive en `program-completion.ts` (`evaluarPrograma`), **lógica pura, sin base de datos**. Tiene tres
condiciones que se cumplen a la vez:

### 3.1. Los obligatorios, siempre

Un módulo con `isRequired` tiene que estar aprobado. No cuenta para ningún cupo: es una condición
aparte. Es el valor por defecto, y tiene sentido — un módulo que no se agrupó en ningún cupo es, por
definición, indispensable.

### 3.2. El cupo: «de estos N, hacen falta M»

Los módulos **no** obligatorios de un mismo **grupo** (`sectionName`) forman un pozo: hacen falta
`minRequiredInSection` aprobados, sin importar cuáles.

El caso literal del cliente: *«de 8 módulos, Gestión Humana sí o sí; de los otros 7 con 6 basta»*.

**El umbral es del GRUPO, no del módulo.** El esquema lo guarda pegado a cada fila porque no hay
tabla de grupos, así que el servidor lo propaga a todos los módulos del grupo en cada escritura
(`fijarMinimo`). Y por eso **se configura desde el programa**, no desde el formulario de un módulo:

- No se puede decidir hasta tener los módulos delante — al agregar el primero nadie sabe si serán
  cinco o nueve.
- Preguntarlo por módulo dejaba que un formulario de uno cambiara la regla de todos.

Un grupo recién creado **exige todos sus módulos** y sigue al total mientras nadie lo baje. En
cuanto alguien lo baja, ese número es una decisión y se respeta aunque el grupo crezca; solo se
recorta si el grupo se queda con menos módulos que el mínimo.

### 3.3. Nada puede quedar sin hacer

**La condición que más importa, y la que más tarde se descubrió.** El cupo perdona haber **perdido**
un módulo; no perdona haberlo **ignorado**:

| | Qué pasó | Qué hace la regla |
|---|---|---|
| **Perdido** | Lo cursó y lo reprobó | El cupo lo perdona |
| **Eximido** | No pudo presentarse; alguien lo eximió con motivo | El cupo lo perdona |
| **Ignorado** | Tiene la obligación viva y no la ha tocado | **Bloquea el programa** |

Un módulo está **pendiente** mientras su obligación esté `PENDING` / `IN_PROGRESS` / `OVERDUE`
(`moduloPendiente`). Sin esta condición se podía completar un programa —y emitir su constancia—
saltándose una formación entera.

**Sin obligación no hay pendiente**, y es deliberado: si a alguien nunca se le exigió ese módulo, no
se le debe nada. Es lo que deja que un programa sin asignación propia —alguien que cursa por su
cuenta— siga completándose con su cupo, sin exigirle módulos que nadie le pidió.

### 3.4. Eximir frente a convalidar

Los dos actos ya existían en el sistema y aquí significan cosas distintas:

| | Qué dice | Efecto en el cupo |
|---|---|---|
| **Eximir** | «No tiene que hacerla» | Resuelve el módulo pero **no lo aprueba**: consume una de las que el cupo deja perder |
| **Convalidar** | «Ya la hizo, en otro sitio» | Cierra la obligación **como cumplida**: cuenta como aprobada |

Eximir de más de lo que el cupo permite **no completa el programa**, y es correcto: es una decisión
que alguien tiene que tomar, no un silencio.

---

## 4. Cómo se decide quién está obligado

**«Asignar a una audiencia» no crea una obligación de programa.** Crea **una obligación por cada
módulo**, todas con la misma audiencia y el mismo plazo, llamando a
`AssignmentsService.setActivityRequirement` una vez por módulo.

`AssignmentTargetType.PATH` sigue existiendo en el esquema **y sin usar, a propósito**. Construir ese
brazo del motor obligaría a reimplementar por dentro lo que `setActivityRequirement` ya hace bien,
con el riesgo de que las dos vías de exigir una formación diverjan con el tiempo.

**Por qué se exigen TODOS los módulos y no solo los que hacen falta:** si la regla dice «6 de 7»,
cuáles 6 no lo decide el administrador — lo decide la persona o sus circunstancias. Para que esa
elección exista, los 7 tienen que estar visibles y asignados. Asignar solo 6 convertiría el cupo en
6 obligatorios elegidos por el admin. Y da igual si el módulo es obligatorio o de cupo: eso es la
regla de **aprobación**, no la de **alcance**.

### Dónde se asigna cada cosa

> **Si la formación está en un programa, se asigna desde el programa. Si no, desde su ficha. Nunca
> las dos.**

Mezclarlas crea **dos reglas vivas** sobre la misma formación: la regla existente se busca por
AUDIENCIA, así que una audiencia distinta no reemplaza nada — añade. La obligación no se duplica
(el motor comprueba si esa persona ya debe la formación), pero las dos reglas compiten por decidir
cuándo vence, y nadie recordará cuál mandó.

| Caso | Dónde se asigna |
|---|---|
| Programa de Inducción General o Reinducción | **En ningún sitio**: se asigna solo al publicar cada módulo |
| Programa de cualquier otro tipo | Desde el programa |
| Formación suelta, fuera de programas | Desde su ficha |

Por eso, cuando todos los módulos son automáticos, **el formulario de asignar se pliega** detrás de
«Asignarlo igualmente a un grupo concreto»: usarlo ahí es casi siempre un error, y no debería estar
a un clic de distancia.

**Quién queda alcanzado por la regla automática (`defaultAssignmentMode`, `requiresBeforeHire`) NO
es editable desde ninguna pantalla**: vive en la semilla. Es deliberado — sale de la norma, no de
una preferencia de la empresa.

### Un módulo sin publicar bloquea el programa entero

Nadie puede cursar un borrador, así que mientras haya un módulo sin publicar **el conjunto nunca
llega a completarse** y nadie recibe su constancia. Y en los tipos automáticos, sin publicar
**tampoco existe su regla**: el aviso de «ya se exigen solos» promete algo que aún no ha pasado.

Se avisa en tres sitios, cada uno contestando algo distinto:

| Dónde | Qué dice |
|---|---|
| Aviso arriba | «3 módulos están sin publicar: nadie puede cursarlos, así que este programa no puede completarse» |
| Cada módulo | `· sin publicar` o `· sin regla activa` |
| El panel de asignar | «Todavía no se le exige a nadie. 3 módulos están sin publicar: la regla nace al publicar cada formación» |

Ese último cierra el círculo: un «no se le exige a nadie» a secas deja la pregunta obvia sin
contestar.

### A quién se le exige, visto desde el programa

La ficha muestra **a quién alcanza el programa hoy**, aunque la regla no se haya creado desde ahí.
Antes había que entrar formación por formación a su pestaña *Quiénes* —ocho viajes en un programa de
ocho módulos— y en los que se asignan solos no había forma de verlo desde ningún sitio.

Agrupado **por audiencia**, no por módulo: lo que se quiere leer es «a los Conductores», no ocho
renglones repitiendo lo mismo. Con su disparador y con **en cuántos módulos aplica** — y esa última
cifra es la que delata una **regla a medias**: una audiencia que alcanza 2 de 3 módulos deja gente
obligada a una parte y no al conjunto, que casi siempre es un error de configuración.

### Y la misma verdad al revés: quién cubre cada módulo

El agrupado por audiencia responde *«¿a quién se le exige el programa?»*. No responde la que de
verdad se hace quien administra mirando la lista: *«¿y **este** módulo, a quién?»*.

La primera versión lo decía colgando un **«(solo 2 de 5)»** del nombre de la audiencia. Avisa de que
faltan tres pero **no dice cuáles**, y con dos audiencias y cinco módulos eso es un crucigrama. Se
invirtió: cada módulo lleva debajo, en gris y en una línea, **a quién alcanza** (`items[].audiencias`
en `obtener`). Así la asimetría que impide completar el programa —las dos inducciones alcanzan a toda
la empresa, la píldora solo a Conductores— salta a la vista sin abrir nada.

Cuando no alcanza a nadie **la línea no aparece**: eso ya lo dice la marca en rojo de la fila, y
repetirlo en dos registros distintos es lo que hacía confusa la pantalla anterior.

Las dos vistas —`obligados` y `items[].audiencias`— salen de **una sola lectura** de `reglasActivas`,
invertida de dos maneras. No hay dos consultas que puedan discrepar, y la matriz lo fija (I35–I38:
mismos nombres, cuentas que cuadran, lista vacía en vez de módulo omitido).

### Lo que NO se bloquea al agregar un módulo

Se consideró impedir agregar a un programa una formación **sin publicar** o **sin obligaciones**. Se
descartaron las dos, por la misma razón: **invierten el orden natural del trabajo**.

- Un programa se arma *antes* de decidir a quién se le exige. El botón «Asignar» del programa existe
  justo para exigir los cinco módulos de una vez — imposible si cada uno tuviera que llegar ya
  exigido. Bloquear obligaría a recorrer formación por formación primero, que es lo que el programa
  venía a evitar.
- Y un programa suele armarse mientras sus formaciones todavía se están escribiendo.

Las dos situaciones ya se **ven**: el selector marca `(sin publicar)`, la fila lleva su aviso, el
bloque de estado dice qué falta y publicar el programa avisa. Un bloqueo no añadiría información:
solo aplazaría el problema y escondería que existe. Ver HANDOFF 2026-09-16 §17.

**Por qué no se quitó la asignación automática**, que fue la alternativa que se consideró: publicar
una Inducción General **garantiza** hoy que alcanza a quien ingrese, y eso es una obligación legal —
no debería depender de que alguien recuerde pulsar un botón. Además el producto permite una
inducción general suelta, fuera de programa: sin el automático, esa se publicaría y no alcanzaría a
nadie, en silencio.

### La exigencia automática

Un módulo cuyo **tipo** dice `defaultAssignmentMode: 'ON_HIRE'` —Inducción general, Reinducción—
crea **sola** su regla de toda la empresa al publicarse (`aplicarExigenciaAutomatica`). Un programa
hecho solo de esos módulos **no necesita el botón de asignar**, y la ficha lo dice.

Se detecta por el **config del tipo**, nunca por su `code` ni por el nombre del programa: los dos
son datos del tenant y se pueden renombrar.

Matiz que la pantalla dice aparte: Inducción general lleva `requiresBeforeHire`, así que su regla
nace `soloNuevos` y **alcanza a quien ingrese, no a la plantilla actual**. Reinducción es al revés.

---

## 5. Rondas: la reinducción que vuelve a pedirse

**Una fila por ronda, inmutable** — mismo patrón que `CertificationGrant`.
`PathEnrollment.cycleNumber`, único por `(pathId, userId, cycleNumber)`.

El programa no tiene recurrencia propia, así que **su ronda sale de las rondas de sus módulos**:
`cicloDePrograma` toma la **más adelantada** de las `Assignment.cycleNumber`, nunca la más atrasada.
En cuanto un módulo abre su ronda 2, el programa pasa a «ronda 2 en curso». Nunca retrocede: una
regla borrada no hace caer a un programa que ya iba por la ronda 3.

**Los módulos caen de uno en uno.** Un módulo cuya ventana no se ha abierto conserva su aprobación:
`moduloAprobado` mira si su obligación **vigente** está cerrada, sin compararla con la ronda del
programa. Comparar con la ronda del programa tumbaba los ocho módulos de una reinducción a la vez,
dejando al aprendiz siete formaciones «pendientes» que ni siquiera podía hacer.

**Un programa de Reinducción se comporta como una campaña anual** no porque el programa tenga una
fecha, sino porque sus módulos **comparten** la `defaultAnnualDate` de su tipo. La ficha lo avisa
cuando coinciden, y también **cuando no** — que es la señal de que alguien rompió la campaña sin
querer.

Al abrirse una ronda nueva se crea una fila aparte y se emite una **segunda constancia**; la de la
ronda anterior queda intacta, con su fecha y su consecutivo.

---

## 6. La constancia del conjunto

**Si una formación es módulo de un programa PUBLICADO, su cierre no emite constancia individual** —
sea por contenido o por cualquier mecanismo de asistencia (QR, firma, lista del instructor). La
evidencia que vale es una: la del programa completo. Si el programa se despublica, la individual
vuelve a emitirse.

Solo los programas **publicados** suprimen la individual: un borrador no es un compromiso con nadie.

`CertificatesService.emitirPorPrograma` arma el snapshot con el nombre del programa, `"Programa"`
como tipo y **horas = suma de los mejores intentos de los módulos aprobados** (no de todos los del
programa: un módulo que no cursó no aporta horas que nadie recibió). Es idempotente por el índice
único parcial sobre `pathEnrollmentId`.

**Sin vigencia propia:** `validUntil` queda `null`. Acredita que se completó, sin fecha de caducidad
del conjunto — la recurrencia vive en los módulos, y son ellos los que aparecen en Vencimientos.

El renderizador **no sabe ni le importa** si una constancia es de una formación o de un programa:
solo lee campos genéricos del snapshot. Por eso Fase 2 no tocó el PDF, la vista previa, la descarga
ni la verificación pública.

La plantilla tiene un campo **«Módulos»** (multilínea, apagado por defecto) que lista los módulos
aprobados. Solo dice algo en una constancia de programa.

---

## 7. Reorganizar un programa

**Una ronda completada no se reabre.** Agregar un módulo a un programa que alguien ya completó
dejaba a esa persona en el peor sitio posible: trabajo nuevo y **ningún papel nuevo**, porque el
índice único impide una segunda constancia de la misma ronda.

Es la regla que el esquema ya declaraba y que este código no respetaba: *una fila por ronda,
inmutable*. Una ronda cerrada acredita lo que el programa exigía ese día.

**Quien va a medias sí ve el módulo nuevo**: no hay evidencia emitida que proteger.

### Versionar el programa: no se hace, y por qué

Estaba anotado como el hueco conocido del módulo. Mirado de cerca, **no lo es**:

- **La evidencia ya está congelada.** El `CertificateSnapshot` guarda nombre, horas y la lista de
  módulos aprobados. La constancia ya acredita lo que el programa era ese día.
- **Quien lo completó ya está protegido**: su ronda no se reabre.
- **Y a quien va a medias, agregarle un módulo es lo CORRECTO.** Si la empresa decide que SST entra
  en la inducción, quien no ha terminado debería hacerla. Versionar serviría para lo contrario.

Lo que quedaría sin versionado es poder decir «este es el programa de 2027» como documento. Eso es
una necesidad de archivo, no de cumplimiento, y no ha aparecido.

---

## 8. Dónde se ve

| Pantalla | Qué responde |
|---|---|
| `/programas` | El banco de programas, con filtro por estado |
| `/programas/[id]` | Módulos, regla de aprobación, asignar a una audiencia |
| Mi aprendizaje → **Programas** | Lo que ve el aprendiz: sus módulos como contenido, no como tabla de estados. **Solo si se le exige** — o si ya tiene avance. Publicar no es asignar: un programa publicado es un compromiso con quien lo tiene exigido, no con toda la empresa |
| Inicio → fila **Programas** | Con el mismo criterio de prioridad del resto: lo empezado antes que lo no empezado |
| Seguimiento → **Programas** | Cómo va cada uno, y **lo que más frena** |

El color de un programa en la interfaz es **fijo** (`#4338ca`), no el de la marca del tenant: es la
señal de «esto es un programa» en cualquier empresa.

---

## 9. El informe

Seguimiento → **Programas**. Una fila por programa publicado:

| Columna | Qué responde |
|---|---|
| Se le exige a | El denominador |
| Completos | Cuántos tienen la constancia del conjunto |
| **A falta de 1** | Quién está a punto — **a quien más rinde perseguir** |
| **Sin empezar** | Quién no ha tocado nada — otro problema, otra conversación |
| Cumplimiento | El % |
| **Lo que más frena** | El módulo que más gente tiene atascada, partido en **sin hacer** / **reprobados** |

**Las columnas que justifican la pantalla no son el porcentaje.** El % dice cómo va; no dice qué
hacer. «Lo que más frena» permite que una sola convocatoria cierre el programa de decenas a la vez.
Y está partido en dos porque son problemas opuestos: *sin hacer* pide programar una jornada,
*reprobados* pide revisar el contenido.

**La fila se abre**: quiénes son, qué les falta y si lo intentaron, ordenados por lo que les falta —
los más cerca primero, los completos al final. La lista existe para perseguir, no para felicitar.

### Las cuatro decisiones del cálculo

Es donde un informe miente sin querer, y una de ellas **se coló el primer día**:

- **El denominador es a quién se le exige**, no quién tiene inscripción. `PathEnrollment` solo nace
  cuando alguien cierra su primer módulo, así que contar por ahí dejaría fuera justo a quien no ha
  empezado.
- **Una obligación RETIRADA no cuenta**, ni como alcanzada ni como frenando. Quien salió de la
  audiencia ya no tiene el programa. *(Esta fue la que se coló: el informe decía 172 alcanzados
  cuando 170 estaban retiradas, y mandaba a perseguir a gente que no debe nada.)*
- **Una EXIMIDA sí cuenta como alcanzada** —el programa le aplica— pero **no frena**: está resuelta
  y el cupo la absorbe.
- **Quien ya terminó no suma al cuello de botella.** Si sumara, ese número subiría con cada persona
  que completa.
- **«A falta de 1» exige haber aprobado algo.** Sin eso, quien tiene un solo módulo exigido y no lo
  ha hecho contaría en esa columna y en «sin empezar» a la vez.

---

## 10. Cómo se prueba

| Qué | Dónde |
|---|---|
| Las reglas puras | `program-completion.spec.ts` — `evaluarPrograma`, `cicloDePrograma`, `moduloAprobado`, `moduloPendiente` |
| Contra la base, de punta a punta | `pnpm --filter @neo-pulse/api dev:verificar-programas` — 131 comprobaciones en nueve bloques |
| La interfaz | `e2e/programas.spec.ts` |
| **El camino entero, por HTTP y con sesión** | `node scripts/recorridos/programa.mjs` — 15 pasos: tres módulos con examen, asignación real, uno cerrado por **contenido** y otro por **asistencia**, el cupo que no perdona dejar uno sin hacer, la constancia del conjunto con la **suma de horas**, Seguimiento, y despublicar devolviendo la individual |

La matriz prueba las REGLAS contra la base llamando a los servicios; el recorrido prueba que **las
piezas encajan entre sí**. Son fallos distintos: el recorrido encontró que `certificateHours` no lo
escribía ningún endpoint —toda constancia salía sin horas— y eso la matriz no podía verlo.

La matriz cubre: supresión de la constancia individual (A), completar y certificar (B), obligatorio
+ cupo (C), rondas (D), esquinas (E), la vista del aprendiz (F), el cupo configurado desde el
programa (G), nada sin hacer (H) y el informe (I).

---

## 11. Decisiones que no se reabren sin motivo nuevo

- Un programa **no tiene tipo** ni recurrencia propia.
- **Solo los publicados** suprimen la constancia individual.
- El **color es fijo**, no el de la marca.
- Asignar un programa **delega en el motor de siempre**, una llamada por módulo. No se construye el
  brazo `PATH`.
- **Una fila por ronda, inmutable.** Ni se pisa al abrir la siguiente, ni se reabre al editar el
  programa.
- El **cupo se configura desde el programa**, no desde cada módulo.
- **Eximir resuelve, no aprueba.** Convalidar sí aprueba.
- La cobertura se lee **por módulo** —a quién alcanza cada uno— y no como un «solo 2 de 5» colgado
  del nombre de la audiencia.
- **Cada módulo se abre dentro de la lista** (2026-09-16). El renglón lleva lo que se compara ENTRE
  módulos —orden, nombre, **tipo de formación**, obligatorio/grupo, lo que está mal, y debajo, más
  pequeño, **a quién alcanza resumido**—, más reordenar; su ficha lleva lo de UN módulo —audiencias
  con nombre completo, estado, campaña, exigencia automática—. Ni una ventana ni un diálogo: se abre
  un módulo para compararlo con el de al lado.
- **Las acciones de un módulo viven en un menú `⋯`**, no en el renglón ni dentro de la ficha: siempre
  visibles, siempre en el mismo sitio, sin desplegar nada y con lo destructivo dentro. Mismo patrón
  que la fila de *Usuarios*.
- **Cada clic, un solo destino.** El chevron despliega y nada más; el **nombre** abre la formación;
  el renglón en sí no hace nada. Repartir un renglón entre dos acciones sin frontera visible no se
  aprende: se falla.
- **La constancia individual se suprime POR FORMACIÓN, no por persona** (decidido el 2026-09-16 tras
  probar lo contrario). Se probó a preguntarlo por persona —para no dejar sin papel a quien debe una
  de sus formaciones por otro motivo— y se deshizo: metía un fallo peor, **constancias duplicadas**
  durante el rato en que las reglas de un programa se van creando módulo a módulo. Cambiar una
  pérdida de evidencia por una duplicación, en el camino que emite los papeles, no es una mejora. El
  porqué entero vive en `ProgramsService.esModuloDeUnProgramaPublicado`.
- **Un programa se completa aprobando TODOS sus módulos**, y no «los que a cada quien se le exigen»:
  `AssignmentRule` no guarda de dónde viene una obligación, así que la versión por persona no
  distingue «el programa me aplica a medias» de «debo una de sus formaciones por otro lado», y
  repartiría constancias de programa por una sola píldora.
- **Una regla de asignación guarda de dónde salió** (`AssignmentRule.sourcePathId`, 2026-09-16):
  NULL = la declaró alguien sobre la formación; con valor = la creó «Asignar programa». Hoy **no se
  lee en ningún sitio**; existe porque es lo único que no se puede reconstruir después, y es lo que
  hará falta si algún día se quiere tronco + rama o suprimir la constancia por persona.
- **Publicar avisa a quién deja sin papel** (2026-09-16). Publicar es el acto que apaga la constancia
  individual de todos los módulos, y hasta entonces lo hacía en silencio. Antes de publicar se cuenta
  a quién se le exige **alguno** de los módulos pero **no todos**: esa gente perderá la individual de
  lo que sí hace y nunca completará el programa. No bloquea; es un número para decidir sabiéndolo.
- **Un programa no debería mezclar tipos automáticos con audiencia marcada.** Una inducción general
  nace exigida a *toda la empresa* al publicarla y eso no se puede quitar; una formación de audiencia
  marcada obliga a marcar al menos una faceta —el alcance vacío está bloqueado a propósito, aquí y en
  su ficha—. **Esos dos alcances no se pueden igualar**, así que un programa que los mezcla no lo
  completará nadie salvo quien caiga en los dos. Los de toda la empresa en un programa; los de
  audiencia marcada en otro, asignados con *Asignar programa*.
- **Agregar un módulo con audiencia propia no se bloquea**: así es como se arma un programa. Se avisa
  en ámbar dentro de su ficha, diciendo la consecuencia entera —esa gente no completará el programa y
  tampoco recibirá la constancia individual—. **Ese aviso es la única protección**, así que no se
  suaviza.
- Un módulo de tipo automático **sin publicar** dice en su ficha que su regla de toda la empresa
  **todavía no existe** —nace al publicar la formación—, y por eso lo único que se ve es lo que
  alguien exigió a mano. Sin esa frase, «se exige sola a toda la empresa» junto a un cargo concreto
  se lee como un fallo.
- El **tipo** y el **a quién** no compiten por el mismo sitio: van en líneas distintas y con pesos
  distintos. El tipo es una etiqueta corta y estable; el «a quién» crece, así que se resume —dos
  nombres, y a partir de tres se cuenta— y los completos viven en la ficha.
- **A quién se le exige NO se dice sumado** arriba. Sumar las audiencias del programa no distingue
  quién tiene qué, que es la pregunta real, y repite lo que ya dice cada renglón.
- El aviso de que ninguna audiencia alcanza el programa entero **explica la regla, no la situación**:
  un programa se completa aprobándolos todos, así que módulos de audiencias disjuntas no los cierra
  nadie. Y nombra la salida: si es a propósito, no son un programa.
- **No se bloquea** agregar un módulo sin publicar ni sin obligaciones: se avisa, que es lo que sí
  informa sin invertir el orden del trabajo.
