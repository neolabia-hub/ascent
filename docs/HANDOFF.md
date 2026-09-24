# ASCENT — HANDOFF (diario de sesiones)

Lo que se hizo cada dia, que quedo abierto y por que. **Se ANEXA por arriba**: la sesion mas
reciente primero, para que abrir el archivo responda de una la pregunta que uno se hace al
sentarse — "¿en que iba esto?".

Que va en cada documento, para no duplicar:

| Documento | Responde |
|---|---|
| **Este** | En que iba, que quedo a medias y con que continuar |
| `docs/PENDIENTES.md` | **Que falta HOY, todo junto.** Se corrige: lo hecho se borra de ahi |
| `docs/RUNBOOK.md` | Como se opera y que se aprendio rompiendo algo. Solo se anade |
| `docs/arquitectura.md` | Como funciona el sistema HOY. Se corrige |
| `docs/glosario.md` | Que significa cada palabra del negocio |
| `docs/sprints/` | Historia por sprint. Envejece a proposito |
| `CLAUDE.md` | El modelo completo y las decisiones irreversibles |

Regla: si algo de aqui deja de ser cierto, no se corrige — se escribe la sesion siguiente. Esto es
un diario, no una referencia.

**Para retomar sin leerse el diario entero: `docs/PENDIENTES.md`.** Nacio el 2026-09-06 porque lo
abierto estaba repartido en siete documentos y saber que faltaba obligaba a leerlos todos.

---

## 2026-09-24 (tarde) — CAMPAÑA DE LA CÉDULA ABIERTA EN PRODUCCIÓN, sin desplegar

Con el archivo del cliente ya subido. **No se desplego**: por peticion expresa, solo se corrio el
script, y como la imagen de produccion es la de `42c3222` y no lo trae, se copio a mano:

| Paso | Resultado |
|---|---|
| Copia antes de tocar nada | `neopulse-20260924-174945.dump`, 981 KB, subida a R2 |
| `scp` a `/tmp` + `docker cp` al contenedor `api` | `/app/apps/api/scripts/clave-igual-a-documento.ts` |
| Ensayo | 1001 activas · 3 ADMIN fuera · 998 a cambiar |
| `--si` | 998 hechas |
| Comprobacion (`--cierre` en ensayo + consulta) | 998 con la cedula como clave; USUARIO 985 y ANALISTA 13 con cambio obligatorio; ADMIN intactos (uno ya tenia el cambio pendiente de antes) |

El archivo copiado **vive solo en ese contenedor**: un `up -d` que lo recree lo borra. Para el
cierre, si todavia no se ha desplegado, se repite el `scp` + `docker cp`. Tras desplegar ya viene en
la imagen. Ningun despliegue lo ejecuta: `release.sh` solo aplica migraciones y RLS.

**Confirmado por el cliente:** las 1001 activas son la plantilla completa (se hablaba de ~1.200 de
memoria). Y **no habra cierre**: no es una campaña con plazo, cada persona es responsable de cambiar
su clave, que el sistema le exige al entrar.

Tambien quedo hecho y **sin desplegar**: filtros en todos los catalogos de Configuracion (buscador,
estado, tipo de cargo, area, responsable, y en Áreas la rama y el nivel), `5eb7ca8`.

---

## 2026-09-24 — «TUS DATOS» EN EL PERFIL, y la campaña de primer ingreso con la cédula

El cliente va a cargar ~1.200 personas y pidio dos cosas: que cada quien pueda agregar o cambiar su
correo (muchos no tienen), y que **solo esta vez** la clave de todos sea su cedula, con cambio
obligatorio al entrar. Los administradores no se tocan.

**1. El perfil del aprendiz ensena la ficha entera y deja editar el CONTACTO.** Tarjeta «Tus datos»
(`perfil/page.tsx`): correo y telefono editables; documento, cargo, area con su rama, regional,
servicio, vinculacion y fechas **de solo lectura**, con la nota de pedir la correccion a quien
administra. Es la linea de los LMS corporativos: el contacto es de la persona; lo laboral es de la
empresa porque de ahi cuelgan las obligaciones. API: `GET /auth/me/datos` y `PATCH /auth/me/contacto`,
sin id en la ruta (como la foto, Decision #105); esquema `myContactSchema` —las claves que no conoce
las descarta, asi que por ahi no se cuela ni el cargo ni el rol—; correo unico en el tenant (409
`DUPLICATE_EMAIL`); auditoria `PROFILE_CONTACT_UPDATED` con antes y despues. Bajo el nombre ya no va
el correo sino el cargo. **Sin correo de confirmacion**: no hay recuperacion de clave por correo (se
pide ayuda desde el login), asi que un correo mal escrito no abre ninguna puerta; si algun dia se
agrega recuperacion por correo, esto tiene que pasar a verificar con codigo.

> Ojo con la RECARGA del archivo: si una persona pone su correo y el archivo mensual trae OTRO en
> esa celda, gana el del archivo (vacio no toca nada). La vista previa de la carga lo enseña campo
> por campo.

**2. `scripts/clave-igual-a-documento.ts`** (`dev:clave-igual-a-documento`). Ensayo por defecto,
`--si` para escribir, `--tenant` obligatorio. **Abrir**: a toda persona activa menos rol ADMIN,
clave = documento, cambio obligatorio, sesiones cerradas (si no, quien estuviera dentro veria «clave
actual» y no sabria cual). **Cerrar** (`--cierre`): a quien siga con la cedula como clave —se
comprueba con `argon2.verify`, sin columna nueva— le pone una aleatoria; entra pidiendo ayuda. El
generador de claves NO se toco: quien se cree despues recibe la de siempre. `--solo <doc>` es para
probarlo en desarrollo.

**3. De paso, un fallo del restablecer clave del admin:** decia cerrar las sesiones vivas y ponia a
nulo `refreshTokenHash`, columna muerta desde la Decision #91. Ahora borra las `user_sessions`.

**Pruebas:** recorrido `perfil-propio.mjs` (24), e2e nuevo `perfil-tus-datos.spec.ts`, el script
probado de punta a punta con `--solo` (entra con cedula, se le exige cambio, el cierre respeta a
quien cambio y deja fuera a quien no, el admin sale en 0). 1008 unitarias, **28/28 e2e**, lint limpio.

> **Trampa que costo una corrida:** una API arrancada a mano sin `PORT` escucha en **3002**, que es
> el puerto de la suite, y Playwright la REUTILIZA (`reuseExistingServer`). La suite corrio contra una
> compilacion vieja y fallo por una tilde. Antes de `pnpm test:e2e`, que 3002 y 3100 esten libres.

**Orden acordado con el cliente:** subir el archivo completo primero, y SOLO despues abrir la
campaña (a todos menos ADMIN, incluidos quienes ya habian cambiado su clave). Anunciar un plazo y,
al vencer, correr el cierre.

---

## 2026-09-23 — DESPLEGADO A PRODUCCION: aprobaciones, permisos de Programas y los arreglos de la carga

Commit `42c3222`. Los cinco pasos de `05-reglas-de-despliegue.md` §3, mas el paso extra de permisos:

| Paso | Resultado |
|---|---|
| 1. Copia ANTES de tocar nada | `neopulse-20260923-011332.dump`, 409 KB, subida a R2. **No vacia** |
| 2. `git pull` | Arrastra tambien lo de la sesion anterior (revision, alcance por tipo) |
| 3. Reconstruir imagenes | `neo-pulse-api:local` y `neo-pulse-web:local` |
| 4. `up -d` + `restart caddy` | `migrate` Exited(0) tras aplicar **dos** migraciones y reaplicar RLS |
| **4 bis. `dev:sincronizar-permisos -- --si`** | 3 concesiones creadas, **todas al ADMIN y ninguna al ANALISTA** |
| 5. Comprobar que RESPONDE | `/v1/health` ok · login 200 · `/plan` 200 · tenant publico 200 |

Verificado ademas en la base de produccion: las cuatro columnas `review_*` existen, la tabla
`role_activity_type_scopes` existe, y los tres permisos de programas quedaron con **su descripcion
en español** y no con el `Permiso programs:read` de antes — que era justo el arreglo del dia. Cero
errores en la API desde el arranque.

El paso 4 bis es el que no estaba en la lista de siempre y hay que recordar: sin el, la pantalla de
Programas le da 403 **al administrador incluido**, y nada en el arranque lo delata. Queda escrito en
`05-reglas-de-despliegue.md` §2.

**Lo que el cliente todavia no ha visto** (regla §3 bis): el menu recortado del analista, el boton
del plan proponiendo el año correcto, el aviso de publicacion con la encuesta, y los mensajes nuevos
de la carga masiva. Se subio igual porque tres de esos cuatro son **arreglos de cosas que el mismo
reporto hoy** y le estaban bloqueando la carga de su gente.

---

## 2026-09-22 (tarde) — CUATRO COSAS QUE EL CLIENTE VIO EN PRODUCCION, y todas eran nuestras

Subio su plantilla de 1089 personas y se llevo tres portazos seguidos. Ninguno era culpa del
archivo, y eso es lo que tienen en comun: **el sistema le echaba la culpa al dato**.

**1. `d{4}` en vez de `\d{4}`.** La expresion que valida `fecha_nacimiento` pedia la letra «d»
cuatro veces, no cuatro digitos. **Ninguna fecha de nacimiento habria pasado jamas**, ni la mejor
escrita, y el mensaje decia *"no tiene un formato valido"* — mandando a corregir justo donde no
estaba el problema. `fecha_ingreso`, dos lineas mas abajo, estaba bien: por eso fallaba una sola de
las dos columnas de fecha y parecia cosa del dato.

**2. La celda de fecha de Excel llegaba como texto de JavaScript.** *«"fecha_nacimiento" no tiene un
formato valido: "Tue Jan 06 1998 00:00:00 GMT+0000 (Coordinated Universal Time)"»* — un texto que
nadie escribio: lo fabricaba `String(cell.text)` sobre una celda con formato de fecha. No se puede
corregir mirando la celda, porque en Excel la celda se ve perfecta. Ahora `textoDeCelda` trata la
fecha antes que nada, y `normalizarFecha` acepta ademas `D/M/AAAA` — con la regla de que **un numero
mayor que 12 solo puede ser el dia**, y si los dos caben en un mes se lee dia/mes, que es la
convencion de aqui. Lo que no encaja se devuelve tal cual y la fila falla diciendolo: una fecha mal
leida en silencio es peor que una fila rechazada.

**3. «"Cargo" es demasiado largo».** El archivo medía 40 caracteres y el catalogo de la pantalla,
120. Un cargo que se puede crear perfectamente desde Configuracion **no se podia nombrar en el
archivo** — y el caso real era «JEFE DE SEGURIDAD Y SALUD EN EL TRABAJO», que es como se llaman los
cargos en una empresa con SG-SST. Subidas a 120 las cinco columnas de catalogo.

**4. «Bad Request Exception».** Los errores que tumban el archivo entero no llevaban frase, asi que
el filtro caia en el nombre de la clase de la excepcion. Ahora `EMPTY_FILE`, `TOO_MANY_ROWS`,
`UNSUPPORTED_FILE`, `MISSING_HEADERS` y `FILE_REQUIRED` traen su explicacion en español diciendo que
hacer —el `.xls` explica el "Guardar como", y la columna que falta se nombra—, y la pantalla ya no
imprime un codigo cuando no reconoce uno.

> **Y de paso, `correo` dejo de ser obligatoria como COLUMNA.** Era opcional como dato desde el
> 2026-09-21 pero seguia siendo imprescindible en la primera fila, asi que quitarla tumbaba la carga
> entera con un 400. Borrarla no borra nada: sin la columna, `correo` llega vacio, y vacio en una
> recarga significa «esto no lo dice el archivo, no lo toques».

**Dos mas, de otras pantallas, del mismo dia:**

- **El boton del plan decia «Crear el plan de 2024».** Los años que se pueden abrir son dos atras y
  uno adelante, y el boton cogia *el primero de la lista*; con el plan de 2026 ya creado, el primero
  libre era 2024. Ofrecer el pasado de primeras es proponer rellenar hacia atras. Ahora propone el
  año en curso si esta libre, si no el siguiente hacia adelante, y solo al final el pasado mas
  reciente (`anoPropuesto`). Los demas siguen en el desplegable.
- **«No se pudo publicar (TYPE_REQUIREMENTS_MISSING)».** La API mandaba la explicacion entera —«este
  tipo pide encuesta y no tiene ninguna elegida; elige cual en Configuracion > Tipos de formacion»—
  y la pantalla la tiraba para imprimir el nombre interno del error. Ademas el panel de arriba decia
  *«Se puede publicar, pero...»* cuando el servidor **rechaza**: arrastraba la Decision #74, de
  cuando el tenant no podia editar la configuracion del tipo. Y su frase de la encuesta se habia
  quedado vieja dos veces: decia «agregala antes de publicar» —ya no se hace ahi (Decision #116)— y
  **no miraba `surveyTemplateId`**, asi que salia tambien cuando el tipo si tenia una elegida y no
  habia nada que arreglar. Ahora las dos listas son una sola, bloquean, y dicen donde se arregla.

**Pruebas:** recorrido nuevo `carga-de-excel-real.mjs` (26 comprobaciones) que sube .xlsx **de
verdad**, con celdas de fecha de verdad y armados con la misma libreria que usa el servidor — el CSV
no reproducia ninguno de los tres fallos, porque el fallo estaba en como se lee una celda de Excel.
Mas 7 unitarias de fechas y topes, 2 de la encuesta del tipo, y la de «ninguna columna sin rotulo»
reescrita para recorrer `IMPORT_HEADERS` en vez de una lista a mano: esa lista tenia cinco columnas
y por eso no cazo que a `fecha_nacimiento` y `vinculacion` les faltara el suyo — el cliente leyo el
nombre crudo de la columna, con guion bajo. Total: 1008 unitarias, 27/27 e2e, lint limpio.

---

## 2026-09-22 (continuacion) — APROBACIONES Y LIMITES DEL ANALISTA: que puede crear, que puede ver, y un menu que dejo de mentir

Todo esto sale de una sola frase del cliente: *"el rol analista solo debe ver pocas cosas, en
formacion solo poder crear tipo plan, ellos no pueden crear otros tipos de formaciones; programa no
pueden, solo seguimiento, inicio, convocatorias... la idea es que todo esto sea por permisos en rol e
individual por usuarios"*. Lo importante de esa frase es el final: **no se cablea nada, se
configura** — y se configura en dos niveles, rol y persona, con la persona mandando.

**1. Estado de revision de la formacion.** `SIN_ENVIAR -> EN_REVISION -> APROBADA | DEVUELTA`
(`revision.service.ts`, migracion `20260922150000_revision_de_formacion`). Enviar avisa a quien
tenga `catalog:publish`; devolver exige motivo y avisa a quien la mando. Una version EN_REVISION **no
se edita**, y editar una APROBADA la devuelve a SIN_ENVIAR — si no, se aprueba una cosa y se publica
otra. Recorrido: `revision-de-formacion.mjs` (24 comprobaciones).

**2. Alcance por TIPO de formacion**, la tercera dimension junto a procesos y areas
(`20260922170000_alcance_por_tipo`). Se configura desde la matriz de Permisos —unas filas mas, con
borde punteado cuando el rol esta sin acotar— y por persona, con la misma precedencia de siempre: lo
individual gana. **Sin filas = sin acotar**, que es lo unico que permite desplegar sin dejar a la
empresa entera sin poder crear una formacion. Recorrido: `alcance-por-tipo.mjs` (16).

> **El fallo silencioso que se comio esta parte y hay que recordar.** Al meter `activity_type_id` en
> `analyst_scopes`, `getAnalystScope` empezo a ver filas donde antes no habia ninguna y devolvia una
> lista de procesos VACIA: la persona veia cero formaciones **sin ningun error**. Lo cazo el paso 5
> del recorrido. La consulta ahora filtra por dimension (`OR: [{processId: {not: null}}, {areaId:
> {not: null}}]`). Moraleja: una tabla de alcance con tres dimensiones no se consulta entera.

**3. Programas, con permisos PROPIOS** (`programs:read` / `programs:manage` / `programs:publish`).
Usaba los del catalogo, asi que **quien podia crear una formacion veia y tocaba los programas**, y no
habia forma de quitarselo sin quitarle el catalogo — que es justo lo que el analista necesita. Son
tres y no uno por el mismo motivo que en el catalogo: publicar un programa **apaga la constancia
individual de todos sus modulos**, y eso no es «guardar». Recorrido:
`programas-con-permiso-propio.mjs` (16), que ademas comprueba que conceder `programs:read` por
permiso individual abre la consulta **y nada mas**.

**4. El menu dejo de ofrecer pantallas prohibidas.** Se pintaba entero para cualquiera que entrara al
panel: el analista veia Programas, Usuarios, Desempeño, Aprobaciones y Configuracion, pulsaba, y se
encontraba un 403 o una pantalla en blanco. Cada entrada de `sidebar.tsx` lleva ahora su `permiso`
—lista, basta uno— y un grupo sin entradas no pinta ni su rotulo. Lo sujeta
`e2e/alcance-analista.spec.ts`, que comprueba **las dos mitades**: lo que el analista ve y lo que no
(solo con las ausencias, un menu roto que no pintara nada pasaria la prueba).

**5. De paso, una incoherencia de la pantalla de Permisos.** El script `dev:sincronizar-permisos`
creaba las filas con `description: 'Permiso programs:read'`, asi que los permisos llegados por
semilla se leian en español y los llegados por el script como una fila de tabla, en la misma columna.
Los textos viven ahora en `apps/api/prisma/permission-descriptions.ts` y los leen los dos. Faltaban
ademas los tres de `performance:*`, que salian como *"Permite manage en el modulo performance"*.

**Estado:** `pnpm lint` limpio, 999 pruebas unitarias en verde, 27/27 e2e, y los cuatro recorridos
nuevos pasando. **NO desplegado**: todo esto es posterior al commit `2d36e23`.

> **Al desplegar hay que correr `pnpm --filter @neo-pulse/api dev:sincronizar-permisos -- --si` en el
> servidor.** Sin eso los tres permisos de programas no existen en la base y la pantalla de Programas
> le da 403 **al administrador incluido**, sin ningun error de arranque que lo delate. `db:seed` NO
> —reemplaza el juego completo de permisos de cada rol y ya borro una vez la parametrizacion de un
> cliente—. En desarrollo ya se corrio: concedio los tres al ADMIN y ninguno al ANALISTA, que es
> exactamente lo que pidio el cliente.

---

## 2026-09-22 — DESPLEGADO A PRODUCCION: todo lo de la sesion del 21

Commit `2d36e23`. Los cinco pasos de `05-reglas-de-despliegue.md` §3, en orden:

| Paso | Resultado |
|---|---|
| 1. Copia ANTES de tocar nada | `neopulse-20260922-142045.dump`, 388 KB, subida a R2. **No vacia** |
| 2. `git pull` | 51 archivos, las dos migraciones incluidas |
| 3. Reconstruir imagenes | `neo-pulse-web:local` y `neo-pulse-api:local` |
| 4. `up -d` + **`restart caddy`** | `migrate` Exited(0) tras aplicar las migraciones y reaplicar RLS |
| 5. Comprobar que RESPONDE | `/v1/health` ok · login de transprensa 200 · tenant publico 200 |

Verificado ademas en la base de produccion: `completion_requirement` y `takes_attendance`
existen, `closes_by_attendance` **ya no**, y `users.email` admite nulo. Cero errores en la API
en los tres minutos siguientes.

**Se desplego en horario laboral (9:00) a peticion expresa**, en contra de la costumbre del
RUNBOOK. El hueco de 503 se queda en ~3 s por el `restart caddy` del paso 4 — que es
exactamente para lo que se añadio. Sin incidencias.

**Lo que queda del lado del cliente:** no ha visto ninguno de los cambios de pantalla (regla
§3 bis). Se subio igual, con el compromiso de enseñarselos despues. Los visibles son: las dos
preguntas de la convocatoria, el aviso ambar del aprendiz cuando le falta la asistencia, la
vista previa de la carga masiva y los selectores de area con la rama.

---

## 2026-09-21 (continuacion) — LAS SUB-AREAS, VISTAS DESDE LA PANTALLA: el motor estaba bien y la interfaz no lo contaba

Sesion corta y de repaso, disparada por las preguntas del cliente sobre lo que se habia desplegado
por la mañana. **Ninguna destapo un fallo del motor** —el arbol de areas se comporta como debe— pero
tres destaparon que **la pantalla no dice lo que el motor hace**, que para quien configura es lo
mismo que si no lo hiciera.

Las preguntas, tal cual, porque son el mejor resumen de lo que faltaba:

- *«¿de donde toma las areas el campo Area donde trabaja? si se creo Nomina, ¿no deberia salir?»*
- *«si en Quienes seleccionan Nomina, ¿solo le asigna a los de Nomina y no a los de Gestion Humana?»*
- *«¿en Responsable del area a quien hay que seleccionar si es una sub-area?»*

### Lo que se comprobo y estaba BIEN (queda escrito para no volver a comprobarlo)

- El campo **«Area donde trabaja»** de Usuarios lista areas y sub-areas **juntas**, con la rama
  (`nombreConRama`). No hay ni hace falta un segundo campo: se elige `Gestion Humana › Nomina`
  directamente. Elegir la madre a secas tambien es valido —quien trabaja en el area grande—.
- **Marcar Nomina alcanza solo a Nomina; marcar Gestion Humana alcanza a todos, hijas incluidas.**
  Verificado en las dos derivaciones de la faceta y en `manual-reach.spec.ts`: la asignacion manual
  se comporta igual que una regla.
- El **archivo de personas** hace lo mismo en dos columnas (`area` + `sub_area`).

### Lo que se arreglo

1. **La rama y la consecuencia, en los cuatro selectores de audiencia.** Pintaban el nombre pelado,
   asi que «Gestion Humana», «Nomina» y «Seleccion» parecian tres areas hermanas, y **en ningun sitio
   decia que marcar la madre arrastra a las hijas**. Ahora llevan `nombreConRama()` y una ayuda:
   *«Marcar un area incluye tambien a sus sub-areas. Para acotar, marca la sub-area.»* Son cuatro:
   Quienes, la tajada de la convocatoria (y su resumen de una linea), «Asignar a una audiencia» de un
   programa, y las dos de Asignaciones. En `offering-form.tsx` el `arbol` que se le pasa a
   `opcionesDe()` es el catalogo **completo** a proposito: la lista viene filtrada a lo que hay entre
   los obligados, y si la madre no tuviera gente propia la rama de su hija se quedaria sin nombre.
2. **Una sub-area sin responsable se marca en ambar**, con la consecuencia en el titulo: su gente
   sale sin evaluador. **El responsable no se hereda del padre** —correcto, pero es lo contrario de
   lo que sugiere colgar una cosa de otra—. En un area de primer nivel el mismo hueco sigue siendo la
   tarea neutra de siempre («Asignar»): ahi nadie supone que lo cubra otro.
3. La tilde de **«Area donde trabaja»**, y su ayuda: *«Si tiene sub-area, se elige la sub-area: de
   ahi sale quien lo evalua.»* Que es la frase que faltaba: ese campo decide **quien evalua**, no
   solo donde aparece la persona en un informe.

`docs/arquitectura.md` §4.55 recoge las dos reglas nuevas (no se hereda el responsable; que tiene que
decir la interfaz). Verificado con `tsc`, `eslint`, los dos guiones de selectores y la suite e2e.

### 4. Y EL 401 AL VOLVER A LA PESTAÑA: arreglado, con el cerrojo que lo hace seguro

Reportado desde produccion: *«sale `v1/catalogs/areas 401` y se queda, demora en pasar a la otra
opcion»*. **No estaba roto** —el token dura 15 min, vive en memoria, y una pestaña quieta no lo
renueva; el primer clic pagaba 401 + refresco + reintento— pero le cobraba la espera a la persona.

Ahora se renueva **antes**: temporizador al 80% de la vida y puesta al dia al volver a la pestaña.

Dos cosas que se dijeron mal en la conversacion y quedan corregidas aqui, porque las dos cambian la
decision:

- **El servidor YA se protege del choque de refrescos.** Al rotar, el token anterior sigue valiendo
  30 segundos (`GRACE_MS`). Dos pestañas renovando a la vez no echan a nadie. Se habia contado como
  un peligro inminente y no lo es. El cerrojo (`navigator.locks` + `BroadcastChannel`) se queda por
  lo que si hace: **N pestañas cuestan UN refresco** y quedan cubiertas las carreras mas largas que
  esa ventana.
- **El limite de la pestaña abandonada no es por gasto.** Se habia razonado como coste —5
  peticiones/hora, irrelevante— y el argumento bueno es otro: la cookie de refresco dura 7 dias **y
  se desliza**, asi que una pestaña visible renovando sola mantendria la sesion **para siempre**. Una
  pantalla desatendida en un puesto compartido se queda dentro, en una aplicacion donde se firma. Por
  eso la renovacion se ata a la ACTIVIDAD (`INACTIVIDAD_MAXIMA_MS`, 30 min), que es como lo acotan
  los sistemas serios. Actividad = una peticion a la API, no el raton.

Es un **limite, no un cierre forzado**: el token muere solo y quien vuelva se recupera por el camino
de siempre. Un cierre de sesion por inactividad es **politica del cliente** y queda sin decidir.

Coste en servidor: **igual o menor** que antes (se ahorra el 401 y el reintento). Sin
`navigator.locks` o `BroadcastChannel`, todo degrada al comportamiento anterior, que era correcto.

### 5. Y EL 2.7, CERRADO: «como se acredita» eran DOS preguntas disfrazadas de una

El cliente lo replanteo con su caso —*"la formacion tiene evaluacion y se cierra por contenido, pero
se quiere el QR, la firma o el acta como constancia de que estuvo presente"*— y al mirarlo de cerca
el problema no era que faltara una opcion: era que **un solo booleano respondia QUE ACREDITA y SI
SE TOMA LISTA a la vez**. Elegir una descartaba la otra, y por eso el caso no cabia.

Ahora son dos: **«que se exige»** (la lista · el contenido · **las dos cosas**) y **«¿se toma
lista?»**, que solo se pregunta cuando acredita el contenido —si la lista acredita se toma por
definicion, y ofrecer apagarla seria ofrecer una jornada que no se puede cerrar—.

Lo que esto desbloquea, y no es solo el caso pedido:

- **Evidencia sin acreditacion.** Con `CONTENT` + lista, el QR, la firma y el acta funcionan y van al
  expediente **sin cerrar nada**. La evidencia documental deja de ser una compuerta.
- **«Asistio Y aprobo»**, que es lo que un auditor pide en una presencial con examen y hasta hoy no
  se podia pedir: o acreditaba la lista y el examen no obligaba, o al reves. Decision tomada al
  abrirlo: **quien asiste pero reprueba sigue debiendola**.
- Y el papel de un tercero **se registra desde la lista siempre que haya lista**, acredite o no.
  Esto estuvo AL REVES unas horas —se rechazaba con `CERT_NOT_ON_THIS_LIST`, razonando que el papel
  dice «cumplio» y esa lista no cierra nada— y lo corrigio el cliente al preguntar donde deberia
  registrarse. La premisa era falsa: **el papel es EVIDENCIA, no una acreditacion**. Quien decide si
  la formacion queda cumplida es la exigencia de la jornada, siempre; el papel solo fija hasta
  cuando vale. Y el instructor lo tiene en la mano al terminar la sesion, asi que prohibirlo ahi no
  protegia nada — solo garantizaba que la evidencia se perdiera. Sin lista, sigue siendo la ficha de
  la persona (`PENDIENTES` 2.2).

**La migracion no le cambia el significado a ninguna jornada ya dictada** (`20260921160000`):
`true`→`ATTENDANCE`, `false`→`CONTENT`, `null`→`null`. Es total y sin perdida, y se probo desde una
base vacia antes de aplicarla, como manda el RUNBOOK.

**Lo que destapo el recorrido nuevo, que es por lo que existe.** `exigencia-y-lista.mjs` (45
comprobaciones, cuatro formaciones de punta a punta hasta la constancia) encontro que con el temario
terminado y sin asistir, el reproductor enseñaba **«Formacion terminada» en verde a quien NO habia
cumplido**. El motor siempre lo supo —`missing` incluye «Asistencia a la sesion»— pero el dato no
llegaba a la pantalla. Es el fallo tipico de *"esto no llega hasta alli"*: las dos mitades, por
separado, estaban bien. Ahora el reproductor devuelve `exigencia` / `faltaAsistencia` y la pantalla
lo dice en ambar, nombrando a quien lo resuelve.

Cobertura: **459 unitarias** de la regla (la matriz pasa de 27 a 108 combinaciones, con dos
invariantes que ninguna puede romper) y los cinco recorridos de asistencia en verde.

### 6. DOS COSAS QUE LA REGRESION DESTAPO Y NO ERAN DE ESTE CAMBIO

Se dicen aparte porque la tentacion al ver rojo es culpar a lo ultimo que se toco:

- **`asistencia.mjs` llevaba en rojo desde el 2026-09-08.** Su paso 13 afirmaba que con dos reglas
  vivas nacen DOS obligaciones, y el pendiente **4.1 lo cambio a UNA** ese mismo dia. El recorrido se
  quedo atras y nadie lo volvio a correr. Corregido a lo que el sistema hace hoy.
- **`tracksExternalCertificate` estaba APAGADO en RECERTIFICACION** en la base de desarrollo, y de
  ahi salian 17 de los 19 fallos de ese recorrido y los 7 de `asistencia-combinaciones`. Es
  configuracion del tenant, no codigo: se comprobo encendiendolo y volviendo a correr —de 19 a 2— en
  vez de suponerlo.

### 7. LA CARGA MASIVA, A RAIZ DE 1.089 FILAS EN ROJO

El cliente subio su plantilla y salio esto, mil ochenta y nueve veces:

```
Columna "area": String must contain at least 2 character(s)
```

La causa era simple —la columna `area` venia vacia— pero el mensaje tenia tres cosas mal a la vez:
en ingles, hablando de «caracteres» cuando lo que pasa es que la celda esta VACIA, y sin decir que
hacer. Y la tabla enseñaba solo la cedula, asi que para saber de quien era cada error habia que
abrir el archivo y buscar el numero.

**Lo que se hizo, y cada cosa sale de una pregunta suya:**

- **Los motivos, en español y diciendo que hacer.** «Falta "Área", y es obligatorio. Si la empresa
  usa sub-áreas, llena también "sub_area".» Ni un codigo tecnico ni una palabra en ingles en toda la
  pantalla. Con pruebas, porque un texto sin prueba vuelve al ingles en cuanto alguien toque la
  validacion.
- **El NOMBRE junto a la cedula** en cada fila del informe.
- **El correo pasa a ser OPCIONAL** (`users.email` nulable, migracion `20260921190000`). *"Eso pasa a
  veces, no tiene correo"*. La alternativa practica era inventar `1116267708@empresa.com`, que es
  peor que no tener ninguno: parece un correo, nadie lo lee, y despues no hay forma de saber quien
  tiene uno de verdad. **No deja a nadie fuera**: se entra con la cedula o con el correo (Decision
  #10), asi que quien no tiene entra con su cedula. Lo unico que pierde es lo que se mande por
  correo — y por eso tiene que constar, para no contarlo como entregado el dia que el correo se
  conecte.
- **Recargar el archivo ACTUALIZA en vez de rechazar.** Una empresa no carga su plantilla una vez:
  la carga cada mes, con las altas y los traslados mezclados entre los 900 que no cambiaron.
  Rechazar esos 900 con «ya existe» convertia el archivo mensual en una lista de errores, y **los
  traslados de area no entraban nunca**. Ahora la carga es un espejo del maestro de personal, con el
  documento como clave — que es como lo resuelven los LMS y los sistemas de nomina.

**Las tres reglas de la actualizacion, y cada una evita un desastre distinto:** una celda vacia **no
borra** (vacia = «este archivo no lo dice»); **no se toca** la contraseña, el rol, si esta activa ni
las politicas firmadas (un archivo de RR. HH. no puede ascender a nadie a administrador); y se dice
**que campos** cambiaron, porque un cambio de area mueve obligaciones y es lo que hay que revisar.

**Dos fallos que este trabajo casi introduce, y que conviene tener presentes:**

1. `updateUserSchema` es el de creacion en `.partial()`. Con la transformacion ingenua, `undefined`
   se habria convertido en `null` y **guardar cualquier cambio de una ficha habria borrado el correo
   de esa persona**. Se distingue «no vino» de «lo dejaron en blanco».
2. El aviso de repaso hacia `if (!correo) return null` con el comentario «dio de baja». Funcionaba
   porque el correo era obligatorio. Con correos nulos habria dejado a toda esa gente **sin su aviso
   en la bandeja**, que no usa correo para nada. La condicion ahora pregunta lo que siempre quiso
   preguntar: ¿sigue activa esta persona?

Cubierto por `scripts/recorridos/sin-correo.mjs` (26 comprobaciones: crear sin correo, entrar con la
cedula, dos sin correo que no chocan, editar sin borrar, la recarga con sus tres resultados, y que
una celda vacia no borre) y por las unitarias de los mensajes.

### 8. GUIAS DE USUARIO

- `guias/asistencia.html`: seccion nueva con **las dos preguntas** de la convocatoria, la tabla de
  que pasa con la evaluacion y la constancia en cada caso, que quien asiste y reprueba sigue
  debiendola, y que ve el aprendiz cuando le falta la asistencia.
- `guias/guia-usuarios.html`: el correo como opcional, la recarga del archivo con sus cuatro
  resultados, y **«Los dos caminos, y cual manda cuando se cruzan»** — que responde la pregunta del
  cliente sobre editar a mano y despues subir un archivo viejo.

### 9. Y LA SIMULACION ANTES DE APLICAR (`PENDIENTES` 5.4)

La pregunta que lo abre es del cliente, y es la buena: *"¿y si un administrador actualiza un usuario
por la interfaz y luego suben un archivo con el correo anterior? Se va a reemplazar"*. Si.

**No hay regla que lo resuelva.** Los dos datos los escribio una persona de la empresa y el sistema
no puede saber cual es el bueno. Cualquier heuristica —«lo manual gana», «lo mas reciente gana»—
acertaria unas veces y se equivocaria otras, en silencio. Asi que la respuesta no es una regla mas
lista: es **enseñar lo que va a pasar antes de que pase**.

Subir el archivo ya no aplica nada. Lee, compara y enseña la lista —*«se crearían 12, cambiarían 4»*,
y en cada fila **qué campos**— y se aplica en un segundo clic. `POST /users/import/simular` recorre
**el mismo metodo** que la carga real con un `simular: true` que solo rodea las escrituras: una vista
previa que siguiera otro camino prometeria un resultado y entregaria otro, que es peor que no
simular.

**Como se prueba, que es lo unico que vale aqui:** `sin-correo.mjs` paso 9 mide la base **antes y
despues** de simular —cuanta gente hay, en que area esta la persona que «cambiaria»— y comprueba que
no se movio ni una fila; y que aplicar despues hace exactamente lo que la vista previa prometio.
Comprobar solo las cifras que devuelve no probaria nada: las calcula el mismo codigo.

### Lo que quedo ABIERTO de esta sesion

- Nada. El **2.7** y el **5.4** se cierran aqui; lo que queda de `PENDIENTES` es §10 (produccion) y
  las decisiones del cliente.

---

## 2026-09-21 — PROGRAMAS CERRADO, y las SUB-AREAS: el cambio que no podia cambiarle el significado a nada

Sesion larga y con dos mitades. La primera termino de cerrar **Programas** (11.5, 11.9–11.12). La
segunda llego con prisa del cliente —*"el cliente esta esperando para subir los usuarios"*— y era la
de fondo: **evaluar el desempeño por jefaturas**, con sub-areas. Todo desplegado a produccion al
final del dia.

### 1. LA FICHA DEL PROGRAMA, EN LA FORMA QUE PEDIA QUIEN LA USA

Cinco vueltas sobre la misma fila de modulo, todas del cliente mirando la pantalla:

- El aviso *"Ninguna audiencia alcanza los 2 modulos"* era correcto y **no se entendia**. Se cambio
  por contar **por PERSONA** (`contarPorPersona()`): la pregunta de verdad no es si una audiencia
  cubre el programa, es si **alguien** lo cubre. La comparacion de audiencias se retiro.
- El pie *"Se le exige a X · Y"* estaba diciendo lo mismo que la fila de arriba. Fuera.
- La lista de audiencias por modulo iba a crecer sin limite: `resumenDeAudiencias()` corta en dos
  nombres y el resto es «y N mas».
- **Los botones.** Primero se probo un menu de opciones; se volvio a los visibles (↑ ↓ ✏️ 🗑). Con un
  admin que ordena diez modulos, un menu son dos clics por cada movimiento.
- **El nombre del modulo abre la formacion**, el chevron solo despliega. Sin subrayado, porque
  subrayado en una fila desplegable se lee como «esto despliega».

Y un cambio de fondo en las palabras: **el cupo es de APROBAR, no de cursar**. Se cursa todo; el
minimo dice cuantos hay que aprobar. La explicacion que se habia dado en conversacion estaba mal
—el motor siempre estuvo bien—, y la pantalla ahora lo dice con esas palabras
(`significadoDelCupo()`).

**Lo que se construyo y se DESHIZO**: suprimir la constancia por PERSONA en vez de por formacion.
Funcionaba. Se retiro entero a peticion del cliente —*"lo que no quiero son errores por
complejidad... ese caso no creo que pase"*— y queda el porque escrito en el docblock de
`esModuloDeUnProgramaPublicado()`, para que nadie lo reabra sin saber que ya se hizo.

### 2. EL RECORRIDO DE PROGRAMA DESTAPO UN FALLO DE PRODUCTO DE VERDAD

`scripts/recorridos/programa.mjs`, 15 pasos con asignaciones reales, asistencia de los tres tipos,
certificados y llegada a Seguimiento. Dos cosas que ninguna prueba anterior tocaba:

- **Las horas de la constancia no las escribia nadie.** `certificateHours` existia en el esquema,
  en la pantalla y en el PDF, y **ningun camino lo guardaba**. Las constancias salian sin horas.
- La convocatoria necesitaba `publish` + `enroll` para que el roster no naciera vacio.

Un recorrido de punta a punta encuentra lo que una prueba unitaria no puede: el hueco **entre** dos
piezas que por separado estan bien.

### 3. LAS SUB-AREAS. Y NO HIZO FALTA NINGUN CAMPO NUEVO

La peticion: *"cada jefe de sub-area debe saber a quien evaluar, no un area grande con muchas
jefaturas"*. La regla que ya existia lo resuelve entero:

```
persona.areaId  →  area.responsibleUserId  =  quien la evalua
```

`Area.parentId` estaba en el esquema **desde el primer dia** y ninguna pantalla lo dejaba usar.
Ahora se declara en *Configuracion → Areas*. **Dos niveles, y el servidor rechaza el tercero**
(`AREA_DEPTH`) porque la faceta de audiencia resuelve las hijas con un filtro de UN salto.

**El riesgo era silencioso, y es lo unico que de verdad importa de esta sesion.** Si la gente se
mueve a la sub-area sin tocar nada mas:

1. Toda regla que apunte a «Gestion Humana» **deja de alcanzarles**, y el motor les retira las
   obligaciones vivas como `WITHDRAWN_LEFT_AUDIENCE`. Nadie lo pidio y nadie se entera.
2. «Gestion Humana» **desaparece de todos los informes** —Seguimiento, Inicio, el consolidado— y
   quien compare con el mes pasado no cuadra los numeros.

Los dos se cerraron, y con el mismo criterio: **se AÑADE informacion, no se le cambia el significado
a la que ya existia**. «Area» sigue siendo la grande; «Sub-area» es un corte nuevo. El detalle
tecnico, en `docs/arquitectura.md` §4.55.

### 4. LA PREGUNTA QUE HIZO EL CLIENTE AL CERRAR, Y LA RESPUESTA

*"¿Es mejor esta opcion, o que area y sub-area esten todo combinado en el mismo lugar?"*

**Ya estan en el mismo lugar, y por eso salio barato.** Una sub-area no es una tabla nueva ni un
campo nuevo en la persona: es una fila mas de `areas` con `parentId`. Todo lo que leia `area_id`
—audiencias, evaluaciones, alcance del analista, informes, importacion, seis pantallas— **sigue
leyendolo sin enterarse**. Un campo `subAreaId` aparte habria obligado a cada uno de esos sitios a
decidir cual de los dos usa. Escrito entero en `docs/modulos/desempeno.md` §9.

### 5. LAS TRES LECTURAS NUEVAS DEL CICLO

- **Contra la campaña anterior.** Un 3,8 solo no dice nada. Se compara con el ciclo **cerrado
  inmediatamente anterior**, no por fecha: una empresa hace dos campañas en un año o se salta uno.
  En la primera no se enseña nada.
- **La brecha autoevaluacion / jefe.** Los datos estaban desde siempre y nadie los cruzaba. Solo
  cuenta quien tiene **las dos entregadas**.
- **Por sub-area**, que solo aparece donde las hay.

### 6. LO QUE SE VERIFICO QUE NO SE ROMPIA

El cliente pregunto por ello y era la pregunta correcta: `area_id` lo usa medio sistema.

| Que | Como quedo |
|---|---|
| Alcance del analista | `withDescendants` **ya** recorria el arbol. Asignar el proceso PESV enseña PESV; asignar el area enseña todos sus procesos y los de sus sub-areas. Sin tocar |
| Audiencias | Arreglado: la faceta alcanza el area y sus hijas |
| Informes | Arreglado: `area` sube a la madre, `subarea` es dimension nueva |
| En que se evalua | **No cambia.** El formulario va por CARGO, y asi se queda |

### 7. UNA TARDE ENTERA QUE NO ERA UN FALLO DEL CODIGO

Dos e2e de asistencia en rojo. No era una regresion: la base de desarrollo tenia **35 reglas de
asignacion activas** hechas a mano, y el RUNBOOK ya avisa de que por encima de 30 se rompe la
creacion de personas. Los limpiadores automaticos no reconocen la basura hecha a mano. Se retiraron
18 reglas (35 → 17) y dos pasadas seguidas quedaron en 26/26.

### Verificacion

lint 0 · typecheck 0 · **594/594 unitarias** · matriz **131/131** · verify-rls correcto · build 0 ·
e2e **27/27** · `programa.mjs` y `desempeno.mjs` en `=== TODO BIEN ===`.

### Produccion

Desplegado el mismo dia. Respaldo previo (`~/respaldo-antes-programas-2026-09-21-1901.sql`, 327K),
**42 migraciones** aplicadas, datos intactos (3 usuarios, 4 formaciones, 2 constancias), los cinco
contenedores sanos y `/login`, `/v1/health` y `/programas` en 200.

Y se descubrio desplegando que el documento de despliegue decia `/opt/neo-pulse` desde el primer dia
cuando la carpeta real siempre fue **`/opt/ascent`**. Corregido.

> **Sobre las areas de prueba en la lista.** El cliente vio «Gestion Humana E2E302358» y pregunto.
> Eso es **solo la base de desarrollo**: produccion tiene 10 areas limpias, todas generales, ninguna
> de prueba. Los desplegables ya filtran por `active`; la lista de *Configuracion → Areas* enseña
> tambien las inactivas a proposito, que es donde se estaban viendo.

---

## 2026-09-16 — LA FICHA DEL PROGRAMA, LEIDA POR EL CLIENTE (11.9), y una pregunta de fondo que queda ABIERTA

Sesion de correccion pura sobre la pantalla que dejo el 11.8. El cliente la abrio, la leyo entera y
devolvio tres cosas. Ninguna era un fallo de calculo: las tres eran **la pantalla diciendo la verdad
de una forma que no se entiende**, que a efectos practicos es lo mismo que mentir.

### 1. El aviso que era correcto y aun asi no se entendia

La pantalla decia: *"Ninguna audiencia alcanza los 2 modulos: sus modulos se exigen a grupos
distintos, asi que solo podra completarlo quien este en todos ellos a la vez"*. El cliente contesto:

> *"esto no lo entiendo... si la pildora dice Director de Gestion Humana y la induccion especifica es
> de otro cargo, ninguno esta en los dos, pero debe aplicar la audiencia de cada una"*.

**Y tiene razon en la premisa.** Cada modulo aplica su audiencia; eso funciona exactamente asi. Lo
que el aviso no decia era **la otra mitad**, que es de donde sale el problema: un programa se
completa aprobandolos **TODOS**. `evaluarPrograma` mete en `obligatoriosPendientes` cualquier modulo
obligatorio sin aprobar, **se le haya exigido a esa persona o no**. Con dos modulos de audiencias
disjuntas, nadie cierra el programa — no porque las audiencias esten mal, sino porque esa union de
formaciones no es un programa.

Asi que el aviso ya no describe la situacion: **explica la regla** y **nombra la salida** — *si cada
modulo va a proposito para un cargo distinto, no son un programa: son formaciones sueltas, cada una
con su audiencia*. Que es lo que el cliente estaba buscando y no encontraba.

### 2. Lo que sobraba

- **El pie "Se le exige a X · Y"**. El cliente: *"esto ya esta de mas si cada uno dice quienes tiene
  de obligacion"*. Y sumado es peor que redundante: no distingue quien tiene que, que es la pregunta
  real. Se quita; el reparto modulo a modulo esta en la lista, que es donde se actua.
- **La segunda caja de "fechas distintas"**, que repetia con otras palabras lo que el bloque de
  estado ya decia tres centimetros mas arriba. Se cayo con el mismo criterio que creo ese bloque.

### 3. El renglon de cada modulo se parte en dos alturas

El renglon traia la lista entera de audiencias y **cinco botones** —abrir, subir, bajar, editar,
quitar—. El cliente vio venir las dos consecuencias: *"si una extraordinaria cubre muchos cargos esa
lista se creceria mucho"* y *"ya tiene muchos botones"*.

El criterio de que va en cada altura es **cada cuanto se necesita**:

| | Que lleva |
|---|---|
| **Renglon (siempre)** | Lo que se compara ENTRE modulos: orden, nombre, **tipo de formacion**, obligatorio/grupo, lo que esta mal — y debajo, mas pequeño, **a quien alcanza resumido**. Mas reordenar, la unica accion que se hace mirando la lista entera |
| **Ficha (al abrirlo)** | Lo de UN modulo, para LEER: audiencias con nombre completo, estado, campaña, exigencia automatica |
| **Menu `⋯`** | Las acciones de ese modulo: abrir la formacion, editar, quitar |

Sobre el renglon el cliente pregunto despues: *"¿el tipo de formacion o el quienes?"*. **No es una
disyuntiva**: responden a preguntas distintas y las dos se hacen mirando la lista —el tipo dice como
se comporta el modulo (si se exige solo, si vence por campaña), el "a quien" es lo que cambia de uno
a otro y lo que decide si el programa se cierra—. Lo que hay que separar es el **peso**: el tipo es
una etiqueta corta y estable y va con los datos del modulo; el "a quien" crece, asi que va debajo,
mas pequeño, con su icono y resumido. El tipo dejo de repetirse en la ficha, ya que ahora esta
siempre visible.

**Las acciones no se metieron en la ficha.** El cliente lo dejo abierto —*"¿el boton de eliminar y
editar debe estar visible, o uno que abra las opciones, o mejor como estaba? no se que es lo mejor
para admin"*— y las tres opciones fallan por un lado distinto: cuatro botones por renglon es el muro
que se acababa de quitar; esconderlas en la ficha obliga a desplegar un modulo para editarlo, un clic
de mas en lo que mas se hace al armar un programa; y al pasar el raton no existe para el dedo ni para
el teclado. El **menu `⋯`** las resuelve las tres —siempre visible, siempre en el mismo sitio, un
control en vez de cuatro, y lo destructivo dentro— y ademas **es el patron que la fila de Usuarios ya
usa** (`Popover` + `MoreVertical`), asi que no se inventa nada para esta pantalla.

### 3 bis. Cada clic, un solo destino

El cliente pidio despues que *"al presionar el nombre del modulo abra la formacion"* y acto seguido
vio el riesgo el mismo: *"o no se si mejor dejar el boton de abrir, porque al dar en el nombre se
confunda con desplegar"*. **Tenia razon, y la primera version lo tenia**: el nombre abria la formacion
y el resto del renglon desplegaba la ficha — dos resultados a pocos pixeles, sin ninguna frontera
visible. Eso no se aprende, se falla.

Se separo del todo, y esta es la regla de la lista:

- **El chevron despliega**, y no hace nada mas. Boton de verdad, con `aria-expanded` y su etiqueta
  cambiando entre "Ver" y "Cerrar la ficha de X".
- **El nombre abre la formacion**, anunciandose al pasar por encima (subrayado + icono de enlace
  externo). Sigue estando tambien en el menu, para quien lo busque ahi.
- **El renglon en si no hace nada.** Pulsar en el hueco no dispara sorpresas.

### 3 ter. "¿Por que sale un cargo en 'se le exige' si es Induccion general?"

Pregunta del cliente sobre un modulo real (`Alcance SUYO 53023130`). **Comprobado contra la base**, no
deducido: la formacion es de tipo Induccion general (`defaultAssignmentMode = ON_HIRE`), esta **sin
publicar** (`current_version_id` nulo) y tiene **una sola regla activa**, `Cargo: Director de Gestion
Humana`, trigger `ON_JOIN`, creada el 2026-09-14.

No es un fallo ni son datos de prueba: **la exigencia automatica nace al PUBLICAR la formacion**
(`aplicarExigenciaAutomatica`, `versioning.service.ts`). En borrador esa regla no existe todavia, asi
que lo unico que se ve es lo que alguien exigio a mano — tipicamente el propio boton de asignar el
programa, que exige TODOS los modulos por igual (lo que el aviso de 11.7 ya advierte).

Lo que si era un fallo es que **la ficha no lo decia**: arriba un cargo, abajo "Se exige sola: a toda
la empresa", y las dos cosas pareciendo contradecirse. Ahora, en borrador, lo dice entero —*"eso es lo
que hay hoy; al publicar nacera ademas su regla de toda la empresa"*— y el dato "Se exige sola" solo
sale cuando la formacion esta publicada, que es cuando explica algo.

El resumen de audiencias: hasta dos se nombran; a partir de tres, `"<la primera> y N mas"`. Los
nombres completos no se pierden, viven en la ficha.

**Se despliega DENTRO de la lista, no en una ventana** — ademas de la regla de siempre sobre no abrir
ventanas, aqui hay un motivo propio: se abre un modulo justamente para compararlo con el de al lado,
y un dialogo obliga a cerrarlo para hacerlo.

### 4. Dos arreglos que salieron por el camino

- **Asignar no recargaba la lista.** `asignar()` no llamaba a `load()`, asi que se asignaba el
  programa y la pantalla seguia diciendo "no se le exige a nadie" hasta recargar a mano. Se lee como
  que no funciono.
- **Una trampa de accesibilidad que habria roto los e2e.** Al convertir el renglon en un boton, su
  nombre accesible pasa a ser todo su texto — y ahi dentro esta la marca **"sin publicar"**. El
  `getByRole('button', { name: 'Publicar' })` de Playwright (y cualquier lector de pantalla) lo
  confundia con el boton **Publicar** de la cabecera. Se corrige con `aria-label` propio en el
  renglon. Anotado en RUNBOOK.

### 5. LA PREGUNTA DE FONDO, RESUELTA — y una version mia que se deshizo el mismo dia

El cliente delego la decision —*"lo que ejecutes debe ser lo que debe hacer el sistema LMS de un
programa"*— asi que se decidio y se ejecuto. Son **tres** decisiones, y al final **solo una cambia
codigo**.

**(a) ¿Bloquear al agregar un modulo con audiencia propia? NO.** La decision ya estaba escrita en el
RUNBOOK (*"Bloquear no es avisar"*): se bloquea lo que produce evidencia falsa, lo que esta a medias
se avisa. Y aqui bloquear seria peor que inutil: **asi es como se arma un programa**, con formaciones
que ya existen y ya tienen sus reglas.

**(b) ¿El programa se completa con TODOS los modulos o con los de cada persona? CON TODOS.** Y no por
inercia: **con el modelo de hoy, "los modulos que a mi se me exigen" no se distingue del abuso**.
`AssignmentRule` no guarda de donde viene una obligacion — una regla creada por "Asignar programa" y
una creada a mano sobre la formacion suelta son la misma fila. Asi que la version por persona dejaria
que **quien solo debe UNA pildora por otro motivo complete el "Programa de Induccion General" haciendo
esa pildora**, y se lleve esa constancia. Evidencia falsa: lo unico que este proyecto si bloquea.

**(c) ¿La constancia individual se suprime por formacion o por persona? POR FORMACION — despues de
construir lo contrario y deshacerlo.** Es la parte que conviene leer entera.

### 6. LA SUPRESION POR PERSONA: construida, probada, y retirada

Se construyo: `esModuloDeUnProgramaPublicado` pasaba a recibir el `userId` y la regla era *se suprime
salvo que a esa persona se le exijan ALGUNOS modulos del programa pero no TODOS*. Tres casos nuevos en
la matriz (A6, A7, A8), 131 comprobaciones en verde. Funcionaba.

**Y aun asi se retiro**, porque el cliente puso el dedo en lo que yo habia pesado mal:

> *"lo que no quiero son errores por complejidad... ese caso de que una formacion individual y por
> programa este, no creo que pase"*.

Tiene razon en las dos mitades:

1. **Yo mismo habia declarado el precio y lo habia aceptado demasiado rapido.** Las reglas de un
   programa se crean modulo a modulo, asi que durante ese rato cualquiera cae en "algunos" y se lleva
   su individual; si despues completa el programa, acaba con **dos constancias del mismo esfuerzo**.
   Cambiar una perdida de evidencia por una DUPLICACION de evidencia, en el camino que emite los
   papeles y que se consulta en CADA cierre de formacion, no es una mejora — es mover el fallo.
2. **El caso que arreglaba requiere una mala configuracion.** Al armar un programa con formaciones que
   ya se exigian, lo normal es que la audiencia del programa sea la misma que ya tenian, y ahi no se
   pierde nada. El daño solo aparece si son disjuntas a proposito. Y asi es como este cliente lo usa:
   *"solo hay un programa de induccion general para todos, y las inducciones especificas no se usarian
   como programa porque la constancia seria individual"*. **Un programa = una audiencia para todos sus
   modulos.**

**Lo que queda en su lugar** es el aviso en ambar dentro de la ficha del modulo, que cuesta cero y
dice la consecuencia entera —incluida la que duele: esa gente no completara el programa **y tampoco
recibira la constancia individual**—. Ese aviso **es** la proteccion, asi que no se suaviza.

Y si algun dia el caso aparece de verdad en un tenant, el arreglo correcto **no es aquel parche** sino
que `AssignmentRule` sepa **de donde** viene la obligacion. Con ese dato, "los modulos que el PROGRAMA
me exige" se pregunta sin adivinar, y entonces si se puede suprimir por persona sin duplicar nada.
Anotado en `PENDIENTES` 11.10.

**Tambien se descarto "tronco comun + rama por cargo"** (general + SST a todos, la especifica solo a su
cargo, cada uno completa tronco + rama). Lo plantee como la funcionalidad que faltaba de verdad; el
cliente lo descarto describiendo como lo usa —las especificas no son programa, precisamente porque su
constancia es individual—. No se construye hasta que algun tenant lo pida.

### 7. LO UNICO QUE SI SE CONSTRUYO PARA EL FUTURO: la regla sabe de donde salio

El cliente pregunto lo correcto al final: *"¿se deberia dejar lo de rama y tronco o no meterse en eso?
La idea es que sea escalable"*. La respuesta: **no construir la funcionalidad, pero no cerrar la
puerta** — y la puerta es exactamente un dato.

`AssignmentRule.sourcePathId` (migracion `20260916140000_regla_sabe_su_origen`). NULL = la declaro
alguien sobre la FORMACION; con valor = la creo "Asignar programa" de ese programa. **Hoy no se lee
en ningun sitio y no cambia ningun comportamiento.**

Se hizo AHORA y no cuando haga falta por una sola razon: es **el unico dato de todo esto que no se
puede reconstruir mirando atras**. Sin el, una regla creada por un programa y una creada a mano son
la misma fila, para siempre; cada dia que pasa es un dia de reglas a ciegas. La funcionalidad se puede
construir cuando alguien la pida; el dato, no se puede inventar despues.

Tres decisiones dentro del campo, que conviene no reabrir:

- **Se escribe solo al CREAR.** Si la regla ya existia porque alguien la declaro a mano y despues un
  programa la reutiliza, la verdad es que no la creo el programa.
- **Viaja como parametro interno del servicio**, no en `setActivityRequirementSchema`. Si estuviera en
  el cuerpo de la peticion, cualquier llamada a la API podria declarar que su regla la puso un
  programa. Lo pone quien de verdad lo sabe: `ProgramsService.asignarAudiencia`.
- **`ON DELETE SET NULL`.** Borrar el programa no puede dejar a nadie sin la formacion que ya se le
  exigia; perder el rastro del origen es lo secundario.

Lo que desbloquea el dia que haga falta: compleccion por persona (tronco + rama), supresion de la
constancia por persona sin duplicar papeles, y que el informe sepa a quien le aplica un programa.

### 8. PUBLICAR AVISA A QUIEN DEJA SIN PAPEL, Y EL AVISO PASA A CONTAR **PERSONAS**

Publicar no es solo "ya se ve": es el acto que **apaga la constancia individual** de todos los
modulos. Y lo hacia en silencio. El cliente llego al caso solo, y **no necesita mala
configuracion**: un programa de inducciones generales —exigidas solas a toda la empresa— mas una
pildora que ya tenia SU regla para cien personas. Al publicar, esas cien completan y reciben la
constancia del conjunto; **el resto de la plantilla** hace las inducciones, nunca completa el
programa —nadie le exige la pildora— y ya no recibe la individual. **Sin ningun papel, habiendola
hecho.**

Ahora publicar lo dice antes, con el numero, y **no bloquea**: `impactoDePublicar`.

**Y por el camino se descubrio que el aviso de la ficha estaba mal planteado desde el principio.**
Comparaba AUDIENCIAS ("ninguna alcanza los N modulos"), y eso **da falsas alarmas**. Lo encontro el
cliente: *"una pildora si puede ser para todos"*. Es cierto — `jobTitleId` y `areaId` son
OBLIGATORIOS en toda persona, asi que una pildora marcada a todos los cargos alcanza a la plantilla
entera. Junto a unas inducciones generales exigidas a "Toda la empresa" forma un programa
**perfectamente sano**... y la comparacion por audiencias gritaba igual, porque son dos audiencias
con nombres distintos. Un aviso que salta sobre algo que esta bien enseña a ignorar los avisos.

Asi que las tres lecturas pasan a salir de **la misma cuenta, por persona** (`contarPorPersona`):
*gente a la que se le exige ALGUNO de los modulos pero no TODOS*. Ni cero (a esa no le afecta) ni
todos (esa lo completara y tendra su constancia).

| Donde | Que dice |
|---|---|
| Aviso de la ficha | "A N personas les falta algun modulo por exigir" |
| Linea verde | "Funcionando: N modulos publicados, y N personas lo tienen exigido entero" |
| Ventana al publicar | El mismo numero, antes de apagar las constancias |

Cubierto en la matriz: **I39** (cuenta a quien tiene todos), **I40** (a quien tiene algunos), **I41**
(la ficha y el aviso de publicar usan la MISMA cuenta: no pueden discrepar). **131 en verde.**

El consejo de la ventana tambien se corrigio por otra observacion suya —*"eso aplicaria solo para las
que no son asignaciones automaticas"*—, que es exacta: un tipo automatico nace exigido a toda la
empresa y no se puede quitar; una formacion de audiencia marcada obliga a marcar al menos una faceta
(el alcance vacio esta bloqueado a proposito). Asi que en un programa MEZCLADO el consejo no puede
ser "asignalo": es **no mezclar**. Donde todos los modulos son de audiencia marcada, si basta con
asignar el programa entero.

### 9. TRONCO Y RAMA: DESCARTADO, y el razonamiento que lo descarta es del cliente

Se ofrecio construirlo y el mismo lo mato pensando en voz alta: si las inducciones especificas van
como modulos, **con 100 cargos son 100 modulos** en la lista. Separarlo en dos programas no arregla
nada — el de especificas sigue teniendo 100.

Y eso no es un problema de pantalla: es la señal de que el modelo esta mal. **Un programa es una
lista FIJA de formaciones**; meterle dentro una dimension que varia por persona (el cargo) lo hace
explotar. Los LMS que si lo resuelven no usan un modulo por cargo: usan un **modulo dinamico** —una
sola fila que dice "la especifica que te toque" y se resuelve distinta para cada persona—. Eso es una
pieza de modelo nueva, bastante mas que "audiencia por modulo", y no hace falta.

Ademas, el D1072 exige induccion y reinduccion; **no exige un solo documento**. Dos constancias que
dicen cada una que cubren no son peor prueba que una.

**Lo que el cliente describia como necesidad —*"ver todo por induccion de una persona, sin importar
si es general o especifica"*— no es estructura, es VISTA**, y no pide tocar el modelo. El perfil
(`/usuarios/[id]`) ya reune en una pagina lo que le falta, su trayectoria y sus constancias; lo unico
que no hace es agrupar por "induccion". Si algun dia se pide, es un informe: no toca el motor, ni las
constancias, ni un solo numero de auditoria. Anotado, sin construir.

Verificado: `tsc`, `eslint`, 582 unitarias, la matriz de programas **131/131**, `db:verify-rls` y la
suite e2e en verde — y antes de esto, **dos corridas seguidas** tras limpiar la base (ver RUNBOOK).

---

## 2026-09-15 (continuacion 3) — EL AVISO DE ASIGNACION AUTOMATICA (11.7), y una REGRESION de la sesion anterior que borraba anos de incumplimiento

Sesion corta de cierre del bloque de Programas. Se hizo lo unico que quedaba sin empezar (11.7) y,
al revisar el trabajo sin comitear de la sesion anterior, aparecio un fallo de fondo que no habia
saltado en ninguna prueba.

### 1. LA REGRESION: "cerrar todas las obligaciones vivas" se llevaba por delante la politica ACUMULA

La sesion anterior cambio `closeAssignment` (`completion.service.ts`) de `findFirst` a **cerrar
todas** las obligaciones vivas de esa persona para esa formacion. El motivo era bueno y el caso real
existe: una formacion exigida a la vez desde su ficha Y desde un programa del que es modulo nace
DOS veces —el indice unico es por REGLA (`@@unique([ruleId, userId, cycleNumber])`), no por
persona+formacion— y completarla una vez solo cerraba una. La otra se quedaba viva para siempre
sobre algo ya hecho.

**Pero el barrido se pasa de largo.** En *Configuracion -> Tipos de formacion* hay una politica que
en pantalla dice literalmente *"Nace la nueva y sigue debiendo la anterior"* (`ACUMULA`, en
`next-cycle.ts`): la ronda sin hacer sigue VIVA a proposito mientras nace la siguiente — *"a los
tres anos debe tres"*. Con el barrido, esa persona hace la formacion **una vez** y se le cierran las
tres rondas de golpe: tres anos de incumplimiento desaparecen del expediente, y desaparecen como
`COMPLETED`, que es lo que el auditor lee como *"lo hizo"*.

**Las dos situaciones se distinguen solas**, y de ahi sale el criterio:

| | Que es | Que hay que hacer |
|---|---|---|
| `ruleId` **distinto** | Una cosa exigida por dos sitios | Cerrar **las dos** |
| MISMO `ruleId`, `cycleNumber` distinto | **Periodos** distintos (ACUMULA) | Cerrar **la mas antigua**, una por vez |

Asi que: se agrupa por regla y se cierra la mas antigua de cada grupo (`dueAt` asc). Las manuales
(`ruleId` nulo) forman un grupo entre ellas, por lo mismo. La regla se saco a
**`learning/close-assignments.ts`** como funcion pura —misma familia que `due-date.ts`,
`next-cycle.ts` y `program-completion.ts`— con 8 pruebas que cubren las dos esquinas enfrentadas,
justo la clase de fallo que acababa de colarse. **554/554 unitarias.**

### 2. 11.7 — EL AVISO, Y COMO SABE QUE UN PROGRAMA ES "DE INDUCCION GENERAL"

La pregunta del cliente fue exactamente esa, y es la decision de diseno entera: **no se mira el
nombre del programa** ni el `code` del tipo. Los dos son **datos del tenant**, editables desde
Configuracion, y deducir de ahi mentiria en cuanto alguien renombrara algo.

Se mira, modulo por modulo, **`activityType.config.defaultAssignmentMode === 'ON_HIRE'`**, que es lo
que lee `aplicarExigenciaAutomatica` (`versioning.service.ts`) para crear sola la regla de toda la
empresa al publicar. Eso cubre Induccion general **y** Reinduccion, sin nombrar a ninguna. Y se
comprueba ademas si **ya existe** la regla activa: eso es el hecho, no la intencion.

**El matiz que evita la lectura equivocada**, y que se dice aparte: Induccion general lleva
`requiresBeforeHire: true`, asi que su regla nace `soloNuevos` y **alcanza a quien ingrese, no a la
plantilla actual**. Reinduccion es al reves. Sin decirlo, *"se asigna sola a toda la empresa"* se
entiende mal justo en el sentido que mas duele.

Y se comprobo antes de redactar el aviso que asignar igualmente **no pisa** la regla automatica: la
regla existente se busca por AUDIENCIA (`audienceId + targetId`), asi que otra audiencia crea una
regla SEGUNDA, y la obligacion nace una sola vez por 4.1. El aviso dice eso: es redundante, no
peligroso.

### 3. Y LA E2E LLEVABA ROJA DESDE LAS REVERSIONES DE INTERFAZ, SIN QUE NADIE LO SUPIERA

`programas.spec.ts` pedia la tarjeta del aprendiz como `article` y la tarjeta es un **enlace entero**
a `/programa/[id]`. La sesion anterior (continuacion 2) hizo tres reversiones de interfaz y cerro
declarando *"546/546 unitarias, tsc y eslint limpios"* — **e2e no se volvio a correr**, y el fallo
solo aparece ahi. Es otra vez la leccion del RUNBOOK sobre selectores: tsc y lint no ven el DOM.
Corregida la prueba (el producto estaba bien: una tarjeta que se pulsa entera es un enlace).

### 4. LO QUE SE VERIFICO, Y UNA DEUDA QUE SE SALDO

- **554/554 unitarias**, tsc y eslint limpios.
- **26/26 e2e**, con una prueba nueva del aviso de 11.7 (usa un modulo de Induccion general **sin
  publicar** a proposito: publicarla en la base de desarrollo crearia su regla de toda la empresa y
  con ella miles de obligaciones; el aviso igual aparece, porque lo decide el TIPO).
- **La cadena de migraciones, desde una base VACIA** — la regla del 2026-09-09 que nacio del
  despliegue fallido, y que las tres migraciones de Programas no habian pasado todavia. Base de usar
  y tirar en el Postgres de dev, `prisma migrate deploy` hasta el final, base borrada. Verde. El
  `DROP INDEX "path_enrollments_path_id_user_id_key"` de `20260915120000_programa_ciclo` era el
  candidato a fallar y no falla: el nombre coincide exacto con el que crea `init`.

### 5. LA MATRIZ DE PROGRAMAS, Y LOS DOS FALLOS QUE DESTAPO

A peticion explicita —*"prueba todas las combinaciones posibles de como se pueda usar el programa"*—
se escribio `apps/api/scripts/verificar-programas.ts` (`pnpm --filter @neo-pulse/api
dev:verificar-programas`), que sustituye al `verificar-constancia-programa.ts` de la sesion anterior
—cubria solo un escenario— y corre **65 comprobaciones** contra la base de dev, en seis bloques: la
supresion de la constancia individual (A), completar y certificar (B), obligatorio + cupo (C),
rondas (D), esquinas (E) y la vista del aprendiz (F). Crea todo lo que necesita y lo borra al
terminar, vaya bien o mal.

**En la primera corrida: 62 en verde y 3 en rojo.** Los tres eran del producto, no de la prueba.

**Fallo 1 — el programa entero se caia en rojo el mismo dia.** El codigo contradecia a su propia
documentacion. El comentario de `cicloDePrograma` promete que los modulos *"van cayendo en
pendientes uno por uno segun se les abre SU propia ventana, no todos el mismo dia"*. Lo que hacia
era lo contrario: `moduloAprobado` exigia ademas `ronda.cycleNumber >= cicloPrograma`, asi que en
cuanto UN modulo abria su ronda siguiente, **todos** perdian el visto a la vez. En una reinduccion
de ocho modulos, el dia que el primero abre su ronda de 2027 el aprendiz veia los ocho pendientes —
y siete ni siquiera podia hacerlos, porque su obligacion no estaba abierta.

La condicion sobraba entera: un modulo esta aprobado si **su obligacion vigente esta cerrada**. Si
se le hubiera abierto una ronda nueva, la vigente seria ESA y estaria pendiente. La ronda del
programa sigue haciendo falta, pero solo para lo que es —decidir en que FILA de `PathEnrollment` se
escribe— no para juzgar modulo a modulo.

**Fallo 2 — un programa sin modulos repartia constancias.** `evaluarPrograma([])` devuelve
`completo: true`, y como funcion pura es correcto (no queda condicion sin cumplir), pero aguas abajo
eso emitia un papel que acredita la nada. `publicar()` impide publicar un programa vacio, asi que no
se llega por ahi: se llega **quitandole los modulos a uno ya publicado**, que nada impide y es una
operacion normal mientras se reorganiza. El guardarrail quedo en `recalcularProgreso`, donde se
decide el papel, y no en la regla pura.

**Y lo que la matriz dejo escrito, que antes no lo estaba en ningun sitio:** agregar un modulo a un
programa que alguien ya completo lo REABRE (su inscripcion vuelve a `ENROLLED`) pero **no borra la
constancia ya emitida** —es evidencia de lo que el programa era ese dia— y al volver a completarlo
**no emite una segunda de la misma ronda**, porque el indice unico por inscripcion lo impide. Es
coherente, pero habia que saberlo; ahora lo dice una prueba (E6 a E10).

Ademas, `moduloAprobado` se saco a `program-completion.ts` como funcion pura porque la regla estaba
**escrita a mano DOS veces** —en `recalcularProgreso`, que decide la constancia, y en `misProgramas`,
que decide el visto que ve el aprendiz—. El dia que una cambiara, el aprendiz veria un programa
completo que no emite papel, o al reves.

### 6. PLAN ANUAL: "Por proceso" dejo de ser un callejon sin salida

Lo pidio el cliente: *"en por proceso muestra 33 programadas, ejecutadas, cumplimiento y cobertura,
pero entonces ¿se debe dejar asi, o que quisieran ver los admin?"*, y *"deberia haber una que sea
por proceso, luego se puedan ver las capacitaciones de ese proceso, y luego las convocatorias"*.

**El diagnostico.** La vista eran cinco numeros por proceso y ningun sitio al que ir. Quien audita
SST lee "33 programadas, 0 ejecutadas" y su pregunta siguiente es siempre la misma —**¿cuales?**— y
para contestarla habia que salir, entrar a "Por capacitacion" y filtrar por proceso a mano. El dato
ya estaba a mano; lo que faltaba es que **la fila fuera una puerta**.

**Ahora son tres niveles**, y cada uno responde una pregunta distinta — que es el criterio entero:

| Nivel | La pregunta | Que muestra |
|---|---|---|
| Proceso | *"¿vamos bien en SST este año?"* | **Capacitaciones** · Programadas · Ejecutadas · **Por dictar** · Cumplimiento · Cobertura |
| Capacitacion | *"¿que se dicta, y como va cada tema?"* | Jornadas (ejecutadas de programadas) · en que meses cae · personas capacitadas de proyectadas |
| Convocatoria | *"¿que paso con esta jornada?"* | Codigo (enlace) · mes · fecha · regional · asistieron de proyectados · estado |

**Y lo que NO se repite, que es la mitad del trabajo.** El cumplimiento y la cobertura se quedan
ARRIBA. Repetirlos en los tres niveles es lo que hace que un informe se sienta redundante, y ademas
mienten abajo: el cumplimiento de una capacitacion con dos jornadas solo puede valer 0, 50 o 100, y
la cobertura de UNA jornada no significa nada — se dicto o no se dicto.

**Las dos columnas nuevas de arriba** salieron de la misma pregunta del cliente sobre que mostrar:

- **Capacitaciones.** "33 jornadas" no distingue 33 temas distintos de 4 temas repetidos 8 veces, y
  son dos planes muy diferentes. En el plan real de 2026 dice **32 capacitaciones / 33 jornadas**,
  que ya es una respuesta.
- **Por dictar.** El cumplimiento cuenta como ha ido; lo accionable es cuanto queda.

Todo sale de `plan.items`, que ya traia el proceso de cada renglon: **cero cambios en la API**.
Visto en el navegador con el plan real (`mirar.ps1`), abriendo los tres niveles.

**Y una segunda pasada, viendolo funcionar (2026-09-15).** El cliente pregunto si esa era la mejor
forma o habia otra. La respuesta: la jerarquia es correcta —la pregunta que se hace es
jerarquica ("SST: 33 programadas... ¿cuales?")— pero **le faltaba poder ACTUAR**. Un admin no entra
al plan solo a mirar como va: entra a programar lo que falta, y para eso tenia que cambiarse a la
vista "Por capacitacion". Dos cambios:

- **Fuera los meses de la fila de capacitacion.** Los dice cada convocatoria un nivel mas abajo, con
  su fecha al lado. Repetirlos arriba llenaba la fila de algo que ya estaba dentro, y con muchas
  jornadas la linea se hacia larguisima.
- **Boton "Convocatoria" en cada capacitacion**, que abre el MISMO cajon que la vista Por
  capacitacion (`openNew(group)`, con la capacitacion fijada y el mes heredado). Programar otra
  jornada sin salir de donde se vio que falta — que era el unico motivo para cambiar de pestaña.

### 7. CUATRO PREGUNTAS DEL CLIENTE SOBRE PROGRAMAS, Y TRES CAMBIOS QUE SALIERON DE ELLAS

**7.1. "¿Donde se configura que de 8 puede perder 1?"** En la ficha del programa, por modulo:
*¿Es obligatorio?* -> *No, cuenta para un cupo*, y entonces *Seccion del cupo* + *Minimo aprobado*.

**Aqui me equivoque y lo dejo escrito para no repetirlo.** Afirme que los minimos podian divergir
—que `validarSecciones` se quedaba con el primero y `recalcularProgreso` con el ultimo— y **es
falso**: existe `igualarMinimoDeSeccion`, que llaman TANTO `agregarModulo` COMO `actualizarModulo`,
asi que el servidor propaga el minimo a toda la seccion en cada escritura. Lei las dos funciones por
separado y di por hecho que nada las sincronizaba, sin comprobarlo.

Lo que SI faltaba era de pantalla, y no es menor: el campo no se rellenaba con el minimo que la
seccion ya tiene, asi que quien agregaba el septimo modulo tecleaba un numero y **cambiaba el umbral
de los otros seis sin que nada se lo dijera**. Ahora se rellena solo al escribir una seccion que ya
existe, y la ayuda lo dice como se piensa —*"De 7 modulos hacen falta 6: puede quedar 1 sin
hacer"*— mas el aviso de que cambiarlo lo cambia para toda la seccion.

**7.2. "Si se edita un programa y lo estan cursando, ¿que deberia pasar?"** Antes, agregar un modulo
devolvia a `ENROLLED` a **todo el que ya lo hubiera completado**. Eso dejaba a esa persona en el peor
sitio posible: trabajo nuevo y **ningun papel nuevo a cambio**, porque el indice unico impide una
segunda constancia de la misma ronda. Su unica evidencia seguia describiendo el programa viejo.

Ahora **una ronda completada no se reabre**. Es la regla que ya estaba escrita en el esquema y que
este codigo no respetaba: *"una fila por ronda, INMUTABLE"*. Una ronda cerrada acredita lo que el
programa exigia ese dia. Quien va a medias SI ve el modulo nuevo — no hay evidencia que proteger.
Si algun dia hace falta que editar un programa obligue a recertificar, la via no es reabrir la fila:
es versionar el programa, como ya se versiona una `Activity`.

**7.3. "¿La reinduccion deberia repetirse por programa o por modulo?"** **Ya se repite por
programa**, y de hecho mi ejemplo anterior estaba mal. Puse que SST abriria en enero y PESV en
febrero; eso solo pasa si cada modulo lleva una regla hecha a mano. En una reinduccion de verdad
todos los modulos son del tipo Reinduccion y **heredan la misma `defaultAnnualDate`**, asi que se
abren y se cierran juntos: una sola campana. Las dos formas existen y la eleccion la decide la
periodicidad que exija cada norma — no hacia falta cambiar codigo.

Lo que faltaba era **decirlo**: nada en pantalla explicaba que la campana sale de que los modulos
compartan fecha. La ficha ahora avisa cuando todos coinciden (*"vencen antes del 31 de marzo de cada
ano, asi que se abren y se cierran juntos"*) y **tambien cuando NO coinciden**, que es la senal de
que alguien rompio la campana sin querer. Sale de `AssignmentRule.recurrence.fixedDate` de cada
modulo, devuelto por `obtener` como `fechaDeCampana`.

**7.4. "Si meto una induccion general en un programa con otros tipos, ¿sale el mismo aviso?"** No:
hay dos versiones y ese caso cae en la parcial. Pero tenia razon en lo que seguia — **el aviso no
decia que pasaba con las otras**, que es justo lo accionable. Ahora dice las dos mitades:
*"1 de 4 modulos se exigen solos... **3 modulos si necesitan que los asignes aqui**. Al asignar se
exigen los 4 por igual: al automatico le queda una regla de mas, que no duplica la obligacion pero
tampoco anade nada."* Verificado en el navegador sobre el programa de demostracion, que es
exactamente ese caso mixto.

### 8. Y TRES COSAS DE PANTALLA, VIENDO LA FICHA DEL PROGRAMA CON EL CLIENTE

**8.1. El panel de "Asignar" se salia por la derecha.** Se culpo primero al popover del icono de
informacion y se le cambio la apertura hacia la izquierda — estaba bien hacerlo, pero **el sintoma
seguia**, y el cliente lo dijo: *"el icono esta bien, el problema era al abrirlo"*. Midiendo en la
pagina en vez de suponiendo, el culpable era la rejilla: `lg:grid-cols-[1fr_380px]`, y **`1fr` es
`minmax(auto, 1fr)`** — ese `auto` es el ancho minimo del contenido, y el desplegable de formaciones
trae nombres larguisimos, asi que la primera columna no encogia y empujaba a la segunda fuera.
Columnas 734+24+380 = 1139 dentro de una rejilla de 1077. Arreglado con `minmax(0,1fr)`. Detalle
entero en el RUNBOOK, **con los otros 7 sitios del repo donde vive el mismo patron** y que habria
que mirar uno por uno.

**8.2. El aviso del cupo alarmaba por ir en orden.** Decia *"Pide 5 pero la seccion solo tendra 1:
no se podria completar nunca"* cuando alguien escribia el minimo al agregar el PRIMER modulo de la
seccion — que es como se arma, de uno en uno. No estaba mal: estaba a medias. Ahora dice *"Pides 5 y
la seccion va por 1: agrega 4 modulos mas antes de publicar"*. El limite de verdad se comprueba al
publicar (`validarSecciones`), que es cuando la seccion ya esta como va a quedar.

**8.3. Y la explicacion que hacia falta mas que el codigo.** El cliente pregunto tres veces por el
cupo sin que la respuesta le sirviera, y la pieza que faltaba era esta: **el minimo no es del modulo,
es de la SECCION**. Se teclea en cada modulo solo porque el esquema lo guarda pegado a cada fila —no
hay tabla de secciones— y el servidor los iguala en cada escritura. Si algun dia esto se rehace, el
arreglo de fondo es pedirlo UNA vez por seccion, no N.

### 9. EL CUPO, DADO LA VUELTA ENTERO — y la leccion de escuchar la correccion literal

El cliente pregunto por el cupo **cuatro veces** sin que la respuesta le sirviera. Al final lo
corrigio con una frase que valia mas que las cuatro explicaciones:

> *"Cuando mencionas saltarse, ¿a que te refieres? Nadie se puede saltar nada. Debe ser que de esos
> 7, si pierde 1 no importa, pasa. ¿Por que no pide los mínimos que puede perder?"*

Las dos mitades eran ciertas y las dos apuntaban al mismo sitio.

**9.1. La palabra estaba mal, y con ella el modelo mental.** "Puede saltarse uno" y "puede perder
uno" no son lo mismo: nadie se salta un modulo — todos los cursan— lo que el cupo permite es
**REPROBAR** alguno y aun asi completar el programa. La pantalla entera hablaba de "minimo
aprobado", que describe la misma regla desde un sitio donde nadie la piensa.

**9.2. Y el numero se pedia al reves, lo que causaba el aviso raro.** "Hacen falta 6" depende de un
total que **todavia no existe**: una seccion se arma de uno en uno, asi que al agregar el primer
modulo no hay 7, hay 1 — y la pantalla tenia que avisar de una imposibilidad que era solo ir en
orden. **"Puede perder 1" es cierto desde el primer modulo y sigue siendolo con los siete.**

**Como se guarda, sin tocar el esquema.** `PathItem.minRequiredInSection` sigue siendo lo que lee el
motor (`evaluarPrograma` no cambia una linea). Lo que cambia es quien lo calcula:
`minimo = total - puedePerder`, recalculado en CADA escritura que altere el tamano del grupo.

**Y la trampa que costo una corrida en rojo:** `puedePerder` no tiene columna, se deduce de
`total - minimo`, asi que **hay que leerlo ANTES de tocar nada**. La primera version lo deducia
despues de escribir, cuando el total ya se habia movido, y el resultado era que "puede perder 1" se
convertia en "hay que aprobarlos todos" en cuanto el grupo crecia: cada modulo nuevo subia el minimo
con el. Lo cazo el escenario G, que es justo el que faltaba.

**9.3. "¿Por que tiene que haber un grupo?"** Porque un grupo es *a quienes se aplica la frase del
cupo*, y hace falta mas de uno **solo** si el mismo programa necesita DOS frases distintas —
p. ej. "de los 4 de Seguridad puede perder 1" **y** "de los 7 de Procesos puede perder 2". Con una
sola regla, que es lo normal, pedir que alguien invente un nombre es trabajo para nada.

Asi que el grupo **dejo de preguntarse**: se hereda el que hay o se crea `opcionales` por debajo.
**No se quito la capacidad** —el cliente lo pidio expreso: *"no lo quites si puede ser util"*—:
queda una linea, *"¿Necesitas dos cupos distintos en este programa? Separar en grupos"*, y los
nombres aparecen tambien solos si el programa ya tiene dos.

**Lo que quedo en pantalla**, sin la palabra "seccion" ni "minimo" en ningun sitio:

| Donde | Que dice |
|---|---|
| Lista de modulos | *"De los 2 módulos no obligatorios puede perder 1 y aun así completar el programa."* |
| Al agregar el primero | *"¿Cuántos de este grupo puede perder?"* — se declara **una vez** |
| Al agregar los siguientes | *"Se une al cupo que ya existe: de los 3 módulos puede perder 1."* Ya no se pregunta |
| Al editar uno | Vuelve a pedirlo, avisando que afecta a los N del grupo — es la unica puerta para corregirlo |

**La leccion, y es la del dia:** cuatro explicaciones mias no valieron lo que una correccion suya de
una linea. Cuando alguien pregunta lo mismo por tercera vez, el problema ya no es que no se haya
explicado: es que **lo que se le esta explicando esta mal planteado**. La tercera pregunta es la
senal de que hay que cambiar el producto, no el parrafo.

**9.4. Y la vuelta definitiva: el cupo ES UNA OPCION DEL PROGRAMA.** Despues de probarlo, el cliente
lo remato: *"que sea una opcion general, no desde cada modulo"*. Y ahi estaba el fondo del asunto —
el cupo son **dos decisiones distintas** que yo habia metido en el mismo formulario:

| Decision | De quien es | Cuando se toma |
|---|---|---|
| ¿Este modulo entra al cupo? | Del MODULO | mientras se arma la lista |
| ¿Cuantos hacen falta? | Del CONJUNTO | cuando la lista ya esta hecha |

Preguntar la segunda en el formulario de un modulo obligaba a decidirla **antes de tener los modulos
delante** (al agregar el primero nadie sabe si seran cinco o nueve) y dejaba que un formulario de UNO
cambiara la regla de todos. Toda la maquinaria que se escribio ese dia —propagar, deducir,
recalcular— existia **solo** para arreglar un problema que creaba preguntarlo en el sitio
equivocado. Movida la pregunta, la maquinaria sobra.

Ahora: bloque **"Regla de aprobacion"** encima de la lista de modulos, una fila por grupo, con su
casilla editable (`POST /programas/:id/grupos/minimo`). El formulario de modulo solo pregunta si es
obligatorio. Un grupo recien creado **exige todos sus modulos** —defecto estricto, no sorprende— y
sigue al total mientras nadie lo baje; en cuanto alguien lo baja, ese numero es una decision y se
respeta, recortandose solo si el grupo se queda con menos modulos que el minimo.

**Por que ARRIBA y no debajo de la lista**, que tambien se pregunto: con ocho modulos, debajo la
regla que gobierna el programa entero queda enterrada y hay que bajar a buscarla.

**La fila quedo asi, tras varias pasadas mirandola con dos reglas puestas:**

```
opcionales        Aprobar [ 1 ]  de 2   (i)
Gestion Humana    Aprobar [ 1 ]  de 1   (i)
```

- **"Aprobar", no "Pueden aprobar" ni "Hacen falta".** Lo pidio el cliente y es mas corto sin perder
  nada: el verbo solo, y el numero al lado.
- **El total va PEGADO a la casilla** (`de 2`), no en la etiqueta de la izquierda. Un numero solo no
  dice nada sin su total, y asi se lee *"Aprobar 1 de 2"* de corrido. Se quito de la izquierda,
  donde estaba repetido.
- **Columnas de ancho fijo.** Con texto que fluye, "puede perder 1" frente a "todos" movia la
  casilla de una fila respecto a la otra, y un campo que baila de sitio segun lo que diga su vecino
  se lee como roto.
- **Lo que el numero IMPLICA vive en un icono**, no en texto al lado: *"Hay que aprobar 1 de 2
  módulos. Se cursan todos; reprobar 1 no impide completar el programa."* Por tooltip y por
  popover, que el tooltip no aparece al navegar con teclado.
- **"Separar en grupos" se puede deshacer** mientras el programa tenga un solo grupo: abrirlo por
  curiosidad no deberia dejar el formulario pidiendo un nombre para siempre.

**Y el aviso de asignacion paso de seis lineas a una.** Ocupaba el panel entero de forma permanente
cuando lo accionable cabe en un renglon —*"4 módulos necesitan que los asignes aquí; los otros 3 ya
se exigen solos"*— y el porque, que se lee una vez, vive detras de un enlace *"Por qué"*.

Verificado: **80 comprobaciones de la matriz** (escenario G rehecho, 13 solo de esto), 569 unitarias,
26 e2e, y visto en el navegador con dos reglas a la vez.

### 10. EL FALLO MAS GRAVE DEL DIA: SE PODIA COMPLETAR UN PROGRAMA IGNORANDO UN MODULO

Lo destapo el cliente leyendo la explicacion del cupo:

> *"No se puede aceptar nada sin hacer. Si no hace 1 no puede aprobar aunque diga 6 de 7, porque debe
> aprobar o reprobar la evaluacion; si no lo ha hecho no se puede marcar como completado."*

Y tenia razon. `evaluarPrograma` solo miraba **aprobado / no aprobado**, y en ese segundo saco caian
por igual dos cosas que no son lo mismo:

| | Que paso | Deberia |
|---|---|---|
| **Perdido** | Lo curso y lo reprobo | El cupo lo perdona |
| **Ignorado** | No lo abrio nunca | **No puede completar** |

Con un cupo de "6 de 7", alguien hacia seis y **el septimo ni lo abria**: el programa se daba por
completo y emitia constancia. Ademas dejaba la obligacion de ese septimo VIVA, asi que la misma
persona salia *completa* en su programa y *vencida* en el informe de Vencimientos — las dos cosas a
la vez, sobre el mismo modulo.

**La regla nueva:** un modulo con la obligacion viva (`PENDING`/`IN_PROGRESS`/`OVERDUE`) **bloquea el
programa**, aunque el cupo ya de los numeros (`moduloPendiente`, `ResultadoPrograma.sinResolver`).

**Y la salida para quien no pudo presentarse ya existia: EXIMIR**, que es un acto con nombre, fecha
y motivo. Encaja sin inventar nada:

- **Eximir** cierra la obligacion pero **no la aprueba** → resuelve el modulo y **consume una de las
  que el cupo deja perder**. Eximir de mas de lo que el cupo permite NO completa el programa, que es
  exactamente lo que deberia pasar: es una decision que alguien tiene que tomar, no un silencio.
- **Convalidar** (la via de `PENDIENTES` 2.3) si cuenta como hecha, porque la formacion se hizo de
  verdad en otro sitio. Los dos actos ya existian y ahora significan cosas distintas tambien aqui.

**Sin obligacion no hay pendiente**, a proposito: si a alguien nunca se le exigio ese modulo no se le
debe nada, y es lo que deja que un programa sin asignacion propia —alguien que cursa por su cuenta—
siga completandose con su cupo.

**Por que importa mas que el resto:** es el unico fallo del dia que **emitia evidencia falsa**. Una
constancia de programa completo sobre alguien que se salto una formacion entera es justo el papel que
un auditor no deberia poder encontrar.

Verificado con **9 comprobaciones nuevas contra la base** (escenario H) y 13 unitarias.

### 11. SEGUIMIENTO NO SABIA QUE EXISTEN LOS PROGRAMAS (2026-09-16)

El cliente pidio revisar si Seguimiento, Vencimientos o Analitica deberian decir algo de Programas
que **sirviera de verdad**. La revision, y lo que salio:

**Lo que ya estaba BIEN y no habia que tocar:**

- **Vencimientos.** La constancia de un programa nace con `validUntil = null` a proposito —el
  programa no tiene recurrencia propia— asi que no aparece ahi. Y es correcto: lo que vence y hay
  que reprogramar son los MODULOS, cada uno con su regla, y esos si salen. El trabajo a perseguir
  esta donde debe.
- **`EXIMIDA` en Seguimiento** ya era un estado terminal propio —*"no es incumplimiento ni
  cumplimiento"*— asi que encaja solo con la regla nueva del punto 10: un programa completo implica
  que ninguna de sus obligaciones quedo viva, y por tanto **ya no puede haber una persona que salga
  "completa" en su programa y "vencida" en el informe**. Antes si podia.

**Lo que faltaba, y era un hueco de verdad:** ningun informe sabia que existen los programas. El de
demostracion tiene **8 modulos exigidos a 172 personas** = 1.376 renglones sueltos en Ejecucion, y
la pregunta que el cliente hace —*"¿cuanta gente tiene la Induccion General completa?"*— no se podia
contestar sin sumar a mano. **El producto certifica el conjunto y los informes solo hablaban de las
partes.**

**Pestaña nueva en Seguimiento: "Programas"** (`GET /reportes/programas`). Una fila por programa
publicado: modulos · a cuanta gente se le exige · completos · en curso · cumplimiento · **lo que mas
frena**.

**La columna que justifica la pantalla es la ultima, no el porcentaje.** El % dice COMO VA; no dice
QUE HACER. "Lo que mas frena" es, de quienes no han terminado, **el modulo que mas gente tiene sin
aprobar** — asi una sola convocatoria de esa formacion cierra el programa de decenas a la vez. En el
tenant de dev, nada mas abrirlo, dijo esto:

```
Programa de Induccion General (demo)   8 modulos   172 personas   0%   Modulo B — 166 personas
```

166 de 172 atascadas **en la misma formacion**. Sin esa columna hay que abrir persona por persona
para descubrir que a casi todas les falta lo mismo.

**Dos decisiones del calculo, que es donde un informe miente sin querer:**

- **El denominador es A QUIEN SE LE EXIGE, no quien tiene inscripcion.** `PathEnrollment` solo nace
  cuando alguien cierra su primer modulo, asi que contar por ahi dejaria fuera justo a quien no ha
  empezado — que es la gente a la que hay que perseguir. Se cuenta por `Assignment`.
- **Quien ya termino NO suma al cuello de botella.** Si sumara, ese numero subiria con cada persona
  que completa, que es lo contrario de lo que significa.

**Y dos columnas mas, que salieron de mirarlo con datos reales:**

- **A falta de 1** — quien esta a punto. Es a quien mas rinde perseguir.
- **Sin empezar** — quien no ha tocado nada. Es otro problema y otra conversacion.

Con un matiz que costo una pasada: *"a falta de 1"* exige **haber aprobado algo**. Sin esa
condicion, quien tenia un solo modulo exigido y no lo habia hecho contaba en las dos columnas a la
vez, y sumaban mas que el total.

**El cuello de botella se parte en dos**, porque mezclaba dos problemas opuestos: **sin hacer**
(falta programar una convocatoria) y **reprobados** (hay algo que revisar en el contenido). Se
distingue por si existe `Enrollment`: si lo hay, lo intento.

**Y se puede ABRIR la fila**: quienes son, que les falta y si lo intentaron, **ordenados por lo que
les falta** — los que estan mas cerca primero, y los completos al final. Es el mismo hueco que este
modulo existe para tapar un nivel mas abajo: *"habia porcentajes y ninguna forma de abrirlos"*.

### El fallo que este informe tuvo el primer dia

Verlo con datos reales lo destapo en un minuto: decia **172 alcanzados** y *"166 sin hacer"*.
Consultando la base, **170 de esas 172 obligaciones estaban RETIRADAS**
(`WITHDRAWN_LEFT_AUDIENCE`: gente que salio de la audiencia, a la que el programa **ya no le
aplica**). El informe contaba obligaciones muertas, e inflaba justo las dos cifras que mandan a
actuar: mandaba a perseguir a 166 personas que no deben nada.

Corregido en las dos capas, y ahora dice **129**. La regla quedo escrita: retirada no cuenta ni como
alcanzada ni como frenando; **eximida** si cuenta como alcanzada —el programa le aplica— pero no
frena, porque esta resuelta.

Es exactamente lo que la propia documentacion advertia dos parrafos mas arriba (*"es donde un
informe miente sin querer"*) y aun asi se colo. **La leccion: un informe nuevo no esta terminado
hasta verlo con los datos sucios de verdad** — con datos de prueba limpios, los cuatro usuarios del
escenario I pasaban sin problema, porque ninguno tenia obligaciones retiradas.

Verificado con **28 comprobaciones contra la base** (escenario I), incluidas las que importan: que
el cuello de botella senale el modulo correcto, que las dos columnas nuevas no se solapen, y que
una obligacion retirada no cuente en ningun sitio.

### 12. UN PROGRAMA PUBLICADO SE LO VEIA TODO EL MUNDO (2026-09-16)

Lo vio el cliente razonando sobre el punto de "sin obligacion no hay pendiente": *"no puede pasar
que un programa quede visible a todos; solo los obligados deben verlo"*. Y era un fallo:
`misProgramas` listaba **todos los publicados**, sin mirar a quien se le exigen.

Resultado: a quien trabaja en Contabilidad le aparecia en *Mi aprendizaje* la Induccion de
Conductores, sin forma de distinguirla de lo que si debe. **Publicar no es asignar** — un programa
publicado es un compromiso con quien lo tiene exigido, no con toda la empresa.

Ahora se ve si tiene **obligacion de algun modulo** (retirada no cuenta: salio de la audiencia) **o
si ya tiene avance** — esto ultimo para que a nadie se le desaparezca de la pantalla algo que ya
empezo, ni siquiera si despues le retiran la regla.

**Sobre el programa ABIERTO** —al que cualquiera se apunte por su cuenta— que el cliente planteo
como excepcion: no se construye todavia. Es un campo en `LearningPath` y una condicion mas el dia
que haya un caso real; hoy seria una opcion mas que explicar sin nadie que la pida.

### 13. Y EL FORMULARIO DE ASIGNAR SE PLIEGA CUANDO NO HACE FALTA

Decir *"este programa no necesita asignarse"* y dejar debajo el formulario entero, listo para usar,
es una contradiccion: la pantalla dice una cosa y ofrece la contraria. Y en un programa de Induccion
General o Reinduccion usarlo es **casi siempre un error** —crea una segunda regla que compite con la
automatica— asi que no deberia estar a un clic.

No se quita: queda detras de *"Asignarlo igualmente a un grupo concreto"*, que obliga a decidirlo a
proposito.

### 14. DOS COSAS QUE SE ACLARARON, Y UNA CORRECCION MIA

**Corregido:** recomende configurar *"se le exige"* desde Configuracion -> Tipos de formacion. **Esa
opcion no existe en la pantalla**: solo se edita la recurrencia, que pasa si no hizo la anterior, y
la gracia por ingreso reciente. `defaultAssignmentMode` y `requiresBeforeHire` viven en la semilla y
no se tocan desde ningun sitio — que esta bien, porque salen de la norma y no de una preferencia.

**Y la regla que faltaba escrita, en una linea:** *si la formacion esta en un programa, se asigna
DESDE EL PROGRAMA; si no, desde su ficha. Nunca las dos.* Mezclarlas es lo que crea las reglas
duplicadas que aparecieron una y otra vez durante la sesion.

### 14 bis. "A QUIEN SE LE EXIGE", VISTO DESDE EL PROGRAMA

El cliente llego a esto razonando en voz alta sobre si convenia quitar la asignacion automatica al
publicar: *"o es mejor que salgan los obligados desde el programa, asi no se asignen desde ahi, para
que vean a quien se le obliga y no ir a cada formacion"*. **Esa era la buena**, y las otras dos
opciones que planteo no:

- **¿Quitar el automatico y asignar solo desde el programa?** No. Hoy publicar una Induccion General
  **garantiza** que alcanza a quien ingrese, y eso es una obligacion legal: no deberia depender de
  que alguien se acuerde de pulsar un boton. Ademas el producto permite una induccion general
  SUELTA, fuera de programa — sin el automatico, esa se publicaria y no alcanzaria a nadie, en
  silencio.
- **¿Configurarlo todo desde el programa?** El problema que senalaba es real pero **no es de
  mecanismo, es de VISIBILIDAD**: la confusion no venia de que se asignara solo, venia de que desde
  el programa **no se veia a quien se le exige**.

Asi que el programa ahora **muestra** a quien se le exige, aunque no haya sido el quien asigno.
Agrupado **por audiencia** y no por modulo —lo que se quiere leer es "a los Conductores", no ocho
renglones repitiendo lo mismo— con su disparador y con **en cuantos modulos aplica**. Esa ultima
cifra es la que delata una regla a medias: una audiencia que alcanza 2 de 3 modulos deja gente
obligada a una parte y no al conjunto, y casi siempre es un error de configuracion.

Y contesta de paso la otra pregunta —*"¿que pasa si quiero ajustar uno que ya tiene obligaciones?"*—
porque desde ahi se ve la regla y se sabe a que ficha ir a cambiarla.

### 14 ter. "¿COMO SE SABE SI UNA FORMACION ESTA PUBLICADA?"

La pregunta salio de mirar el programa de demostracion: *"esta publicada y tiene asignacion
automatica, pero el panel dice que no se le exige a nadie"*. Comprobado contra la base, **no habia
fallo**: esas tres formaciones estan publicadas pero con **0 reglas activas** — se las desactivo
`dev:limpiar-reglas`, el limpiador de la base de desarrollo. La pantalla decia la verdad.

**Pero la pregunta destapo algo que si faltaba: la ficha del programa no decia si un modulo esta
publicado**, y eso importa mas de lo que parece:

- **Un modulo sin publicar no lo puede hacer NADIE** -> el programa **nunca podra completarse**
  mientras siga ahi, y nadie recibira su constancia.
- Y en los tipos automaticos, sin publicar **tampoco existe su regla** -> el aviso de "ya se exigen
  solos" promete algo que todavia no ha pasado.

Ahora se ve en tres sitios, cada uno contestando algo distinto:

| Donde | Que dice |
|---|---|
| Aviso arriba | *"3 módulos están sin publicar: nadie puede cursarlos, así que este programa no puede completarse"* |
| Cada modulo | `· sin publicar` o `· sin regla activa`, en ambar |
| El panel de asignar | *"Todavía no se le exige a nadie. 3 módulos están sin publicar: la regla nace al publicar cada formación"* |

Ese ultimo es el que cierra el circulo: un *"no se le exige a nadie"* a secas deja la pregunta obvia
sin contestar.

**Y sobre si mostrar las obligaciones por modulo o en general:** las dos, porque responden cosas
distintas. **Por audiencia** contesta *"¿a quien alcanza este programa?"*; **por modulo** contesta
*"¿por que no alcanza a nadie?"*. Sin la segunda, la primera deja preguntas colgando — que es
exactamente lo que paso.

**Y la tabla de personas para eximir desde el programa: NO.** Tres razones:

1. Esta pantalla es para **armar** el programa; Seguimiento es para **perseguir gente**. Mezclarlas
   empeora las dos.
2. La tabla ya existe, en Seguimiento -> Programas, abriendo la fila.
3. **Eximir desde el programa seria ambiguo**, y el cliente lo intuyo al preguntarlo: eximir es
   siempre de UNA obligacion concreta. "Eximir del programa" tendria que significar "de las ocho a
   la vez, con un solo motivo" — perdonar ocho cosas por una razon. Quien no pudo ir a la de SST si
   pudo ir a las otras siete.

### 15. VERSIONAR EL PROGRAMA: NO SE CONSTRUYE, Y POR QUE

Estaba anotado como el hueco conocido del modulo. Mirado de cerca, **no lo es**:

- **La evidencia ya esta congelada.** El `CertificateSnapshot` guarda el nombre, las horas y la
  lista de modulos aprobados. La constancia ya acredita lo que el programa era ese dia, sin
  necesidad de versionar nada.
- **Quien lo completo ya esta protegido** desde el punto 7: su ronda no se reabre.
- **Y a quien va a medias, agregarle un modulo es lo CORRECTO.** Si la empresa decide que SST entra
  en la induccion, quien no ha terminado deberia hacerla. Versionar serviria para lo contrario:
  para que siguiera cursando un programa que la empresa ya considera incompleto.

Lo que quedaria sin versionado es poder decir *"este es el programa de 2027"* como documento. Eso es
una necesidad de archivo, no de cumplimiento, y no ha aparecido. **Se deja sin hacer a proposito**, y
esta linea existe para no volver a abrirlo sin un caso nuevo.

### 16. LA COBERTURA, LEIDA POR MODULO

El bloque de estado decia a quien se le exige el programa colgando de cada audiencia un
**"(solo 2 de 5)"**. Avisa de que faltan tres y **no dice cuales**: con dos audiencias y cinco
modulos hay que ir abriendo formaciones hasta dar con los que fallan. El cliente lo pidio del
derecho: *"lo importante es saber por modulo, ejemplo induccion general cubre toda la empresa o lo
que sea que seleccionaron"*.

Se invirtio la lectura. `obtener` devuelve ahora `items[].audiencias` —quien tiene que hacer ESE
modulo, por nombre— y cada fila lo lleva debajo en una linea gris con icono de personas. El "(solo 2
de 5)" desaparecio: la lista de arriba dice los nombres a secas y remata *"Debajo, modulo a modulo, a
quien alcanza cada uno"*.

Sale de **una sola lectura** de `reglasActivas`, invertida de dos maneras, asi que las dos vistas no
pueden discrepar. Cuando un modulo no alcanza a nadie **la linea no aparece**: eso ya lo grita la
marca en rojo de la fila, y decirlo dos veces es justo lo que hacia confusa la pantalla.

Cuatro comprobaciones nuevas lo fijan (**I35-I38**): cada modulo dice a quien alcanza, el que no
alcanza a nadie sale con lista **vacia** y no omitido, los nombres coinciden con la vista agrupada y
las cuentas cuadran con lo que declara la audiencia.

### 17. LOS DOS BLOQUEOS QUE SE DESCARTARON

Se pregunto si conviene **impedir** agregar a un programa una formacion sin publicar, o una sin
obligaciones. Las dos se descartan por lo mismo: **invierten el orden natural del trabajo.**

Un programa se arma *antes* de decidir a quien se le exige — el boton "Asignar" del programa existe
justo para exigir los cinco modulos de una vez, cosa imposible si cada uno tuviera que llegar ya
exigido. Y se arma mientras sus formaciones todavia se estan escribiendo. Bloquear obligaria a
recorrer formacion por formacion primero, que es exactamente lo que el programa venia a evitar.

Y no aportaria informacion: las dos situaciones ya se **ven** —`(sin publicar)` en el selector, la
marca en la fila, el bloque de "que falta para que funcione", el aviso al publicar—. Un bloqueo solo
aplazaria el problema y esconderia que existe. Queda anotado en `docs/modulos/programas.md` §11 para
no reabrirlo sin un caso nuevo.

### En que queda

**Programas entero (11.1 a 11.7) hecho y verificado en dev. Sigue SIN DESPLEGAR**, por la misma
instruccion de las sesiones anteriores. Verificado en verde de punta a punta: **582 unitarias, 128
comprobaciones de la matriz, e2e, typecheck, lint y build**. Todo ese trabajo —tres migraciones incluidas— sigue **sin comitear** en `main`:
es lo primero que conviene decidir al retomar. Sin empezar: la vista agregada de Programas en
Seguimiento (ofrecida, no pedida).

---

## 2026-09-15 (continuacion 2) — REINDUCCION COMO PROGRAMA: la ronda que se abre sin pisar la anterior, y tres preguntas de negocio cerradas

Seguia abierta una duda del cliente sobre Programas: ¿como encaja un programa con formaciones que
SE REPITEN (Reinduccion, cada tanto) si `PathEnrollment` solo tenia una fila por persona-programa,
para siempre? Si alguien completaba la ronda 1, esa fila quedaba `COMPLETED` de forma permanente —
aunque el motor le volviera a abrir la obligacion un ano despues, el programa seguiria mostrandose
completo y jamas emitiria una segunda constancia.

### 1. EL DISENO: UNA FILA POR RONDA, mismo patron que `CertificationGrant`

`PathEnrollment.cycleNumber` (migracion `20260915120000_programa_ciclo`), unico ahora por
`(pathId, userId, cycleNumber)`. El programa NO tiene su propia recurrencia — no hay un campo "cada
cuanto vence este programa completo" (la nota ya existente en `emitirPorPrograma` lo explicaba) — la
recurrencia vive en cada modulo, en su propia `AssignmentRule`. Asi que la ronda del PROGRAMA sale
de las rondas de sus MODULOS: `cicloDePrograma()` (`program-completion.ts`) toma la MAS ADELANTADA
de las `Assignment.cycleNumber` de sus modulos rastreados por el motor, nunca la mas atrasada — en
cuanto UN modulo abre su ronda 2, el programa entero pasa a "ronda 2 en curso" y los demas modulos
van cayendo en pendientes segun se les abre SU propia ventana, no todos el mismo dia. Nunca
retrocede: una regla borrada o desactivada no hace caer a un programa que ya iba en la ronda 3 de
vuelta a la 1.

`ProgramsService.recalcularProgreso` ahora decide, por cada modulo, si esta aprobado leyendo su
`Assignment` MAS RECIENTE (no su historial de `Enrollment`, que no distingue rondas): aprobado
significa que esa `Assignment` esta en la MISMA ronda que el programa y en estado `COMPLETED`. Un
modulo que nunca paso por el motor (sin regla que lo alcance) sigue el camino de siempre —
"¿hay un `Enrollment` aprobado alguna vez?"— porque tampoco tiene rondas que distinguir. Cuando la
ronda calculada es mayor a la que tenia la inscripcion, **no se pisa la fila vieja: se crea una
nueva** — la de la ronda anterior queda intacta, con su constancia, para siempre. `misPrograms`
(la vista del aprendiz) usa el mismo criterio, para que un modulo que ya se debe de nuevo no siga
apareciendo con el visto verde de la ronda pasada.

Verificado con un script de punta a punta contra la base de dev (borrado, no se guardo en el repo:
crea dos modulos con `Assignment` reales, cierra la ronda 1 completa con constancia, abre la ronda 2
de un solo modulo a mano, comprueba que el programa NO completa y que la fila de la ronda 1 sigue
`COMPLETED` sin tocar, completa el segundo modulo en su ronda 2, y comprueba una SEGUNDA constancia
distinta con la primera intacta). Mas 5 pruebas nuevas de `cicloDePrograma` en
`program-completion.spec.ts`. Suite completa: 546/546 unitarias, tsc y eslint limpios.

### 2. TRES PREGUNTAS DE NEGOCIO, RESPONDIDAS (no hacian falta cambios de codigo)

- **¿Un modulo de Induccion Especifica en un programa interfiere con la matriz por cargo?** No. La
  matriz crea su `AssignmentRule` directo sobre la formacion, sin saber si esta en un programa; el
  programa solo OBSERVA cuando se cierra cada modulo para sumar progreso. Son capas separadas.
- **¿Para que sirve entonces el boton "Asignar a una audiencia" de un programa, si la matriz ya
  cubre los cargos?** Para alcanzar por eje que la matriz no entiende — area, regional, servicio —
  cuando la exigencia no es "todo el que tenga este cargo" sino "todos en esta regional, sea cual
  sea su cargo".
- **Induccion General: el cliente aclaro que NO es una sola charla de bienvenida — CADA proceso
  (SGI, SST, PESV...) tiene su propia formacion de ese tipo, y quiere un programa que agrupe VARIAS
  como obligatorias al entrar.** Con eso, la conclusion cambia: como cada modulo de tipo Induccion
  General YA se asigna solo a toda la empresa al publicarse, un programa asi **no necesita usar el
  boton de asignar en absoluto** — publicar los modulos y publicar el programa ya cubre a todos.
  Queda pendiente (no hecho) un aviso en el panel de "Asignar" que detecte este caso y lo diga en
  vez de dejarlo adivinar — ver PENDIENTES 11.7.

### 3. UI: tres reversiones pedidas viendo la pantalla

"Agregar modulo" volvio a ser un formulario en linea (no un Drawer aparte), el panel de "Asignar a
una audiencia" perdio el `sticky`/scroll propio (se sentia poco fluido con muchos modulos), y su
parrafo explicativo se redujo a un icono de informacion con un popover, en vez de ocupar espacio
siempre visible. `apps/web/src/app/(admin)/programas/[id]/page.tsx`.

### En que queda

11.1 a 11.6 (Programas entero, incluida la recurrencia) **hechos y verificados en dev, NO
desplegados**. Sin empezar: el aviso de "esta asignacion es automatica" para programas de Induccion
General (11.7), y la vista agregada de Programas en Seguimiento (ofrecida, no pedida).

---

## 2026-09-15 — PROGRAMAS: 11.3, 11.4 y la constancia lista sus modulos — todo lo abierto, cerrado

Sesion larga, sobre el mismo bloque de Programas que se dejo listo Fase 1/2 el dia anterior. Se
cerraron 11.3 y 11.4 enteros, y salio una pieza mas (11.5, la constancia lista sus modulos) de una
pregunta del cliente viendo la pantalla.

### 1. 11.3 — ASIGNAR UN PROGRAMA, SIN INVENTAR UN MOTOR NUEVO

`ProgramsService.asignarAudiencia` no crea un requisito de tipo PATH: llama a
`AssignmentsService.setActivityRequirement` UNA VEZ POR MODULO, con la misma audiencia y el mismo
plazo. Se probo en vivo con dos modulos de tipo "Capacitacion del plan" y el motor aplico la regla
PLAN (Decision #76) sola, sin que el codigo nuevo supiera nada de ella — la prueba de que delegar
en el motor de siempre, en vez de reimplementar sus reglas, fue la decision correcta.

### 2. 11.4 — LA INTERFAZ ENTERA, ADMIN Y APRENDIZ

Admin: `/programas` (listado, filtro por estado, tarjetas con portada generada — mismo mecanismo
que `ActivityCover`, color fijo `#4338ca` para que un programa se reconozca en cualquier tenant sin
leer la palabra) y `/programas/[id]` (modulos con reordenar arriba/abajo — nuevo:
`PathItem.displayOrder` existia y nada lo dejaba cambiar—, drawer para agregar/editar en vez de un
formulario siempre abierto, panel de "Asignar" `sticky` para que no se pierda de vista con muchos
modulos, descripcion editable en linea, y "Volver a borrador" en vez de "Despublicar").

Aprendiz: tab "Programas" en Mi aprendizaje, fila "Programas" en Hoy —con su propio filtro y el
MISMO criterio de prioridad que ya usa esa pantalla (lo empezado antes que lo no empezado)— y
`/programa/[id]`, que ensena los modulos como CONTENIDO, no como una tabla de estados.

Se agrego `LearningPath.description` (migracion `20260915090000_programa_descripcion`): un programa
tambien necesitaba poder decir de que trata antes de que alguien vea sus modulos, igual que ya
puede una `Activity`.

### 3. UNA PREGUNTA DEL CLIENTE DESTAPO UN HUECO REAL, Y SALIO 11.5

Viendo el PDF de una constancia de programa, la pregunta fue "¿por que no dice que modulos
tenia?". La respuesta completa: NINGUNA constancia lo dice hoy, ni las de programa ni las
sueltas — `CertificateSnapshot.formacion.syllabus` se guarda desde el Sprint 5 y nunca se
imprime, en ningun lado. Se construyo el campo "Modulos" en el diseñador de plantillas
(`certificate-pdf.ts` gano soporte para texto MULTILINEA, el unico campo que lo necesita) y se
dejo APAGADO por defecto, igual que cargo/area/tipo — solo dice algo en una constancia de
programa, y en una suelta sale vacio.

**Un bug real que aparecio al construirlo, y que afectaba a CUALQUIER campo nuevo, no solo este.**
La pantalla de plantillas solo mostraba la casilla de un campo si YA estaba en el JSON guardado de
esa plantilla — una plantilla creada antes de que existiera "Modulos" no tenia forma de encenderlo
nunca, por ningun camino de la interfaz. Se corrigio rellenando por CAMPO, no solo cuando toda la
plantilla estaba vacia (`configuracion/constancias/page.tsx`, funcion `abrir`): ahora cualquier
campo nuevo que se agregue en el futuro aparece solo, sin migrar datos.

**Sin colocar en la plantilla real del cliente**, a proposito: eso es una decision de diseno que le
toca a quien arma el arte, no algo que se deba encender desde aqui.

### 4. UN HALLAZGO SIN EXPLICACION CONFIRMADA, ANOTADO PARA NO OLVIDARLO

Durante la verificacion visual aparecieron 4 modulos de formaciones de prueba (de otras corridas)
enganchados al programa de demostracion, sin que ningun codigo escrito hoy los pusiera ahi a
proposito. Se limpiaron a mano y no se repitio en las corridas siguientes de la suite completa
(25/25 dos veces), pero la causa exacta no se identifico. Si vuelve a aparecer algo asi —modulos en
un programa que nadie agrego a mano— es la pista para retomar.

### En que queda

11.1 a 11.5 (Programas, entero: motor, constancia, asignacion, interfaz admin y aprendiz, campo de
modulos en la plantilla), **hechos y verificados en dev — nada desplegado a produccion**, por la
misma instruccion de la sesion anterior. `e2e/programas.spec.ts` los cubre de forma permanente.
`scripts/limpiar-datos-de-prueba.ts` ahora tambien recoge programas de prueba (antes solo
formaciones y personas), asi que el bloque entero de Programas ya no deja basura en la base de
desarrollo.

Sin empezar: la vista agregada de Programas en Seguimiento (una fila por programa con su % de
cumplimiento, en vez de ver solo los modulos sueltos) — se ofrecio como mejora opcional, no como
hueco, y el cliente no la pidio todavia.

---

## 2026-09-14 (continuación) — FASE 2 DE PROGRAMAS: la constancia del conjunto, terminada

Se retomó exactamente donde se cortó la sesión anterior (`PENDIENTES` 11.2) y se terminó Fase 2 completa.

**Lo que se escribió.** Migración `20260914200000_certificados_programa` (columna `certificates.path_enrollment_id`
+ índice único parcial `WHERE path_enrollment_id IS NOT NULL`, espejo exacto del patrón de
`enrollment_id`), aplicada en dev con el usuario owner. `CertificatesService.emitirPorPrograma()`:
agrega el `PathEnrollment` completo, arma un `CertificateSnapshot` (nombre del programa, "Programa"
como tipo, horas = suma de las de los MEJORES intentos de cada módulo aprobado, no de todos los del
programa), reusa `plantillaActiva` / `SequenceService` / el mismo pipeline de PDF, y es idempotente
por el índice nuevo — igual patrón que `emitirPorEjecucion`. Enganchado en
`ProgramsService.recalcularProgreso`: cuando marca `recienCompletado: true`, llama a
`emitirPorPrograma` sin tumbar el recálculo si falla (mismo principio que ya regía la individual).

**Sin vigencia propia, a propósito.** Un programa no tiene una `AssignmentRule` propia con su
recurrencia — la tienen sus módulos, cada uno la suya — así que `validUntil` queda `null`: acredita
que se completó, sin fecha de caducidad del conjunto. Documentado en el propio método para que no se
lea como un descuido.

**La prueba que faltaba, la que pidió el cliente explícitamente.** La sesión anterior dejó anotado
que faltaba "una petición HTTP en vivo, no un script aislado de verificación de reglas". Se escribió
`scripts/verificar-constancia-programa.ts`: autocontenida (crea programa + 2 módulos + persona +
2 ejecuciones dentro del tenant real de dev, con nombres `E2E-PROG-<timestamp>`),
llama a los servicios REALES (`ProgramsService.recalcularProgreso`, que a su vez llama a
`CertificatesService.emitirPorPrograma`), y limpia todo lo que crea al terminar, éxito o fallo.
Comprueba, contra la base y no contra lo que devuelve la llamada: con 1 de 2 módulos no hay
constancia; al completar el segundo se emite una con el snapshot correcto (nombre, tipo, horas);
un segundo recálculo no duplica. Los tres, en verde.

**Un tropiezo real, y por qué se cambió de estrategia.** El primer intento montaba los servicios con
`Test.createTestingModule` de Nest, igual que un test de integración normal. Fallaba con
`Cannot read properties of undefined (reading 'scoped')` dentro de `ProgramsService` — no un error
de Nest, un `undefined` silencioso. La causa: `tsx` (esbuild) NO emite `design:paramtypes`, el
metadato de tipos de constructor del que depende la inyección por decoradores, aunque el `tsconfig`
pida `emitDecoratorMetadata: true` — eso solo lo hace `tsc`. El DI de Nest resolvía cada provider por
separado sin quejarse, pero no sabía qué pasarle al constructor de los que dependen de otros. Se
confirmó con un script aparte (`Reflect.getMetadata('design:paramtypes', ProgramsService)` devolvía
`undefined`) y se resolvió instanciando los servicios A MANO — sin pasar por el contenedor de Nest,
sin necesitar ese metadato. Fuera de este script no cambia nada: la API real siempre corrió
compilada con `tsc`.

### En qué queda y con qué seguir

Fase 1 y Fase 2 de Programas, **hechas y verificadas en dev, sin desplegar**. Lo que sigue, en orden,
es `PENDIENTES` 11.3 (cómo matricular gente a un programa — dar la recomendación pendiente) y 11.4
(la interfaz, que no existe todavía ni para admin ni para el aprendiz).

---

## 2026-09-14 — PROGRAMAS: agrupar formaciones y certificar por el conjunto (Fase 1 hecha, Fase 2 a medias)

Sesión larga, sobre todo de motor. Cerró 8.3 (racha de cumplimiento en el titular de Inicio) y 5.1/5.2
(avisos de repaso configurables, fila única en Seguimiento) al arrancar, y el grueso fue construir
**Programas**: el cliente quiere formaciones agrupadas ("Gestión Humana", "Comercial"...) bajo un solo
programa, vistas y **certificadas como un conjunto**, no una por una. Y un susto de seguridad real, aunque
no disparado, por el camino.

### 1. LO QUE YA EXISTÍA Y NADIE HABÍA CONSTRUIDO

Antes de inventar tablas, se buscó en el esquema — y **`LearningPath` / `PathItem` / `PathEnrollment`
ya estaban en Prisma, sin una sola línea que los usara**. `PathItem.isRequired` (módulo obligatorio,
salta la cuota) y `PathItem.sectionName` + `minRequiredInSection` (cupo de "N de M" por sección) son
justo las dos piezas del caso real del cliente: *«si de 8 módulos hay uno, ejemplo Gestión Humana, debe
aprobarlo sí o sí»* — obligatorio + cupo opcional en el resto, combinados. `Certification.awardedByType:
ACTIVITY | PATH` también estaba anticipado y sin usar.

### 2. FASE 1: LA REGLA Y EL ENGANCHE AL CIERRE — hecha y verificada en dev

`program-completion.ts` (`evaluarPrograma()`) es lógica pura, sin base de datos: 8/8 pruebas, incluido
el escenario exacto del cliente. `programs.service.ts` trae el CRUD, `esModuloDeUnProgramaPublicado()`
y `recalcularProgreso()`. Se enganchó en **los dos puntos donde una formación se cierra**
(`completion.service.ts`: cierre por contenido y cierre por CUALQUIER mecanismo de asistencia — QR,
firma, lista del instructor, que convergen todos en `cerrarPorAsistencia`), con la regla que pidió el
cliente explícitamente: *«que si es un programa no emita certificados individuales y que solo emita
individual cuando no pertenece a un programa»*.

**Verificación, no solo lectura del código:** un primer script de comprobación devolvió `false` en un
caso que debía dar `true` — porque usaba `SET LOCAL app.tenant_id` en una sentencia raw suelta, y
`SET LOCAL` es de transacción, no sobrevive a la siguiente llamada. Se corrigió envolviendo todo en
`$transaction`, igual que hace `PrismaService.forTenant()` de verdad, y los tres escenarios de
asistencia pasaron limpios.

**Sin desplegar a producción**, por instrucción explícita: *«no despliegue a producción si consume
mucho, toques solo dev por ahora»*.

### 3. FASE 2: LA CONSTANCIA DEL PROGRAMA — investigada, sin escribir

Se leyó entero el pipeline de constancias (`certificates.service.ts`, `certificate-render.service.ts`,
`certificate-pdf.ts`, `certificate-policy.ts`) para confirmar algo importante: **el renderizador no
sabe ni le importa si una constancia es de una formación o de un programa** — solo lee campos genéricos
del `CertificateSnapshot` guardado. Así que Fase 2 no toca el PDF, la vista previa, la descarga ni la
verificación pública: solo necesita un campo nuevo `Certificate.pathEnrollmentId` (espejo exacto de
`enrollmentId`, mismo índice único parcial) y un método de emisión que arme el snapshot con los datos
del programa. **Quedó documentado en `PENDIENTES` 11.2 para retomarlo justo ahí**, sin código nuevo
todavía — se cortó al quedarse sin contexto de sesión, y seguir a medias con un `git status` sucio
habría sido peor que parar limpio y anotar el punto exacto.

### 4. EL SUSTO DE SEGURIDAD: LA CARPETA DE CREDENCIALES DENTRO DEL REPOSITORIO

Apareció `ASCENT - ENTREGA TRANSPRENSA` (sin trackear, nunca comiteada) dentro del repo. Se sacó fuera
y se reforzó el `.gitignore` como cinturón de más, no como única defensa. La pregunta del cliente —*«por
qué esa carpeta debe estar fuera, no entiendo, hay una que dice entra y esta tiene más cosas»*— tiene
una respuesta de una línea: **`docs/entrega/` solo lleva plantillas institucionales que nunca cargan un
secreto real; la carpeta de credenciales SÍ está diseñada para recibir, en algún momento, una contraseña
de acceso real rellenada a mano.** Una es documentación; la otra es, por diseño, portadora de secretos.
Nunca debe entrar al repo — ni siquiera sin comitear es cómodo tenerla ahí, porque un `git add -A`
distraído no distingue.

### 5. EN QUÉ QUEDA Y CON QUÉ SEGUIR

**8.3, 5.1, 5.2 desplegados y verificados en producción.** Programas: Fase 1 hecha y probada solo en
dev, Fase 2 sin código (investigación completa, ver `PENDIENTES` 11.2 para el punto exacto de
continuación). Sin decidir todavía: **cómo matricular gente a un programa** —el cliente preguntó cuál
es la forma más fácil para un admin, y quedó pendiente dar la recomendación (`PENDIENTES` 11.3)— y no
hay pantalla de administración ni de aprendiz para programas, solo la API (`PENDIENTES` 11.4).

**Lo que NO se llegó a hacer y hay que recordar al retomar:** una prueba end-to-end real, completando
una inscripción de verdad en la base de dev (no solo el script aislado de verificación de reglas), para
confirmar que la cadena cierre→supresión→progreso de programa dispara igual en una petición HTTP en
vivo — el cliente lo pidió explícitamente (*«debes probar todas las posibles cosas o situaciones que
puedan pasar»*) y quedó cubierto solo en parte por presupuesto de sesión.

---

## 2026-09-09 (noche) — ASCENT EN PRODUCCIÓN: el nombre, la máquina, y los tres fallos que solo se ven desplegando

La sesión más larga del proyecto, y la que más cambió: el producto **dejó de llamarse NEO PULSE y se
llama ASCENT**, tiene dominio propio, una máquina en Miami, copias de seguridad probadas y un cliente
entrando por `https://transprensa.ascentio.app`. Y por el camino aparecieron **tres fallos que no
podían aparecer en desarrollo**, dos de ellos de la clase que borra datos de un cliente.

---

### 1. EL NOMBRE: ASCENT, Y QUÉ NO SE RENOMBRÓ

`ascentio.app` estaba libre y costaba poco. La empresa es **AION**; **Ascent** es el producto.

Lo que **sí** cambió: lo que ve una persona (la pantalla de entrada, los documentos de entrega, el
dominio) y el repositorio, que ahora es `neolabia-hub/ascent`.

Lo que **NO** cambió, a propósito: el *scope* de los paquetes sigue siendo `@neo-pulse/api`,
`@neo-pulse/web`, `@neo-pulse/shared`, el proyecto de Compose sigue siendo `neo-pulse`, los roles de
Postgres siguen siendo `neopulse*` y la carpeta del repo en el disco sigue llamándose
`Transprensa - NEO PULSE`.

**Por qué no.** Un renombrado de *scope* toca cada `import` del monorepo, los `moduleNameMapper` de
Jest, los nombres de volumen de Docker y los roles de la base — y **los volúmenes y los roles son
datos, no código**: renombrar el proyecto de Compose en la máquina de producción haría que
`docker compose up` creara **volúmenes nuevos y vacíos** y levantara una plataforma sin nada, con la
base vieja intacta pero desconectada. El nombre interno no lo ve nadie; el riesgo de cambiarlo, sí.

> Si algún día se hace: con la plataforma parada, con copia verificada, renombrando los volúmenes a
> mano — y nunca el mismo día que otra cosa.

---

### 2. LA MÁQUINA, EL DOMINIO Y EL VÍDEO

| | Qué |
|---|---|
| **Servidor** | Vultr High Performance, Miami · 2 vCPU / 4 GB / 128 GB · USD 24 + 4,80 de copias |
| **IP** | `45.63.107.34` · usuario `linuxuser` (con sudo) · entrada solo por llave |
| **Dominio** | `ascentio.app` en Namecheap, DNS en Cloudflare |
| **Certificados** | Caddy, automáticos (Let´s Encrypt, HTTP-01) |
| **Vídeo y archivos** | Cloudflare R2, bucket `ascent-media`, enlaces firmados |

**Por qué Vultr y no Hetzner**, que era la primera opción: Hetzner subió los precios de sus máquinas
de Estados Unidos en junio de 2026 y la diferencia se cerró; Miami está a ~40 ms de Colombia y
Falkenstein a ~200. Para vídeo, esa latencia es la diferencia entre «arranca» y «carga».

**Por qué R2 y no la propia máquina.** Si el vídeo sale del servidor, su ancho de banda es el techo
de cuánta gente puede ver una formación a la vez: cinco personas viendo un vídeo de 8 Mbps ya son
40 Mbps sostenidos. R2 no cobra salida —es la razón entera de elegirlo— y la máquina se queda para lo
que sabe hacer.

**Las tres llaves SSH son tres a propósito**: la del PC al servidor (`ascent`), la del PC a GitHub
(`github_neolabia`) y la del servidor a GitHub (`deploy_ascent`, de **solo lectura** y solo para este
repositorio). Si un día hay que revocar una, las otras dos siguen vivas.

---

### 3. EL PRIMER FALLO: LA CADENA DE MIGRACIONES NUNCA SE HABÍA CORRIDO DESDE CERO

El despliegue murió en la migración `20260902010000_area_un_solo_responsable`:

```
column "responsible_user_id" does not exist
```

En desarrollo la columna existía **porque una migración posterior la había creado y la base local
llevaba meses acumulando estados**. Sobre una base vacía, la cadena se lee en orden, y ese orden
estaba mal. Nadie lo había visto porque **nadie había corrido nunca las migraciones desde cero**: en
desarrollo, `migrate dev` va aplicando lo nuevo sobre lo que ya hay.

Arreglo: `ADD COLUMN IF NOT EXISTS` antes del `UPDATE`, y la migración hermana
(`20260902120000_area_responsable`) hecha idempotente entera — la columna, la restricción (dentro de
un `DO` que consulta `pg_constraint`) y el índice.

Recuperar la máquina fue `prisma migrate resolve --rolled-back` **y reconstruir la imagen**, porque
las migraciones viajan **dentro** de la imagen de la API: corregir el archivo en el disco no cambia
lo que hay en el contenedor.

> **REGLA NUEVA, y va en `docs/05-reglas-de-despliegue.md`:** toda migración se prueba **desde una
> base vacía** antes de subir. Un Postgres de usar y tirar, `prisma migrate deploy`, y que llegue al
> final. Una cadena que solo funciona sobre una base con historia no es una cadena de migraciones:
> es una casualidad.

---

### 4. EL SEGUNDO FALLO, Y ESTE ERA EL GRAVE: LA SEMILLA BORRABA LO QUE HACÍA EL CLIENTE

El cliente lo dijo así, y llevaba días diciéndolo: *«lo que noté en dev es que a veces borraba el
logo y el color secundario, no sé por qué»*.

No era «a veces». Era **cada vez que se ejecutaba la semilla**. `prisma/seed.ts` usaba `upsert` con
un `update` lleno de valores — y **el `update` de un `upsert` es una escritura sobre datos vivos**.
Así que cada despliegue con `RUN_SEED=true` devolvía el logo al de fábrica, el color secundario al de
fábrica, y la **nota mínima de 90 que había puesto el cliente, al 75 por defecto**.

La regla nueva, escrita en la primera línea del archivo para que no se pueda ignorar:

> **LA REGLA DE ESTA SEMILLA: APORTA DEFECTOS, NO VERDADES.**
> Crea lo que falta. **Nunca corrige lo que existe.** Si una fila ya está, la semilla no la toca.

En código, eso fue:

- El tenant se lee antes con `findUnique` y sus `settings`/`branding` se **mezclan** con los defectos
  por debajo: `{ ...porDefecto, ...existente }` — lo del cliente gana siempre.
- Catálogos, roles y políticas de retención: `update: {}`. Vacío, literal. Si existe, no se toca.
- Los tipos de actividad conservan su `config` mezclada (solo se fuerza `isSystem`, que es
  estructura, no decisión de nadie).
- `rolePermission.deleteMany` —que borraba **todos** los permisos de un rol para volver a
  escribirlos, incluidas las excepciones dadas a mano— pasó a `createMany({ skipDuplicates: true })`.

Y en producción **`RUN_SEED` se queda en `false`**. Ya no borra nada, pero alarga cada despliegue sin
motivo.

---

### 5. EL TERCER FALLO: LA PLATAFORMA NO TENÍA PUERTA

Se llegó por un camino largo. El cliente vació el contacto de soporte de su empresa esperando que
saliera el nuestro, y no salió ninguno. La razón: el contacto de la plataforma se configura en
`/plataforma`… y **`platform_users` estaba vacía**. El módulo sabía autenticar, refrescar sesiones y
bloquear cuentas, pero **no había manera de crear la primera cuenta**: ni semilla, ni script, ni
endpoint.

Se resolvió con `apps/api/scripts/crear-admin-plataforma.ts`
(`pnpm --filter @neo-pulse/api plataforma:crear-admin -- --email=… --nombre="…"`), que genera una
contraseña de 24 caracteres, la enseña **una vez** y no la vuelve a mostrar. Con `--reset` la
regenera y de paso desbloquea la cuenta.

**Por qué un script y no una semilla:** una cuenta con acceso a TODAS las empresas no se crea sola al
desplegar. Sembrarla sería dejar una puerta con contraseña conocida en cada instalación del producto.

---

### 6. Y UN CUARTO, PEQUEÑO Y CARO: `NEXT_PUBLIC_API_URL`

Con `NEXT_PUBLIC_API_URL=https://ascentio.app`, `transprensa.ascentio.app` respondía *«No pudimos
conectar con el servidor»*. La variable se hornea en el JavaScript del navegador **en tiempo de
compilación**, así que el navegador de un tenant pedía a otro dominio y el CORS lo paraba. **Se deja
vacía**: la web llama a rutas relativas y cada subdominio habla consigo mismo. Anotado en el
`.env.prod` y en las reglas.

---

### 7. LAS COPIAS: LO ÚNICO QUE HACE REVERSIBLE UN ERROR

- `scripts/backup.sh` → `pg_dump` comprimido a **R2**, diario por cron a las 03:00 UTC, con registro
  en `/opt/ascent/backups/backup.log`.
- `scripts/restaurar-prueba.sh` → **restaura en una base de usar y tirar**, cuenta las filas y la
  borra. Producción no se toca. **Se probó**, y esa es la diferencia entre tener copias y creer que
  se tienen.
- Encima, las copias automáticas de Vultr (USD 4,80/mes): son lo único que respalda los secretos que
  viven **solo** en la máquina (`private.pem`, `REFRESH_TOKEN_PEPPER`, `MEDIA_URL_SECRET`).

Y `docs/05-reglas-de-despliegue.md`, escrito a petición explícita del cliente: los seis comandos
prohibidos —`docker compose down -v` el primero—, qué quita el acceso a la gente sin avisar, los
cinco pasos de un despliegue con la copia **antes**, y §3 bis: **antes de producción, siempre se ve
en dev**. Esa última es regla del cliente y aplica a todo, no solo a lo grande.

---

### 8. LA ENTREGA, Y LA RONDA DE INTERFAZ DEL FINAL

**El archivo de credenciales vive FUERA del repositorio**, en
`C:\Users\Prueba\Documents\ASCENT - CREDENCIALES Y ACCESOS.md`. No es orden: dentro, un `git add .`
distraído lo sube, y **una credencial que llegó a un repositorio ya no se arregla borrando el
commit** — hay que rotarla.

Y con el cliente delante, la última ronda de pantalla:

- **La entrada**: se quitó el bloque de texto largo y quedó un lema («Se entra con tu número de
  cédula») y **una sola cara**: «No puedo entrar» voltea el panel en vez de abrir un desplegable.
- **Las acciones de una persona: cuatro formas, y las tres primeras las tumbó el cliente con la razón
  puesta.** Siete iconos por fila → cinco desplegándose en la fila (*«hace lo mismo que antes»*, y
  era cierto) → un menú con palabras (una tarjeta más encima de la tabla) → **cuatro acciones siempre
  visibles —editar, estado, perfil y los tres puntos— y las cuatro excepcionales flotando en
  círculos, sin tarjeta y sin fondo**, saliendo escalonadas del propio botón. El estado salió del
  menú porque entra y sale gente todos los días, y esconderlo costaba dos gestos.
- **El expediente pasó a llamarse Perfil y dejó de ser una ventana: es una página**
  (`/usuarios/[id]`), con banda de la marca, las cuatro cifras, lo que le falta, su trayectoria, sus
  constancias y sus papeles. La razón del cliente: *«página completa, es tipo perfil con todo lo
  importante»*. Una ventana obliga a cerrarla para seguir; una página se comparte por enlace, se abre
  en otra pestaña y se imprime.

---

### 9. EN QUÉ QUEDA Y CON QUÉ SEGUIR

**Producción viva y verificada**, suite en verde, copias probadas. Lo abierto, por orden:

1. **Rotar lo que se escribió en una conversación**: las cuatro claves de R2 y la contraseña de la
   cuenta de plataforma. Cómo, en el archivo de credenciales §2 y §3.
2. **Decidir el correo de soporte de verdad.** `soporte@ascentio.app` existe pero **no lo atiende
   nadie**: si llega un mensaje, se queda ahí. Hasta decidirlo, el contacto que ve el cliente no
   debería prometer atención.
3. **Limpiar los datos de prueba en producción**: el contacto de soporte de TRANSPRENSA dice
   «administrador de todo el mundo» y «lunes a viernes no llame». Se corrige en *Configuración*.
4. **Vigilancia**: no hay nada. Hoy el primer aviso de que algo se cayó lo daría el cliente. Sentry
   (gratis hasta 5.000 sucesos) más un vigilante de disponibilidad sobre `/v1/health` es una tarde, y
   sirve para Ascent **y** para SAC-NEO desde la misma cuenta.
5. Y lo de siempre: la **transcripción automática** de los vídeos (`PENDIENTES` 9.4), el **repaso**
   (5.1) y la **fila por persona en Seguimiento** (5.2).

**LibreOffice no está instalado** (no cabe en 4 GB): un `.pptx` se rechaza pidiendo el PDF. Es una
decisión, no un olvido — si molesta, la máquina de 8 GB cuesta USD 24 más.

---

## 2026-09-09 — Las evaluaciones enteras, el verde del tenant, la cicatriz de las tildes y el Sprint 6

Sesión corta, toda con el cliente leyendo la pantalla.

### 1. EL FONDO Y LAS TARJETAS ESTABAN A 1,5 PUNTOS

Lo dijo mirando: *«no hace contraste con las tarjetas»*. Y era medible: fondo `#f7f8fa` contra
tarjeta blanca — **1,5% de luminancia**. A esa distancia el ojo no separa dos superficies, así que la
tarjeta dejaba de leerse como tarjeta y la pantalla entera parecía una hoja con líneas encima.

El fondo baja a `#eceff4` (~7 puntos). **Se mueve el fondo y no la tarjeta**, a propósito: la tarjeta
es donde se lee y se escribe, y el blanco puro es lo que le da al texto el máximo contraste. El borde
baja un paso con él, o se habría perdido contra el fondo nuevo. En oscuro no se toca nada: allí la
separación ya era de nueve puntos, que es justo lo que faltaba en claro.

### 2. LAS EVALUACIONES: TRES PALABRAS QUE NO EXPLICABAN NADA

Las tres preguntas del cliente fueron, literalmente, *«qué es tema»*, *«qué es biblioteca»* y *«de
dónde se administra el banco»*. Las tres tenían la misma forma: el producto usaba una palabra suya
sin decir qué significaba **en el sitio donde aparece**.

- **Tema.** Es una etiqueta de la pregunta y sirve para **una sola cosa**: que un bloque al azar
  pueda decir «saca 10 de este montón». No cambia la pregunta, no sale en el examen y no altera lo ya
  respondido. Ahora lo dice el propio campo, y el del bloque al azar también.
- **Banco.** «Reutilizar una / De las ya escritas» pasa a **«Traer una ya escrita / Del banco: todas
  las preguntas de la empresa»**. La palabra ya no hay que adivinarla.
- **Biblioteca.** Era lo peor: no es un sitio al que se vaya. Pasa a **«Traer una lección ya creada»**.

**Y lo que faltaba de verdad no era vocabulario, eran dos puertas:**

1. **Un tema no se podía renombrar.** Se creaba al vuelo tecleándolo y se podía borrar —si estaba
   vacío—, así que uno mal escrito el primer día se quedaba mal escrito para siempre. Ahora hay un
   gestor con la lista, **cuántas preguntas tiene cada uno**, renombrar y borrar. Vive **dentro del
   editor** y no en una pestaña propia, por lo mismo que la Decisión #84 quitó el banco: nadie entra
   a «administrar temas», entra a armar un examen y se topa con que el tema está mal.
2. **Una pregunta no se podía sacar del banco.** El endpoint existía desde el Sprint 2 y ninguna
   pantalla lo usaba: la lista solo crecía. Ahora se retira desde el buscador — y **retirar no es
   borrar**: lo que alguien respondió apunta a la versión que respondió, y borrarla dejaría ese
   intento sin enunciado, que es lo que un auditor pide ver.

**Y una comprobación que evitó trabajo:** el cliente dijo que crear una evaluación pedía «nombre y
descripción». Se miró: pide **solo el título** —«las preguntas se escriben dentro, viendo cómo van a
quedar»—. Lo de nombre y descripción es de **crear una lección**. No se tocó nada.

### 3. Y DOS RESPUESTAS QUE NO ERAN CÓDIGO

**«¿El acta se genera igual si la lista la tomó el instructor?»** Sí, y ya estaba: el acta no lee el
QR, lee la tabla donde escriben los tres mecanismos. Se le puso su recorrido (`acta-de-lista.mjs`)
para no volver a contestarlo de memoria.

**«¿Para qué pedir asistencia si la evaluación y la encuesta se hacen en la plataforma?»** Tiene
razón en el caso normal, y por eso está anotado como `PENDIENTES` 2.7: hoy la jornada elige una de
las dos vías y no puede llevar lista *además*. Lo que falta es decidir si se ofrece una tercera —
asistencia como **evidencia**, sin que cierre nada—, que es una decisión suya y no nuestra.

### 4. EL FONDO, SEGUNDA VEZ: LO QUE SE MIDE Y LO QUE SE VE

El primer arreglo llevó el fondo de `#f7f8fa` a `#eceff4` y luego a `#e8ecf2`. Sobre el papel estaba
resuelto —de 1,5 puntos de separación a 7—. El cliente volvió a mirar la pantalla y dijo: *«el
contraste no lo veo»*.

Tenía razón otra vez, y la lección es que **la medida no era la buena**. Siete puntos de luminancia
bastan cuando las dos superficies se tocan; aquí no se tocan: entre el fondo y la tarjeta hay un
borde claro, sombras suaves y mucho aire, y cada uno de esos tres se come parte de la diferencia.

Queda en **`#dfe5ee`** (~11 puntos), con el borde bajando con él (`--line` a `#cfd7e2`,
`--line-strong` a `#b6c0ce`) para que no se pierda contra el fondo nuevo. Sigue siendo un gris de
oficina y no un color: lo que tiene que destacar es lo que está escrito, no la hoja.

**Regla para la próxima:** el contraste de superficies se comprueba mirando, no calculando. El número
sirve para descartar lo evidente —1,5 no puede funcionar—, no para dar algo por bueno.

### 5. EL SELECTOR DE LA FICHA: TERCERA FORMA, Y LA BUENA

Las cinco pestañas de una formación (Ficha · Contenido · Quiénes · Convocatorias · Versiones) han
tenido tres formas en dos días, y las dos primeras las tumbó el cliente mirando:

1. **Subrayadas.** *«El botón se parece a esos selectores»* — con los botones de acción al lado, un
   trazo de 2 px no distingue *dónde estoy* de *qué puedo hacer*.
2. **Pastilla rellena.** *«No me gusta cuadrado cuando está en el medio»*. Un bloque de color en
   mitad de la fila parte el recorrido en dos en vez de señalar un punto dentro de él.
3. **Una barra de progreso con paradas**, que es lo que pidió: *«tipo pipeline o tracking por
   etapas»*.

Una **línea** cruza la fila entera, va de color hasta donde estás y gris después; encima, cinco
**paradas** numeradas, con visto las ya pasadas y un anillo suave la actual. El avance se ve sin
contar nada, y la etapa activa es un punto, no un bloque — que era exactamente la queja.

El único movimiento es el de la línea al cambiar de etapa (medio segundo) y un pulso corto en la
parada nueva. **En un registro que va a auditoría el movimiento tiene que significar algo**, y aquí
significa «te has movido de sitio». Vive en `view-tabs.tsx` como `forma="etapas"`; el resto del
sistema sigue con `pastillas`, porque una lista de vistas que no llevan orden no es un recorrido.

### 6. LAS TILDES: 165 CADENAS, Y LA TRAMPA DE SINCRONIZARLAS

*«Revisa palabras mal escritas en todo el sistema»*. Las tres pasadas anteriores fueron a por el
texto entre etiquetas JSX, pero medio sistema escribe sus rótulos **como cadenas** —`label: 'Quienes'`,
los avisos de error, los textos de ayuda— y ahí no llegaba ninguna. 165 corregidas.

La línea que no se cruza: **hay cadenas que son palabras y cadenas que son nombres.** `key: 'quienes'`
viaja en `?tab=` y ponerle una tilde rompe los enlaces guardados; `'formacion'` es la clave de un
campo de la constancia. Solo se corrige una cadena si tiene un espacio dentro —ninguna clave interna
lo tiene— o si va detrás de `label:`, `title:`, `nombre:` o `placeholder:`.

**Y lo que costó de verdad fue la otra mitad:** cada rótulo corregido deja ciegas a las pruebas que lo
buscan por su texto. `scripts/sincronizar-selectores.mjs` lee el `git diff` de la web y sustituye
en las pruebas **esas mismas cadenas**, no un diccionario. Cuatro intentos, cuatro trampas, todas
pisadas antes de esquivarlas: emparejar por posición propuso `Escape -> Enter`; sustituir a pelo
renombró la función `montarFormacion`; respetar las comillas todavía renombró `${reglaArea}` dentro de
una plantilla; y exigirlo todo seguía cambiando `Areas completas`, un rótulo que no se había tocado,
porque `Area` es un trozo de `Areas`. Está contado entero en el RUNBOOK.

**Lo que NO se tocó, y es una respuesta para el cliente:** «Gestion Humana», «Capacitacion del plan»,
«Director de Gestion Humana» son **datos**, no código — nombres de catálogo guardados en la base. Se
escriben bien desde Configuración, y en producción los carga el cliente. Corregirlos en la semilla no
arreglaría ninguna base que ya exista.

### 7. LAS PREGUNTAS DE UN TEMA, QUE ERAN UN NÚMERO Y NADA MÁS

El gestor de temas de esta misma mañana decía «71 preguntas» y no había forma de ver **cuáles** — que
fue lo primero que preguntó el cliente al abrirlo. Y sin verlas tampoco había forma de vaciar un tema
para poder borrarlo: la única salida era abrir cada evaluación a buscarlas.

Ahora cada tema se despliega y enseña las suyas, con dos salidas que **no son lo mismo** y por eso
van separadas: **«Quitar del tema»** deja la pregunta en el banco y solo le borra la etiqueta —es lo
que hace falta para poder borrar el tema—; **retirar** la saca del banco entero. Se piden solo al
desplegar: cargar las de treinta temas para pintar treinta nombres sería traerse el banco para nada.

Y dice dónde se edita el texto, porque es la pregunta siguiente: **no se edita aquí**. Se trae a una
evaluación con «Traer una ya escrita» y se corrige allí, lo que crea una versión nueva sin tocar lo
que alguien ya respondió (Decisión #6).

### 8. Y LA SUITE ESTABA ROJA POR LA BASE, NO POR EL CÓDIGO

Al correr la suite entera falló `alcance-analista` esperando el diálogo de la contraseña al crear una
persona. El síntoma estaba escrito en el RUNBOOK desde el 2026-08-31 y dado por cerrado: la base de
desarrollo acumula reglas de asignación de cada corrida, el motor las evalúa **todas** al dar de alta
a alguien, y el alta se pasa de los diez segundos.

**Medido antes de tocar nada: 131 reglas activas y 453.091 obligaciones.** Y el limpiador
—`dev:limpiar-reglas`— contestaba *«Desactivadas 0»*.

La causa estaba dentro del propio limpiador. La guarda que se le puso el 2026-09-03 —no tocar la
regla de una formación publicada, después de dejar sin regla una inducción real del cliente— se
justificó con *«eso deja alguna regla de prueba viva, y son unas cuantas de más»*. **Eran 104 de
131**: hoy casi todas las pruebas publican su formación, así que la excepción dejó de ser una esquina
y pasó a ser el caso normal.

Se afinó por el **nombre**: lo que deja la suite acaba en un espacio y seis o más dígitos
(`Induccion E2E 04084758`); lo que escribe una persona, no — y la inducción que se perdió aquel día
se llamaba como la llamó su autor. **131 → 29 reglas activas.**

**La lección no es sobre reglas de asignación:** una excepción que se defiende con *«son unas pocas»*
caduca el día que dejan de ser pocas, y nadie vuelve a mirarla, porque el script sigue corriendo y
sigue diciendo que fue bien. Lo que la delató fue la **segunda línea del mensaje** —«Respetadas
104»—; sin ella habría pasado por un limpiador que no encuentra nada que hacer.

### 9. Y CINCO PRUEBAS LLEVABAN ROJAS DESDE ANTES, POR MI CULPA

Con la base ya limpia siguió fallando `convocatoria-version`, esperando el botón «Nueva lección». La
pantalla decía **«Nueva leccion»**, sin tilde. Y no era de hoy: en el commit anterior, sin tocar
nada, la prueba pedía una cosa y la pantalla decía otra.

Es la cicatriz de la pasada de tildes que se aplicó a los dos lados y luego **se revirtió solo en la
web** —el script había estropeado comentarios y se deshizo con `git checkout -- apps/web/src`—. Las
pruebas se quedaron citando una pantalla que ya no existía. Cinco specs afectadas
(`convocatoria-version`, `quienes-desde-la-ficha`, `sprint-2`, `sprint-3`, `sprint-4`), y su rojo se
parecía al de siempre: un tiempo de espera agotado, que es lo que sale también cuando la base va
lenta. Por eso las dos corridas anteriores no lo separaron.

**Se corrigió en la pantalla —las pruebas ya decían lo correcto—** y de paso quedó la herramienta que
lo encuentra sin correr nada: `scripts/selectores-huerfanos.mjs` compara los textos con acento que
piden las pruebas contra lo que la web escribe de verdad. Encontró los 14 de una vez.

**La lección, y me la apunto:** revertir a medias deja el sistema peor que no haber tocado nada,
porque el rojo que produce **no señala al sitio del error**. Si hay que deshacer una pasada que tocó
dos lados, o se deshacen los dos o se comprueba el otro antes de seguir.

### 10. Y LA SUITE ENCONTRÓ UN FALLO DEL SELECTOR NUEVO, QUE NO ERA DE LA PRUEBA

Con la base limpia y las tildes cuadradas, cinco specs seguían fallando al pulsar la pestaña
«Contenido», y por DOS motivos encadenados. El primero: al meter el número dentro de la parada, el
**nombre accesible** del botón pasó de «Contenido» a «2 Contenido». El segundo, que solo apareció al
arreglar el primero: al pasar la ficha a `ViewTabs`, esos botones dejaron de tener `role="button"` y
pasaron a `role="tab"` —que es lo correcto, hay un tablist con sus paneles—, y las pruebas seguían
pidiéndolos como botones. Once selectores actualizados a `getByRole('tab')`.

No es un problema de la prueba. El número y el visto son pistas **visuales** de posición: lo que
dicen —«vas por la segunda», «esta ya la pasaste»— ya lo dice `aria-selected` y ya lo dice el orden
de los propios botones. Quien navegue con lector de pantalla oiría el número antes que el sitio al
que va. La parada lleva ahora `aria-hidden`, y la pestaña vuelve a llamarse por su nombre.

**Vale la pena decirlo porque es el argumento de siempre al revés:** una prueba que se rompe al
cambiar la interfaz suele ser una prueba frágil. Esta no: pedía el botón por su nombre, que es como
hay que pedirlo, y se rompió porque el nombre había empeorado de verdad.

### 11. EL SEGUNDO COLOR DE LA EMPRESA, QUE LLEVABA MESES SIN USARSE EN LA ADMINISTRACIÓN

*«Tienes que usar el color secundario del tenant, no solo el primario... algunos botones podrían ser
de ese color... sin tener muchos colores.»*

Existía desde el principio: cada empresa configura **dos** colores en Preferencias → Marca,
`primaryColor` y `accentColor`. Y el segundo se usaba **solo en el lado del aprendiz**, siempre
diciendo lo mismo: **algo avanza** — la barra de una lección, el porcentaje de cobertura del plan, el
botón de continuar. En la administración no aparecía nunca.

Se añadió la variante **`acento`** al botón, y lo importante es la regla, no el color:

> El acento pinta **la acción que lleva el trabajo a su siguiente estado**. Una por pantalla.

Hoy son dos, y las dos se eligieron por esa regla:

| Pantalla | Botón de acento | Por qué no otro |
|---|---|---|
| Ficha de la formación | **Publicar cambios** | Crear una versión, descartarla o eliminar son movimientos laterales o marcha atrás |
| Lista de asistencia | **Dar por cumplida a N** | Es lo que convierte una lista marcada en formación cumplida; «Cancelar» al lado es fantasma |

**Y el límite, que es la mitad del trabajo:** si con el acento se pinta un «Guardar» cualquiera, el
color deja de significar *avance* y pasa a significar *botón* — que es lo que ya dice ser un botón.
La última frase del cliente, *«sin tener muchos colores»*, es exactamente ese criterio, y por eso
quedó escrito en el propio componente y no en un documento aparte.

Un detalle que no se ve pero se notaría: cuando el botón de acento lleva halo, el halo se pinta del
**mismo** color que el relleno. Un botón naranja con resplandor azul se lee como un error de
pintura.

### 12. Y LA PARADA, CON LA FORMA Y EL ICONO QUE PIDIÓ LA REFERENCIA

Sobre una imagen de referencia, tres correcciones al recorrido de la sesión anterior:

1. **Cuadrado redondeado, no círculo.** Un `rounded-[12px]` de 36 px tiene la forma de un icono de
   aplicación —se reconoce como algo que se pulsa—; el círculo perfecto se lee como el punto de un
   mapa.
2. **Dentro va el icono de la pestaña, no un número.** *«Que la selección actual tenga icono y
   nombre.»* Cada pestaña ya traía el suyo desde que existe la pieza —un documento la ficha, unas
   capas el contenido, unas personas a quiénes—, y el número solo repetía el orden, que la línea ya
   cuenta. Lo ya recorrido conserva el visto: ahí no importa qué había, importa que no hay que
   volver.
3. **Dentro de una tarjeta**, que ya estaba y el cliente confirmó: el recorrido es navegación y
   necesita su propia superficie para no confundirse con el contenido que ordena.

### 14. EL FONDO, TERCER INTENTO — Y REVERTIDO POR EL CLIENTE

*«Termina con más contraste en todo, aún no se nota.»* El diagnóstico fue bueno y el resultado no le
gustó, así que lo primero es lo segundo: **el fondo se queda en `#dfe5ee`**, tal como estaba, y el
árbol quedó byte a byte como al empezar.

Lo que sí quedó aprendido, porque volverá a hacer falta el día que se retome: **`--paper` hace DOS
trabajos con un solo valor.** Es el suelo de la pantalla *y* el relleno suave de dentro de las
tarjetas —pastillas, filas al pasar el ratón, cajas de aviso: unos sesenta sitios—. Por eso los tres
intentos se quedaban cortos y no por falta de puntería: bajarlo lo suficiente para que el suelo se
separase habría ensuciado de gris los sesenta rellenos. La salida, si se retoma, es **partirlo en
dos** (`--ground` para el suelo, `--paper` para el relleno), que es lo que se probó: se vio en el
login que la tarjeta se separaba sola, con 16 puntos de luminancia en vez de 11.

**Y la lección de verdad no es de color:** se revirtió entero en cinco minutos porque los cambios
eran un token y un reemplazo mecánico de clase. Un cambio de aspecto que se pueda deshacer así vale
mucho más que uno «bien hecho» repartido por cuarenta archivos.

### 15. EVALUACIONES: EL FORMULARIO QUE SÍ PEDÍA COSAS, Y LOS TEMAS ENTEROS

**Lo primero es un error nuestro de ayer.** Se dijo que crear una evaluación «pide solo el título» y
que no había nada que tocar. Es cierto en *Evaluaciones → Nueva evaluación*. Pero el cliente crea
desde **dentro de la formación**, y ahí pedía cuatro cosas —Título, Descripción, Banco de preguntas y
Cuántas al azar—, **las dos últimas obligatorias**. Se comprobó la pantalla equivocada y se cerró
como «no hay nada que hacer»: cuando alguien dice que una pantalla pide algo, la pantalla que hay que
abrir es la suya, no la que responde a la misma frase.

**Y lo que había detrás era peor que un formulario largo:** el tema era obligatorio para crear, así
que en una empresa **sin temas el botón Agregar no se dejaba pulsar**. Desde una formación no se
podía crear una evaluación. Nadie lo había visto porque la semilla trae temas.

Cómo queda: **solo el título**. Se crea vacía y se abre su editor —lo mismo que hace una lección—,
que es donde están las tres salidas de verdad: escribir una pregunta, traer una ya escrita del banco
o poner el bloque al azar. La descripción sale de evaluación y encuesta (`PENDIENTES` 7.2): la lee
quien cursa **junto al contenido**, y en un examen lo que se abre es el examen. Y el enlace de volver
decía siempre «Evaluaciones» aunque llevara a la formación; ahora dice a dónde vuelve.

**Los temas del banco, lo que pidió mirando:**

- **Icono arriba a la derecha**, no un enlace de texto. Y de paso deja de depender del bloque al
  azar: allí solo existía si ese bloque era el paso activo, pero el tema también se le pone a una
  pregunta suelta, así que la puerta tenía que estar siempre. Lo que vale para toda la pantalla vive
  en la cabecera.
- **Un solo campo que busca y crea.** Antes era «Tema nuevo» + botón Crear, y la lista entera debajo.
  Con treinta temas lo que uno hace casi siempre es **buscar** uno; crear es la excepción. Ahora
  filtra según se escribe y solo ofrece «Crear ...» si lo escrito no coincide con ninguno —comparado
  sin mayúsculas, que es lo que evita acabar con dos temas iguales y ninguno completo—.
- **«Dónde se editan las preguntas de ese tema no la veo.»** Estaban: se desplegaban pulsando el
  NOMBRE del tema. Un nombre no parece un botón. Ahora cada fila tiene el suyo —**«12 preguntas»**
  con su flecha—, que además dice lo que hace falta saber para que un bloque al azar quepa.
- **Los párrafos largos, detrás del icono de ayuda**, que es la regla que el cliente puso el 06-09 y
  que este panel no cumplía. Y los iconos: `SquarePen` para editar, `Undo2` para deshacer, y
  **`Archive` para retirar del banco** — no una papelera: retirar no borra nada, y lo que alguien
  respondió sigue apuntando a su versión.

**Lo que NO se hizo, y es decisión, no olvido:** el panel sigue siendo un **cajón lateral** y no una
ventana. La regla del producto es suya (Decisión #131): *si tiene campos, cajón; si es para leer,
ventana*. Y aquí el cajón hace algo más — deja ver detrás la evaluación que se está armando, que es
justo lo que uno mira mientras decide si el tema está bien puesto.

### 16. EL VERDE, EL AVISO DEL PLAN Y EL SALUDO QUE SE DECIA DOS VECES

Tres cosas que vio en la pantalla, y las tres eran ciertas.

**El botón verde.** La Decisión #166 —*«la acción que lleva el trabajo a su siguiente estado va en el
color de acento del tenant»*— duró un día. El acento que TRANSPRENSA tiene configurado es **verde
`#367d17`** (el principal es `#1e0958`), así que *Publicar cambios* y *Dar por cumplida a N* salían
verdes entre botones neutros y no se leían como «el paso siguiente», sino como un semáforo. Vuelven
al color principal, y **#166 queda retirada**: la variante sigue existiendo en `button.tsx`, pero no
la usa nadie.

Donde el verde sí dice algo es en los **sí/no de la ficha**, que era su propuesta: el «Sí» va relleno
en verde (`tone: 'ok'`). Y de paso dejó de decir **«Si»**, que es otra palabra: ahora es **«Sí»**.

**El aviso del plan ocupaba una tarjeta entera todos los días.** Eran dos párrafos —el estado y su
explicación— encima de una ficha que se abre para otra cosa. Queda en **una línea**, con la
explicación detrás del icono de ayuda.

Y lo que **no** se hizo, que es la parte que importa: esconderlo entero detrás de un icono
desplegable. Cuando la formación **no** está en el plan, eso no es un dato — es la advertencia de que
no cuenta para ningún indicador. *Un aviso que hay que abrir para enterarse no es un aviso.* Así que
ese caso se queda a la vista, en ámbar; el caso normal —sí está en el plan— es gris y discreto. El
color es lo que separa los dos, no el tamaño.

**Y el saludo salía dos veces en la misma pantalla.** La barra de arriba dice «Buenos días, Miguel»
en TODAS las pantallas; el título de Inicio decía exactamente lo mismo dos centímetros más abajo.
Inicio deja de saludar y su título dice ahora **en qué va la empresa hoy**: «3 acreditaciones
vencidas», «5 obligaciones se quedaron atrás», «2 decisiones esperan tu aprobación» o «Todo al día».
Se nombra **una** sola cosa —la primera que importa—, porque un titular con tres cifras no es un
titular; y `null` mientras las cifras no han llegado, para no afirmar «todo al día» un segundo antes
de que aparezcan tres vencidas.

**Lo que se le dijo que NO, y por qué.** Propuso que la barra saludara con «buenos días, crack /
maestro / máquina», con el efecto de escritura del login, «para que se sienta viva». Dos motivos para
no hacerlo, y ninguno es de gusto:

1. **La regla del registro formal es suya**, de una sesión anterior, y este es un sistema cuyos
   registros acaban delante de un auditor. Una barra que tutea a un director de Gestión Humana no se
   puede quitar de una captura de pantalla.
2. **El efecto de escritura en el login se ve una vez**; en la barra se repetiría en cada carga de
   pantalla, decenas de veces al día. Lo que la primera vez es simpático, a la quinta es una
   animación que retrasa la lectura.

Lo vivo no sale del tono, sale de **decir algo cierto y distinto cada día**, que es justo lo que hace
ahora el título de Inicio. Se le ofreció el paso siguiente por ese camino —que el título reconozca un
logro real: «Nadie tiene nada vencido: 41 días seguidos»— y está sin decidir.

### 17. LA CICATRIZ DE LAS TILDES, ENTERA: OCHO PRUEBAS Y UN HUECO EN LAS DOS HERRAMIENTAS

Al correr la suite con lo de evaluaciones salieron **8 rojas de 23**, y **ninguna era de lo de hoy**:
todas eran de la pasada de tildes de ayer. El 2026-09-09 por la mañana se dieron por cerradas cinco;
faltaban ocho, y las dos herramientas que se escribieron para esto no las vieron porque **las dos
leen cadenas entre comillas** y estas se escondían en otros tres sitios:

| Dónde se escondía | Ejemplo |
|---|---|
| Una **expresión regular** | `/Buenos dias\|Buenas tardes/` — la pantalla dice «Buenos días» |
| Un **atributo CSS** | `[aria-label="Planes de capacitacion"]` — la pantalla escribe «capacitación» |
| Una **plantilla** | `` `Marcar opcion ${n} como correcta` `` — la pantalla pone la tilde |

Y dos de las ocho no eran de las pruebas sino **de la pantalla**, que es lo que hace que valga la pena
haber mirado una por una: `format.ts` escribía **«Vence en 3 dias»**, **«Vencio ayer»** y **«el mismo
dia»** —texto que lee el usuario, no un comentario—, y la ficha decía «vence 1 dias antes del
ingreso». Ahí lo correcto era corregir la pantalla, no la prueba.

`scripts/selectores-huerfanos.mjs` gana la comprobación que le faltaba, que es **la del sentido
contrario**: *la prueba pide sin tilde lo que la pantalla escribe con ella*. Mira también dentro de
las expresiones regulares y **propone la corrección exacta** —saca del código el trozo equivalente—
en vez de solo señalar. La lección, otra vez la misma que con el limpiador de reglas: una herramienta
que solo mira en una dirección da por bueno todo lo que pasa por la otra, y sigue diciendo que fue
bien.

### 18. LA SEGUNDA VUELTA DEL CLIENTE: SIN ÁMBAR, SIN ETAPAS, Y LA HERENCIA A LA VISTA

**El ámbar del aviso del plan, fuera.** *«No quiero nada ámbar.»* Tenía razón y el motivo es el que
importa: el color de estado se gasta si se usa para algo que pasa todos los días. Los dos casos —está
en el plan, no está— se distinguen ahora por **las palabras**, sobre el mismo gris. El aviso sigue
saliendo solo para los tipos que participan en el plan; el resto de las formaciones no oyen hablar
del plan en ningún sitio.

**El selector de la formación, cuarta forma — y la lección no era el dibujo.** Subrayadas, pastilla,
etapas: las tres tumbadas, y siempre por lo mismo, *«el botón se parece a esos selectores»*. Estaba
mirando el sitio equivocado en las tres: el problema no era la forma, era que **compartía fila con
Publicar y Eliminar**. Ahora las pastillas —la forma del resto del producto— viven en **su propia
banda**, encima del contenido, dentro de un carril gris que las hace legibles como UN control y no
como cinco botones. `Etapas` se borró entero: una variante que no usa nadie invita a volver a
usarla, y un recorrido AFIRMA un orden que estas cinco vistas no tienen —se entra a Convocatorias sin
pasar por Contenido cada vez que se programa algo ya publicado—.

**Una evaluación nueva entra escribiendo.** Se abría en «Cómo se califica» —la nota, los intentos, el
tiempo—, que es lo último que se decide y era lo primero que se veía: recién creada, la pantalla pedía
configurar un examen que todavía no existe. Ahora nace con la primera pregunta en blanco. No se
guarda sola: entra sin marcar la pantalla como sucia y `guardar()` se niega mientras esté a medias.

**Y la pregunta más de fondo del día: nota mínima e intentos se piden en dos sitios.** No son
redundantes —son una **cascada de tres pisos**: empresa → formación → examen, y el vacío significa
«lo que diga el piso de arriba»—, pero eso **no se veía por ninguna parte**: una caja vacía no dice
con qué nota se aprueba. Decidió dejar los dos sitios y que la herencia se vea:

- El campo de la evaluación lleva en el hueco **el número que se aplicaría** («80 (de la empresa)») y
  dice para qué sirve rellenarlo: **solo para exigir MÁS**, como un piso legal —«alturas siempre 90 %»—.
- Se enseña el de la **empresa** y no el de la formación a propósito: una evaluación puede estar
  dentro de varias formaciones con notas distintas, así que un solo número de formación aquí sería
  mentira la mitad de las veces. El de la empresa es el único que siempre es cierto.
- «Reglas de la versión» dice ahora lo que es: *con esto se aprueba todo examen de esta formación,
  salvo que alguno exija más por su cuenta*.

**Y el saludo, escribiéndose — pero una vez.** Aceptó lo del efecto de escritura «sutil, solo al
iniciar sesión o cuando cambia el saludo», que es exactamente la regla que lo hace soportable: la
barra sale en todas las pantallas, así que animarla en cada carga serían decenas de animaciones al
día. Se escribe al entrar y cuando el saludo cambia de verdad —al cruzar el mediodía y las siete—, lo
recuerda `sessionStorage`, y no se anima si el sistema pide menos movimiento. Lo del tuteo
—«crack», «máquina»— sigue fuera, por lo dicho en §16.

### 19. EL SPRINT 6, REVISADO ANTES DE PRODUCCIÓN: TRES HUECOS Y NINGUNO ERA «EL DASHBOARD»

*«Revisa Sprint 6, métricas, KPIs, aún no hay dashboard. Es importante antes de producción.»*

Lo primero fue el inventario, y contradice a medias la frase: **sí hay tablero** —Inicio con los
cuatro avisos y el % de cumplimiento, Analítica con **siete cortes** (área, cargo, regional,
servicio, proceso, tipo, norma), Vencimientos con su eje, la medición del plan, la matriz cargo ×
inducción—. Decirle que no hay habría sido darle la razón por comodidad. Lo que faltaba eran **tres
preguntas que ningún informe contestaba**, y las tres se hicieron.

**1. El expediente de una persona — y era la Definición de Terminado del propio sprint:** *«el
auditor simulado obtiene, para una persona cualquiera, su historial completo con soportes en menos
de un minuto»*. Los datos estaban en tres pantallas: obligaciones en Asignaciones, constancias en un
cajón, papeles de terceros en otro. Contestar «demuéstrame lo de Juan Pérez» obligaba a abrir tres,
filtrar cada una y unirlas a mano, **delante del auditor y con el reloj corriendo**. Un botón
«Expediente» en cada fila de Usuarios: lo que le falta arriba, lo cumplido debajo, y los dos tipos de
soporte al final. Y es de **lectura**: no reemplaza a los dos cajones de al lado —esos son para
emitir, revocar y registrar—, porque lo que la Decisión #140 prohíbe son dos puertas a la misma
TAREA, no una vista de consulta junto a las de trabajo.

**2. La evolución en el tiempo.** Todo lo demás es una foto de hoy: contestaba «¿cómo vamos?» y no
«¿vamos mejor que en enero?», que es la del comité mensual. Se mide **lo que vencía cada mes** y
cuánto se cumplió — **no el histórico del indicador**, que nadie guardó y reconstruirlo sería
inventarlo.

**Y aquí la guía de gráficos evitó un error que no se ve a ojo.** Iban a ser tres tramos: a tiempo
verde, tarde ámbar, sin cumplir rojo. El validador de paletas lo tumbó con un número: **ámbar y rojo
están a ΔE 5,5 para un deuteranope** —y a 8,5 con visión normal—, así que en una barra apilada serían
el mismo color para una de cada doce personas. Quedan dos tramos (ΔE 26) y el «a tiempo o tarde» vive
en el detalle, con palabras. **La lección es la de siempre en este proyecto:** la parte de color es
computable, así que se computa; mirarla y decir «se distinguen» es exactamente cómo se cuela.

**3. En qué falla la gente.** Los informes decían cuántos aprobaron; ninguno **qué fallaron**, que es
lo único que se convierte directamente en un renglón del plan. Por tema y, aparte, las preguntas más
falladas — con suelo de cinco respuestas, porque sin él la peor del informe sería siempre una que
contestó una sola persona. Su lectura es doble y por eso lleva el número de respuestas al lado: una
pregunta que casi todos fallan **o no se enseñó, o está mal redactada**.

**Lo que se decidió y no se hizo:** los vídeos se quedan en **R2 y no en un canal de YouTube**. El
ahorro sería de un dólar al mes —60 GB cuestan eso— y lo que se perdería es lo que hace valioso al
producto: servir el vídeo con una **URL firmada atada a la sesión**, que es la prueba de que *esta*
persona vio *este* contenido. En un canal «no listado» el enlace lo tiene cualquiera a quien se lo
pasen, la evidencia vive en una cuenta de Google, y media logística bloquea YouTube en su red. El
precio de esa decisión es poner los subtítulos nosotros: transcripción automática, ~USD 36 una vez
por todo el catálogo, **después del despliegue**.

### 20. EN QUÉ QUEDA Y CON QUÉ SEGUIR

**Suite: 23/23 e2e y 502/502 unitarias.** Lo de evaluaciones y lo del Sprint 6 está cerrado
(`PENDIENTES` §7 y §9). Lo que queda **no es código, es del cliente**:

1. **La máquina.** Decidido: Vultr High Performance Miami, 2 vCPU / 4 GB (USD 24) + copias
   automáticas (USD 4,80), sin DDoS —Cloudflare ya lo cubre—. Qué marcar en cada casilla del
   formulario y el `cloud-init`: `docs/04-despliegue-piloto.md` §2 bis.
2. **El remoto de git** (`PENDIENTES` 6.1). Sigue siendo lo más urgente: hoy tres sesiones de
   trabajo viven en un disco, y el despliegue **clona** el repositorio.
3. **El bucket R2 y su token.** Sin eso el vídeo saldría por la máquina y su ancho de banda sería el
   techo de cuánta gente puede ver una formación a la vez.

Después del despliegue, por este orden: la **transcripción automática** (`PENDIENTES` 9.4), el
**repaso** (5.1) y la **fila por persona en Seguimiento** (5.2).

Y sigue vivo lo de siempre: **el fondo** se queda en `#dfe5ee` (§14), y el **título de Inicio con un
logro** (`PENDIENTES` 8.3) está ofrecido y sin decidir.

---

## 2026-09-08 (tarde) — Los seis pendientes que eran nuestros, y dos fallos que las pruebas destaparon

Sesión larga: todo lo de `PENDIENTES` que no dependía de una decisión del cliente. Seis puntos
cerrados —2.4, 2.5, 3.1, 3.2, 3.3 y 4.1—, dos fallos de fondo que aparecieron **midiendo** y no
razonando, y cuatro recorridos nuevos que los sostienen.

### 1. LAS DOS PUERTAS DEL PAPEL, DICIENDO LO MISMO (2.5)

El criterio «si la dicta la empresa, no hay tercero que certifique» vivía **dentro** de la lista de
asistencia, y la segunda puerta —*Papeles de un tercero*, en la ficha— no se enteró. Ahora vive en
`certificate-policy.ts` y las dos lo **importan**. La diferencia no es de estilo: un criterio copiado
se separa el día que alguien corrige uno de los dos, que es exactamente lo que había pasado.

Lo demás que pidió el cliente, hecho:

- **La fila dice de dónde sale** —«Lo pide su tipo» o «Lo pide su ficha»—, que contesta *«¿y esta por
  qué aparece aquí?»* sin abrir cuatro pantallas, y además dice dónde se cambia.
- **Se abre la formación y la convocatoria** desde la fila, en pestaña nueva: es una gaveta con
  borradores a medio escribir y navegar la cerraría.
- Con `PROPIOS` la pantalla no pide el número **pero lo explica**, con un «Registrarlo de todos
  modos» al lado. Sigue siendo un defecto, no una compuerta. Y si ya hay papel guardado se enseña
  siempre: esconder un dato que alguien registró es peor que no haberlo pedido.

`dos-puertas-del-papel.mjs` corre la matriz entera: jornada propia o de un tercero × papel heredado
del tipo o puesto en la ficha × con papel guardado o sin él.

### 2. VENCIMIENTOS, REHECHO ENTERO (3.1, 3.2 y 3.3)

Los tres puntos eran el mismo: **el informe partía por de qué tabla salía el dato**, y eso es una
división del esquema y no del trabajo. Costaba dos cosas y las dos se veían en la pantalla —una serie
siempre en cero, y la gente de la ventana de 60 días contada **dos veces**—.

El eje ahora es lo que hay que hacer: **REPROGRAMAR** (ya la tuvo y deja de estar acreditado) frente a
**PERSEGUIR** (nunca la ha cumplido y tiene plazo). Cada persona y formación sale **una vez**: cuando
coinciden varias fechas manda la obligación abierta —es la que tiene plazo de verdad— y, si no la
hay, la caducidad más próxima. Y cada fila dice **según qué** vence, porque quien lee «vence en
marzo» pregunta siempre «¿según qué?».

**Y ahora alguien se entera.** Aviso los lunes a la **bandeja** —no correo, decisión del cliente— a
quien tiene `reports:read_scope`. Uno por persona y no uno por vencimiento —cuarenta avisos el mismo
lunes enseñan a archivarlos sin leerlos—, con las dos cifras separadas y nunca la suma, y si no hay
nada **no se manda**. El plazo lo decide el tenant en Preferencias (45 días por defecto, 0 lo apaga) y
se puede disparar a mano: probar un aviso semanal esperando al lunes es como no poder probarlo.

### 3. DOS REGLAS VIVAS, UNA SOLA OBLIGACIÓN (4.1) — Y NO ERA EL CASO RARO QUE DECÍA LA NOTA

La lista decía *«solo posible en tipos de alcance MANUAL; no se ha visto en la práctica»*. **Se vio el
mismo día**, escribiendo el recorrido de las dos puertas: una persona de prueba tenía dos
obligaciones PENDING de la misma formación.

La causa es de manual: **publicar una inducción crea sola su regla de «toda la empresa»**, así que
cualquier inducción publicada y además exigida a un cargo ya tenía dos reglas vivas. Lo que se veía no
era un error visible sino un **denominador inflado**: la misma persona contada dos veces, y el
cumplimiento bajando sin que nadie dejara de hacer nada.

El motor mira ahora si esa persona **ya debe esa misma formación** antes de abrirle la ronda 1 — que
es lo que la asignación manual hacía desde siempre (*«no pisa lo que ya está vivo»*); el motor era la
mitad que faltaba. No toca la que existe, y si esa regla se retira, la otra la vuelve a crear.

### 4. EL FALLO DE DEBAJO: LA CONSTANCIA QUE NACÍA SIN VENCIMIENTO

Apareció al probar que Vencimientos leyera de verdad `certificates.valid_until`: **la constancia se
emitía sin fecha de caducidad** cuando la formación tenía más de una regla viva. La vigencia salía de
un `findFirst` sobre las reglas, así que dependía **del orden de las filas**; si tocaba la regla sin
recurrencia —la automática de las inducciones— el papel nacía sin caducidad y la persona
**desaparecía del informe** hasta que alguien se acordara.

Ahora se miran todas y manda **la vigencia más corta**: la obligación más exigente decide, y
equivocarse hacia avisar antes es un error que se corrige mirando.

Es la tercera vez en dos días que la conclusión correcta sale de **medir** y no de razonar sobre el
código. Ninguno de estos dos fallos se veía leyendo.

### 5. LOS MECANISMOS 2 Y 3 DE LA ASISTENCIA (2.4)

Estaban diseñados desde el Sprint 0 —con su sitio en el modelo— y sin construir.

- **QR de sesión.** Rota cada **90 segundos**: un código fijo se fotografía y se manda al grupo, y
  quien está en su casa marca asistencia a una jornada a la que no fue. 90 es el punto entre las dos
  formas de que esto no se use —más corto y la gente del fondo no alcanza; más largo y la foto vale
  toda la sesión—. Y **se puede dictar en voz alta**: seis caracteres sin parecidos, porque siempre
  hay alguien con la cámara rota y ese es justo el que se queda sin constar.
- **Firma en pantalla.** A dedo, en el móvil. Puerta propia (`attendance:sign`, solo PNG, 300 KB) por
  lo mismo que la evidencia no usa la del contenido: **el permiso es otro**. Es un dato biométrico, no
  se enseña en ninguna lista — donde aparece es dentro del acta.
- **Acta en PDF**, con la lista, las firmas y una **huella** de lo que el acta afirma —no de los bytes,
  que cambian con la fecha de generación—. Se genera **a petición** y volver a generarla no pisa la
  anterior: un acta es un documento con fecha.

Los tres mecanismos cierran por el **mismo sitio**, así que el informe y la obligación no se enteran
de por qué puerta entró la marca. El recorrido lo comprueba explícitamente.

**El QR salió a pantalla completa, y lo pidió el cliente mirando la pantalla.** Tenía razón: se
proyecta en un salón, y dentro de la tarjeta compite con el menú, la ficha y la tabla — a cinco metros
no se lee un código de dos centímetros.

**Y lo corrigió otra vez cuando lo hice mal.** La primera versión abría una ventana del navegador
(`window.open`); lo que pidió es una capa **de la propia aplicación**. Tiene razón y la diferencia es
real: una ventana nueva la bloquea el navegador, sale sin sesión hasta que se refresca, y quien está
dictando se queda con dos ventanas que ordenar. Ahora es una capa a pantalla completa encima de la
convocatoria, que sale con **Escape** y no cierra la sesión al salir — dejar de proyectar y apagar el
código son dos cosas distintas, y mezclarlas dejaría fuera a quien esté escaneando en ese momento.

El acta **no** necesita nada de esto: es un PDF y se abre en su pestaña con el visor del navegador,
que es donde se imprime y se guarda.

### 6. Y LA EVIDENCIA QUE SE SUBÍA Y NO SE PODÍA VOLVER A ABRIR

Descubierto construyendo el acta: solo se servían los archivos registrados como `ContentPackage`, así
que **el certificado escaneado, el acta y la firma quedaban en el disco sin forma de verlos**. Una
evidencia que no se puede volver a ver no es evidencia. La regla no se relajó —se sirve un archivo si
**alguna fila del dominio apunta a él**, nunca una clave suelta— solo se completó con las cinco
columnas que faltaban.

### 6 bis. Y UN ADJUNTO QUE NO SE PODÍA GUARDAR — lo cazó el cliente en caliente

Adjuntaba el certificado de alguien que **ya tenía su formación cumplida** y el botón se quedaba en
«Guardar 0 correccion(es)», apagado: el archivo subido se perdía al cerrar la lista. La comparación
que decide si hay algo que guardar miraba el número y la fecha **y no el adjunto**.

Y la otra mitad, del mismo tirón: el adjunto **no se podía abrir**. Se enseñaba un visto con el
nombre y nada más, así que no había forma de comprobar que se subió la hoja correcta ni de
enseñársela a nadie. El servidor ya sabía servirlo desde esta misma sesión —era la mitad que faltaba
del arreglo de §6—; lo que faltaba era el enlace.

Tres cosas, entonces: **el escaneo cuenta como cambio**, **el nombre del archivo es un enlace** (con
su URL firmada) y, cuando hay papel sin número, el botón **dice qué falta** en vez de apagarse sin
explicación — el número lo exige el servidor, pero un botón muerto no lo explica.

**Y esto sí lleva prueba de pantalla**, no recorrido: el servidor aceptaba el archivo perfectamente
—de hecho lo aceptaba— y el fallo estaba en la interfaz. `e2e/asistencia-adjunto.spec.ts` monta la
jornada cumplida por API y prueba los tres clics: 13 segundos.

### 6 ter. LO QUE VINO DESPUÉS, MIRANDO LA PANTALLA CON EL CLIENTE

**La lista de asistencia se veía desordenada, y tenía razón.** Tres causas, las tres de maquetación:
la tabla no tenía anchos de columna, así que **el navegador los repartía según el contenido de cada
fila** —la que lleva número de certificado y clip empuja hacia un lado, la que lleva la píldora del
motivo hacia el otro— y las columnas se movían de fila en fila; la píldora del motivo iba **al lado**
del selector y ensanchaba su columna al doble de su cabecera; y las dos columnas del certificado
quedaban **en blanco** en las filas de quien no asistió, dejando media tabla vacía. Ahora: anchos
fijos, celdas alineadas arriba, el motivo **debajo** de su selector, y un guion que dice por qué esa
persona no lleva certificado. Y «Ponérselo a todos», que en `ghost` y deshabilitado parecía un
rótulo, es un botón como los otros dos de lote.

**Ya se ve quién va marcándose mientras se proyecta.** La pantalla de la convocatoria carga la lista
una vez, así que quien proyecta el código no veía entrar a nadie sin recargar — justo cuando hace
falta saber si ya están todos. La capa proyectada pregunta cada cinco segundos y dice **«Van 12 de
40»**, o «Ya se marcaron los 40» cuando no falta nadie; y al salir de la proyección, la lista de
inscritos se vuelve a pedir sola.

**Y ahora la lista dice CÓMO se marcó cada quien** —«Marcada en la lista», «Escaneó el código»,
«Firmó en pantalla»—. El dato estaba guardado desde el Sprint 5 y ninguna pantalla lo enseñaba. Para
el cumplimiento da igual por qué puerta entró la marca, y eso es deliberado; para quien revisa la
evidencia no da igual, y hasta hoy había que abrir el acta para verlo.

**Dos huecos de prueba, cerrados.** `acta-de-lista.mjs` cubre el acta de una jornada marcada **solo
por el instructor**, con ausentes y con faltas justificadas dentro —que es la que va a generar el
noventa por ciento de las actas— y comprueba lo que el cliente preguntó: que el acta no depende del
QR, porque lee la tabla donde escriben los tres mecanismos. Y `e2e/asistencia-a-mano.spec.ts` toma la
lista **por la pantalla**, con los tres iconos, incluida la justificación que exige motivo.

**Inicio habla el idioma nuevo.** «Ya vencido» y «Lo que viene» ya estaban ahí; lo que faltaba era
que dijeran las dos cifras por separado —por reconvocar y por perseguir— y que sus enlaces llevaran
**a la pestaña de Vencimientos** y no a Seguimiento con doscientas formaciones delante.

**Preferencias explica qué hace cada campo.** Eran siete números con una pista corta: «Intentos
máximos: 3» no decía qué pasa al agotarlos. Cada uno responde ahora la única pregunta que importa
—qué pasa si lo cambio— y la pantalla quedó con sus tildes.

### 7. LAS TILDES DE LO QUE DICE EL SERVIDOR

El barrido del 07 corrigió el texto de las **pantallas** y dejó fuera los mensajes de la API — y esos
también se leen: salen en el aviso rojo cuando algo se rechaza, que es justo el momento en que
alguien lee con atención. **43 mensajes** corregidos en tres pasadas.

Y una corrección mía por el camino, que vale la pena escribir: el diccionario mapeó `publico` →
«público» donde era el **verbo** («se publicó otra versión»). Es el riesgo de un diccionario ciego, y
por eso la segunda vuelta llevó formas verbales concretas y la tercera fue a mano. Un barrido
automático sobre lenguaje necesita que alguien lea la lista de cambios.

### 8. LA SUITE EN ROJO QUE NO ERA UNA REGRESIÓN — otra vez

La primera corrida completa dio **19 de 21**, con dos pruebas caídas que tocaban justo lo que había
cambiado el motor. Antes de tocar nada se midió, que es la lección del 07:

| Qué se corrió | Resultado |
|---|---|
| Suite completa, base con la basura de la sesión | 19 / 21 |
| **Las dos pruebas caídas, solas** | **5 / 5** |
| **Suite completa, base ya recogida** | **21 / 21** |

La causa era otra vez la base sucia —los recorridos de esta sesión dejaron gente y reglas—, no el
código. Con una sola muestra habría dado por hecho lo contrario y habría «arreglado» algo que
funcionaba.

### Verificación

502 unitarias · 21/21 e2e · cuatro recorridos nuevos en verde (`dos-puertas-del-papel`,
`dos-reglas-una-obligacion`, `vencimientos`, `qr-y-firma`) · tsc y lint limpios · build en verde.

**Y miradas en el navegador**, que es la mitad que las pruebas no cubren: el panel de la
convocatoria, la capa proyectada —QR sobre blanco, el código en letra enorme, la cuenta atrás, y
Escape para volver— y la pantalla del asistente con su lienzo de firma. De paso salió a la vista el
mensaje de un código caducado, que es el que más se va a leer: *«Ese código ya caducó. El de la
pantalla cambia cada minuto y medio: mira el nuevo»*.

Falta una sola cosa por mirar de verdad: **la firma desde un teléfono**. El lienzo se probó con
ratón, y lo que decide si funciona es el dedo sobre una pantalla pequeña.

### Lo que queda abierto

- **6.5 repaso de estilo** con la referencia del cliente. No se tocó: el propio pendiente dice que es
  trabajo de diseño y hay que hacerlo **mirando pantalla por pantalla**, y esta sesión no tuvo ojos.
- **6.1, no hay remoto en git.** Sigue siendo lo más urgente de la lista y sigue sin ser técnico.
- Y lo que es del cliente: **2.6** (si `INDUCCION_ESPECIFICA` debe llevar papel de un tercero), **4.2**,
  **5.1**, **5.2** y **5.3**.

---

## 2026-09-08 (cierre) — El bloque de evidencia, cerrado: subir el papel, la segunda puerta y la via C

Los tres puntos abiertos de `PENDIENTES` §2 salvo el 2.4. Dos migraciones, dos decisiones nuevas
(#160 y #161) y cuatro recorridos que las prueban.

### 2.1 — SUBIR EL ARCHIVO

Las columnas existian desde el Sprint 6 y la API las aceptaba: no habia por donde mandarlas.

**Puerta propia** `POST /media/evidencia` con `attendance:take`, y no la de contenido —que pide
`lessons:manage` y crea un `ContentPackage`—. Dos razones: pedirle permisos de autoria a quien solo
adjunta el PDF que le dio la ARL acaba en que no adjunta nada; y un acta pertenece a ESA jornada, no
es una pieza reutilizable del catalogo. Acepta PDF e imagenes **comprobadas por sus bytes**: el acta
se fotografia con el telefono mas de lo que parece, y renombrar un `.exe` a `.pdf` es el ataque de
manual.

En pantalla, dos sitios distintos porque son dos cosas distintas: **el acta** al lado de la fecha
(una por jornada — es la hoja con las cuarenta firmas, trocearla por persona seria inventar un
documento) y **el certificado** bajo su numero, en la misma celda. Los dos OPCIONALES: la lista
marcada ya es evidencia, y exigir el escaneo dejaria jornadas sin cerrar esperando al escaner —
mientras tanto el plan las cuenta como no ejecutadas.

**El recorrido encontro dos fallos antes que el cliente:** el acta se guardaba pero solo constaba en
la auditoria (quien acababa de guardar no podia confirmarlo), y **el roster no devolvia
`extCertFileKey`**, asi que al reabrir la lista el adjunto no aparecia y quien lo mirara volveria a
subirlo. Es el mismo fallo que los estados de asistencia sin sembrar, del dia anterior.

### 2.2 — LA SEGUNDA PUERTA

Registrar el papel desde la ficha de la persona. **Y la premisa del cliente al pedirlo era falsa, lo
cual importa:** creia que hacia falta porque *"si se cierra la convocatoria ya no se puede"*. Se
comprobo — el servidor solo rechaza marcar asistencia en BORRADOR y CANCELADA
(`offerings.service.ts:149`); una jornada EJECUTADA sigue dejando corregir certificados.

Lo que SI lo justifica es el camino: **la peticion llega con un nombre, no con una jornada**. Mismo
argumento que puso la constancia interna en esa pantalla (#128). Y su consecuencia: si registrarlo
cuesta no se registra, y sin el papel la obligacion se queda con el vencimiento que CALCULA la
recurrencia en vez del que dice el certificado — una fecha equivocada que nadie detecta hasta que
caduca una habilitacion legal.

**Puerta propia** `PATCH /enrollments/:id/papel-de-tercero` y no la de asistencia: desde la ficha no
se esta tomando ninguna lista, y reusarla obligaria a mandar `estado: PRESENT` sobre una asistencia
ya marcada solo para que el certificado llegara de rebote. Un dia alguien lo mandaria con otro estado
y **remarcaria una asistencia sin querer**.

La lista filtra en MEMORIA y no en la consulta: `tracksExternalCertificate` sale de la cascada tipo →
ficha, asi que un `where` por columna se dejaria fuera todas las que lo heredan del tipo, que son la
mayoria. El recorrido lo prueba con una que lo hereda sin decirlo en su ficha.

### 2.3 — LA VIA C, Y LA PREGUNTA DEL CLIENTE QUE FIJO EL DISEÑO

Quien llega ya certificado de otro empleo. Ver **Decisiones #160 y #161**, que recogen el porque.

Lo importante para retomar: **el cliente pregunto lo correcto y cambio el diseño**. Iba a hacerlo con
un motivo libre por persona; el pregunto *"¿y si la empresa cree que debe hacerlo igual porque son
procesos propios?"* y eso obligo a las dos capas — la formacion declara si su papel es transferible
(por defecto NO) y aceptar cada papel es un acto auditado. Con el diseño anterior se habria podido
dar por cumplida una induccion con el papel de otra empresa.

Y volvio a preguntar lo correcto con la cascada: **"¿no es mejor que este en cada formacion?"**. Si —
y a `tracksExternalCertificate` le habia pasado exactamente eso dos dias antes. Se hizo el mismo dia
en vez de esperar a que apareciera el caso.

### UNA TRAMPA DE LOS RECORRIDOS QUE COSTO MEDIA HORA

`convalidar-papel-ajeno.mjs` fallaba en dos aserciones, de forma consistente, y **pasaba al añadir
una linea de depuracion**. Parecia una carrera y no lo era.

Las reglas de las formaciones de prueba **siguen activas hasta que se limpian**, asi que a cada
persona nueva del mismo cargo le nacen tambien las obligaciones de todo lo que quedo de corridas
anteriores. Un `includes('Trabajo en alturas')` cazaba la formacion de OTRA corrida: se convalidaba
una obligacion y se leia otra. El sintoma es desconcertante —la funcionalidad va bien y la asercion
dice que no— y la causa no se parece en nada.

**La regla, ahora escrita en el recorrido:** toda busqueda por nombre va acotada al sufijo de su
corrida.

### Verificacion

461 unitarias · 21/21 e2e · seis recorridos de asistencia en verde
(`asistencia`, `asistencia-combinaciones`, `asistencia-correcciones`, `asistencia-evidencia`,
`papel-desde-la-persona`, `convalidar-papel-ajeno`) · tsc y lint limpios.

### PENDIENTE Y ABIERTO: una induccion especifica ofreciendo "papel de un tercero"

Lo vio el cliente al final de la sesion, y **no se resolvio**. Lo medido:

- La formacion *"Estandar Induccion especifica E2E884778"* aparece en **Papeles de un tercero** de
  una persona, diciendo *"la dicto PROPIOS"*, que es contradictorio: si la dicta la empresa no hay
  ningun tercero que expida nada.
- **La cascada hizo lo suyo bien.** La ficha tiene `tracksExternalCertificate = null` (hereda) y el
  TIPO `INDUCCION_ESPECIFICA` tiene **`tracksExternalCertificate: true`** en su configuracion. La
  pantalla enseña lo que el tipo declara. Lo que falla es lo de abajo.
- **No lo puso ningun recorrido**: el unico que toca la configuracion de un tipo es
  `convalidar-papel-ajeno.mjs` y apunta a RECERTIFICACION. Vino de la interfaz o del dato de partida.

**Y al documentarlo aparecio la mitad que SI es nuestra.** La regla «si la dicta la empresa, no hay
tercero que certifique» existe desde el 2026-09-06, pero vive **solo en la lista de asistencia**. La
segunda puerta —*Papeles de un tercero* en la ficha— filtra unicamente por la cascada tipo → ficha y
**no mira quien dicto la jornada**, aunque lo tiene delante y lo enseña (`quienLaDicto`,
`papel-de-tercero.service.ts:91`). Por eso la fila se contradice a si misma. Las dos mitades son
coherentes por separado.

**Lo que queda abierto, separado en tres:**

1. **La incoherencia entre las dos puertas — nuestra, y hay que arreglarla.** El mismo criterio debe
   decidir igual se entre por donde se entre. Ojo al arreglarlo: en la lista es un DEFECTO de
   pantalla y no una compuerta, a proposito (hay tenants —un centro de entrenamiento acreditado— donde
   «propios» y «certificado oficial» conviven). Copiar el criterio, no endurecerlo.
2. **¿Debe `INDUCCION_ESPECIFICA` llevar papel de un tercero? — del cliente, no nuestra.** Casi seguro
   que no, la dicta la empresa. Pero es configuracion del tenant y apagarla por nuestra cuenta seria
   decidir en su nombre (#159). Se apaga en Configuracion → Tipos de formacion.
3. **La pantalla no deja comprobar nada.** Enseña el nombre de la formacion sin decir POR QUE la
   ofrece y sin poder abrirla. El cliente lo pidio expresamente: *"desde esa interfaz debe poder
   abrir esa formacion o convocatoria"*.

Anotado en `PENDIENTES` 2.5 (lo nuestro) y 2.6 (lo del cliente), y explicado en
`docs/modulos/formaciones/08-evidencia.md` §8.

---

## 2026-09-08 — Los rotulos que no decian lo que pasa, y un cruce que la pantalla prometia y no cumplia

Sesion corta de lenguaje y orden, con el cliente leyendo la pantalla campo por campo. Casi todo
salio de preguntas suyas, y dos de ellas destaparon cosas que no eran de redaccion.

### 1. LA FICHA, EN EL ORDEN EN QUE SE PIENSA

Segundo ajuste en dos dias y el cliente tuvo razon las dos veces. Queda:

**Nombre + Tipo** · Proceso | Responsable · Modalidad por defecto · La acredita un tercero ·
**Norma** · **Descripcion**

Dos motivos distintos para lo que bajo:

- **La norma** clasifica —para poder decir cuanta formacion tributa a cada norma— pero no decide
  nada: ni a quien se le exige, ni que lleva la formacion. Lo que se consulta a diario va antes.
- **La descripcion** va la ultima por ser el unico campo GRANDE. Un area de texto de tres renglones
  en medio parte la retahila de campos cortos y obliga a saltarla con la vista.

**La regla que deja, para la proxima pantalla:** los campos grandes al final, y el orden de los
cortos lo decide con que frecuencia se miran.

### 2. LA MODALIDAD NO ERA REDUNDANTE — PERO EN LA CONVOCATORIA SI

El cliente pregunto por que sale en la ficha y en la convocatoria. Se midio antes de contestar:

- La de la FICHA no es solo un defecto. Ademas decide la modalidad de la jornada PERMANENTE que el
  sistema crea solo al publicar una formacion de autoservicio (`versioning.service.ts`), y es la que
  ve el aprendiz en el reproductor (`player.service.ts`). Se llama ahora **"Modalidad por defecto"**.
- En la CONVOCATORIA si estaba repetida: en "Datos de la jornada" y otra vez en la tarjeta de al
  lado. Se quito de los datos y vive en la tarjeta, que es donde significa algo.

### 3. "COMO SE ACREDITA" NO DECIA LO QUE PASA

Tres rotulos parecidos —modalidad, como se acredita, certificado de un tercero— puestos en fila se
leen como el mismo dato tres veces. El cliente lo dijo tal cual: *"¿que tiene que ver «como se hace»
con la modalidad y con «como se acredita»?"*.

Ahora la tarjeta se llama **"Como se cierra esta jornada"** y se lee como una cadena:

| | |
|---|---|
| **Como se dicta** | logistica: donde va la gente |
| **Como se registra** | la evidencia: que queda escrito de que la hizo |
| **Papel de un tercero** | un documento aparte, con su numero y su vencimiento |

Y el campo del formulario paso de "Como se acredita" a **"Como se registra"**, con las opciones
renombradas: *"Con lista de asistencia"* y *"Al completar el contenido"*.

**Se probo con dos opciones y se volvio a tres.** La version de dos —la heredada resuelta y marcada,
como "la acredita un tercero"— parecia mas limpia hasta que el cliente pregunto: *"¿donde queda la
opcion de registro automatico por contenido?"*. Con dos, la heredada y la automatica se pisaban en el
mismo boton. Con tres, la heredada dice **a que resuelve** ("Lo que sugiere su modalidad: con lista
de asistencia"), que es justo lo que le faltaba a la vieja "lo que diga su modalidad": no decia QUE
decia.

Y se dice "al completar el contenido" y no "automatico" a secas porque "automatico" no dice QUE lo
dispara. Lo que hace falta saber es que se cierra sola cuando la persona termina el temario y, si su
tipo los pide, la evaluacion y la encuesta.

### 4. Y LA PREGUNTA QUE DESTAPO UN HUECO DE VERDAD

*"Si hacen una virtual que acredita un tercero, donde la asistencia es automatica, ¿que pasa?"*.

Se comprobo en el codigo: **`registraCertificadoExterno` y `admiteAsistencia` son independientes**.
El primero sale de la formacion; el segundo, de como se dicto esa jornada. Asi que una formacion con
papel de tercero cuya jornada se cierra al completar el contenido —un curso en linea de la ARL que
emite certificado— **no tiene hoy donde registrar el papel**. No hay lista.

Y la tarjeta decia siempre *"la lista pedira su numero y su vencimiento"*. Mentia en ese cruce.

**Lo que se hizo y lo que NO.** No se invento una pantalla: es raro, y esa es la segunda puerta que
ya estaba en `PENDIENTES` (2.2 y 2.3). Lo que si se arreglo es la promesa — ahora dice *"esta jornada
no lo pide: se cierra al completar el contenido"*. Prometer una lista que no va a aparecer es peor
que no decir nada: quien lo lee cierra la jornada esperando que le pregunten, y no le preguntan.

### 5. LO DEMAS

- **Pendiente 6.3, cerrado.** `autoPlan` entra en las dependencias del `useEffect`. **Cero avisos de
  lint en el proyecto.**
- **Pendiente 6.4, cerrado para lo que se VE.** 1.103 tildes corregidas en 185 archivos, con un
  barrido que solo toca cadenas y prosa —nunca identificadores, porque `const tamano` y
  `const campana` existen de verdad—. Un segundo rastreo, solo de texto visible, encontro tres que
  el primero se salto por tener `{}` en la linea (`Ano {plan.year}` entre ellas) y despues dio cero.
- **Pendiente 6.5:** el radio unico (`rounded-lg`) estaba a medio aplicar y el cliente lo noto
  preguntando si estaba mejor antes o ahora. No era ni una cosa ni la otra. Terminado en `Combo`,
  `MultiSelect` y `PersonPicker`, **con su regla escrita**: la caja de un control va a `lg`; lo que
  vive dentro de ella, a `md`.
- **Un texto inventado, fuera.** En el plan anual: *"los planes de SST, PESV o BASC no son planes
  aparte: son la vista por proceso de este"*. El cliente lo marco como falso. Era una afirmacion
  sobre como trabaja SU empresa colada en el rotulo de una pantalla.

### Verificacion

401 unitarias · 21/21 e2e · tsc y lint limpios · build en verde.

---

## 2026-09-07 — La matriz completa de la marca de asistencia, y la base de desarrollo respirando otra vez

Dos cosas, y las dos salieron de una pregunta del cliente: *"al cambiar de asistio a no por error,
cuando ya se cumplio... ¿que pasa? ¿sigue con los pendientes?"*.

### 1. LA RESPUESTA, Y AHORA MEDIDA EN LAS QUINCE CASILLAS

`scripts/recorridos/asistencia-combinaciones.mjs` — **cinco estados iniciales por tres marcas**, cada
combinacion sobre su propia persona, y lo esperado escrito ANTES de correr nada (si se escribiera
mirando el resultado confirmaria lo que hace el sistema en vez de comprobar lo que debe hacer).

Los cinco estados: sin marcar · no asistio · falta justificada · cumplida por la lista · **cumplida
en la plataforma**, esta ultima montada haciendo el curso de verdad como aprendiz, que es el unico
camino para llegar a "cumplida SIN acta".

Las tres reglas de las que sale toda la tabla:

1. Una formacion CUMPLIDA no se reabre desde la lista, se mande lo que se mande.
2. Una NO cumplida se cierra si —y solo si— se marca PRESENT.
3. El acta se re-marca SIEMPRE, cumplida o no: corregir a quien se apunto mal no puede exigir
   tocar la base a mano.

**Y de la 1 y la 3 juntas sale la casilla por la que preguntaba: cumplida + "no asistio" deja el
acta diciendo que no vino y el expediente diciendo que cumplio, con la constancia emitida.** No es
un fallo del motor: es que deshacer un cumplimiento es ANULAR y no existe. Por eso la pantalla
enseña el estado de los cumplidos como TEXTO. **No vuelve a pendientes.**

Ademas, en el mismo recorrido: el papel de un tercero en sus cuatro variantes (completo, solo
numero, mandado con AUSENTE, y con fecha imposible), la justificacion sin motivo, un certificado en
una formacion que no lo lleva, y la lista entera con los tres estados en un solo envio. Todo en
verde a la primera — que aqui es la noticia buena: el comportamiento ya era el correcto, lo que
faltaba era tenerlo escrito.

### 2. PENDIENTE 6.2 HECHO: la basura de las pruebas sale del motor

`apps/api/scripts/limpiar-datos-de-prueba.ts` — ensayo por defecto, `-- --si` para hacerlo.

**Por que hacia falta otro ademas del que ya habia.** `limpiar-reglas-de-prueba.ts` busca por el
nombre de la AUDIENCIA y, con razon, respeta las reglas de formaciones PUBLICADAS: `findOrCreate`
reutiliza audiencias y una induccion real puede colgar de una con nombre de prueba. El efecto era
que la basura publicada se quedaba. El nuevo distingue por el nombre de la FORMACION —`E2E123456`,
que nadie usa de verdad— y por los nombres que la suite se pone a si misma (`Persona S3 …`,
`Importada Uno …`, `Analista Alcance …`), con `888888888` y `999999999` intocables: desactivar la
primera dejaria a las veintiuna pruebas sin poder iniciar sesion.

Desactiva, no borra, por la misma razon que el otro y que pesa mas aqui: en una base de desarrollo
que el cliente usa para mirar pantallas, un borrado en cascada mal calculado se descubre cuando
falta algo que nadie sabe que falta.

**Lo que se saco:** 1.043 reglas y personas de prueba. De 221 reglas activas a 72, y de 910 personas
activas a 4 —las reales—.

**La prueba de que el diagnostico era el bueno, y una correccion mia por el camino.** Al limpiar,
`sprint-1` paso de 4 de 5 a 5 de 5 y la suite de 18 de 21 a 20 de 21. Con un fallo suelto que saltaba
de una prueba a otra segun la corrida, escribi que era intermitencia de Playwright. **Con una sola
muestra, y estaba mal dicho.** El cliente pregunto lo unico que lo resolvia —*"¿esto salio antes o
despues de tus cambios?"*— y se midio de verdad:

| Que se corrio | Resultado |
|---|---|
| La suite con los cambios, antes de limpiar | 18 de 21 |
| Idem, tras la primera limpieza | 20 de 21 |
| **El codigo SIN los cambios** (`git stash`), base ya limpia | **21 de 21** |
| **Los cambios otra vez**, misma base limpia | **21 de 21** |

Las dos ultimas juntas son las que cierran la pregunta: **la causa era la basura acumulada, no el
codigo de la sesion**. La tercera fila sola parecia decir lo contrario y por un momento lo di por
bueno; hicieron falta las dos. La leccion no es sobre este fallo: **una sola corrida no distingue
una regresion de una condicion del entorno**, y el precio de averiguarlo son diez minutos.

### La suite recoge sola

`e2e/global-teardown.ts` corre ahora LOS DOS scripts. Cada uno ve una mitad —el viejo, las reglas de
las audiencias generadas; el nuevo, las formaciones y las personas de prueba— y si uno falla no se
salta el otro: la mitad que quede sin limpiar es la que hara fallar la proxima suite.

Comprobado: una corrida de `sprint-4` deja la base como la encontro (15 personas retiradas al salir).

### Y el fallo que parecia quedar, tampoco era otro

Tras enganchar el teardown se corrio la suite y dio 20/21, asi que se anoto como intermitencia
aparte. **Tampoco lo era**: esa corrida arranco con la base sucia, porque el teardown se acababa de
escribir y solo limpia al TERMINAR. Desde que cada corrida empieza de una base ya recogida:

| Corrida | Resultado | Duracion |
|---|---|---|
| 1 | 21 / 21 | 4,0 min |
| 2 | 21 / 21 | 3,6 min |
| 3 | 21 / 21 | 3,4 min |

Tres seguidas en verde y bajando de 6,7 minutos a 3,4: la base ligera no solo deja de romper la
suite, la hace la mitad de rapida. Es la tercera vez en el dia que la conclusion correcta salio de
repetir la medicion en vez de razonar sobre una sola muestra.


