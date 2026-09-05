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

## 2026-09-05 (noche) — Una tabla que ya existia, un informe que inflaba el cumplimiento, y un manual

Sesion de revision sobre lo de la tarde. El encargo del cliente fue *"asegurate que pase pruebas en
diferentes situaciones: varias reglas, sin acotamiento y con acotamiento de todas las facetas, y
como se ve en seguimiento"*, y de ahi salieron tres cosas, dos de ellas incomodas.

### 1. La asistencia ya tenia su tabla, y le habia puesto columnas a otra

`attendance_records` **estaba en el esquema desde el Sprint 0** —los tres estados
(PRESENT/ABSENT/JUSTIFIED), el metodo (INSTRUCTOR/QR/SIGNATURE), la justificacion, la firma y quien
marco— vacia porque nadie la escribia. Y al lado `session_acts`, para el acta con su hash. La
version de la tarde le habia puesto `attended_at` y `attendance_by` a `enrollments`.

Se corrigio el mismo dia, con la tabla todavia vacia. Es el mismo problema que ya arrastra el
informe de Vencimientos leyendo `certification_grants` —otra tabla que nadie escribe— solo que aquel
lleva meses y este se cazo en horas.

**La leccion:** este esquema se diseno entero al principio y lleva partes esperando. Antes de anadir
una columna, buscar `model X` en `schema.prisma`.

De paso salio el permiso correcto: **`attendance:take`**, que existia desde el Sprint 1 sin usarse,
porque el INSTRUCTOR tiene que poder decir quien vino sin poder ademas programar ni cancelar
convocatorias.

### 2. Y esto es lo gordo: el informe daba por TERMINADA la ronda que la persona todavia debe

Lo destapo medirlo. Cinco obligaciones —dos cumplidas y tres pendientes— y el informe decia **cuatro
terminadas**. Los tres informes pegaban la inscripcion por `(persona, formacion)` y la aplicaban a
todas sus filas; como `resolverEstadoEjecucion` pregunta primero por el resultado, **quien completo
la ronda 1 salia con la ronda 2 tambien como TERMINADA**.

**MEDIDO: el mismo escenario pasaba de 80% de avance a 40%.** En produccion es la reinduccion de 796
personas figurando hecha el 2 de enero de cada ano.

Es el hermano del fallo del 2026-09-04 pero al reves, y por eso es peor: aquel inflaba el
incumplimiento y este infla el **cumplimiento** — nadie reclama un numero que le favorece.

Arreglado con `inscripcionDeCadaRonda`, usando los enlaces que ya existian en las dos direcciones
desde el Sprint 3 (Decision #2). Vive en `execution-state.ts` y se exporta por lo mismo que
`ESTADOS_RETIRADOS`: son TRES informes.

### 3. Lo que se midio, y por que NO hay un recorrido por tipo

`asistencia.mjs` pasa de 12 a **15 pasos**: falta justificada (explica pero **no exime**), dos reglas
sobre la misma persona (le nacen dos obligaciones y asistir cierra UNA), acotamiento por facetas
(cargo 100 · area 240 · las dos, **9**), y que una lista no alcanza fuera de su jornada.

Sobre lo del recorrido por tipo, que pregunto el cliente: **no**. Cerrar por asistencia no depende
del tipo sino del `kind` de la jornada; siete archivos serian siete copias del mismo camino. Lo
propio de cada tipo ya lo deriva `estandar.mjs` de su configuracion. Misma decision que `tajadas.mjs`.

### 4. El manual, que tambien lo pidio

`docs/guias/asistencia.html` —una guia propia, porque la asistencia es identica en los siete tipos y
copiarla siete veces es lo que se desincroniza— **mas un puntero** en las cinco guias de tipos que si
se dictan en jornada. En la pildora no: es microlearning de tres minutos y nadie convoca un salon
para eso; un aviso que no aplica ensena a saltarse los avisos. Y su seccion en el indice.

### Contradicciones revisadas, que tambien lo pidio

- **CLAUDE.md 3.7** decia "asistencia PRESENCIAL". Corregido: va con el `kind`, no con la modalidad,
  y se anota cuales de los tres mecanismos estan construidos (1 de 3).
- **`attendance:sign`** lo nombra CLAUDE.md y no existe en `permissions.ts`. Anotado: llega con la
  firma en pantalla.
- **`sprints/README`** decia "Terminado salvo asistencia presencial" y **`05-cumplimiento`** la tenia
  como pendiente Alta que "bloquea que lo presencial emita constancia" — que se quedaba corto: no
  bloqueaba la constancia, bloqueaba **cerrarla de ninguna forma**. Los dos actualizados.
- Los sprints 03 y 04 tambien la mencionan y **NO se tocan**: son historia, no referencia.

### El barrido

```
13 recorridos           TODO BIEN     (asistencia.mjs con 15 pasos)
390 pruebas unitarias   pasan         (385 + 5 del enlace por ronda)
21 e2e                  pasan         (4,0 min)
build - lint - types    limpios       (1 aviso de lint, ninguno nuevo)
```

### Lo que sigue abierto

1. **El archivo no se sube todavia**: el PDF del certificado y el acta escaneada. Las columnas estan
   y la API las acepta; falta la pantalla.
2. **Los mecanismos 2 y 3 de la asistencia**: QR de sesion y firma en pantalla con acta PDF. Los dos
   diseñados, con su sitio en el modelo y su valor en el enum.
3. **La segunda puerta** para el papel que llega tarde, desde la ficha de la persona.
4. **El informe de Vencimientos**: sigue leyendo `certification_grants` (vacia) y **su eje esta mal**
   —separa por origen del dato en vez de por "¿ya la tuvo o nunca?"—.
5. **Repaso / volver a verlo**: sigue esperando las preguntas del cliente.
6. **El aviso**: aplazado, y sera notificacion INTERNA al jefe o a SST, no correo.

---

## 2026-09-05 (tarde) — No se podia registrar NINGUNA formacion presencial

Empezo como una pregunta sobre certificados externos y acabo destapando el agujero mas grande que
quedaba en el producto.

### Lo que se encontro

`CompletionService.evaluate` —lo unico que cierra una obligacion— **solo lo llaman el reproductor y
los intentos de examen, los dos del lado del aprendiz**. `POST /offerings/:id/complete` cierra la
jornada y marca el renglon del plan como EJECUTADO, pero no toca a ninguna persona. Y el roster era
de solo lectura.

Traducido: **la unica manera de cerrarle una formacion a alguien era que entrara a la plataforma y
completara el contenido.** Una capacitacion de la ARL, presencial, dos horas, veinte personas: no
habia como darla por cumplida.

En una empresa bajo SG-SST la mayor parte del plan anual se dicta en salon, y encima de esa capa
esta TODO lo demas —los siete tipos, el plan, la cobertura, las constancias, el Seguimiento—. **El
indicador de cumplimiento enseñaba cero de todo lo que de verdad se hizo.**

### Las tres vias de evidencia (Decision #157)

Se generalizo a "¿como consta que cumplio?" en vez de anadir un campo a un tipo, porque la respuesta
cambia POR FORMACION y no por clase de formacion:

|  | Cuando | Que queda |
|---|---|---|
| **A. En plataforma** | contenido + examen | progreso, nota, constancia propia — ya existia |
| **B. Lista de asistencia** | jornada con fecha, la dicte quien la dicte | quien vino, quien no, y quien lo marco |
| **C. Papel de un tercero** | lo emite un organismo acreditado | entidad, numero, expedicion, vencimiento |

Las decisiones que importan, todas medidas en `asistencia.mjs` (12 pasos, seguimiento incluido):

- **La asistencia va con el `kind`, no con la modalidad.** `EVENT` se cierra por lista —presencial o
  virtual en vivo—; `PERMANENT` la rechaza con 409. Atarlo a PRESENCIAL dejaba fuera el webinar de
  la ARL.
- **No pasa por `evaluate`.** Para una jornada de salon los contenidos vistos no existen. No es un
  atajo: la evidencia es otra. Pero salta la evaluacion que exige el tipo, asi que queda escrito
  **quien** respondio por ella. Probado con el caso mas duro: tipo Recertificacion, que exige
  examen, y nadie lo responde.
- **Quien no vino la SIGUE debiendo.** No se cierra ni se retira nada.
- **Con papel de tercero NO se emite constancia propia**; sin papel, SI.
- **El papel manda** (lo decidio el cliente): su fecha va a `assignments.valid_until_override` y
  `proximoVencimiento` la lee antes que la campana y que el aniversario.

**Como se midio "el papel manda" sin tocar el reloj:** un certificado a **30 dias** sobre una
recurrencia de **12 meses**. La ventana esta fijada en 60, asi que el papel la tiene abierta hoy. Si
manda el papel nace la ronda 2 con su fecha; si mandara la recurrencia, no naceria ninguna. **Nace,
y con la fecha del papel.**

### Lo que se toco

Migracion `20260905120000_asistencia_y_certificado_externo`, `proximoVencimiento` en `due-date.ts`,
`cerrarPorAsistencia` en `CompletionService`, `POST /offerings/:id/attendance`,
`tracksExternalCertificate` en el config del tipo (con su interruptor en Configuracion), el
componente `lista-de-asistencia.tsx` en la jornada, y `docs/modulos/formaciones/08-evidencia.md`.

### El barrido

```
13 recorridos           TODO BIEN     (los 7 tipos + ciclos, convocatorias, tajadas,
                                       proyectados-ajuste, estandar y ASISTENCIA)
385 pruebas unitarias   pasan
build - lint - types    limpios       (1 aviso de lint, ninguno nuevo)
```

### Lo que sigue abierto

1. **El archivo no se sube todavia.** Las columnas estan (`ext_cert_file_key`,
   `offerings.attendance_sheet_key`) y la API las acepta, pero no hay pantalla que suba el PDF del
   certificado ni el acta firmada. Es lo siguiente y lo que completa la evidencia.
2. **La segunda puerta**: cuando el papel llega despues de la jornada —lo normal, la ARL los manda a
   los quince dias— hay que volver a la jornada. Falta poder hacerlo desde la ficha de la persona.
3. **El informe de Vencimientos sigue leyendo `certification_grants`**, que no escribe nadie, asi
   que su serie de "Certificacion" sale en cero. Ya tiene con que llenarse.
4. **Y su EJE esta mal**, no solo su fuente: separa por "de donde sale el dato" y deberia separar
   por "¿ya la tuvo o nunca?" — por hacer (perseguir) frente a por renovar (reprogramar). Con el eje
   de hoy, quien esta en su ventana de 60 dias sale en las DOS series.
5. **Repaso / volver a verlo**: dejado a proposito, el cliente tiene preguntas.
6. **El aviso por correo**: aplazado. Cuando toque, sera notificacion INTERNA al jefe o a los
   encargados de SST, no correo.

---

## 2026-09-05 — Lo que ya hizo no se le vuelve a pedir, y una campana que acusaba al que cumplia

El encargo era cerrar el ultimo pendiente de la induccion especifica —*"pense que la 1 ya estaba
resuelta; si no, aplicala, porque puede que dos cargos tengan la misma formacion"*—, actualizar la
documentacion y decidir que hacer con las opciones de "se repite" de la pestana Quienes. Salio eso
y, de rebote, **un fallo del motor que solo castigaba a quien cumplia**.

### 1. Lo que ya hizo no se le vuelve a pedir (Decision #155)

La deduplicacion del motor es **por regla**, no por formacion. Es correcto mientras cada formacion
cuelgue de un solo cargo, y deja de serlo en cuanto la matriz repite una formacion en varios — que
en transporte es lo normal: la de bodega vale para auxiliar, montacarguista y coordinador. Sin esto,
a quien la **completo** y cambia de cargo le nacia la ronda 1 de algo que acababa de terminar, con
constancia emitida.

`decidirPrimeraRonda` (`next-cycle.ts`, logica pura) decide tres caminos:

| | |
|---|---|
| No se repite | no le nace nunca: el hecho no caduca |
| Vigente | no le nace todavia; le nacera en su ventana, **con SU vencimiento** — el certificado es de la persona, no del cargo |
| Caducada | le nace como a cualquiera, con gracia. **Nunca se hereda una fecha ya pasada** |

Solo cuenta lo **CUMPLIDO**: una eximida o una retirada explican por que no se le exigio, no que
sepa hacer el trabajo. Paso 14 nuevo en `induccion-especifica.mjs`: antes **1 CUMPLIDA**, despues
**1 CUMPLIDA y ninguna viva**, y cero veces en la pantalla del aprendiz.

### 2. Y detras habia esto, que es lo gordo del dia (Decision #156)

Escribiendo la unitaria de la vigencia heredada con una recurrencia de **fecha fija**, la asercion
dio lo contrario de lo esperado. El ancla de la ronda siguiente era `completedAt` para las dos
formas de repetir, y en una **campana** eso es falso:

| Quien | Que le pasaba |
|---|---|
| Hizo la reinduccion **antes** del 31 de marzo (o sea, cumplio) | ronda 2 abierta al dia siguiente con vencimiento **el mismo 31 de marzo**, vencida el 1 de abril, **NO REALIZADA** en enero |
| La hizo tarde, o no la hizo | su siguiente era la del ano que viene: **correcto** |

MEDIDO reproduciendo lo que hace el motor: completada el 20/03/2026 → ronda 2 venciendo el
31/03/2026. **Un indicador que solo castiga a quien cumple esta al reves.**

Arreglado con `cycleAnchor`: fecha fija ancla en el **vencimiento** —lo que se satisface es el
periodo—, "cada N meses" sigue anclando en `completedAt`.

**Y no lo cubre ningun recorrido, ni puede.** El truco de este proyecto para probar "el ano que
viene" es comprimir la recurrencia a un mes; una campana no se comprime, su periodo es el ano. Lo
prueban 5 unitarias sobre las funciones de fecha reales. Queda dicho en vez de fingir cobertura.

### 3. La pregunta de las opciones de "se repite": se quedan, con aviso

Se pregunto si convenia quitar de la pestana Quienes las opciones que dejan hacer repetir una
induccion. **Se quedan.** No falla nada: el motor lee la recurrencia del REQUISITO, no del tipo, asi
que hacerla repetir funciona entero. Lo que cambia es como se LEE — el informe la sigue contando
como induccion— y hay una asimetria real: `onExpiry` y la gracia por ingreso reciente los pone el
TIPO, no el requisito.

Asi que se avisa y se deja decidir: al elegir una recurrencia en un tipo cuyo defecto es "no se
repite", sale una linea que dice que su constancia pasara a vencer y que una habilitacion legal va
mejor como **Recertificacion**.

### El barrido, al cerrar

```
12 recorridos           TODO BIEN     (los 7 tipos + ciclos, varias convocatorias, tajadas,
                                       proyectados-ajuste y la suite estandar)
385 pruebas unitarias   pasan         (374 + 11 nuevas: 6 de primera ronda, 5 de ancla)
build - lint - types    limpios       (1 aviso de lint, ninguno nuevo)
```

### Lo que sigue abierto

1. **El numero del certificado EXTERNO.** Lo pidio el cliente al cerrar la sesion: TRANSPRENSA no
   emite certificados de montacargas —los emite la ARL o un centro— pero necesita saber **a quien se
   le vence**. Hoy el sistema sabe la fecha y no sabe **que documento** la respalda, que es lo
   primero que pide el auditor. Sin disenar todavia: ver el final de esta entrada en el RUNBOOK.
2. **Una fila por persona en Seguimiento, no por ronda** — decidido: por persona, pero **despues**
   del informe por periodo del Sprint 6.
3. **NADA SE HA SUBIDO A GIT EN 9+ SESIONES** (150+ archivos). Sigue siendo lo mas urgente del
   proyecto y no es tecnico: todo el trabajo vive en un solo disco.

---

## 2026-09-04 (noche) — RECERTIFICACION: el septimo tipo, y no costo codigo

El encargo fue una pregunta: *"no creo que transprensa certifique en alturas... pero es buena opcion
para otros clientes como recertificacion, ¿o es mejor dejarlo como dices?"*. Se creo el tipo, se
probo de punta a punta —seguimiento incluido— y se documento.

### Lo que se hizo

- **Tipo `RECERTIFICACION`** en el seed y en el tenant vivo (`#65a30d`, `BY_JOB_TITLE`, `EVENT`,
  12 meses de aniversario, `ESPERA`, sin gracia por ingreso reciente, fuera del plan).
- **`scripts/recorridos/recertificacion.mjs`** — 11 pasos, en verde, con `comprobarSeguimiento`.
- **Guia de usuario** `docs/guias/recertificacion.html`, y el indice
  `docs/guia-montar-formaciones.html` ahora **enlaza las siete guias por tipo** (no lo hacia:
  existian siete paginas y ninguna estaba enlazada desde el indice).
- **`docs/modulos/formaciones/07-recertificacion.md`** y la tabla de `00-el-motor.md`.
- **Decision #154** en `CLAUDE.md`.

### Lo que importa de esto

**La suite estandar cubrio el tipo nuevo sola, sin tocarla.** Es el primer tipo creado despues de
`estandar.mjs`, y es la prueba que le faltaba a la Decision #8: el contrato se deriva del `config`
del tipo, no de una lista escrita a mano. Un cliente que cree su propio tipo queda cubierto el mismo
dia.

**Por que un tipo y no una induccion especifica que se repite** (la pregunta del cliente): las dos
cuelgan del cargo y usan el mismo motor, pero **el tipo es lo que lee el auditor**. La especifica
pregunta "¿se la hicieron cuando llego?"; la recertificacion, "¿esta vigente HOY?". Una especifica
vencida es una tarea pendiente; una recertificacion vencida es alguien que **no puede hacer su
trabajo**.

### El barrido completo, al cerrar

```
12 recorridos           TODO BIEN     (los 7 tipos + ciclos, varias convocatorias, tajadas,
                                       proyectados-ajuste y la suite estandar)
374 pruebas unitarias   pasan
21 e2e                  pasan         (4,1 min)
build · lint · types    limpios       (1 aviso de lint, ninguno nuevo)
```

### Lo que sigue abierto

1. **Una fila por persona en Seguimiento, no por ronda** — decidido: por persona, pero **despues**
   del informe por periodo del Sprint 6. Cambiar el grano ahora obligaria a rehacerlo.
2. **NADA SE HA SUBIDO A GIT EN 8+ SESIONES** (150+ archivos). Es lo mas urgente del proyecto y no
   es tecnico: hoy todo el trabajo vive en un solo disco.

---

## 2026-09-04 (tarde) — Los seis tipos cerrados, y el numero del auditor estaba mal por cinco

Sesion corta con un solo encargo —*"revisa reinduccion que no falte nada, y sigue con las pruebas
que faltan"*— que acabo tocando los tres informes de cumplimiento. **Lo que hay que leer si se
retoma manana esta aqui.**

### Lo primero, que lo pidio el cliente a media sesion

El tipo **«Prueba de encuesta W6PWX»** que llevaba desde el 2026-09-01 en Configuracion → Tipos de
formacion. No era un tipo: lo dejo `demo:encuesta`. No se dejaba borrar porque **dos formaciones lo
usaban** — la del script y **«videos logistica11», que la creo el cliente eligiendo ese tipo de la
lista**, que es exactamente el dano de dejar basura en la configuracion. Borradas las dos y el tipo,
con copia de la base antes. Quedan los seis tipos reales.

Y los tres arreglos para que no vuelva: `demo:encuesta --limpiar` (probado, crea y recoge), el
mensaje de la pantalla —decia **"Conflict Exception"** y ahora dice "lo usan 2 formaciones" y ofrece
desactivar—, y la pastilla "Desactivado", porque desactivar no tenia efecto visible. Detalle en el
RUNBOOK.

### Reinduccion: solo quedaba un hueco, y detras habia otro mucho mayor

Lo unico abierto de codigo era **«cierra y abre» (Decision #142)**, probado con unitarias pero no de
punta a punta. El modulo decia que haria falta *"esperar un ano o manipular fechas en la base"*.
**Ninguna de las dos**: la ventana esta fijada en 60 dias, asi que con una recurrencia de **un mes**
ya esta abierta el dia que nace la ronda 1. Se comprime la recurrencia, no el reloj — es el mismo
codigo que correra en 2027. `scripts/recorridos/reinduccion-ciclos.mjs`, 10 pasos.

**El motor esta perfecto:** ronda 1 → `EXPIRED_NOT_DONE`, ronda 2 nace, el aprendiz debe una sola.

**El informe no se habia enterado**, y esto es lo gordo de la sesion:

| Lo que el motor escribia | Lo que el Seguimiento ensenaba |
|---|---|
| Ronda cerrada NO REALIZADA | **"Sin empezar"** — lo contrario de lo que es |
| **96.246** obligaciones retiradas | **"Sin empezar"**, y sumando al denominador |

Los tres informes no filtraban por estado **ninguno**. El avance global salia **0,18%** cuando lo
real es **0,89%**: cinco veces peor de lo que era. Tras arreglarlo el informe pasa de **121.819
renglones a 25.208** — sobraba el 79%.

Lo peor es que estaba escrito que no podia pasar: `00-el-motor.md` §7 aseguraba que la lista blanca
protegia. Cierto para las consultas de lo abierto, falso para los informes. Corregido, con la
medicion al lado.

**Arreglado** (Decision #144): `ESTADOS_RETIRADOS` filtrando en los tres informes, dos estados de
lectura nuevos —**No realizada** y **Eximida**— y el avance es `terminadas / (total - eximidas)`,
porque dejar la eximida dentro pone techo al indicador.

### Extraordinaria: el ultimo tipo, en verde a la primera

`scripts/recorridos/extraordinaria.mjs`, 13 pasos. **Los seis tipos tienen recorrido.** Lo medido:
publicar no crea ni requisito ni convocatoria; las facetas del alcance **se cruzan** (cargo 256 ·
area 142 · las dos: **51**, no la suma); programar la jornada **no crea renglon** de plan; colarla en
un plan por la API da 409; el aprendiz no se apunta solo; una sola ronda, no vuelve.

### La e2e llevaba una sesion en rojo sin que nadie lo supiera

Al correr la suite entera salieron **5 de 21 en rojo**, y **ninguna era de hoy**: las cinco son
rotulos y comportamientos que cambiaron ayer y la suite no se volvio a correr. Vale la pena
mirarlas, porque son el inventario de lo que ayer se rehizo:

| Lo que la prueba esperaba | Lo que hay desde ayer |
|---|---|
| pestanas como `button` | son `role="tab"` (`view-tabs.tsx`) |
| boton "Guardar a quien se le exige" | se llama **"Exigirla"** |
| la novedad se pide SIEMPRE | solo cuando la casilla **ya existe** — la primera vez se escribe la matriz, no se modifica |
| columna "Requisito" en la tabla de obligaciones | la tabla se rehizo; ahora es "Quienes la tienen que hacer" y el origen es el encabezado |
| el requisito retirado se ve en la lista | la lista ensena **solo lo VIGENTE**; hay que pedir "Todos" |

Y una sexta que no era rotulo sino **estado**: la prueba de la convocatoria del plan fallaba con un
timeout si en la base habia un plan aprobado vivo, porque entonces el formulario pide motivo. Ahora
lo rellena si se lo piden. Una prueba que depende de lo que dejaron otras corridas falla el dia mas
inoportuno y con el error que menos se parece a la causa.

### Lo demas

- **`mirar.ps1` fallaba** si se lanzaba con la ruta entera desde `Documents`: compilaba en la
  carpeta actual y moria en `EPERM ... 'Mi musica'`, con el mensaje "Fallo la compilacion de
  shared", que no se parece a la causa. Un `Set-Location $raiz` lo arregla.
- Verificado **en el navegador**: el aviso de "no se puede eliminar", el boton de desactivar, la
  pastilla y la vuelta atras.

### Y despues, revisando la pantalla con el cliente delante, salieron cuatro cosas mas

**1. El fallo de las tajadas, que es el mas caro de hoy.** Lo pregunto el cliente: *"dos jornadas de
la misma formacion para regionales diferentes, ¿se suman bien?"*. No. Cada jornada acotada proyectaba
a **todos** los obligados, no a los suyos:

| Faceta | Debia proyectar | Proyectaba |
|---|---|---|
| Area | 198 y 207 | **405 y 405** |
| Cargo | 288 y 57 | **345 y 345** |
| Tipo de cargo | 345 y 559 | **904 y 904** |

Una colision de claves: la tajada y las audiencias del requisito usaban las dos `audienceMembers` y
la segunda pisaba a la primera. Publicar CONGELA los proyectados, asi que dos jornadas de 405 para
405 personas dejan la cobertura del ano sin poder pasar del 50%. **No se veia porque solo falla
ANTES de aprobar el plan** —despues, el escalon de los ya obligados usa otra clave— y es justo cuando
se decide como partir las jornadas. Arreglado (Decision #145) y probado con `tajadas.mjs`, que
el cliente hizo crecer con dos preguntas seguidas —"¿solo en el plan?" y "¿y con varias reglas?"—:
ahora cubre **los seis tipos** y **los dos escalones de derivacion** (por reglas antes de que haya
obligaciones, por obligados despues), que son codigo distinto. Identico en los seis. Y con **dos
reglas que se solapan** —area 211 y cargo 294, 89 personas comunes— los proyectados dan **416**, la
union, no 505.

**2. Todos los recorridos cruzan ahora el Seguimiento.** Lo pidio el cliente: *"tienes que hacer todas
las pruebas de todos los tipos teniendo en cuenta el seguimiento, si los datos son reales"*. Los ocho
llaman a `comprobarSeguimiento` antes de limpiar: lo retirado fuera, los estados terminales bien
leidos, el avance recalculado y los estados sumando el total.

**3. "Lo que se exige hoy" no contaba las obligaciones sueltas.** El cliente sumo 267 + 145 + 48 = 460
y abajo decia 463: las tres personas agregadas por "O a personas concretas" no tenian renglon. Ahora
sale "3 reglas + 3 sueltas" con su renglon propio. Vale para **todos los tipos** que admiten
asignacion individual, no solo extraordinaria. Y se dice que los alcances **no se suman** entre
reglas, porque una persona puede cumplir dos.

**4. Tipos de formacion, rehecha.** La tarjeta era un formulario de cuatro casillas + selector de
encuesta + linea de repeticion, por tipo: siete pantallas de alto para algo que se mira mas de lo que
se toca. Ahora es una linea de resumen y un boton **Configurar** que abre el cajon con todo. Ademas:
desactivar y eliminar son **dos botones** (antes habia que pulsar Eliminar y leerse el error para
descubrir que se podia desactivar), el nombre se edita al pulsarlo en vez de vivir en un campo
abierto, el color es un circulo con lapiz, y el icono de estado ya no es el mismo en los dos
sentidos.

**Y una comprobacion nueva del motor**, que tambien pidio el cliente: **dos reglas sobre la misma
persona** llevan contadores de ronda independientes. Cada una cierra SU ronda 1 como NO REALIZADA y
abre SU ronda 2, sin pisar a la otra. Verificado en `reinduccion-ciclos.mjs`.

### Y al final, tres cosas mas que pidio el cliente

**5. Pruebas ESTANDARIZADAS por tipo (Decision #147).** `estandar.mjs` recorre **los tipos que
existan en el tenant** —los seis de fabrica y los que cree el cliente— y comprueba de punta a punta
que el sistema hace lo que el tipo dice. **Sin tabla de expectativas escrita aparte**: se derivan de
`activity_types.config`, porque una tabla aparte es justo lo que se desincroniza. Cambiar el tipo
desde la pantalla cambia lo que se espera, y la prueba sigue siendo cierta sin tocarla.

Conviven dos capas y no se sustituyen: la estandar prueba lo COMUN (se corre al tocar el motor o
anadir un tipo), y `<tipo>.mjs` prueba lo SUYO (el renglon del plan, la ronda de la reinduccion).

**Lo primero que encontro:** el `LEEME` afirmaba que *"publicar sin evaluacion se rechaza"*. **No se
rechaza.** La Decision #74 lo dejo en AVISO —a la auditoria, no a la respuesta— con dos motivos
escritos: que el config no se podia editar desde la interfaz, y que ninguna prueba anadia evaluacion.
**Los dos han dejado de ser ciertos**, y el propio comentario dice cuando cambiarlo: *"se convierte
en compuerta el dia que el config del tipo se edite desde la interfaz"*. Ese dia llego. **Decision
del cliente**, anotada abajo.

**6. "Ajustar proyectados" movido (Decision #146).** Estaba dentro del cajon de publicar, cuando el
numero acaba de derivarse y no ha tenido tiempo de quedarse viejo — y el motivo acababa diciendo
"ajuste inicial". Ahora publicar congela y punto; corregir tiene su boton sobre la cifra congelada.
`proyectados-ajuste.mjs` prueba la situacion entera: congela 97, entran 2 personas, se derivarian
99 y **el congelado no se mueve solo**, sin motivo da 422, y ajustado queda 99 con el motivo escrito.

**7. Acotamientos en los SEIS tipos** (antes solo en el plan), por las siete facetas y por los dos
escalones de derivacion. Identico en los seis. Y con dos reglas solapadas los proyectados son la
UNION —416, no 505—.

**8. Una fecha de campana que no existe (Decision #148).** Al leer la configuracion REAL del tenant
para escribir la guia de usuario: la reinduccion tenia la campana en **`09-31`**, y septiembre tiene
30 dias. No falla nada —`Date.UTC` desborda al mes siguiente en silencio—, asi que **vencia el 1 de
octubre** mientras la pantalla decia 09-31. El patron estaba copiado a mano en TRES sitios y los
tres aceptaban `3[01]` en cualquier mes. Arreglado en un solo `fixedDateSchema` compartido, mas la
red de abajo en `nextFixedDate`.

**Ojo: la fecha guardada hay que cambiarla a mano.** El arreglo impide guardar una nueva mala; la que
ya esta puesta sigue ahi. Esta avisado en la guia de usuario.

**9. La guia de usuario, publicada.** "Montar cada formacion, paso a paso": los seis tipos con la
misma espina —para que es · lo que promete · paso a paso · lo que pasa solo · lo que hay que
vigilar— mas la tabla de estados con los casos reales de EXIMIDA y NO REALIZADA que pedia el
cliente. `claude.ai/code/artifact/77d23f2e-9ea7-4f1e-a074-680f9d77159b`

### Y para cerrar: los pendientes que quedaban, ejecutados

El cliente reviso la guia de usuario y **encontro un error real en ella**: decia que publicar una
induccion general "nace un requisito para toda la empresa", y no es cierto — nace con el corte de
solo-nuevos puesto **por el sistema** y obliga a CERO hoy. Medido: alcance 1.060, obligadas 0. La
guia esta corregida, y con el procedimiento real para que la deban tambien los antiguos (Quienes →
Ajustar → "al entrar al grupo", que hace nacer 1.060 obligaciones de golpe).

Con eso encima, se ejecutaron los pendientes:

| | |
|---|---|
| **#74 cerrada** | publicar sin lo que el tipo pide da **409**. La salida es apagar la regla en el TIPO, no un "publicar igualmente" |
| **Primera ronda de la campana** | cae en la fecha si faltan mas de 60 dias; si no, a los 30. Medido: vence el 31-mar-2027 |
| **Ingresos recientes** | fuera de la campana (`exemptRecentHiresMonths`, 6 meses). Medido: 747 de 1.071 |
| **Cupo** | convoca a los que caben, por orden de vencimiento, y dice cuantos faltan |
| **Fecha de campana** | dos listas (mes y dia): el 31 de septiembre ya no se puede ni intentar |
| **"En el plan anual"** | solo dice "agregala desde el plan" en las que pueden entrar; en las otras explica por que no |
| **Atras** | vuelve a la ficha de la formacion si viniste de ahi, no a la lista de convocatorias |

**Y salio un fallo de rendimiento serio de rebote.** La e2e se puso en rojo y la captura mostraba el
boton "Retirar" **deshabilitado**: la peticion seguia en vuelo pasados 30 s. Medido: **crear un
requisito de toda la empresa 1,0 s, retirarlo 61,1 s**. Un `OR` de mil clausulas para marcar avisos,
donde caben dos `IN`. **61,1 s → 1,3 s.** Es la tercera vez que este patron muerde, y esta vez lo
destapo una prueba funcional que empezo a agotar su tiempo — subirle el tiempo sin mirar lo habria
enterrado.

**Lo que NO se hizo, y es deliberado:** parametrizar la convocatoria automatica. El cliente pregunto
y su propio razonamiento lo resolvio: para varias regionales se crean varias convocatorias, y
"ejecutada por" es casi siempre PROPIOS. La modalidad, que parecia el descuido, **ya sale de la
formacion** — mi lectura anterior era erronea.

### Lo ultimo: una guia POR TIPO, y el campo que no se podia tocar

El cliente pidio documentacion de usuario **por tipo**, no una para todo: quien va a montar una
pildora no deberia leerse las inducciones para llegar a lo suyo. `docs/guias/` tiene ahora seis
paginas con la misma espina y el color de su tipo.

Y preguntando "¿desde donde se configuran esos 6 meses?" destapo que `exemptRecentHiresMonths`
**no estaba en ninguna pantalla**: funcionaba en el motor y solo se podia cambiar resembrando. Ya
esta en Configuracion → Tipos de formacion → Configurar.

**Lo medido para contestar la pregunta de los proyectados**, que es la que mas se repite: una
jornada programada para un area deriva las personas de ESE momento (10) y las congela al publicar;
otra jornada del mismo alcance meses despues deriva **las que hay entonces** (12). **No hay que
ajustar nada**: cada jornada deriva su numero en su propio momento. El ajuste es solo para cuando la
realidad se mueve DESPUES de congelar esa jornada concreta, y **mueve el numero, no la lista**.

### Estado al cerrar

| | |
|---|---|
| Recorridos de punta a punta | **11 / 11 en verde**, y los ocho de tipo cruzan el Seguimiento |
| Cobertura de tajadas | 6 tipos x 7 facetas x 2 escalones |
| Suite estandar | los 6 tipos, derivada de su configuracion |
| e2e de Playwright | **21 / 21** (venian 16/21 sin saberlo) |
| Unitarias | **374 / 374** |
| Retirar un requisito de toda la empresa | 61,1 s → **1,3 s** |
| Lint, typecheck, build | En verde |
| Git | **Nada confirmado.** Van OCHO sesiones |

### PARA ARRANCAR LA PROXIMA SESION

1. **Confirmar en git.** Se dijo ayer y no se hizo. Es lo mas barato de arreglar y lo que mas duele
   si se pierde. Van mas de cien archivos sin confirmar y ocho sesiones.
2. **Mirar los numeros de Seguimiento con ojos nuevos.** El avance global cambio hoy en todas las
   pantallas; conviene abrirlas y ver si algo mas chirria ahora que el denominador es el bueno.
3. **Ninguna de las pantallas nuevas de ayer se ha clicado** salvo Tipos de formacion. Sigue
   pendiente de la sesion anterior — y la e2e demuestra que ese pendiente tiene coste: los cinco
   fallos de hoy se habrian visto ayer corriendola.
4. **Correr la e2e al cerrar la sesion, no al abrirla.** Es lo que la habria mantenido en verde.
5. ~~Llevar a las guias la explicacion de EXIMIDA y NO REALIZADA~~ **HECHO**: estan en la guia nueva
   con sus casos reales.
5 bis. **CORREGIR LA FECHA DE LA CAMPANA de la reinduccion**, que esta en `09-31`. El sistema ya no
   deja guardar una fecha imposible, pero la que hay guardada no se arregla sola.
6. **LA UNICA PENDIENTE DE VERDAD: un renglon por ronda o por persona** en el informe. Con DOS reglas
   sobre la misma persona ya no son dos filas sino **cuatro**. El cliente decidio el orden: **por
   persona**, pero DESPUES del informe por periodo (Sprint 6), porque si se cambia antes el
   incumplimiento cerrado desaparece de todas las pantallas y no queda donde verlo.
7. ~~Decidir si publicar sin evaluacion pasa a ser compuerta~~ **HECHO** (Decision #149).
8. ~~Mover "ajustar proyectados"~~ **HECHO** (Decision #146). Antes decia: Lo pidio el cliente: hoy se ofrece AL PUBLICAR la
   convocatoria, que es cuando el numero acaba de derivarse y no ha tenido tiempo de quedarse viejo.
   Tiene sentido DESPUES, cuando la realidad ya se movio. Hay que moverlo y probar esa situacion:
   congelar, que cambie la plantilla, ajustar con motivo y ver que el plan lo recoge.

### PENDIENTES POR TIPO DE FORMACION

**Induccion general** — nada abierto.

**Induccion especifica**
- Quien **completo** la formacion y pasa a otro cargo que exige la misma, **la vuelve a deber**.
  Ocurrira con la matriz real del cliente si repite una induccion en varios cargos.

**Reinduccion** — sin nada de codigo abierto. **Tres decisiones del CLIENTE**, ninguna bloquea:
- La primera ronda **no cae el 31 de marzo**: vence a los 30 dias de publicarla.
- La campana **alcanza a quien acaba de ingresar** y aun no termino su induccion.
- **NUEVA:** quien tiene una ronda cerrada y otra viva sale **dos veces** en el informe, y cuenta
  dos en el denominador. Un renglon por ronda (historial, lo de hoy) o por persona (campana en
  curso). Cambia lo que lee el auditor.

**Capacitacion del plan**
- **Convocar a todos falla ENTERO si se pasa del cupo**, y el mensaje no dice cuantos hay obligados
  ni cuantas sillas faltan. **No arreglado.**
- **La cuenta del requisito sigue en cero** aunque haya gente obligada: las del plan cuelgan del
  RENGLON, no de la regla.

**Extraordinaria** — nada abierto. Recorrido en verde a la primera.

**Pildora** — nada abierto.

**Transversales**
- **Varias convocatorias en los tipos permanentes**: el sistema deja publicar dos permanentes del
  mismo contenido y **nada avisa**.

---

## 2026-09-04 — Cinco recorridos de punta a punta, y ocho fallos que solo se ven caminando

Sesion larga que empezo en "sigue con los pendientes" y acabo tocando el motor de obligaciones, el
plan y media docena de pantallas. **Lo que hay que leer si se retoma manana esta aqui.**

### Los recorridos: de uno a cinco

`scripts/recorridos/` tiene ahora **induccion general (10 pasos), especifica (16), reinduccion (12),
capacitacion del plan (19) y varias convocatorias (9)**, todos en verde. Prueban el CAMINO, no la
pantalla, y por eso encuentran lo que ninguna prueba de interfaz ve.

### Los ocho fallos, todos reproducidos antes de arreglarse

1. **Las obligaciones nacian VENCIDAS.** El plazo se contaba desde que la persona entro a la
   AUDIENCIA, y las audiencias se REUTILIZAN entre formaciones: al estrenar un requisito la gente ya
   llevaba meses "dentro". Medido con una audiencia de 60 dias: **7 de 7 vencidas**, con fecha de
   hacia un mes. En produccion, 600 personas en rojo el dia de publicar la reinduccion. Ancla ahora
   en el maximo entre la creacion de la regla y la entrada (Decision #143).
2. **La matriz por cargo se saltaba la Decision #76.** Marcar una casilla de una capacitacion del
   plan creaba un requisito que disparaba solo y hacia nacer **143 obligaciones de golpe**. Habia
   dos puertas que no hacian lo mismo; ahora la matriz delega en `setActivityRequirement`.
3. **El PLAN proyectaba a la misma gente dos veces.** Dos jornadas de lo mismo: **26 proyectados con
   13 obligados reales**, y la cobertura del ano sin poder pasar del 50%. El renglon congelaba el
   bruto de la jornada y el reparto le saltaba a quien ya contaba otro renglon.
4. **Cualquier formacion entraba al plan por la API.** El filtro de la Decision #78 vivia solo en la
   pantalla: meter una induccion general subio los proyectados del plan **de 22 a 819**.
5. **Cancelar una jornada no cancelaba un renglon REPROGRAMADO**, que seguia contando como
   programado en el cumplimiento del ano.
6. **Con dos convocatorias publicadas, la misma persona se inscribia DOS veces.** Al terminar una,
   la otra inscripcion se quedaba viva para siempre, y los numeros contaban dos inscritos donde hay
   una persona.
7. **`pnpm db:seed` borraba la parametrizacion del tenant.** Resembrar tras una migracion borro las
   encuestas que el cliente habia activado desde la interfaz. Ahora la semilla MEZCLA.
8. **La novedad era un asterisco que solo vivia en el navegador**: el servidor la aceptaba vacia.

### Lo que se construyo

- **"Cierra y abre" (Decision #142).** Que pasa cuando llega la ronda siguiente y no hizo la
  anterior pasa a ser politica de la empresa: `ESPERA` / `ACUMULA` / `CIERRA`, con estado terminal
  nuevo `EXPIRED_NOT_DONE` ("NO REALIZADA"), que **si** cuenta como incumplimiento. Migracion
  aplicada.
- **Un requisito por cargo**: marcar tres cargos crea tres casillas independientes.
- **La matriz de inducciones, rehecha entera** — cuatro formas probadas hasta dar con la buena: se
  LEE en una lista de cargos y se EDITA en una ventana ancha con las dos listas al lado.
- **Previsualizacion de proyectados**: la convocatoria decia "cubre a 773 personas de la empresa" en
  una formacion que obliga a nueve. Ahora dice "proyecta N de las M obligadas".
- **Programar significa lo mismo por las tres puertas** —ficha, modulo de Convocatorias y plan— y se
  quito el cuarto boton, el de la tarjeta del plan.
- **Configuracion -> Tipos de formacion** gana "cada cuanto vuelve": no se repite / cada ano en
  fecha fija / cada N meses, mas que pasa si no la hizo. Plegado tras un "Ajustar", con la decision
  resumida en una linea.
- **Eximir a una persona** desde la ficha, con ventana propia en vez del `window.prompt`.
- **Pestanas y filtros** de Asignaciones unificados (`view-tabs.tsx`, `list-filter.tsx`).

### La documentacion, que era la deuda mas vieja

- `docs/modulos/formaciones/` — **un documento tecnico por tipo**, mas `00-el-motor.md` con lo
  comun. Los cuatro verificados llevan sus numeros medidos; los dos pendientes dicen que lo suyo
  sale de leer el codigo.
- `docs/guia-formaciones.html` — guia de usuario, paso a paso, con "lo que no hay que hacer":
  `claude.ai/code/artifact/a4e94cb6-7dd6-4fb4-8f7d-eb51e82d6089`
- Glosario, y decisiones **#142** y **#143** en CLAUDE.md.

### Y una frase que estaba mal en cuatro pantallas

Decia que a quien lleva anos "lo cubre la reinduccion". **No es cierto**: su induccion se le hizo
cuando entro. Lo corrigio el cliente.

### PARA ARRANCAR LA PROXIMA SESION

1. **Confirmar en git.** Siguen sin confirmar mas de cien archivos y ya son siete sesiones. Es lo
   mas barato de arreglar y lo que mas duele si se pierde.
2. **Hay una migracion nueva** (`20260904090000_estado_no_realizada`). En cualquier maquina que no
   sea esta: `prisma migrate deploy` -> `db:rls` -> `prisma:generate` (con el stack APAGADO) ->
   `pnpm build` -> `mirar.ps1`.
3. Ya solo falta el recorrido de **extraordinaria**.

### PENDIENTES POR TIPO DE FORMACION

**Induccion general** — nada abierto.

**Induccion especifica**
- Quien **completo** la formacion y pasa a otro cargo que exige la misma, **la vuelve a deber**: la
  regla nueva no tiene historia suya. Hoy no ocurre porque ninguna se exige a dos cargos con
  contenido identico; ocurrira con la matriz real del cliente si repite una induccion en varios
  cargos, que es probable (bodega vale para auxiliar, montacarguista y coordinador).

**Reinduccion** — dos decisiones del CLIENTE, ninguna bloquea el piloto:
- **La primera ronda no cae el 31 de marzo**: vence a los 30 dias de publicarla y la campana rige
  desde la segunda. La pantalla dice "cada ano el 31 de marzo" y la primera no vence ese dia.
- **La campana alcanza a quien acaba de ingresar** y aun no termino su induccion. Lo habitual es
  dejar fuera del ciclo a quien ingreso dentro de el: su induccion ES su actualizacion del ano.
- Y una salvedad tecnica: **"cierra y abre" esta probado con unitarias, no de punta a punta**. Haria
  falta esperar un ano o manipular fechas. Se vera de verdad en la campana de 2027.

**Capacitacion del plan**
- **Convocar a todos falla ENTERO si se pasa del cupo** (`OFFERING_CAPACITY_EXCEEDED`): no convoca a
  los que caben, y el mensaje dice solo "el cupo es de 30 personas". Fallar es defendible —no se
  eligen 30 de 40 al azar— pero falta lo accionable: cuantos hay obligados, cuantas sillas faltan y
  que la salida es partir en dos jornadas con su tajada. **No arreglado**: en el recorrido solo se
  esquivo poniendo un cupo proporcional.
- **La cuenta del requisito sigue en cero** aunque haya gente obligada: las del plan cuelgan del
  RENGLON, no de la regla. Es correcto, pero "Lo que se exige hoy" ensena 0 obligadas con 11
  personas obligadas de verdad.

**Extraordinaria** — recorrido PENDIENTE.

**Pildora** — recorrido en verde a la primera, nada abierto.

**Transversales**
- **Varias convocatorias en los tipos permanentes**: el sistema deja crear y publicar dos
  permanentes del mismo contenido. Ya no duplica inscripciones, pero **nada avisa** de que hay dos.
- **Ninguna de las pantallas nuevas se ha clicado en un navegador.** Las llamadas estan probadas por
  los recorridos; el cableado de la interfaz, no.

---



## 2026-09-03 — CIERRE: desempeno terminado, y la carga de las 600 personas resuelta con numeros

Entrada de cierre de la sesion larga del 2026-09-02. **Lo que hay que leer si se retoma manana**
esta todo aqui; el detalle de cada cosa, en las entradas de abajo.

### La pregunta que quedaba viva, contestada MIDIENDO

El plan del piloto es: subir primero las formaciones y sus reglas, despues las personas, para que a
todo el mundo —nuevos y antiguos— le nazcan las inducciones generales. La duda era si el alta de
personas, anotada en 5,6 s desde el 2026-09-01, lo hacia inviable.

**Medido contra la base de desarrollo (184 audiencias, ~750 personas, peor que produccion):**

| Camino | Medicion | 600 personas |
|---|---|---|
| Alta individual, boton "Nueva persona" | 6,2 s · **9,0 s** tras anadir 125 personas | **60-90 min** |
| **Carga masiva (CSV)** | 25 en 9,5 s · 100 en 18,0 s = **180 ms/persona** | **1-2 min** |

**Conclusion: el plan funciona, y no hay que arreglar nada antes.** Son dos caminos distintos del
motor: el individual recorre todas las audiencias por cada persona; el lote llama a `reevaluateAll`
UNA vez y reparte ese costo — por eso 100 personas salen a la mitad de ms que 25. **La carga inicial
va por Usuarios -> carga masiva, nunca una por una.**

**Lo que queda, y ya no es sospecha sino dato:** el alta individual **empeora con el tamano del
tenant** (6,2 -> 9,0 s solo por anadir 125 personas). No bloquea el piloto, pero Gestion Humana va a
esperar ~9 s cada vez que cree a alguien en el dia a dia. La forma del arreglo se ve: acotar en
`syncPerson` el recorrido a las audiencias que puedan aplicar a esa persona, en vez de todas. Queda
en el RUNBOOK con los numeros.

### Y despues se arreglo, porque el dato invitaba a mirar

Con la medicion delante, el alta individual de 9 s dejo de ser "deuda anotada" y se volvio obvia.
**Ninguna consulta pasaba de 150 ms**: eran 1.680 transacciones por persona. Dos sitios, el mismo
error de forma:

- **Una fila por audiencia**, en `audiences.syncPerson`: 133 INSERT sueltos. El camino por lote ya
  usaba `createMany` desde siempre; este no se habia alineado.
- **`withdrawLeavers` recorria las 569 reglas del tenant** (diez de verdad, el resto residuo de e2e)
  con dos consultas cada una, para no hacer nada en 559.

Arreglados los dos sin cambiar ninguna regla de negocio: **9,0 s -> 0,4 s**. Verificado con la suite
entera, incluida la e2e "la obligacion nace sola al ingresar", que es justo ese camino. El detalle y
el metodo de diagnostico quedan en el RUNBOOK.

**Efecto en el plan del piloto:** la carga por archivo sigue siendo la via (600 en 1-2 min), pero
ahora el dia a dia tambien esta bien — dar de alta a un ingreso nuevo es instantaneo en vez de una
pantalla congelada nueve segundos.

### La guia de personas, publicada

Nueva, aparte de la de desempeno: **"Alta y gestion de personas"**, con el paso a paso de la carga
inicial en seis pasos, que decide el cargo y que el area, que pasa solo cuando entra alguien, y la
casilla de "se le exige a quien entre desde" — que es la que decide si los antiguos tambien deben la
induccion. Para TRANSPRENSA va **vacia**, porque el cliente quiere que la hagan nuevos y antiguos.

`claude.ai/code/artifact/86adfee0-f639-4c84-b2fe-7e44817348b7`

### Estado al cerrar

| | |
|---|---|
| Unitarias | **349** en verde |
| e2e | **21 / 21** |
| Alta de una persona | **0,4 s** (era 9,0 s) |
| Lint, typecheck, build | En verde |
| Migraciones | 2 nuevas, aplicadas en desarrollo y con RLS puesto |
| Git | **98 archivos sin confirmar** — seis sesiones |
| Stack | Levantado (`mirar.ps1`, web 3200 / api 3012) |

**Desempeno queda cerrado.** En esta sesion: un ciclo con varios formularios repartidos por cargo
(#139), una sola puerta para evaluar (#140), las dos capas de competencias (#141), el recordatorio
del ciclo parametrizable por tenant, el consolidado en Excel, y una tanda de interfaz que empezo
por un fallo real —`--primary-soft` no existia y llevaba semanas sin pintar en catorce sitios—.

### PARA ARRANCAR LA PROXIMA SESION

1. **Ponerse al dia con la base**, que hay dos migraciones nuevas. Con el stack APAGADO:
   `prisma migrate deploy` -> `pnpm db:rls` -> `prisma:generate` -> `pnpm build` -> `mirar.ps1`.
   Los pasos exactos estan en el RUNBOOK (2026-09-03).
2. **Confirmar en git.** Son seis sesiones y 98 archivos; es lo mas barato de arreglar y lo que mas
   duele si se pierde.
3. Y de ahi, la lista de abajo.

### LO QUE QUEDA, EN ORDEN

**Para que el piloto exista** (nada de esto es codigo de producto):

1. **Elegir proveedor y levantar la maquina.** El compose, los Dockerfiles y el Caddyfile estan
   escritos. Es lo unico que separa esto de estar en linea.
2. **Secretos reales**: `REFRESH_TOKEN_PEPPER` sigue en `change-me-in-prod`; faltan RS256, R2,
   Resend, Sentry. Y `TRUSTED_PROXY_HOPS` bien puesto al montar el proxy.
3. **Probar la restauracion** con un volcado real (`scripts/restaurar-prueba.sh`). Sin restauracion
   probada no hay copias, hay archivos.
4. **Verificar R2 contra un bucket real**: ninguna subida ha tocado Cloudflare todavia.
5. **LibreOffice no va en la imagen** -> subir un PPT se rechaza pidiendo el PDF.

**Datos, que solo puede dar el cliente:**

6. **Los cargos definitivos.** Los cinco de la base son los que se subieron; los de verdad son
   muchos mas, y de ellos dependen el reparto de formularios de desempeno y la matriz de induccion.
7. **Matriz cargo -> induccion** y el **plan 2026**.
8. **Responsable de cada area** (Configuracion -> Areas). Sin eso, la primera campana de desempeno
   solo genera autoevaluaciones: se comprobo con 723 personas saliendo "SIN_RESPONSABLE".
9. **Contenido y firmantes de la constancia**, y las **cuatro preguntas de desempeno**
   (`docs/modulos/desempeno.md` seccion 6). Ninguna bloquea codigo; bloquean tener una campana real
   en vez de una vacia.

**Sprint 5, abierto:**

10. **Asistencia presencial y QR** — bloquea que las formaciones presenciales emitan constancia.
11. **Pantalla del jefe para la eficacia** + el programador de la cita a los N dias (hoy la eficacia
    esta apagada por decision del cliente, asi que no bloquea).
12. **Emision manual de constancia** para lo completado antes de activar la plantilla.

**Deuda con numeros:**

13. ~~El alta individual de personas~~ **RESUELTO el 2026-09-03**: 9,0 s -> 0,4 s.
14. **La analitica tarda 3,4 s** contra las 90.000 obligaciones de la base de desarrollo.
15. **`MultiSelect`**: el aspa de quitar un chip vive dentro del boton que abre y cierra.
16. **La base de desarrollo esta gorda** y las corridas de e2e la engordan mas.

**Desempeno, lo unico que quedo fuera a proposito:**

17. **El puente hacia el plan.** La costura esta sembrada (`suggested_activity_id`) y la pantalla no.
    Se construye cuando armen el plan 2027 y con un ciclo CERRADO detras; el diseno de lo que haria
    falta esta escrito mas abajo, en la entrada de las dos capas.

---

## 2026-09-02 (noche, 2) — Desempeno tiene una sola puerta, y una variable que llevaba semanas sin pintar

Tanda de interfaz sobre el modulo, a partir de una lista de dudas del cliente. Casi todas eran de
diseno; una resulto ser un fallo de verdad que afectaba a media aplicacion.

### El fallo: `--primary-soft` no existe

La queja fue *"al seleccionar, la opcion ahora solo tiene borde"*. Y era cierto, pero no era una
decision de diseno: **la variable CSS estaba mal escrita**. La que existe es
`--brand-primary-soft`; se habia escrito `--primary-soft` en **catorce sitios** —barra
lateral, barra superior, conmutador de espacio, encuestas, la escala de puntuacion, constancias—.

Una variable CSS que no existe no pinta nada **y tampoco falla**: el navegador se la salta y no dice
ni una palabra. Asi que el relleno que marca "esto esta activo" llevaba semanas sin verse en ninguna
de esas pantallas, y lo que quedaba era el borde. Corregido en los catorce.

### La escala: marcado es RELLENO, no un tinte

Aun arreglada la variable, un 10% de color sobre blanco no basta aqui. Marca bien un item de menu
—hay uno solo y siempre en el mismo sitio— pero en una fila de cinco botones iguales, donde lo unico
que se pregunta es CUAL elegiste, se pierde; en el telefono de una bodega con mala luz, directamente
no se ve. Ahora el elegido va **relleno solido con el numero en blanco**. Lo hereda tambien la
encuesta de satisfaccion, que usa el mismo componente a proposito.

### El boton de entregar ES el medidor

Era un boton apagado con un "faltan 2" en gris a tres centimetros: dos sitios para mirar lo mismo.
Ahora usa `meterPct`, la pieza que ya existia en el reproductor: **se rellena con lo que
llevas respondido** y se abre con un latido al llegar al final. La microinteraccion de la marca,
puesta donde de verdad hay un avance que contar.

### La lista de evaluaciones dejo de ser una tabla

Eran 206 filas identicas, cada una con su pastilla naranja de "Pendiente". Un estado que llevan
TODOS los elementos de una lista no informa: solo pinta la pantalla de naranja. Ahora:

- **Un medidor arriba**: "2 de 208", cuantas faltan, cuando cierra y una barra. Doscientas deja de
  ser una palabra y pasa a ser un tamano — es lo mismo que hace la tarjeta de repaso dibujando las
  preguntas en vez de contarlas.
- **Pastillas** Por responder / Entregadas, y **buscador** cuando pasan de ocho.
- **Iniciales de cada persona** en vez del mismo portapapeles veinte veces: se califica a gente, y
  se la reconoce antes de leer el nombre.
- **Agrupadas por formulario** cuando hay mas de uno, que es lo que estrena la Decision #139.
- La nota cuando ya se entrego; una flecha cuando falta. Ninguna pastilla de estado.

### La ventana de calificar, y la de confirmar

Cada competencia es ahora una tarjeta con borde, el peso va en pastilla de color en vez de gris, y
**el comentario se pide en vez de imponerse**: una caja de texto abierta bajo cada competencia
triplicaba el alto de la ventana y convertia "marcar cinco numeros" en un formulario de redaccion.
Aparece al pulsar "Anadir comentario", y se queda si ya tiene algo escrito.

La confirmacion era una ventana blanca con un parrafo gris y un boton igual que los demas: se leia
como un tramite. Ahora el aviso lleva el color de advertencia con su icono, se dice **de quien** es
la evaluacion, y el boton dice **"Entregar la evaluacion"** y no "Entregar" — la regla de siempre
para lo irreversible: verbo + objeto.

### UNA SOLA PUERTA (Decision #140)

Era la duda mas de fondo del cliente y tenia razon. Habia **tres** entradas para el mismo asunto y
cual te tocaba dependia de quien eras: administracion para configurar, "Evaluaciones" en el menu
para calificar, y "Perfil" para leer lo tuyo.

- **Se quito la pestana "Evaluar" de administracion.** Eran las mismas evaluaciones en dos sitios.
  Dos puertas a una tarea no son una comodidad: son tener que acordarse de por donde se entro la vez
  pasada. Y decia algo falso del producto — calificar a tu equipo NO es administrar la plataforma,
  lo hace tambien quien no administra nada. Quien entre sin el permiso ve un estado vacio que le
  dice donde estan sus evaluaciones.
- **Lo tuyo salio del perfil.** El razonamiento de la #138 era bueno (se mira dos veces al ano, no
  merece entrada permanente) y el resultado no: nadie busca su evaluacion de desempeno entre sus
  constancias. Ahora esta arriba de la misma pantalla, **con el color secundario de la empresa**
  para que se distinga de un vistazo del trabajo de abajo, que va en el principal.
- **El item del menu sigue sin ser fijo**, que es la parte de la #138 que si se sostiene: aparece
  cuando hay ALGO —que responder o algo tuyo que leer— y desaparece cuando no queda nada. Lo unico
  que cambio es que antes solo miraba lo que hay que calificar, y por eso a quien no evalua a nadie
  no le salia nunca.

### El formulario, con la vista previa al lado

La ventana pasa a **880px en dos columnas**: a la izquierda se arma, a la derecha se ve. Estaba
escondida detras de "Ver como lo vera quien califique", y una vista previa que hay que ir a buscar
no se mira — se descubre como quedo con el ciclo ya abierto.

Y **"a quien se le hace" se pregunta en vez de deducirse de un vacio**. Antes, no marcar ningun
cargo significaba "toda la empresa": funcionaba con cinco cargos en pantalla, pero con cuarenta la
lista se come la ventana, y ademas un vacio se lee igual de bien como "todavia no elegi" que como
"no aplica a nadie". Ahora se elige entre **Toda la empresa** y **Solo algunos cargos**, y solo
entonces aparece el selector — con buscador cuando hay muchos y lo elegido arriba como pastillas
que se quitan de una en una. Elegir "algunos" y no marcar ninguno ya no guarda.

### Por cargo y no por area, con el razonamiento escrito

Otra pregunta del cliente, y de las buenas. No: los dos ejes ya tienen su papel. El **cargo decide
QUE se pregunta** —se evalua como alguien hace su trabajo— y el **area decide QUIEN califica** (el
responsable del area) **y como se corta el resultado**. Dentro de un area conviven cargos muy
distintos, y preguntarles lo mismo obliga a competencias tan genericas que dejan de medir nada. Es
tambien lo que hacen SuccessFactors, Cornerstone y Workday: competencias atadas al puesto, y la
estructura organizativa para la jerarquia y los reportes. Queda escrito en
`docs/modulos/desempeno.md` seccion 6 octies y en la guia del cliente.

### Lo del verde, contestado con las reglas del propio producto

La pregunta era si usar verde en botones y acentos en vez de siempre el azul. **El acento de
TRANSPRENSA ES verde** (`#205908`), asi que no hace falta inventar nada — pero el sistema ya
dice donde va cada uno y conviene no romperlo: el **principal manda** y significa "esto es lo
activo, esto es la accion"; el **secundario acompana** en refuerzos de otra naturaleza (racha,
puntos, el halo del repaso). Los dos no pueden significar lo mismo en la misma pieza o ninguno se
lee.

Aplicado aqui: el bloque **"Lo tuyo" es lo unico verde** de la pantalla —no es una accion con fecha
limite, es lo que se escribio sobre ti— y la lista de trabajo se queda en azul. El otro verde que
aparece es el semantico de "hecho": el visto de entregada y el de firmada.

### Y el boton del repaso, que gusto

Es `Button glow`: la sombra no es gris sino del COLOR del boton y muy difusa, asi que parece
encendido en vez de recortado. No es mas informal — es la llamada principal, y la regla es **uno por
vista**. Se puso en los dos sitios donde hay una sola accion que cierra la tarea: entregar la
evaluacion y firmarla.

### Verificacion

Lint, typecheck y build en verde; **339 unitarias**; **e2e 21 de 21** en la corrida final. Durante
la sesion hubo una corrida en 20/21: la que fallaba es la de siempre —el alta de una persona
pasando de los 10 segundos del limite, punto 13 de la deuda conocida— y va y viene segun lo cargada
que este la maquina. Sigue esperando que se mida con datos de produccion; no se toco.

Y revisado en el navegador con el stack levantado: la lista con su medidor y las iniciales, la
ventana con el 3 relleno y el boton medio lleno, el panel de administracion con dos pestanas y el
aviso de donde se califica, y el formulario ancho con la previa poblandose al marcar.

**La guia del cliente se reescribio y se publico como artefacto nuevo**, con el paso a paso completo
y la seccion de por que el formulario va por cargo:
`claude.ai/code/artifact/1b9e3ee4-8ca5-4800-841b-b7caf3b08bc7`. El artefacto viejo
(`09af1950-...`) queda obsoleto: no se pudo republicar por permisos.

### La segunda vuelta, con la pantalla delante

El cliente miro lo anterior y salieron cuatro cosas mas. Tres eran defectos de verdad:

- **"El relleno del item activo sigue sin verse."** El nombre de la variable estaba corregido, pero
  la FORMULA seguia mal: los "soft" se mezclaban con `white` fijo. Un 10% de azul oscuro sobre
  blanco da un gris casi invisible, y en la superficie OSCURA del aprendiz producia un bloque casi
  blanco sobre fondo negro. Ahora se mezclan con `--surface` —14% en claro, 34% en oscuro—,
  asi que la formula sirve en los dos temas.
- **"Logros del ano y Comentario general tienen otra interfaz."** Cierto: al poner las competencias
  en tarjeta, el comentario general se quedo suelto y parecia de otra pantalla. Ahora lleva la misma
  tarjeta, y la competencia de solo texto dice que lo es ("se responde escribiendo · no da nota") en
  vez de verse como una a la que le falta la escala.
- **"En Entregar se ve una ventana encima de la otra."** Era literal: la confirmacion era un segundo
  modal sobre el primero, con dos velos difuminados apilados. **Ya no se apilan ventanas**: la
  confirmacion es un PASO de la misma —cambian titulo, icono, contenido y botones—. Queda escrito en
  la skill de interfaz como regla.

Y una era una duda razonable: **"¿un aprendiz tiene que ver 3 de 208 y la fecha de cierre?"**. Si,
porque **no es el informe de la empresa: es su propio trabajo** —las evaluaciones que le tocan a el,
con su plazo—, y quien no califica a nadie no ve esa pieza. Lo que si estaba mal era como se leia:
el nombre del ciclo iba arriba en mayusculas, como cabecera de reporte. Ahora el rotulo dice **"Lo
que te toca calificar"** y el nombre de la campana baja a la linea de apoyo, donde sirve para
distinguir dos ciclos abiertos.

**Un descuido mio, dicho:** probando en el navegador entregue **una evaluacion de verdad** del ciclo
demo —"Persona S3 73467541", nota 80—. Es dato de desarrollo y no se puede deshacer por diseno; ahi
esta si molesta, se borra con un DELETE.

### Cuarta vuelta: se cierra desempeno

- **Los dias del recordatorio los pone el tenant.** Estaban en el codigo y no son una constante
  tecnica: `performanceReminderDays` en Configuracion -> Preferencias, 3 por defecto y **0 lo
  apaga**. En una campana de seis semanas tres dias llegan tarde; en una de dos, avisar con diez es
  avisar el primer dia. Misma clase de decision que `efficacyDaysDefault`.

- **El consolidado se exporta a Excel**, que era el ultimo pendiente con valor claro:
  `GET /desempeno/ciclos/:id/consolidado/xlsx`. **Dos hojas** —por formulario y persona por
  persona— porque responden preguntas distintas y mezcladas no se puede filtrar ninguna. La nota va
  como NUMERO en fraccion, no como texto, para poder promediar y ordenar la columna; sin nota, la
  celda queda **vacia y no en cero**. Las filas salen del mismo metodo que pinta la pantalla.

- **El formato de los libros se saco a `common/xlsx.ts`** al aparecer el segundo: cabecera con
  empresa, fecha y filtros declarados, y titulos congelados con autofiltro. Tenerlo dos veces
  garantiza que un dia un informe lleve fecha y el otro no. El export de Seguimiento se refactorizo
  encima y sus 6 pruebas siguen en verde.

- **Los dos textos largos, acortados.** "Nuevo ciclo" dice ahora "La campana del ano. Queda en
  borrador hasta que la abras.", y el rotulo de formularios "Marca todos los que apliquen: cada
  persona responde el de su cargo, y el que no declara cargos recoge al resto." La primera version
  explicaba el modelo entero en la ventana; una vez entendido, sobra.

### LAS DOS CAPAS, CONSTRUIDAS (Decision #141)

Se habian descartado hace dos horas con este razonamiento: "con cinco cargos, repetir las comunes en
cada formulario es copiar tres lineas una vez al ano". **El cliente corrigio el dato**: los cinco
cargos de la base son los que se han subido, y los de verdad son muchos mas. Con cuarenta, cambiar
"trabajo en equipo" obliga a editar cuarenta formularios y el que se olvide se evalua distinto sin
que nadie lo note. Con el dato correcto, la decision se da vuelta.

**Un formulario HEREDA de otro.** Uno se marca como base —las organizacionales de la empresa— y los
de cargo dicen "hereda de ese" y anaden las suyas. Al abrir el ciclo, la copia congelada junta las
dos listas: primero las comunes, despues las del cargo.

**Lo que NO cambia, y es la razon de elegir esta forma sobre las otras dos que se consideraron:**
cada persona sigue respondiendo UN formulario, con UNA evaluacion y UNA nota. A partir de la
composicion, el modulo entero trabaja con una sola lista — el calculo, el congelado, la pantalla del
evaluador y el consolidado no saben que hubo dos capas. Por eso **no hubo que tocar nada mas**.

Las alternativas y por que no:

- **Que una persona responda dos formularios** (el general y el suyo) con la nota sumada. Dos
  ventanas para calificar a la misma persona, y un modelo de nota repartido entre dos evaluaciones.
- **Marcar competencias como "organizacionales" e inyectarlas solas.** Menos clicks, pero el
  contenido de un formulario deja de ser explicito —marcas una y cambias en silencio cuarenta— y
  sobre todo **solo admite UN juego de comunes**. Con formularios base caben "Comunes operativos" y
  "Comunes administrativos", que es lo que pide una empresa con dos realidades.

**Tres reglas, probadas contra la base real:** no se encadena (heredar de uno que ya hereda ->
409 `BASE_CHAIN`), no se repite lo que ya viene de la base (-> 409 `COMPETENCY_IN_BASE`,
y la pantalla ni las ofrece), y editar la base cambia el PROXIMO ciclo pero no los pasados, porque
la copia se congela al abrir. Verificado: ciclo abierto con un formulario que hereda, y la copia
congelada trae las dos competencias en orden con sus pesos.

**Y lo que hace esto usable con cuarenta cargos:** **Duplicar** pasa a estar siempre disponible —no
solo como salida de un formulario bloqueado—, porque armar el numero 12 desde cero cuando se parece
al 11 es media hora tirada; y el selector de formularios del ciclo tiene **buscador** a partir de
ocho.

### Lo que sigue sin hacerse, y por que

- **El puente hacia el plan** (que una nota baja sugiera la formacion que la fortalece). La costura
  esta sembrada —`suggested_activity_id` en cada competencia, que hoy no lee nadie— y **la
  pantalla no**. Tiene sentido construirla cuando armen el plan 2027 y con un ciclo CERRADO detras:
  hacerla ahora seria disenar contra datos imaginados, sin saber que competencias van a existir ni
  como se van a leer. **Lo que haria falta cuando toque:** una vista que, dado un ciclo cerrado,
  liste las competencias por promedio ascendente, cuanta gente quedo por debajo de un umbral, y la
  formacion que cada una apunta; desde ahi, un boton que anada ese renglon al plan del ano
  siguiente. Nada de automatico: decidir a quien se forma es una decision de personas.

### Tercera vuelta: el recordatorio que faltaba, y dos colores de menos

- **El recordatorio del ciclo, construido.** Era el unico aviso que faltaba: al abrir se avisa una
  vez y despues nada, asi que una campana de seis semanas se olvida en la primera y el dia del
  cierre aparecen cuarenta evaluaciones sin responder. Ahora, **faltando tres dias**, se avisa
  **solo a quien aun no ha respondido**, una vez por ciclo y persona. La regla de cuando avisar va
  aparte y probada (`performance-reminder.ts`, 5 pruebas) para poder cambiar "tres dias" sin
  leer el worker; el disparo es diario a las 8 (`workers/performance-reminder.worker.ts`), no
  cada hora como el de pildoras: aquello va en la franja en que cada quien estudia, esto es trabajo
  de oficina. Los tres avisos del modulo quedan en `docs/modulos/desempeno.md` 5 bis.

- **El conmutador de espacio, sin color.** Al empezar a pintar de verdad el "soft", la pastilla de
  "donde estas" quedo azul dentro de un control que ya es azul palido por fuera: dos tonos de lo
  mismo, uno encima de otro, para marcar algo que no es una accion. Vuelve al papel neutro.

- **Una sola letra para las lineas de apoyo.** El aviso de la competencia de solo texto estaba en
  mayusculas con tracking y la descripcion del comentario general en gris normal: dos voces para lo
  mismo dentro de la misma tarjeta. Se queda la **normal** —son frases que explican, no rotulos de
  seccion— y el texto se acorta a "Se responde escribiendo. No suma a la nota."

- **Y se dice en la pantalla que NO hace falta un ciclo por cargo**, que fue la duda del cliente:
  el rotulo del selector lo dice con esas palabras y la ventana empieza por "una sola campana para
  toda la empresa".

### LO QUE SIGUE

1. **Las cuatro preguntas al cliente** (`docs/modulos/desempeno.md` seccion 6). Sigue siendo
   lo primero: no bloquea codigo, pero si sembrar el contenido real. Son: que competencias evalua
   hoy y con que escala, si la persona se autoevalua o solo califica el jefe, si el resultado se le
   muestra, y cada cuanto se hace.
2. **Dos capas de competencias** (organizacionales + del cargo) sobre la misma persona. Hoy cada
   quien responde UN formulario, asi que quien quiera las dos repite las organizacionales en cada
   formulario de cargo. Con cinco cargos es razonable; el dia que sean cuarenta, hay que sumarlas.
3. **El puente hacia el plan**: cada competencia ya puede apuntar a la formacion que la fortalece
   (`suggested_activity_id`) y **hoy no lo lee nadie**. Falta la pantalla que, al armar el plan
   del ano siguiente, diga "esto salio bajo, esta formacion lo cubre".
4. **Exportar el consolidado a Excel**, como el de Seguimiento, y ahora tambien por formulario.
5. Y lo de siempre: **sin confirmar en git**, ya son seis sesiones.

---

## 2026-09-02 (noche) — Un ciclo, varios formularios: el reparto lo decide el cargo

Era el primero de los pendientes de desempeno y el unico que partia algo en dos. Hasta hoy un ciclo
usaba UN formulario, asi que tener el de conductores y el de analistas en la misma campana obligaba
a abrir dos ciclos — y con dos ciclos el consolidado son dos consolidados, que alguien suma a mano
en una hoja aparte. Los formularios ya declaraban a que cargos aplican: el dato estaba, faltaba el
reparto.

### Las tres reglas, y por que ninguna se elige a mano

1. **El cargo manda.** El formulario que declara cargos se lleva a las personas de esos cargos.
2. **El que no declara ninguno es el general** y recoge a quien no encaje en otro. Es exactamente lo
   que ya significaba «sin cargos = a toda la empresa», asi que **una campana de un solo formulario
   se comporta igual que antes** — que era la condicion para no romper nada.
3. **Lo ambiguo no se abre.** Dos formularios peleandose el mismo cargo, o dos generales, dejarian a
   quien le toca cual en manos del orden de la consulta. Se rechaza al crear el ciclo y otra vez al
   abrirlo, diciendo cual es el choque; y la pantalla lo dice antes, al marcar la casilla.

Elegir formulario por persona no se ofrece, y es deliberado: con seiscientas personas eso no es
parametrizar, es escribir a mano lo que el cargo ya sabe.

### Y una cuarta que no estaba prevista: una campana vacia no se abre

Abrir es irreversible —congela los formularios y genera las evaluaciones—, y hasta ahora se podia
abrir un ciclo que no generaba ni una. Pasa cuando ningun cargo de la empresa encaja con los
formularios elegidos, o cuando nadie tiene responsable de area y el ciclo no lleva autoevaluacion.
Lo que quedaba era una campana en OPEN, vacia y ya sin arreglo. Ahora se para antes y se dice
cuantos se quedaron fuera y por que.

### El fallo que me destapo mi propia prueba

Habia escrito el aviso de «a estas personas no las cubre ningun formulario» **y no podia aparecer
nunca**: antes de repartir, la consulta ya filtraba a la gente por los cargos declarados, asi que
todo el que llegaba al reparto encajaba por construccion. Un aviso muerto y un bloque de pantalla
que no se pinta jamas.

El arreglo no fue borrarlo sino quitar el filtro: **se reparte sobre toda la plantilla y lo que queda
fuera se cuenta**. Filtrar de entrada es mas corto y deja fuera EN SILENCIO a los conductores porque
nadie hizo su formulario — que es la forma exacta en que esto se descubre en diciembre. Si la
campana era a proposito solo para unos cargos, el aviso sobra y no estorba; si fue un olvido, es la
unica ocasion de verlo.

### El modelo: la copia congelada se muda al formulario

`performance_cycle_forms` es la tabla nueva: que formularios lleva la campana, **cada uno con su
propia copia congelada**. La copia estaba en el ciclo y ahi ya no cabe: si el conductor responde el
suyo y el analista el suyo, una sola copia por ciclo obligaria a adivinar cual le tocaba a cada quien
al leer una evaluacion de hace tres anos. Y `performance_reviews` gana `cycle_form_id`: cada
evaluacion sabe con que formulario se respondio.

**La migracion no pierde nada.** Cada ciclo que existia se convierte en un ciclo con un solo
formulario, con su copia congelada intacta, y sus evaluaciones quedan apuntando a el. Se comprobo
contra la base de desarrollo: 4 ciclos, 4 filas nuevas, **2.788 evaluaciones rellenadas y ninguna
huerfana** — la columna se anade anulable, se rellena y solo entonces se exige, que al reves no
cabria en una tabla con filas.

### El consolidado, que era el motivo de todo esto

Va entero y **formulario a formulario**: cuantas evaluaciones, cuantas entregadas y el promedio de
cada uno. Se pueden promediar entre si porque la nota esta normalizada a 100 desde el primer dia —un
4 sobre 5 y un «cumple» valen 80 y 100 en cualquier formulario—. Con un solo formulario ese desglose
no se ensena: seria repetir las cifras de arriba.

### Verificacion

**339 unitarias en verde** (7 nuevas del reparto), lint y typecheck y build en verde, y **contra la
base real por HTTP, con sesion**:

| | |
|---|---|
| Dos formularios peleandose «Conductor» | 409 `JOB_TITLES_OVERLAP` |
| Dos formularios generales | 409 `TOO_MANY_GENERAL_FORMS` |
| Campana de dos cargos, sin general | 511 personas cubiertas, **212 fuera y dichas** |
| La misma campana + el general | 206 evaluaciones, **0 fuera** |
| Abrir una evaluacion | trae SU formulario, no el del ciclo |

Los datos de prueba se borraron despues: la base queda con los mismos 4 ciclos y 2.788 evaluaciones
que antes. El stack quedo levantado con lo nuevo (`mirar.ps1`, 3200 / 3012).

### La suite e2e, entera y en verde — y lo que costo llegar

**21 de 21**, en 4,7 minutos. La primera corrida dio **4 rojas** y la tentacion era darlas por
ambientales, porque la maquina estaba compilando y yo tenia el navegador encima. Repetida en limpio
salieron **las mismas cuatro**, asi que no era el entorno. Ninguna era del cambio de hoy:

- **Tres eran el alta de personas** tardando mas de los 10 segundos del limite: es el punto 13 de la
  deuda conocida (177 audiencias, 90.000 obligaciones en la base de desarrollo). Con la maquina
  libre entran de sobra —13,5 s y 42,6 s de prueba completa— y por eso pasan ahora. **No se toco**:
  la recomendacion sigue siendo medirlo con datos de produccion el dia de la carga de las 600
  personas, no antes.
- **La cuarta era una asercion vieja.** `sprint-1` esperaba que el panel saludara con «Hola», y el
  rediseno del inicio del 2026-09-01 lo cambio a «Buenos dias / tardes / noches, Nombre». Llevaba
  en rojo desde entonces sin que nadie corriera la suite. Ahora comprueba lo que no depende de la
  hora: que saluda, y por el nombre.

Dicho de otra forma: **el 19/21 que decia el diario ya no era cierto — eran 17/21**, y una de las
dos nuevas no tenia nada que ver con el rendimiento. Correr la suite entera al cerrar el bloque es
exactamente lo que la encontro.

### La guia del cliente: actualizada en el repo, PENDIENTE de republicar

`docs/guia-desempeno.html` decia, en un recuadro destacado, *«Limitacion de hoy: un ciclo usa un
formulario»*. Ya no es verdad, asi que se reescribio: como se marcan varios, que es el formulario
general, que pasa con quien no queda cubierto, y dos filas nuevas en la tabla de «lo que el sistema
no deja hacer».

**El archivo del repo esta al dia; el artefacto publicado NO.** Republicarlo requiere permiso y se
denego, asi que la version que el cliente puede tener abierta
(`claude.ai/code/artifact/09af1950-2f5a-41be-9e9c-e741a0a6eace`) sigue anunciando una limitacion que
ya no existe. **Hay que republicarla desde `docs/guia-desempeno.html` antes de volver a enviar el
enlace.**

### LO QUE SIGUE — desempeno, en orden

1. **Las cuatro preguntas al cliente** (`docs/modulos/desempeno.md` seccion 6): que competencias
   evalua hoy y con que escala, si se autoevalua o solo califica el jefe, si el resultado se le
   muestra a la persona, y cada cuanto. Pasa a ser lo primero: no bloquea el codigo —todo es
   parametrizable— pero si sembrar su contenido real.
2. **El puente hacia el plan.** Cada competencia ya puede apuntar a la formacion que la fortalece;
   falta la pantalla que, al armar el plan del ano siguiente, diga «esto salio bajo, esta formacion
   lo cubre». Tiene sentido construirlo cuando armen el plan 2027.
3. **Recordatorios del ciclo** a los evaluadores que no han respondido cuando se acerca el cierre.
4. **Exportar el consolidado a Excel**, como el de Seguimiento — y ahora tambien por formulario.

Y lo que no es de desempeno pero sigue siendo lo mas grande: **86 archivos sin confirmar** desde el
commit del 2026-09-01, y el **responsable de area sin rellenar en produccion**, que es lo que decide
si la primera campana genera evaluaciones de verdad o solo autoevaluaciones.

---

## 2026-09-02 (tarde) — Desempeno: por donde entra cada quien, y dos cosas que el cliente vio antes que yo

Tanda de correcciones sobre el modulo recien construido. Las dos mas importantes salieron de
preguntas del cliente, no de una revision.

### El hueco: "¿por que Evaluar sale en admin? los jefes son rol aprendiz tambien"

Tenia razon y era grave. **Un jefe de area normalmente NO tiene acceso a administracion**: entra por
la superficie del aprendiz como todo el mundo. Mientras "Evaluar" vivio solo en el panel, la mitad
de los evaluadores recibia el aviso de que tenia veinte evaluaciones y **no tenia por donde
abrirlas**. El modulo estaba completo y a la vez era inutilizable para su usuario principal.

Ahora hay `/mi-desempeno` en la superficie del aprendiz, con su item en el menu — y **el item solo
aparece cuando hay algo pendiente** (Decision #138). Fijo seria un recordatorio permanente para la
mayoria, que no califica a nadie nunca; escondido en el perfil, un jefe con veinte evaluaciones no lo
encontraria. Aparece cuando es una tarea y se va cuando deja de serlo.

**Perfil y menu quedaron como dos trabajos distintos:** calificar tiene fecha limite y se busca en el
menu; leer lo propio es "lo mio" y se busca en el perfil.

Los dos componentes se mudaron a `components/modules/desempeno/`: ya no son ni de admin ni de
aprendiz, son de las dos superficies.

### "Un formulario que ya uso el ciclo no se puede editar, ¿como se duplica? No veo"

Tambien tenia razon. La regla es correcta —lo que ya uso un ciclo no se reescribe, porque cambiaria
la pregunta debajo de respuestas ya dadas— pero **deshabilitar el boton dejaba sin salida**: se veia
un boton apagado y ningun camino.

Ahora se pulsa, se explica POR QUE no se puede, y se ofrece **Duplicar y editar**: se crea uno nuevo
con "(copia)" en el nombre, el original no se toca y los ciclos viejos siguen diciendo lo que decian.
Esconder una regla no la explica.

### Un defecto viejo que solo aparece mirando la pantalla

**Un boton deshabilitado se veia identico a uno pulsable** —mismo relleno de marca, mismo texto
blanco— y solo se notaba al pulsarlo y no pasar nada. Afectaba a TODO el producto, no solo a este
modulo. Ahora se atenua, salvo mientras carga: un boton con la rueda girando esta trabajando, no
apagado (Decision #137).

### La escala, unificada

Se extrajo a `ui/escala.tsx` la del cuestionario de encuestas —botones grandes, todas las opciones a
la vista, extremos escritos— y ahora la usan las dos. Tener dos formas de "elegir un numero" en el
mismo producto solo garantiza que un dia se sientan distintas.

**Con numeros y no caras al calificar a una persona**, y esa es la unica diferencia deliberada: las
caras son perfectas para medir satisfaccion, pero convierten un juicio profesional en un emoticono, y
quien lo lea dentro de un ano merece "4 de 5" (Decision #136).

### Tambien: cargos, vista previa y de donde sale el formulario

- **Selector de cargos** en el formulario. Sin marcar ninguno aplica a toda la empresa, y se dice: un
  selector vacio se lee igual de bien como "todavia no elegi" que como "no aplica a nadie".
- **Vista previa** de como lo vera quien califique.
- **Al crear el ciclo se ensena QUE PREGUNTA** el formulario elegido —competencias, escalas, pesos y
  cargos—, que era la duda del cliente: "no veo de donde sale ese formulario".

### Preguntas contestadas, para no volver a explicarlas

- **Autoevaluarse** es que sale tu propio nombre y te calificas: una evaluacion mas, con las mismas
  competencias, respondida desde el mismo sitio donde calificas a tu gente.
- **Firmar** solo aplica a la evaluacion DEL JEFE y aparece cuando el la entrega. Firmar la propia no
  significaria nada.
- Quien es responsable de su propia area sale como `ES_SU_PROPIO_JEFE` y **no tiene quien lo evalue**:
  por eso ve su autoevaluacion y ningun boton de firmar. No es un fallo.
- **Cada cuanto:** un ciclo al ano para toda la empresa es lo normal, con formularios distintos por
  cargo dentro de la misma campana. Semestral solo donde hay mucha rotacion.

Todo esto quedo tambien en la guia del cliente (`docs/guia-desempeno.html`), que se actualizo.

### Verificacion

332 unitarias en verde, lint/typecheck/build en verde, y revisado en el navegador: el item
"Evaluaciones" apareciendo en el menu del aprendiz con 206 pendientes, la pagina listandolas, y el
boton "Guardar" atenuado cuando no hay nada marcado.

---

## PENDIENTE de desempeno, por orden

1. **Un ciclo, VARIOS formularios.** Hoy un ciclo usa uno solo, asi que tener el de conductores y el
   de analistas en la misma campana obliga a abrir dos ciclos — y eso parte el consolidado en dos y
   hay que sumar a mano. Los formularios ya declaran a que cargos aplican: el dato esta, falta el
   reparto. **Es lo primero.**
2. **Las cuatro preguntas al cliente** (`docs/modulos/desempeno.md` seccion 6): que competencias
   evalua hoy y con que escala, si se autoevalua o solo califica el jefe, si el resultado se le
   muestra a la persona, y cada cuanto. No bloquean el codigo —todo es parametrizable— pero si
   sembrar su contenido real.
3. **El puente hacia el plan.** Cada competencia ya puede apuntar a la formacion que la fortalece;
   falta la pantalla que, al armar el plan del ano siguiente, diga "esto salio bajo, esta formacion
   lo cubre". Tiene sentido construirlo cuando armen el plan 2027, no antes.
4. **Recordatorios del ciclo.** Hoy se avisa al abrir y al entregar; falta el recordatorio a los
   evaluadores que no han respondido cuando se acerca el cierre.
5. **Exportar el consolidado a Excel**, como el de Seguimiento.

---

## 2026-09-02 (tarde) — El responsable del area: dos campos, ninguno rellenable

El cliente aviso de algo pequeno —"no hay campo en area para asignar al responsable"— y detras habia
tres cosas.

### 1. El campo existia y ninguna pantalla lo exponia

`areas.responsible_user_id` esta en el modelo desde el Sprint 5. Lo leen **la evaluacion de
eficacia** (quien responde si la formacion sirvio) y ahora **el desempeno** (quien califica). No
habia forma de rellenarlo: ni en la interfaz, ni siquiera en la API — el contrato de areas no
aceptaba ese campo.

Asi que las dos funciones llevaban meses apuntando a un vacio **sin dar error**, porque no falla
nada cuando simplemente no hay a quien avisar. Es la peor forma de estar roto: la que no se nota.

### 2. Eran DOS campos que significaban lo mismo (Decision #135)

Mirando el modelo aparecieron `manager_user_id` y `responsible_user_id`, los dos en `areas`, los dos
"el jefe del area" — y cada funcion leia uno distinto: el aviso de "alguien reprobo" miraba el
primero y la eficacia el segundo. En la base los dos estaban vacios en las diez areas.

Se unifico en `responsible_user_id`, que es como se llama el equivalente en `processes` (quien
responde por esto). La migracion **copia antes de borrar**: se escribio a mano en vez de dejarsela a
Prisma justamente por eso — un `DROP COLUMN` a secas habria perdido lo que alguien hubiera guardado
en la columna vieja.

### 3. Y de paso, una migracion que habria reventado el despliegue

Al crear la migracion, la base sombra de Prisma —que es una base NUEVA— fallo:

```
ERROR: index "areas_responsible_user_id_idx" does not exist
```

La migracion de desempeno del dia anterior habia arrastrado tres sentencias de limpieza de deriva
—dos `DROP INDEX` y un `DROP CONSTRAINT`— sobre objetos que existen en la base de desarrollo y **no
en una base nueva**. Tal cual estaban, `migrate deploy` habria muerto ahi el dia del despliegue.

Se volvieron idempotentes (`IF EXISTS`). **La base sombra hizo de simulacro de produccion**: fallo
en el sitio donde fallar es gratis.

### Verificacion

Con un responsable asignado desde la API: **206 evaluaciones de jefe generadas**, 516 personas
todavia `SIN_RESPONSABLE` —las areas que aun no lo tienen— y quien dirige el area salio como
`ES_SU_PROPIO_JEFE` en vez de autoasignarse. 332 unitarias en verde.

### Las pantallas, el mismo dia

`/desempeno`, seccion propia en la barra —no dentro de Formaciones: el cliente pidio que no se
mezcle, y la navegacion es donde primero se mezclan las cosas—. Tres pestanas:

| Pestana | Quien | Que hace |
|---|---|---|
| **Evaluar** | todo el mundo | Responder lo que le toca calificar, y su autoevaluacion |
| **Ciclos** | Gestion Humana | Crear, abrir, ver como va y cerrar |
| **Que se evalua** | Gestion Humana | Competencias y formularios |

"Evaluar" va primera aunque fue la ultima en construirse: es la que abre mas gente y la unica con
algo que hacer hoy. Las otras dos solo aparecen con `performance:manage`.

Decisiones de esa pantalla:

- **No hay autoguardado al calificar.** Es un texto que se piensa y se corrige mientras se escribe;
  guardar cada tecla dejaria en el servidor versiones a medias de un juicio sobre una persona. Se
  entrega entera, con una confirmacion que dice que no se puede deshacer.
- **Al abrir un ciclo se dice a quien no se le pudo asignar jefe**, agrupado por motivo y con el
  camino para arreglarlo. Es la unica forma de que "faltan responsables de area" se vea el dia que
  importa y no en diciembre.
- **El peso se muestra al calificar**: si una competencia vale el triple, quien califica tiene
  derecho a saberlo antes de marcar.
- **La escala se responde con botones, no con un desplegable**: son cinco opciones que se comparan
  entre si, y verlas todas a la vez es el gesto.

### Y la pantalla de la persona evaluada

En SU PERFIL, debajo de sus constancias. No una entrada propia en la navegacion: se mira una o dos
veces al ano, justo despues de la conversacion con el jefe, y una entrada permanente para eso seria
un recordatorio doce meses de algo que ocurre dos veces. Si no hay evaluaciones, la seccion no se
pinta.

La autoevaluacion y la del jefe se ven juntas —por separado son dos opiniones sueltas; juntas, la
diferencia ES la conversacion—, los valores se muestran como se respondieron ("4 de 5", no "80%"), y
la firma se explica con palabras: *"firmar no es estar de acuerdo, es dejar constancia de que leiste
tu evaluacion"*. Sin esa frase, quien cree que firmar es aceptar una nota injusta no firma, y la
empresa se queda sin la evidencia.

### Verificado recorriendo la interfaz

Ciclo creado y abierto (929 evaluaciones), autoevaluacion respondida con la escala de botones, el
aviso de "no se puede corregir", entrega, y la evaluacion apareciendo en el perfil del aprendiz con
su 90%. El fondo difuminado de la ventana y el peso "x3" de la competencia, comprobados a ojo.

### Preguntas del cliente, contestadas

- **¿Quien evalua?** Lo decide el ciclo. Con autoevaluacion activada se generan DOS por persona —la
  suya y la de su jefe— y se comparan lado a lado. El empleado no evalua a su jefe: eso es 360 y
  esta fuera de la primera version a proposito.
- **¿Y si el plan ya se cerro?** La necesidad que aparece a mitad de ano no se fuerza dentro del
  plan: para eso esta la **capacitacion extraordinaria**. Cuenta como evidencia, sale en Seguimiento
  y en el expediente, y **no mueve el cumplimiento del plan** — que es deliberado: el plan mide lo
  que se prometio en diciembre, y si cada reaccion del ano entrara ahi, el indicador dejaria de
  poder compararse entre anos.
- **¿La evaluacion solo alimenta el plan?** No: son dos caminos segun si la necesidad es estructural
  ("todo el equipo de SAC esta flojo en atencion al cliente" -> renglon del plan del ano siguiente) o
  puntual ("este agente necesita reforzar ya" -> extraordinaria, ahora). Por eso la costura apunta a
  una FORMACION y no a un renglon de plan: una formacion se entrega de las dos maneras.

### Cerrado despues: cargos, vista previa, y dos cosas que salieron de mirar la pantalla

- **El selector de cargos** ya esta en el armador de formularios. Sin marcar ninguno aplica a toda la
  empresa, y **se dice**: un selector vacio se lee igual de bien como "todavia no elegi" que como "no
  aplica a nadie", y son cosas opuestas.
- **Vista previa** ("ver como lo vera quien califique"). Es lo unico que se tomo del editor de
  examenes: armar el formulario es marcar casillas, pero lo que importa es lo que llega a los ojos
  de quien evalua.
- **Al crear el ciclo se ensena QUE PREGUNTA el formulario elegido** —competencias, escalas, pesos y
  cargos—. Elegir por el nombre de un desplegable obliga a acordarse de que llevaba dentro, y de eso
  depende la campana del ano. Era la duda del cliente: "no veo de donde sale ese formulario".

**La escala se extrajo a un componente compartido** (`ui/escala.tsx`) con el cuestionario de
encuestas: botones grandes, todas las opciones a la vista, extremos escritos. Con NUMEROS y no caras
al calificar a una persona — las caras son perfectas para satisfaccion, pero convierten un juicio
profesional en un emoticono, y quien lo lea en un ano merece "4 de 5".

**Y un defecto viejo que solo se ve mirando la pantalla:** un boton DESHABILITADO se veia identico a
uno pulsable —mismo relleno de marca, mismo texto blanco— y solo se notaba al pulsarlo y no pasar
nada. Afectaba a todo el producto. Ahora se atenua, salvo mientras carga: un boton con la rueda
girando esta trabajando, no apagado.

### Lo que sigue

Las cuatro preguntas al cliente (seccion 6 de `docs/modulos/desempeno.md`).

---

## 2026-09-02 — Desempeno: el servidor completo, y una costura decidida antes de implementarla

Se paso del diseno al codigo el mismo dia. Lo que hay ahora: **permisos, siete tablas migradas con
RLS, las dos reglas con pruebas, y la API entera funcionando contra la base real.** Faltan las
pantallas.

### La costura hacia el plan, decidida ANTES

La pregunta del cliente fue buena: *"esa idea de que desempeno alimente el plan, ¿cambia algo antes
de implementar?"*. Si, una cosa: si una calificacion baja debe convertirse en necesidad de
formacion, la competencia tiene que poder decir **que formacion la fortalece**. Es una columna
anulable hoy (`suggested_activity_id`); manana seria una migracion mas volver a pedirle al cliente
que rellene el catalogo entero.

**Hoy no la lee nadie, y esta bien.** Apuntar no es exigir: convertir una nota baja en obligacion
automatica seria que el sistema decida a quien se forma el ano que viene, y eso lo decide una
persona.

### Las dos reglas que se probaron sin base de datos

1. **La nota.** Promedio ponderado NORMALIZADO: un formulario puede mezclar "1 a 5" con "cumple / no
   cumple", y promediar los numeros crudos haria que un "cumple" (1) hunda la nota de alguien con
   cincos. Cada respuesta se lleva a su porcentaje de escala y despues se promedia. **Lo que no se
   respondio no cuenta como cero** —un cero es una calificacion pesima, no contestar es no
   contestar— y un formulario de solo texto **no tiene nota**, que no es lo mismo que tener 0.
2. **Quien evalua a quien.** El jefe sale de `areas.responsible_user_id`, que ya existia desde el
   Sprint 5. Y quien no tiene jefe **se reporta, no se le inventa uno**: abrir un ciclo con cuarenta
   evaluaciones asignadas a quien no corresponde se descubre cuando alguien recibe una que no le
   toca; un aviso se ve antes.

### Tres decisiones tomadas al construir

- **La escala de una competencia no se cambia si ya tiene respuestas.** Un 4 sobre 5 y un 4 sobre 10
  son notas distintas: cambiarla reescribiria en silencio lo que significan las respuestas
  guardadas, y los numeros seguirian ahi sin querer decir lo mismo.
- **Un formulario que ya uso un ciclo no se reescribe: se duplica.** El ciclo guarda su copia
  congelada, asi que lo abierto no se rompe; pero editar el original haria que el ciclo del ano
  pasado y el del que viene se llamen igual y no lo sean.
- **Calificar se autoriza por IDENTIDAD, no por permiso.** No existe `performance:evaluate`: se abre
  la evaluacion si esta asignada a ti. Un permiso global de "evaluar" dejaria a cualquiera con el rol
  calificando a cualquiera.

### Verificacion contra la base real

Crear competencias (y el 409 del codigo repetido), formulario con pesos, ciclo, **apertura con 723
evaluaciones generadas**, entrega con la nota ponderada correcta, el 409 al entregar dos veces,
firma, consolidado y cierre. Todo por HTTP, con sesion.

Dos cosas que salieron de ahi:

1. **Las 723 personas salieron "sin evaluador"**, motivo `SIN_RESPONSABLE`: en la base de desarrollo
   ninguna area tiene responsable. El sistema hizo lo correcto —avisar en vez de inventarse un
   jefe— pero es **lo primero que hay que configurar en produccion**: sin responsable de area solo
   hay autoevaluacion.
2. **Los permisos nuevos exigen resembrar.** Los tres `performance:*` no existian en la base y todo
   respondia 403 hasta correr `pnpm db:seed`, que es idempotente. En el despliegue lo hace el
   servicio `migrate`; en un entorno ya montado hay que acordarse.

### Lo que sigue

1. **Las pantallas**: catalogo de competencias y formularios, ciclos con su apertura, la del
   evaluador, la de la persona (leer y firmar) y el consolidado.
2. **Las cuatro preguntas al cliente** (`docs/modulos/desempeno.md` seccion 6). No bloquean el
   codigo —todo es parametrizable— pero si sembrar su contenido real.
3. **Seccion propia en la barra lateral.** No debajo de Formaciones: el cliente pidio que no se
   mezcle, y la navegacion es donde primero se mezclan las cosas.

### Estado

| | |
|---|---|
| Pruebas unitarias | **332** en verde (9 nuevas de desempeno) |
| Lint, typecheck, build | En verde |
| Migracion | `desempeno` aplicada, RLS activo en las siete tablas |

---

## 2026-09-01 (noche, 5) — Desempeno pasa a requisito de produccion, y las aprobaciones ya eran lo que se pedia

### Evaluacion de desempeno: habia una nota de brief y nada mas

Se reviso que existia y la respuesta es: **el Bloque 4 del brief crudo y una linea en dos listas de
pendientes**. Ningun modelo, ninguna pantalla, ninguna decision tomada. El cliente lo aplazo el
2026-08-25 —"puede esperar, lo dijo el"— y hoy dijo que **tiene que estar en produccion**.

Queda escrito el diseno completo en `docs/modulos/desempeno.md`, con lo que hay que decidir antes de
escribir codigo. Lo que importa de ahi:

**La decision que estaba abierta —¿motor propio o compartido?— se responde: PROPIO, reusando el
patron de las encuestas y no el de los examenes.** Un examen lo responde el dueno de la nota; una
evaluacion de desempeno la responde OTRO. Todo el motor de examenes vive sobre `enrollments` y
`attempts` —intentos, bloqueo, nota minima—, y encajar ahi el desempeno obligaria a inventar una
inscripcion falsa por persona evaluada. Esa inscripcion entraria en las metricas de formacion, que
es exactamente lo que el cliente prohibio: *"no deben afectar ni mezclarse con capacitaciones"*. Lo
que si se comparte son los TIPOS DE PREGUNTA (escalas de caras/estrellas/numeros, opcion unica,
texto), que se extraen a una pieza comun en vez de copiarse.

Regla que evita el desastre: **una evaluacion de desempeno nunca escribe en `enrollments`,
`assignments` ni `certification_grants`.** Si algun dia alimenta el plan del ano siguiente —que es la
idea del cliente— sera generando una NECESIDAD de formacion, no tocando el cumplimiento.

Del catalogo de lo que traen SAP, Workday, Cornerstone y compania, entra lo minimo que hace que esto
sea util —ciclo, competencias por tenant, formulario por cargo, autoevaluacion + jefe, firma— y se
deja fuera con nombre y apellido lo que multiplica la complejidad sin que nadie lo haya pedido: 360
grados, calibracion, 9-box y objetivos individuales.

**Lo que bloquea empezar no es tecnico: son cuatro preguntas al cliente.** Que competencias evalua
hoy y con que escala (si tienen el formato en papel, ese formato ES la especificacion), si se
autoevalua o solo califica el jefe, si el resultado se le muestra a la persona y si lo firma, y cada
cuanto se hace. Con eso en mano son unos nueve dias de construccion.

### Aprobaciones: ya era lo que se pide ahora

Se pidio revisar si estaba bien, porque el encargo original era "cualquier modificacion del analista
debe ser aprobada" y ahora se quiere "en borrador que hagan lo que quieran, pero publicar lo aprueba
el admin".

**Lo segundo es lo que ya hace el sistema**, y es lo correcto de los dos. El mecanismo:
`requestOrExecute` mira si quien actua tiene el permiso; si lo tiene, ejecuta; si no, guarda la
solicitud CON EL CAMBIO DENTRO (`payload`) y lo aplica al aprobarse. El rol ANALISTA tiene
`catalog:manage_draft` y no tiene `catalog:publish`, asi que en borrador trabaja libre y al publicar
el boton ya dice **"Enviar a aprobacion"** en vez de "Publicar". Al crearse la solicitud se avisa a
todo el que tenga `approvals:decide`, y al decidirse se avisa a quien la pidio, con la nota.

Por que la idea original era peor: aprobar cada cambio de borrador ahogaria al administrador con
solicitudes para corregir una tilde y dejaria al analista sin poder trabajar. Y aprobar el PUBLICAR
—que es cuando el contenido empieza a obligar a gente— es exactamente donde el control vale algo.

Lo unico que se separa de lo pedido es la palabra: el boton dice "Enviar a aprobacion" y no "Enviar
a revision". Se deja asi por coherencia con el modulo, que se llama Aprobaciones.

### Interfaz

- **"Mi formacion" pasa a "Mi aprendizaje"** en el aprendiz. La RUTA no cambia: renombrarla romperia
  los enlaces de los correos ya enviados y los accesos directos de la PWA instalada, todo por un
  rotulo.
- **La barra de arriba del aprendiz: siempre visible y sin fondo, las dos cosas.** El velo al
  desplazar que se habia puesto no vale —no puede tener fondo en ningun estado—, y sin fondo y fija
  el texto se leeria encima de las tarjetas. La salida no estaba en la barra sino en el armazon: el
  que se desplaza pasa a ser el CONTENIDO, no la ventana, igual que en administracion. Con eso la
  barra no se superpone a nada. Se usa `100dvh` y no `100vh` porque en el movil `vh` cuenta con la
  barra del navegador plegada y la navegacion inferior se iria bajo el filo. Precio conocido: la
  barra del navegador movil ya no se recoge al bajar.
- **La ventana difumina el fondo** en vez de solo oscurecerlo: el ojo deja de poder leer lo de atras
  y la ventana pasa a ser lo unico legible. Es el recurso de las hojas de iOS, y el mismo gesto que
  ya hace el buscador.
- **Editar salio del pie y subio junto a la X**, como icono que despliega su palabra al pasar por
  encima: un pie entero para un solo boton gasta una franja de ventana en algo que no cierra ninguna
  tarea — ahi no se rellena nada, se lee.

### Pendientes anotados a peticion del cliente

- **Revisar la gamificacion**: existe (racha, puntos, congelaciones) y no se ha vuelto a mirar desde
  el Sprint 4. No es urgente; que no se olvide.
- **Revisar la interfaz del perfil del aprendiz.**

### Guia de lectura para el cliente

Se pidio "un documento que explique que son cada dato en Seguimiento, y algo especial para el plan".
Esta en `docs/guia-numeros-neo-pulse.html` y publicada como artefacto para poder enviarla tal cual.

No es documentacion tecnica traducida: esta escrita desde el lado de quien mira la pantalla. Los seis
estados con su accion al lado, por que lo que espera convocatoria cuenta en el denominador, por que
las normas suman mas que el total, la diferencia entre una certificacion que caduca y una obligacion
por hacer — y, para el plan, **tres lecturas cruzadas resueltas**: que significa 100% de programa con
60% de cobertura, 60% con 95%, y 80% con 35% de personas al dia. Esa parte es la que pidio "algo
especial para el plan": el porcentaje lo lee cualquiera, la contradiccion entre dos porcentajes no.

Usa la tipografia y la paleta del propio producto (Manrope + Inter, sistema Pulso) para que se lea
como parte de el y no como un anexo.

La documentacion tecnica de todo lo que faltaba de Seguimiento —las tres pestanas, los cambios del
plan, y los detalles de posicion y color que son decisiones— quedo en `docs/modulos/seguimiento.md`,
secciones 9 y 10.

### Verificacion

323 unitarias en verde, lint/typecheck/build en verde.

---

## 2026-09-01 (noche, 4) — Donde estoy: contraste, la ventana deja de ser plana y la barra del aprendiz vuelve

Tanda de correcciones de interfaz, todas salidas de mirar la pantalla y no encontrar algo.

### La pestana activa no se veia (Decision #132)

Era una pastilla BLANCA sobre un carril gris clarisimo. Sobre fondo blanco, la unica pista de en que
pestana estabas era una sombra de un pixel. Ahora la activa va **pintada con el color de la
empresa** y texto blanco: no hay que buscarla. Se aplico en Seguimiento, en las cinco vistas del
plan y en los chips de horizonte de Vencimientos, que tenian el mismo patron.

El boton fantasma tambien: tenia `hover:bg-paper`, un gris casi invisible sobre una tarjeta blanca,
asi que no parecia pulsable hasta despues de pulsarlo. Ahora se tine con el color de la empresa.

### La barra del aprendiz vuelve a estar (Decision #133)

Se iba con el contenido: al bajar, la persona perdia su avatar, sus avisos y el buscador, y para
recuperarlos tenia que subir del todo. En el telefono —donde vive el 80% de esa superficie— es un
gesto largo y constante.

La razon original de dejarla suelta era buena: **fija y sin fondo, el texto se leia encima de las
tarjetas**. Lo que estaba mal era la disyuntiva. Ahora se queda arriba y **el velo aparece solo
cuando hay algo pasando por debajo** (a partir de 8 px de desplazamiento) y desaparece arriba del
todo, que es donde ensuciaba la portada. Cristal difuminado, no una franja opaca.

Detalle que casi cuesta el arreglo entero: la clase llevaba `relative` y se le anadio `sticky`. Son
la misma propiedad CSS, y dejar las dos deja el resultado a merced del orden de la hoja generada
—una forma silenciosa de que la barra no se quede fija en algunos casos—. Se quito `relative`.

### La barra lateral, otra vez (Decision #130 corregida)

Dos cosas del dia anterior estaban mal:

1. **Configuracion se desplegaba sola al entrar.** La idea era "abrirla cuando se necesita"; el
   efecto real es que el menu crecia seis renglones de golpe sin que nadie lo pidiera y empujaba el
   resto fuera de la vista, justo al llegar. Ahora solo se despliega con su flecha.
2. **Se veia el rail del desplazamiento**, gris y pegado al borde de una tarjeta redondeada: parece
   un desperfecto. Se oculto el adorno (`.sin-rail`) **y ademas se ajusto el aire** —2 px menos por
   renglon, menos separacion entre grupos— para que los nueve items quepan sin desplazar. Esconder
   la barra sin hacer que quepa habria dejado Configuracion siempre bajo el filo y sin nada que
   insinuara que existe.

### La ventana del plan: tenida, y editable desde ahi (Decision #131 ampliada)

Se pregunto si ponerle el borde aurora del buscador. **No**: en este producto ese halo significa una
cosa concreta —ahi hay busqueda inteligente— y prestarselo a una ventana de solo lectura lo vaciaria
de significado. Un lenguaje visual sirve mientras cada senal signifique una sola cosa. Lo que si
tenia razon de ser era la queja de fondo —se veia plana—: ahora la cabecera va **tenida**, que es la
misma division que ya usan las tarjetas.

Y se anadio **Editar** dentro de la ventana, pero **sin duplicar el formulario**: abre el mismo
editor de cabecera que ya existia. Dos formularios sobre los mismos datos siempre acaban
divergiendo, y nadie se entera hasta que alguien guarda desde el equivocado.

De paso, **ese editor paso de cajon lateral a ventana centrada**: aqui no hay tabla detras que
consultar mientras se escribe —se esta dentro del plan— y 480 px estrechan un formulario con dos
areas de texto. La regla de la skill se afina: **campos sobre una tabla que hay que seguir viendo,
cajon; formulario de la propia pantalla, ventana; construir una pieza, pantalla completa.**

### Lo que quedo sin tocar, y por que

**La barra superior del administrador ya no tiene fondo**: el `<header>` es `bg-transparent` sobre
el papel, y lo unico con superficie propia son el buscador y los botones —que es el efecto de
"flotar" buscado—. Si sigue viendose una franja, hace falta senalar en que pantalla: puede ser algo
de una pantalla concreta y no del armazon.

### Verificacion

323 unitarias en verde, lint/typecheck/build en verde, y revisado en el navegador: la pestana activa
en color de empresa, la barra sin rail, Configuracion sin desplegarse sola.

---

## 2026-09-01 (noche, 3) — Medir el plan sin confundirlo con todo, el inicio deja de estar vacio, y la barra se reordena

Sesion de las que valen: casi todo salio de mirar la pantalla y preguntar "¿esto que significa?".

### Tres porcentajes que sonaban igual (Decision #127)

El plan tenia "cumplimiento del programa", "cobertura" y "avance del plan", y la analitica anadio
"avance general". Cuatro numeros, palabras intercambiables, y nadie sabia cual citar en un comite.
**Un indicador que hay que explicar cada vez que se ensena no se usa: se ignora.**

Ahora la pestana "Como va" del plan abre con los tres juntos y **la pregunta delante del numero**:

| Pregunta | Indicador | Formula |
|---|---|---|
| ¿Hicimos lo que dijimos? | Programa | jornadas ejecutadas / programadas |
| ¿Llego la gente que dijimos? | Cobertura | capacitados / proyectados |
| ¿Quien la tiene hecha hoy? | Personas al dia | obligaciones cumplidas / total |

Y debajo, **la conclusion escrita**: un plan al 100% de programa y al 60% de cobertura no es "va
bien con un matiz", es que **las jornadas se hicieron y la gente no fue**, y eso pide convocar
mejor, no programar mas. El porcentaje lo lee cualquiera; la contradiccion entre dos porcentajes,
no.

En la analitica general el rotulo dejo de ser "Avance general" —que no decia de que— y ahora dice
"Obligaciones cumplidas · toda la formacion viva: plan, inducciones, pildoras y extraordinarias".

**Los cortes por dimension tambien viven ya dentro del plan**, acotados a el (regla de oro 2): saber
que area va peor DENTRO del plan ya no obliga a salir a otra pantalla donde ademas contaban las
pildoras.

### "¿A que se refieren los 90 puntos?"

La pregunta del usuario, y tenia toda la razon: la barra decia "Faltan 90 puntos" y en este producto
**los PUNTOS son otra cosa** —los que gana el aprendiz al completar formaciones—. Dos significados
para la misma palabra en la misma pantalla, y el que se lee primero es el equivocado. Ahora dice
**"Meta del 90%"**: el anillo ya ensena donde va, y lo unico que falta al lado es hasta donde hay
que llegar. Se corrigio en los tres sitios donde aparecia.

### Objetivo y alcance: detras de un boton, en ventana (Decision #131)

El objetivo ocupaba una tarjeta fija en una pantalla que se abre todos los dias, y **el alcance no
se veia en ninguna parte** aunque se pudiera escribir: estaba guardado y nunca se ensenaba. Los dos
son texto que se escribe una vez al ano y se lee una vez al trimestre, casi siempre para una
auditoria.

Ahora hay un boton "Objetivo, alcance y meta" que abre una **ventana centrada** (`ui/modal.tsx`,
nueva). No un cajon lateral: el cajon es para EDITAR —aparece al lado y deja ver la tabla de
atras—, y para leer dos parrafos secuestra media pantalla. La regla queda escrita en la skill de
diseno: **campos -> cajon; leer -> ventana; construir -> pantalla.**

### La barra lateral, reordenada (Decision #130)

Seguimiento estaba en el octavo puesto. El orden viejo seguia el ciclo de vida del producto
—primero se crea la formacion, luego se convoca, luego se asigna— que es el orden en que se
CONSTRUYE una vez, no el orden en que se TRABAJA todos los dias.

```
Inicio · Seguimiento · Plan anual        (el dia a dia, sin rotulo)
PROGRAMAR    Formaciones · Convocatorias · Asignaciones
ADMINISTRAR  Usuarios · Aprobaciones · Configuracion (desplegable)
```

**Configuracion se despliega y el plan no**, y la diferencia no es de gusto: debajo de Configuracion
hay SEIS pantallas propias con su URL, y sin desplegar la unica forma de saber que existe "Encuestas"
es entrar y buscarla. Las vistas del plan —Cronograma, Por proceso, Como va— son la MISMA pantalla
mirada de otra forma: sacarlas al menu prometeria cinco destinos donde hay uno y obligaria a
sincronizar el estado de la pantalla con el subrayado del menu, que es de las cosas que se rompen sin
que nadie lo note. **Se despliega lo que son destinos; no lo que son filtros.** Asignaciones, por lo
mismo, se queda sin desplegar: es una sola pantalla.

Al plegar la barra los rotulos de seccion se sustituyen por una linea —en 76px no cabe el texto pero
la separacion si tiene que sobrevivir— y el boton de contraer se tine con el color de la empresa al
pasar por encima.

### Las constancias, desde la ficha de la persona (Decision #128)

El aprendiz ya podia bajar las suyas, pero **la peticion real la hace la empresa**: "mandame el
certificado de alturas de Juan" llega un viernes, y Juan puede estar en carretera o haberse ido. El
endpoint existia desde el Sprint 5 y **ninguna pantalla lo usaba**: la unica forma de bajar una
constancia ajena era encontrar a esa persona dentro del detalle de una formacion concreta, es decir
sabiendo de antemano cual buscar.

Ahora Usuarios tiene un boton por fila que abre el expediente: emitidas, vigencia, estado calculado
—vigente / vencida / revocada—, descarga y revocacion con motivo. Va ahi porque la peticion siempre
llega con un NOMBRE delante, nunca con una formacion.

### El inicio deja de estar vacio (Decision #129)

Eran tres tarjetas con un guion y la leyenda "Disponible en el Sprint de reportes". La pantalla de
entrada del producto no contaba nada, asi que la primera accion de todo el mundo era irse a otra.

Ahora responde cuatro preguntas, en orden de urgencia: **¿hay algo cayendose ahora?** (lo vencido, lo
atrasado, lo que espera aprobacion), **¿como vamos?**, **¿donde esta el problema?** (las peores areas
y regionales) y **¿que se viene?** (30 y 90 dias). Cada cifra enlaza a la pantalla que la explica.

Dos reglas que lo mantienen honesto: **un numero que no lleva a una accion no entra**, y **no hay
endpoint nuevo** — se compone de lo que ya existe, porque un resumen calculado aparte acabaria
diciendo un numero distinto al de la pantalla que lo explica.

Y "esperando convocatoria" **no se enciende en ambar** aunque sean 62.000: no es culpa de nadie,
nadie les abrio la puerta. Un cero en rojo, o un rojo que no es un problema, entrenan a ignorar el
rojo.

### Verificacion

323 unitarias en verde, lint/typecheck/build en verde, y revisado en el navegador: el inicio, la
barra con sus grupos, el submenu de Configuracion desplegando, la ventana de objetivo y alcance, y
el rotulo "Meta del 90%" en la barra.

### Lo que queda de esta tanda

1. **Exportar analitica y vencimientos a Excel** (la ejecucion ya se exporta).
2. **Matriz de competencia** (cargo x formacion): la cuadricula de SST.
3. **Selector de plan en la analitica general**: el servidor ya acepta `?plan=`.
4. **Medir el rendimiento con datos reales**: la analitica tarda 3,4 s contra las 90.000
   obligaciones de la base de desarrollo.

---

## 2026-09-01 (noche, 2) — Analitica por dimensiones y vencimientos: lo que mira quien decide

El encargo fue explicito: *"lo que quisiera ver el admin que toma decisiones, que mide el plan, pero
todo tambien"* — cortes por regional, por norma, por lo que haga falta.

### La decision de fondo: un motor, no cuatro pantallas

"Por area", "por regional", "por norma" y "por cargo" NO son cuatro informes: son el mismo dato
agrupado por otra columna. Construirlos por separado garantiza que dentro de tres meses uno diga
62% y otro 58% sobre lo mismo, porque alguien arreglo el criterio en un sitio y no en los otros.

Asi que hay UN hecho —una obligacion de una persona, con su estado ya resuelto por
`resolverEstadoEjecucion`, que sigue siendo el unico sitio donde vive el criterio— y siete formas de
agruparlo: area, cargo, regional, servicio, proceso, tipo y norma. Cuatro consultas fijas, sea una
dimension o las siete.

**Los siete se ven juntos, sin selector.** Un desplegable obliga a recordar el numero del corte
anterior para compararlo con el siguiente, y nadie lo recuerda. Uno al lado del otro, "Logistica va
mal" y "la regional Caribe va mal" se leen de un golpe — y muchas veces son la MISMA gente vista de
dos formas, que es justo lo que hay que descubrir.

**Se puede acotar al plan** (`?plan=<id>`, regla de oro 2): quien ingreso en agosto no hace la
jornada de marzo y no puede contar como incumplimiento de ese plan. El servidor ya lo acepta; el
selector en pantalla queda pendiente.

### Dos cosas que no se esconden

1. **Por norma, los grupos suman mas que el universo.** Alturas cuenta para SST y para BASC, asi que
   esa obligacion aparece en las dos. No es un error de conteo —la pregunta "¿como vamos con BASC?"
   incluye todo lo que BASC exige— pero callarlo haria que alguien intentara cuadrar los numeros, no
   pudiera, y acabara desconfiando de los dos. La pantalla lo dice donde pasa.
2. **Lo que no tiene valor se agrupa, no se descarta.** "23 personas sin regional" es un hallazgo:
   normalmente significa que faltan datos por cargar. Y si esas filas desaparecieran, el total
   dejaria de cuadrar con el del seguimiento.

### Vencimientos: lo unico que mira hacia adelante

De aqui sale el plan del ano siguiente —hoy esa lista se arma a mano en una hoja de calculo y por eso
siempre llega tarde— y es la segunda pregunta del auditor: la primera es "¿quien lo hizo?", la
segunda "¿sigue vigente?".

**Dos cosas vencen y no se suman:** una CERTIFICACION que caduca (la persona lo hizo bien y aun asi
deja de estar acreditada -> hay que reprogramar) y una OBLIGACION abierta con fecha limite (hay a
quien perseguir). Sumarlas daria un numero grande sin significado y las acciones son opuestas.

Lo ya vencido va aparte y primero: no es "lo que viene", es lo que ya se cayo. Los tramos se
acumulan —lo de 20 dias tambien esta dentro de 90— porque la pregunta real es "cuanto tengo que
resolver este trimestre". Los meses vacios se dibujan igual: el hueco es donde se puede reprogramar
lo que se amontona al lado. Y cada mes filtra la lista de abajo, porque despues de "en marzo hay
cuarenta" siempre viene "¿quienes?".

**El color de las dos series se valido, no se eligio a ojo:** son categorias, no estados, asi que no
reutilizan el ambar de "atrasado" ni el rojo de "reprobado" —prestarlos los vaciaria de significado—.
Los dos tonos pasan los seis chequeos (luminosidad, croma, separacion para daltonismo, contraste)
en claro Y en oscuro.

### La pantalla

`/reportes` pasa a tener tres pestanas, que son tres preguntas y tres momentos distintos:

| Pestana | Contesta | Para quien |
|---|---|---|
| Ejecucion | ¿como va esta formacion y quien la ha hecho? | quien persigue |
| **Analitica** | ¿donde esta el problema? | **quien decide** |
| **Vencimientos** | ¿que se me viene encima? | quien programa el ano |

### Dos regresiones propias, encontradas y cerradas

1. **`output: 'standalone'` rompio el build local.** Lo habia dejado encendido en `next.config.mjs`
   para la imagen de Docker, y en Windows Next no puede crear los enlaces simbolicos que necesita:
   `mirar.ps1` moria con un error que hablaba de React y no tenia nada que ver con React. Ahora se
   enciende con `NEXT_OUTPUT`, solo dentro del contenedor.
2. **Mi propia validacion de R2 tumbo la API en desarrollo.** La regla "o estan las cuatro variables
   o ninguna" sonaba prudente: el `.env` llevaba meses con `R2_BUCKET_NAME` puesto y sin
   credenciales, y el servidor dejo de arrancar. Quien decide si se quiere R2 son las CREDENCIALES,
   no el nombre del bucket. Las dos lecciones estan en el RUNBOOK.

### Verificacion

| | |
|---|---|
| Unitarias | **323** en verde (8 nuevas: agrupador, solapamiento de normas, tramos y calendario) |
| Lint, typecheck, build | En verde |
| Contra la base real | `/reportes/analitica` responde en **3,4 s** con 89.994 obligaciones y devuelve los siete cortes; `/reportes/vencimientos` en **0,7 s** |
| En el navegador | Las tres pestanas revisadas a ojo: cortes, aviso de normas, calendario, filtros y lista nominal |

**Sobre esos 3,4 s:** son de la base de desarrollo, que arrastra 90.000 obligaciones de meses de
e2e. En produccion el orden es 12.000 (600 personas por ~20 formaciones), asi que deberia quedar por
debajo del segundo. **Hay que medirlo con datos reales antes de darlo por bueno**, y si con el
volumen del cliente sigue tardando, el camino es agregar en SQL en vez de traer los hechos.

---

## 2026-09-01 (noche) — El piloto ya se puede desplegar: R2, contenedores y un fallo que solo aparecia con la base vacia

El encargo: entregar formalmente, gratis, sin atarse a un proveedor y sin que mudarse al VPS de pago
sea otro proyecto.

### La forma elegida, y por que

Todo el sistema en un `docker/docker-compose.prod.yml`: Caddy con TLS, web, API, Postgres y Redis en
una sola maquina. Nada atado a un proveedor —ni funciones, ni colas gestionadas, ni almacenamiento
propietario—, asi que el mismo archivo corre igual en una VM gratuita de Google, en Oracle o en el
VPS de pago del mes que viene. **Mudarse es operacion, no desarrollo.**

Lo que descarta los gratuitos tipo Render, Koyeb o Fly no es el rendimiento: **duermen el contenedor
cuando nadie entra**, y aqui el motor de obligaciones y los avisos corren DENTRO del proceso de la
API. Un servicio dormido no ejecuta un cron: las obligaciones no nacerian y nadie se enteraria hasta
que el cliente pregunte por que no le llega nada.

Procedimiento completo en `docs/04-despliegue-piloto.md`.

### R2: la decision no fue "subir archivos", fue quien sirve los bytes

El adaptador estaba sin cablear a proposito (lanzaba un error para que fuera imposible desplegar a
medias). Ya esta, con `@aws-sdk/client-s3`. Lo que importa no es el `put`:

**Con R2, los bytes NO pasan por la API.** El controlador de medios comprueba su propia firma,
resuelve el paquete contra la base y entonces **redirige** a una URL prefirmada del bucket. Servirlos
desde el servidor haria que cada video viajara dos veces —del bucket a la maquina y de la maquina al
telefono— y convertiria el ancho de banda del servidor en el techo de cuanta gente puede ver una
formacion a la vez. Es justo lo que R2 existe para evitar. Los rangos los resuelve R2 nativamente,
que es lo que necesita el reproductor para saltar dentro de un video.

Por eso `stream()` en R2 no esta implementado y falla con un mensaje explicito: es un hueco
deliberado, no uno olvidado.

Ademas, o estan las CUATRO variables de R2 o ninguna: con tres de cuatro el servidor **no arranca** y
dice cual falta, en vez de fallar en la primera subida con alguien esperando delante.

### El dominio resulto ser funcional, no estetico

`resolveTenantSlug` contaba los puntos del host: "tres trozos o mas, el primero es la empresa". Con
`transprensa.neopulse.app` acierta, y **con `neopulse.duckdns.org` o `algo.vercel.app` se inventa una
empresa llamada "neopulse"** y no habria forma de entrar. Como la entrega va sobre un host gratuito
de tercer nivel, esto era un bloqueo real.

Ahora el dominio raiz es CONFIGURACION (`NEXT_PUBLIC_ROOT_HOST`), no adivinanza: si no esta puesto,
del host no se deduce nada y se entra con `?tenant=`. Preferir "no lo se" a "creo que es esta
empresa" es lo correcto en multi-empresa: acertar por accidente la equivocada no se nota hasta que
alguien ve datos que no son suyos.

### El fallo que solo se veia con la base VACIA

Levantando el stack en local aparecio esto, y habria aparecido igual en la VM el dia de la entrega:

```
Applying migration 20260831230000_user_sessions
ERROR: role "neopulse_app" does not exist
```

Dos migraciones hacen `GRANT` sobre el rol de la aplicacion, y ese rol lo creaba `rls.sql`, que corre
DESPUES de migrar. En desarrollo nunca se noto —el rol ya existia desde la primera vez— pero contra
una base nueva la migracion muere.

Y detras venia el segundo: `rls.sql` crea el rol con la contrasena de DESARROLLO. Aunque la migracion
hubiera pasado, la API no habria podido conectarse con la contrasena de produccion.

Los dos se cierran en `scripts/release.sh`: crea el rol ANTES de migrar y le fija la contrasena del
entorno (`APP_DB_PASSWORD`), siempre, tambien si ya existia. `rls.sql` se queda como la fuente de las
policies y su `CREATE ROLE` idempotente ya no pisa nada.

**Es exactamente lo que se buscaba probando el despliegue en local**: encontrarlo aqui cuesta media
hora; encontrarlo el dia de la entrega, con el cliente mirando, cuesta la entrega.

### Verificacion (contra una base creada desde cero)

| | |
|---|---|
| Imagenes | API 393 MB, web 82 MB de contenido. Las dos construyen |
| Migraciones + RLS + semilla | En verde, sobre base vacia. `SEED OK — login: 999999999` |
| Caddy con TLS | `GET /v1/health` 200 y `GET /login` 200 por HTTPS |
| **Login real** | 200 con token RS256: llaves montadas, rol de aplicacion conectando con RLS encima |
| Unitarias / lint / typecheck / build | 315 en verde, todo lo demas en verde |

### Lo que falta, y quien puede hacerlo

**Solo lo puede hacer una persona** (es cuenta y tarjeta): crear la cuenta del proveedor. Una tarjeta
con deuda sirve mientras le quede cupo —la verificacion es una retencion de USD 1—; si esta al tope,
la rechazan. Oracle y GCP suspenden al acabarse el credito; **AWS y Azure pasan a cobrar en silencio**
al terminar los 12 meses.

Con `gcloud` ya autenticado en el equipo, lo demas es automatizable desde aqui: crear la VM
(`e2-micro` en `us-central1`, que es el shape que entra en Always Free), abrir 80/443, swap, Docker,
subir el repo y levantar.

**Plan B sin tarjeta ninguna:** tunel de Cloudflare desde una maquina propia. Mismo compose, URL
HTTPS publica, cero cuentas. El equipo tiene que quedarse encendido: sirve para presentar, no para
que la empresa lo use a diario.

### Pendientes que deja este trabajo

1. **Elegir proveedor y levantar la maquina.** Es lo unico que separa esto de estar en linea.
2. **Probar la restauracion de verdad** (`scripts/restaurar-prueba.sh`) con un volcado de la maquina
   real. Hasta entonces no hay copias de seguridad, hay archivos.
3. **LibreOffice no va en la imagen**: subir un PPT se rechaza pidiendo el PDF. Son 500 MB de imagen
   y otro tanto de RAM al convertir, y no cabe en una VM de 1 GB. Se anade cuando haya maquina.
4. **Verificar R2 contra un bucket real.** El adaptador esta probado por tipos y por arranque, pero
   ninguna subida ha tocado todavia Cloudflare.
5. **Sin dominio propio no hay subdominio por empresa.** Con un cliente da igual; con dos, hace falta.

---

## 2026-09-01 (tarde) — Los cinco pendientes del cliente, el Excel del auditor y la IP real

Sesion corta y de cierre. El encargo fue explicito: **solo lo importante para salir a produccion; lo
que pueda esperar, que espere.** Lo que sigue respeta ese corte, y al final esta lo que se dejo
fuera A PROPOSITO.

(La entrada de abajo quedo fechada 2026-09-02 por un desliz de la sesion anterior: es la misma
jornada, la del commit `77f930b`.)

### Los cinco que dejo el cliente

1. **Eliminar un tipo en uso ya dice por que.** La regla no cambio —lo que otros usan se desactiva,
   no se borra—; lo que cambio es que ahora se sabe QUE estorba. El 409 viaja con el desglose
   ("3 formaciones", "2 personas y 1 proceso") y el panel se queda ABIERTO con el motivo y con el
   boton de desactivar, que es lo que quien administra queria hacer. Antes se cerraba con un aviso
   rojo que decia "esta en uso" y dejaba a la persona donde empezo.

   De paso dejo de ser un problema solo del tipo: los ocho catalogos comparten pantalla y ahora los
   ocho explican. Y `countReferences` paso a `references`, que devuelve el desglose con la palabra
   del negocio —"cargo", "convocatoria", "alcance de analista"— en vez de un numero pelado.

2. **El numero grande de la tarjeta es SIEMPRE el avance**, tambien con un filtro puesto. Antes
   cambiaba de significado —con "Atrasadas" pasaba a ser cuantas atrasadas— y eso obliga a releer la
   tarjeta cada vez para saber que se esta mirando: el mismo sitio, el mismo tamano, dos magnitudes
   distintas. El conteo del estado va al lado, mas pequeno y con su color.

3. **El enlace del plan ya abre la formacion.** `/reportes?formacion=<id>` lee el parametro, abre el
   detalle y lo retira de la URL para que cerrarlo devuelva a la lista. Si esa formacion no tiene
   obligaciones vivas no se abre nada y **se dice por que**: dejar la lista entera sin explicacion se
   lee como un enlace roto.

4. **"Reportes" se llama "Seguimiento"** en la barra lateral y en el buscador. El cliente tenia
   razon: eso es el estado de la ejecucion, no un informe. El grupo de permisos quedo como
   "Seguimiento y reportes", que es lo que `reports:*` cubre de verdad.

5. **Filtro de seguimiento dentro del plan:** sigue siendo pregunta abierta del cliente. No se toco.

### El Excel del auditor (Decision #124)

Era el pendiente 7 del Sprint 5 y **es lo que se lleva el auditor**, asi que entro. Dos
exportaciones, las mismas dos preguntas de la pantalla: una fila por formacion, o una fila por
persona con cedula, area, cargo, estado, vencimiento, version, intentos, nota, encuesta y
constancia.

Lo que parece formato y no lo es: la **cedula va como texto** (con ceros delante los pierde si Excel
la lee como numero, y es el dato con el que se cruza contra nomina); el **avance va como numero**
(0,62 con formato de porcentaje, no el texto "62%") para poder promediarlo; **el filtro se declara
DENTRO del archivo**, porque doce filas sin decir que solo son las atrasadas se leen como el
universo entero; y **el filtro por texto no viaja**, porque buscar es una forma de encontrar algo en
pantalla, no un criterio de informe.

Va bajo `reports:export` —el permiso existia desde el Sprint 1 y no lo usaba ningun endpoint—:
mirar la pantalla y sacar de la plataforma una lista nominal no son el mismo acto.

**El PDF no se hizo, y no por falta de tiempo.** Un PDF de 600 filas no se ordena ni se filtra: es
el peor formato para lo que se hace con esto. Tendra sentido el dia que se pida una hoja **para
firmar** —una pagina, totales por proceso—, que es otro informe y no la misma tabla en otro
envoltorio.

### La IP real detras del proxy (lo primero de la lista de endurecimiento)

`TRUSTED_PROXY_HOPS` dice cuantos proxies propios hay delante (Cloudflare + proxy inverso = 2). Sin
esto, en produccion **toda la empresa es una sola IP**: el aviso de "no puedo entrar" son 3 cada 5
minutos, asi que el tercero del dia dejaba a los demas sin poder pedir ayuda; y la auditoria
guardaba la IP del proxy en vez de la de quien entro.

Se declara un NUMERO y no `trust proxy: true` a proposito: con `true`, Express cree el primer valor
de la cabecera —que lo escribe el cliente— y cualquiera se inventa una IP por peticion para saltarse
el limite. **Ponerlo mal duele en los dos sentidos**, y por eso esta escrito en el `.env.example` y
en el CLAUDE.md.

### La suite recoge lo que ensucia

`e2e/global-teardown.ts` corre la limpieza de reglas al terminar cualquier corrida, en verde o en
rojo. No sustituye a que cada spec retire lo suyo, pero quita del camino el fallo que mas confunde:
una prueba de ALTA DE PERSONAS que expira por unas reglas que nadie relaciona con ella.

---

## Estado al cerrar

| | |
|---|---|
| Pruebas unitarias | **315** en verde (6 nuevas, del Excel) |
| e2e | **19 / 21**. Los dos fallos son de tiempo de espera, no de asercion: ver abajo |
| Lint, typecheck, build | En verde |
| Git | **Nada confirmado.** Todo lo de esta sesion esta sin commit |

**El Excel se verifico ademas contra la base real**, no solo con unitarias: descarga con sesion, 452
formaciones, encabezado con la empresa y la fecha, autofiltro puesto; y el mismo archivo con
`?estado=ATRASADA` recortado a 3 filas y declarando el filtro dentro.

### Los dos fallos del e2e, y por que no son del producto

`alcance-analista` y `sprint-3` fallan esperando el dialogo "Contrasena generada": **crear una
persona tarda 5,6 segundos** y el limite de la prueba son 10, asi que unas veces entra y otras no.

Se midio la causa: la base de desarrollo lleva **177 audiencias, 723 personas y 90.000 obligaciones**
de meses de corridas, y el alta evalua a la persona contra TODAS las audiencias. Con solo **10
reglas activas** —ya limpias— el tiempo sigue ahi, asi que no es la basura de reglas de la que habla
el RUNBOOK: es el volumen de audiencias.

**No se toco, y esa es la recomendacion:** en produccion se arranca con una decena de audiencias, no
con 177. Lo que si hay que hacer antes de darlo por bueno es **medirlo con datos de produccion** el
dia de la carga de las 600 personas (ahi se usa `syncPeople`, que recalcula por lotes y es otro
camino). Si con veinte audiencias sigue tardando segundos, entonces si es del motor y no del
entorno.

---

## PENDIENTE

### Antes de salir a produccion (casi nada de esto es codigo de producto)

1. **No existe `docker-compose.prod.yml` ni imagen de la API.** Es el hueco mas grande: hoy no hay
   con que desplegar. `docs/03-infraestructura-produccion.md` tiene las decisiones (Hetzner,
   Cloudflare R2, Cloudflare delante) y falta escribirlo.
2. **Secretos de verdad.** `REFRESH_TOKEN_PEPPER` sigue en `change-me-in-prod`, y hacen falta las
   llaves RS256, R2, Resend y Sentry del entorno real.
3. **`TRUSTED_PROXY_HOPS` bien puesto** al montar el proxy (equivocarse duele en los dos sentidos).
4. **Copias de seguridad de Postgres y prueba de restauracion.** Sin restauracion probada no hay
   copia: hay una carpeta con archivos.
5. **Datos reales del piloto**: cargos definitivos, matriz cargo -> induccion y el plan 2026 (P4 y P5
   del CLAUDE.md). Sin eso se despliega un sistema vacio.
6. **Contenido y firmantes de la constancia** (P1). La plantilla existe; lo que va escrito en el
   papel lo aprueba el cliente antes de emitir el primero.
7. **La imagen de la API necesita LibreOffice** o las presentaciones PPT/PPTX se rechazan.

### Sprint 5, lo que sigue abierto (por orden de dano)

8. **Asistencia presencial y QR.** El cliente dijo que no es urgente, pero **bloquea que las
   formaciones presenciales emitan constancia**: una jornada de 8 horas acredita y ahi no hay
   reproductor que marque completado, sino asistencia marcada.
9. **Pantalla del jefe** para responder la eficacia, y el programador que crea la cita a los N dias.
   Hoy la eficacia esta apagada en todo por decision del cliente, asi que no bloquea.
10. **Emision manual de constancia** para lo completado antes de activar la plantilla.
11. **Prueba de navegador de la exportacion.** Las unitarias cubren el contenido del archivo y se
    verifico a mano contra la base real, pero nada impide que una regresion en el boton pase sin que
    salte.

### Deuda conocida (no bloquea)

12. **`MultiSelect`: el aspa de quitar un chip vive DENTRO del boton que abre y cierra.** Con una
    sola opcion marcada y etiqueta larga, el clic para cerrar puede borrar la seleccion.
13. **El alta de una persona tarda 5,6 s con 177 audiencias.** Medir con datos reales antes de
    decidir si hay que tocar el motor.
14. **La base de desarrollo esta gorda** (90.000 obligaciones). Un `db:seed` limpio deberia entrar en
    la rutina, o la suite seguira dando sustos que no son del producto.

### Sprint 6, lo que el cliente quiere

15. **Analiticas y reportes agregados**: cobertura por proceso, matriz de competencia, vencimientos,
    cortes por area y regional. El Excel de hoy es la evidencia NOMINAL; eso es otra cosa, son los
    indicadores.
16. **La evaluacion de desempeno anual deberia alimentar el plan del ano siguiente.** Y sin esperar a
    ese modulo, el plan ya podria alimentarse de lo que hoy se sabe: quien reprobo, quien tiene
    eficacia negativa, a quien le vence la certificacion.

---

## Para arrancar la proxima sesion

1. Levantar: `.\scripts\mirar.ps1`
2. **Confirmar en git.** Hay una sesion entera sin commit.
3. Si el e2e falla en el alta de personas, no es el codigo: mirar el punto 13 de arriba.

---

## 2026-09-02 — Sprint 5: constancias, encuestas, seguimiento y la capa de plataforma

Sesión larga y con muchas idas y venidas del cliente. Lo que sigue está ordenado por tema, no por
orden cronológico.

### El patrón que apareció cinco veces

**Configuración sembrada en el Sprint 1 que la interfaz prometía y el motor ignoraba.** Ya había
pasado con `requiresAssessment`; en esta sesión aparecieron cuatro más:

| Campo | Dónde estaba | Qué pasaba |
|---|---|---|
| `issuesCertificate` | `activity_types.config` | Nadie lo leía. Ninguna formación emitía constancia |
| `requiresSurvey` | `activity_types.config` | Se leía y **bloqueaba publicar**, sin forma de crear una encuesta |
| `requiresEfficacy` | `activity_types.config` | Sembrado, sin leer y sin interruptor |
| `assessments.reviewPolicy` | Tabla, desde Sprint 2 | Bien diseñado y **sin pantalla**: valores por defecto para siempre |

**Regla para la próxima sesión:** antes de dar por buena una casilla de configuración, comprobar que
alguien la lee *y* que alguien la puede cambiar. Sembrar sin leer es deuda silenciosa.

---

### Certificación (#110 – #113)

- Cascada **tipo → actividad → snapshot en la versión**. Una píldora no acredita; una inducción sí.
  El seed ya traía los valores correctos.
- **Vigencia desde la recurrencia**, no de un campo aparte: si hay que repetirla cada 12 meses, el
  papel vale 12 meses. Pedirlo por separado garantizaría que algún día no coincidan.
- **Contradicción del plan resuelta:** el esquema decía `html_template` (el cliente diseñaría en
  HTML). Se cambió a **arte de fondo + campos encima**, dibujado con `pdf-lib`. Sin Chromium
  (300 MB en 1 vCPU) y sin ejecutar HTML ajeno en el servidor.
- **Migración retroactiva:** las 1.630 versiones ya publicadas quedaron en `false` porque la columna
  nació después. No era una decisión congelada sino un hueco, así que se rellenó con la cascada. Sin
  eso, toda la formación existente se quedaba sin constancia en silencio.
- Verificación pública sin sesión, código de 20 caracteres no enumerable, revocación con motivo.

Ver `docs/modulos/certificacion.md`.

### Encuestas (#114 – #121)

- **Una encuesta de satisfacción por empresa**, elegida en el tipo, **enganchada sola** al crear la
  formación y otra vez al publicar como red.
- **No es obligatoria**: si lo fuera, quien no opina se queda sin terminar y **sin constancia**.
- Tipos de pregunta con escalas en **caras / estrellas / números** (mismo dato guardado).
- **El binario manda sobre el promedio** al calificar; el corte está en 3 sobre 5, no en 2,5.
- **La eficacia la responde el jefe del área**, no el dueño del proceso. Obligó a añadir
  `areas.responsible_user_id` (10 filas frente a 600).
- **La eficacia se decide por FORMACIÓN**, no por tipo: dentro de «Capacitación del plan» conviven
  alturas (sí) y una actualización documental (no).
- **Hoy está apagada en todo** por decisión del cliente. El interruptor existe para que la función
  quede cerrada.

Ver `docs/modulos/encuestas.md`.

### Seguimiento (#117, #122, #123)

- `/reportes` dejó de ser un «llega en Sprint 6».
- **Seis estados**, y el orden en que se preguntan es la decisión. `ESPERANDO` gana al vencimiento:
  no se reclama un retraso a quien nunca pudo empezar.
- **Barra apilada en vez de un porcentaje**: 62% con el resto atrasado y 62% con el resto esperando
  convocatoria piden acciones opuestas.
- Pestaña **«Cómo va»** en el plan, con enlace al detalle de cada formación.
- **Optimización:** la vista del plan llamaba al cálculo por formación dentro de un bucle (150
  consultas para 30 renglones). Ahora hay un camino por lote de **3 consultas fijas**. La regla de
  estados sigue en un solo sitio.

Ver `docs/modulos/seguimiento.md`.

### Capa de plataforma (#100)

Cuenta del proveedor **fuera de los tenants**, con su propio ingreso en `/plataforma`. Los dos tokens
no se cruzan y eso está probado en las dos direcciones.

Ver `docs/modulos/plataforma.md`.

### Login y contacto (#97)

«No puedo entrar» ahora trae el contacto de la empresa (parametrizable) y un botón que deja
constancia en la bandeja de quien puede restablecer. Responde lo mismo exista la cuenta o no.

### UI del aprendiz y del panel (#98, #101 – #109)

Barra superior sin fondo en las dos superficies, logo del tenant en las barras laterales, avatar con
foto subible, `/hoy` como biblioteca con filtros por tipo, sin rojo para lo vencido, y el fallo de
fondo: **«Venció hace 3 días» junto a «todavía no está abierta»** — un retraso reclamado a quien
nunca pudo empezar. Resuelto en el servidor para que ningún cliente pueda volver a contradecirse.

---

## Estado al cerrar

| | |
|---|---|
| Pruebas unitarias | **309** en verde |
| e2e | **21 / 21** |
| Lint, typecheck, build | En verde |
| Git | **Nada confirmado.** Todo el trabajo está sin commit |

Entorno de pruebas: `.\scripts\mirar.ps1` → http://localhost:3200/login?tenant=transprensa

---

## PENDIENTE, por orden de urgencia

### Lo que el cliente pidió al final de la sesión y quedó sin hacer

1. **No se puede eliminar el tipo «Prueba de encuesta W6PWX»** y da error sin explicar por qué. La
   causa es correcta —tiene formaciones que lo referencian, y `countReferences` lo impide— pero el
   mensaje no lo dice. **Arreglar el mensaje**, no la regla: debe decir cuántas formaciones lo usan
   y ofrecer desactivarlo. (El tipo lo creó `demo:encuesta`; se puede borrar a mano en la base junto
   con su formación de prueba.)

2. **Decidir qué número va en la tarjeta de Seguimiento con un filtro puesto.** Hoy, al filtrar por
   «Atrasadas», el número grande pasa a ser *cuántas atrasadas* en vez del avance. Está sin resolver
   si es mejor eso o mantener siempre el avance. **Mi recomendación:** mantener siempre el % como
   ancla estable y poner el conteo filtrado al lado, más pequeño — cambiar el significado del número
   grande según el filtro obliga a releer la tarjeta cada vez.

3. **El enlace del plan no filtra al llegar.** Lleva a `/reportes?formacion=<id>` y la pantalla
   ignora el parámetro: hay que buscar la formación a mano. Falta leerlo y abrir el detalle directo.

4. **«Reportes» debería llamarse «Seguimiento»** en la barra lateral. El cliente tiene razón: lo que
   hay ahí no son reportes —son el estado de la ejecución—, y los reportes de verdad (exportables,
   agregados) llegan en Sprint 6. Cambiar el rótulo del ítem de navegación.

5. **Valorar un filtro de seguimiento dentro del plan**, en vez de saltar a otra pantalla. Queda
   como pregunta abierta del cliente.

### Sprint 5, lo que falta para cerrarlo del todo

6. **Asistencia presencial y QR.** El cliente dijo que no es urgente, pero **bloquea que las
   formaciones presenciales emitan constancia**: una jornada de 8 horas acredita, y ahí no hay
   reproductor que marque completado sino asistencia marcada.
7. **Exportar a Excel / PDF** el seguimiento. Es lo que se lleva el auditor.
8. **Pantalla del jefe** para responder la eficacia, y el programador que crea la cita a los N días.
9. **Emisión manual de constancia** para lo completado antes de activar la plantilla. El permiso
   `certificates:issue` existe y no lo usa ningún endpoint de alta manual.

### Deuda conocida

10. **`MultiSelect`: el aspa de quitar un chip vive DENTRO del botón que abre y cierra.** Con una
    sola opción marcada y etiqueta larga, el clic para cerrar puede borrar la selección. Documentado
    en el componente; arreglarlo exige rehacer su estructura.
11. **La suite e2e deja basura**: cada corrida crea una audiencia «Toda la empresa <n>» con su regla,
    y al acumularse 80+ el alta de personas se pasa de tiempo. Paliativo:
    `pnpm --filter @neo-pulse/api dev:limpiar-reglas`. **La solución real es limpiar en el teardown
    de la suite.**
12. **`X-Forwarded-For`** sigue sin leerse. Es lo primero de la lista de endurecimiento desde que
    existe «No puedo entrar» (3 avisos cada 5 min por IP: detrás de un proxy, el tercero del día
    dejaría a toda la empresa sin poder pedir ayuda).

### Idea del cliente que vale la pena

13. **El módulo de evaluación de desempeño anual** (Sprint 6, aparte de las encuestas: distinto
    ciclo, distinta confidencialidad, se firma) **debería alimentar las necesidades de formación del
    plan del año siguiente**. Y sin esperar a ese módulo, el plan ya podría alimentarse de lo que hoy
    se sabe: quién reprobó, quién tiene eficacia negativa, a quién le vence la certificación.

---

## Para arrancar la próxima sesión

1. Levantar: `.\scripts\mirar.ps1`
2. Si el e2e falla en el alta de personas: `pnpm --filter @neo-pulse/api dev:limpiar-reglas`
3. Leer `docs/README.md` → los cuatro módulos nuevos están ahí.
4. **Confirmar en git antes de seguir.** Hay una sesión entera sin commit.

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
