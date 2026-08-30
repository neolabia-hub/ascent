# Arquitectura tecnica — NEO PULSE

Referencia VIVA del sistema: como esta construido HOY. Se corrige cuando cambia el diseno; no es
un historico (para eso estan `docs/sprints/`).

Para el significado de los conceptos de negocio, ver `docs/glosario.md`.

---

## 1. Mapa general

```
NAVEGADOR
  |
  |  transprensa.neopulse.app  (el subdominio identifica la empresa ANTES del login)
  v
apps/web  — Next.js 14 (App Router)
  |  Cliente HTTP tipado (lib/api.ts, lib/admin-api.ts, lib/catalog-api.ts)
  |  Token de acceso SOLO en memoria; renovacion con cookie httpOnly
  v
apps/api  — NestJS  (prefijo /v1)
  |  Guards: JWT -> Permisos
  |  Interceptor: fija la empresa del contexto
  v
PostgreSQL (con seguridad a nivel de fila)      Redis (previsto)      Almacenamiento (disco / R2)
```

**packages/shared** es la fuente unica de los contratos (esquemas Zod). La API valida con ellos y
la interfaz los usa para saber que enviar. Un cambio de contrato rompe la compilacion en ambos
lados, que es exactamente lo que se busca.

---

## 2. Aislamiento entre empresas (lo mas importante del sistema)

Una fuga de datos entre empresas seria catastrofica e irreparable. Por eso hay **dos capas
independientes**, no una:

### Capa 1 — La aplicacion
`PrismaService.scoped` devuelve un cliente ya atado a la empresa de la sesion:

```ts
// Correcto: filtrado por empresa, siempre
this.prisma.scoped.activity.findMany()

// Imposible de escribir sin darse cuenta: no hay forma de consultar "todo"
```

El interceptor guarda la empresa del usuario autenticado en el contexto de la peticion, y
`scoped` la lee de ahi. **Un desarrollador no puede olvidar el filtro porque no existe la version
sin filtro.**

### Capa 2 — La base de datos
Politicas de seguridad a nivel de fila en toda tabla con `tenant_id`. Antes de cada consulta se
fija la empresa en la transaccion; PostgreSQL descarta cualquier fila ajena.

La aplicacion se conecta con un usuario de base de datos **sin privilegios especiales**, sujeto a
esas politicas. Las migraciones usan otro usuario.

### La prueba que lo respalda
`pnpm db:verify-rls` comprueba tres cosas y **corre en integracion continua**:
1. Con el contexto de la empresa A no se ven filas de la B.
2. Sin contexto no se ve **ninguna** fila.
3. Intentar escribir una fila de la empresa B desde la A es rechazado por la base.

Si esa prueba falla, no se integra el cambio.

---

## 3. Autenticacion y permisos

### Flujo de ingreso
1. El subdominio determina la empresa (en desarrollo, un parametro en la URL).
2. La pantalla de ingreso carga la marca de esa empresa (endpoint publico, solo nombre y colores).
3. El usuario entra con **cedula o correo** y su contrasena.
4. Se emite un token de acceso (15 minutos) y una cookie de renovacion (7 dias, httpOnly).
5. Si es su primer ingreso: cambio de contrasena obligatorio y aceptacion de Habeas Data y del
   acuerdo de firma electronica.

**Por que el tenant va primero:** con ingreso por cedula, dos empresas pueden tener la misma. Sin
saber la empresa, el ingreso seria ambiguo.

**Proteccion contra fuerza bruta:** bloqueo por cuenta tras varios intentos fallidos (no solo por
IP, porque 18 personas detras del mismo NAT corporativo comparten IP). Todo intento queda auditado.

### Permisos, nunca nombres de rol
Los guards evaluan **codigos de permiso** (`catalog:publish`, `users:manage`). En el codigo no
existe `if (rol === 'ADMIN')`. Consecuencia practica: el administrador puede ajustar que hace
cada rol desde la interfaz, sin desarrollo.

Los permisos efectivos = permisos del rol + concesiones individuales − revocaciones individuales,
**mas `enrollments:read_own`, que se concede siempre y a todos** (Decision #65): ver la formacion
propia no es una capacidad que alguien conceda, es consecuencia de existir en la plataforma. Se
suma DESPUES de las revocaciones, asi que tampoco se puede retirar, y en el cajon de permisos
aparece como "Toda persona lo tiene", sin botones — ofrecer "Retirar" sobre algo que el servidor
concede igual seria una mentira silenciosa.

### 3.1 El ALCANCE: que parte de la empresa es suya

Permiso y alcance son **dos preguntas distintas** y por eso viven en sitios distintos: el permiso
dice *que puede hacer* (`catalog:manage_draft`), el alcance dice *sobre que parte de la empresa*.
Fundirlos obligaria a duplicar cada permiso de lectura del producto —`catalog:read_all` /
`catalog:read_scope`— y a mantener los dos sincronizados a mano para siempre.

**La tabla.** `analyst_scopes`: una fila por persona con **`process_id` o `area_id`**. Puede tener
varias de cada tipo, y de los dos tipos a la vez.

**La regla, en una linea: TENER FILAS ES LO QUE RESTRINGE.** Sin filas se ve el tenant entero —asi
es como el administrador no tiene restriccion—; con filas, solo eso. Es una regla que **falla
abierto**, y hay que tenerlo presente: "no configurado" y "ve todo" son indistinguibles en la base.

**Como se resuelve** (`permission.service.ts`, al iniciar sesion). Las filas se convierten en **una
lista de procesos**: las de proceso tal cual; las de area, en todos los procesos que cuelgan de esa
area **y de sus subareas** (`areas.parent_id`, recorrido en memoria). En la sesion viaja
`scopeProcessIds`; el area, hecho su trabajo, desaparece.

| Forma | Que alcanza | Para quien |
|---|---|---|
| Por **PROCESO** | exactamente ese | quien lleva SARLAFT, trabaje donde trabaje |
| Por **AREA** | todos los procesos de esa area y sus subareas, **incluidos los que se creen manana** | la jefatura de un area con varios procesos |

Por eso `processes.area_id` **no es decoracion**: es lo unico que da contenido al alcance por area.
Un proceso sin area no lo ve ninguna jefatura de area y nada lo avisaba, asi que desde el
2026-08-30 el area es **obligatoria** al crear un proceso y los antiguos sin ella se marcan.

> Que "Comercial" exista como AREA y como PROCESO no es un conflicto: el area dice donde trabaja
> una persona, el proceso dice de que trata una capacitacion. Se resuelve poniendo el proceso
> Comercial en el area Comercial.

**Donde se aplica.** Catalogo, convocatorias y plan (lectura), y como compuerta de ESCRITURA al
crear o **mover** algo de proceso. Lectura fuera de alcance: 404, no 403 —un 403 sobre un id
confirma que ese id existe—. Escritura: 403 **con explicacion**, porque el proceso lo eligio quien
llama en un desplegable que ya vio. Pedir un proceso ajeno por filtro devuelve **lista vacia**: ni
mentir mostrando lo suyo bajo otro rotulo, ni confirmar que el otro existe.

**Donde se configura, y por que en dos sitios.**

| Pantalla | Que hace |
|---|---|
| **Gestiona**, en el alta y la edicion de la persona | **Lo ESCRIBE.** Dos opciones —toda la empresa, o solo estas areas y procesos— y dos listas marcables a la vez |
| **Permisos** de la persona | **Solo lo MUESTRA**, porque cambia el significado de los permisos que hay debajo. Remite a la ficha para cambiarlo |

**Un dato, un editor** (2026-08-30). Los dos lo escribian y por eso divergieron: la ficha asumia
que un alcance de area era siempre "su propia area" y lo reescribia al guardar cualquier cosa. La
cura no es sincronizar mejor las dos pantallas — es que escriba una.

**Las DOS areas de la ficha no son la misma cosa**, y se leen sin preguntarlo: arriba, *Area donde
trabaja* (`users.area_id`), de la que salen las formaciones que se le exigen a ELLA; abajo, en el
alcance, las areas que ADMINISTRA — donde la suya, si aparece, sale rotulada "(donde trabaja)". Se
toma **solo lo marcado**: marcar SGI no arrastra Logistica. Y no se obliga a incluir la suya, porque
quien trabaja en Gestion Humana y lleva SARLAFT acabaria administrando todo Gestion Humana.

Las dos escriben la MISMA tabla y **reemplazan el conjunto completo**. Que la simple no supiera
representar todos los casos costo un fallo real: asumia que un alcance de area era siempre "su
propia area", asi que guardar cualquier cambio de la ficha reescribia el alcance de quien lo
tuviera sobre otra area. Hoy marca areas y procesos igual que Permisos, asi que no hay estado que
no sepa mostrar. **Y no deja guardar "acotado" sin marcar nada**: cero filas significa ver todo, o
sea lo contrario de lo que se acaba de pedir.

**Lo que el alcance NO acota todavia: las PERSONAS.** Quien tiene alcance sigue viendo a todos los
usuarios y sus reportes. No es un olvido, es una decision pendiente: acotar personas por area
rompe al analista cuya formacion cruza areas —SARLAFT se le exige a comercial, cartera y
logistica—, que no podria ver el avance de sus propios obligados. Lo propuesto (sin construir) es
filtro por area **por defecto y quitable** en Personas, recorte de reportes **por proceso** (que ya
funciona) y restriccion dura solo donde se decide SOBRE la persona, que es un permiso y no un
alcance.

---

## 4. Las tres reglas de inmutabilidad

Todo el valor probatorio del sistema descansa en estas tres. Si alguna se rompe, el producto deja
de servir para auditoria.

### 4.1 Contenido publicado
Publicar una version **congela** todo:
- Las lecciones se **copian** a copias marcadas como publicadas, que rechazan toda edicion.
- Se congelan el temario (para las constancias) y la nota minima exigida.
- Se congela **quien responde** por la formacion (`activity_versions.responsible_user_id`).
- La version publicada rechaza agregar, quitar o reordenar contenidos.

**El responsable tiene DOS niveles, y esa es la parte que se malentiende** (Decision #64):

| Nivel | Que responde | Cuando cambia |
|---|---|---|
| `processes.responsible_user_id` | Quien lleva el proceso HOY | Se edita en Configuracion → Procesos |
| `activities.responsible_user_id` | Quien responde por esta formacion HOY. Se copia **por valor** del proceso al crearla | Solo con un borrador de version abierto |
| `activity_versions.responsible_user_id` | Quien respondia cuando esa version **se publico** | Nunca: es historia |

Copiar por valor del proceso a la actividad ya evitaba que cambiar al lider de SARLAFT reescribiera
las capacitaciones existentes. Lo que faltaba era el tercer nivel: sin el, editar la ficha cambiaba
en silencio quien figuraba como responsable de la version publicada en marzo, que es **evidencia**.

Por eso el campo se comporta como el contenido: se decide **mientras hay borrador** —al crear la
formacion desde cero o tras abrir una version nueva— y se congela al publicar. Con una version
publicada y ningun borrador, el servidor responde `RESPONSIBLE_LOCKED` y la pantalla lo dice
deshabilitando el campo, sin esconderlo, con la salida escrita: crear una version nueva.

**Las notificaciones NO usan el congelado.** Un aviso de incumplimiento va al responsable
**vigente** del proceso: para avisar sirve quien esta hoy, y para la evidencia quien estaba
entonces. Son dos usos distintos del mismo dato y estan separados a proposito.

La regla vive en `apps/api/src/activities/responsible-rules.ts`, pura y con 7 pruebas.

"Editar" lo publicado crea la version siguiente en borrador, con copias editables. La anterior no
se toca.

**Verificado:** tras editar la leccion de la version 2, la de la version 1 conserva sus tarjetas
originales.

**Publicar la version nueva no arrastra a nadie por su cuenta.** La convocatoria sigue colgada de
la version que entregaba, y se apunta a la nueva con un acto deliberado (`migrate-version`) que
avisa en pantalla, ensena a cuantos afecta y pasa por la misma compuerta que publicar. Entonces
—y solo entonces— se aplica la **politica de migracion** que se eligio al publicar esa version:

| Politica | Quien pasa a la version nueva |
|---|---|
| `FINISH_OLD` | Nadie de los ya inscritos; solo quienes se inscriban despues |
| `MOVE_NOT_STARTED` (por defecto) | Quien no ha abierto nada. Se comprueba por HECHOS (sin avance ni intentos), no por el rotulo del estado |
| `RESTART_NEW` | Todo el que no haya cerrado; vuelve a empezar |

Dos frenos que **ninguna** politica levanta: una ejecucion cerrada (completada, aprobada,
reprobada, retirada o vencida) no cambia de version nunca, y quien ya tiene otra ejecucion abierta
de la version destino se queda donde esta —moverlo dejaria dos ejecuciones suyas de la misma
version y el avance no sabria en cual guardarse—. El avance del que se mueve **no se borra**:
queda apuntando a los contenidos de la version anterior, deja de contar (la completitud se calcula
contra los contenidos de la version de la ejecucion) y sigue disponible para auditoria.

La regla vive aparte y probada en `apps/api/src/offerings/version-migration.ts`.

### 4.2 Preguntas y examenes
Editar una pregunta crea una version nueva. Cada intento guarda **que preguntas cayeron, en que
orden y con que opciones**, apuntando a la version que se sirvio.

Esto permite anular una pregunta defectuosa y recalificar solo a quienes les toco. Sin ese
detalle, una impugnacion no se puede defender.

### 4.3 Registros e historia
- Las membresias de audiencia guardan cuando se entro y cuando se salio; **nunca se borran**.
- Las obligaciones retiradas se marcan como retiradas, no se eliminan.
- Cada renovacion de una certificacion es un registro nuevo.
- Cada inscripcion guarda una foto del momento: titulo, version, nota minima y **el cargo y area
  que la persona tenia ese dia**.

---

## 4.4 Las dos superficies, y quien pasa de una a otra

El producto tiene dos caras con vocabulario, densidad y chrome distintos: el **panel** (`(admin)`)
y la **formacion propia** (`(learner)`). No es una cuestion de estilo: quien administra recorre
listas y compara cifras; quien se forma hace una cosa a la vez.

**Pero la misma persona es las dos.** El jefe de SGI programa la formacion de la empresa y ademas
tiene que hacer su reinduccion. Hasta la Decision #65 eso no se podia: no habia un solo enlace del
panel a `/hoy`, y el rol Analista ni siquiera tenia `enrollments:read_own`.

**Una sola cuenta, siempre.** `users` es unico por (tenant, documento): una persona es una cedula.
Una segunda cuenta "de aprendiz" exigiria inventar un documento, y ese documento falso entra en la
matriz de competencia, en el denominador del plan y en la constancia que firma el auditor.

**Como se resuelve.**

| Pieza | Que hace |
|---|---|
| `permission.service.ts` | Concede `enrollments:read_own` a TODOS, despues de los overrides: no se hereda del rol y no se puede retirar |
| `lib/landing.ts` | `isLearnerOnly` decide donde aterriza cada quien; `managesAnything` decide quien ve el camino de vuelta |
| `layout/space-switcher.tsx` | El control de la barra superior, con el contador de lo pendiente |

Nada de esto mira el NOMBRE de un rol (Decision #19): un cliente puede llamar "Asistente" al suyo
que gestiona y funciona igual. `managesAnything` se define por descarte —tener algun permiso que
no sea "lo mio"— para que no haya que ampliar una lista cada vez que el producto crece.

**La bandeja es UNA y lleva las dos naturalezas.** Desde que quien administra tambien se forma,
el mismo buzon recibe "tienes una formacion nueva" (lo haces tu) y "alguien agoto sus intentos"
(trabajo sobre otro). No se parte en dos bandejas —la persona es una sola, y mirar en dos sitios es
como se pierde un aviso—: cada aviso lleva su etiqueta, **Tu formacion** o **Gestion**
(`lib/notification-kind.ts`). Un tipo de evento que no este en el mapa **no se etiqueta**:
inventarle una naturaleza seria una suposicion con aspecto de dato.

| Evento | A quien | Etiqueta |
|---|---|---|
| `ASSIGNMENT_CREATED`, `PLAN_ASSIGNMENTS_CREATED`, `ENROLLED` | a la persona obligada | Tu formacion |
| `ATTEMPTS_EXHAUSTED` | responsable del proceso + jefatura del area | Gestion |
| `APPROVAL_REQUESTED` | a quien tiene `approvals:decide` | Gestion |
| `OFFERING_PUBLISHED` | al instructor ("vas a dictarla") | Gestion |

### La vida de un aviso: aparece, se apaga, se borra

Un aviso no puede quedarse para siempre, y tampoco puede desaparecer en cuanto molesta. Tiene tres
momentos y cada uno lo dispara algo distinto:

| Momento | Cuando | Que pasa |
|---|---|---|
| **Aparece** | ocurre el hecho (te asignan, te aprueban, alguien agota intentos) | sin leer; cuenta en la campana |
| **Se apaga** | lo abres · marcas todo leido · **la obligacion se cumple** · **la obligacion se retira** | leido: sale de la vista, sigue bajo "Ver leidas" |
| **Se borra** | 30 dias despues de leido · 90 sin que nadie lo abriera | desaparece de la base (`NotificationRetentionWorker`, diario a las 3) |

**Se apaga solo en los dos casos en que ya no pide nada:**
- **Cumplida** (`completion.service.ts`): terminar la formacion apaga el aviso que la anunciaba.
- **Retirada** (`requirement-engine.service.ts`): quien sale de la audiencia deja de estar
  obligado, y el aviso que se le mando deja de reclamarle algo que ya no se le exige. Este es el
  caso que se veia como "la campana dice que tengo X y X no esta en mis pendientes".

**EMPEZARLA NO lo apaga, a proposito.** Un aviso puede estar pidiendo que la TERMINES; apagarlo al
abrir la formacion silenciaria justo el recordatorio que hacia falta.

**Y borrar es seguro porque el aviso es una COPIA.** El hecho vive en `assignments`, en
`audit_logs` y en `enrollments`; lo que caduca es el recordatorio, no el registro. Por eso el
ciclo no toca los avisos de correo pendientes de enviar: esos todavia no cumplieron su funcion.

**El contador cuenta PENDIENTES, no avisos.** Son dos senales distintas y estan a dos centimetros
una de otra en la barra: la campana cuenta lo que no has leido y se apaga al leerlo; el conmutador
cuenta lo que te falta por HACER y no se apaga hasta que lo haces. Si contara avisos, bajaria a
cero sin que nadie se hubiera capacitado. **Cifra solo cuando algo esta VENCIDO**; con pendientes al dia, un punto y nada mas. Con numero
siempre quedaba pegado al numero de la campana y los dos se leian como el mismo dato: tener
formacion pendiente es lo normal, tenerla vencida es lo que hay que mirar hoy, y solo eso merece
una cifra. El rojo va en el contador, nunca en el boton entero.

---

## 4.5 El motor de obligaciones

Es el unico componente que **crea trabajo por su cuenta**, asi que su diseno se rige por tres
propiedades, en este orden:

**1. Idempotente.** Un indice unico de (requisito, persona, ronda) y `skipDuplicates` en la
insercion. El motor corre en dos disparadores a la vez —el alta de una persona y el ciclo horario—
y repetirlo no puede duplicar nada. Las obligaciones manuales y las del plan no llevan requisito,
asi que no entran en esa restriccion: esas se controlan en el servicio comprobando lo que ya esta
vivo.

**2. En caliente donde importa, en frio donde alcanza.** Al dar de alta a alguien o cambiarle el
cargo, sus obligaciones se recalculan en el acto: la matriz de competencia no puede mentir hasta
el proximo ciclo. Lo que solo cambia con el paso del tiempo —la reinduccion que cumple su ano, lo
que se paso de fecha— lo cubre un ciclo por hora. Si el enganche en caliente falla, no tumba el
alta: lo registra y el ciclo lo recupera.

**3. Una sola definicion de la regla.** El filtro que busca miembros y el predicado que decide en
memoria se derivan del mismo listado de facetas (`audience-rule.ts`). Dos implementaciones podrian
discrepar, y ahi la lista que ve el analista y las obligaciones que nacen dejarian de coincidir.

### Fechas: dia civil, no instante
Un vencimiento es un **dia**: "vence el 31 de enero" significa que a las 11 de la noche del 31
todavia se cumple. Todo vencimiento se ancla al cierre del dia en Colombia (que no tiene horario
de verano, asi que el desfase es siempre -05:00 y la aritmetica es exacta, sin libreria de zonas).

**La trampa, ya pagada una vez:** una columna de solo fecha (`hired_at`) llega como medianoche
UTC. Si se le aplica el desfase de Bogota, el 1 de diciembre se lee como 30 de noviembre y **todos**
los vencimientos anclados al ingreso se corren un dia. Hay dos funciones distintas a proposito
(`toBogotaDate` para instantes, `fromDateOnly` para fechas de calendario) y una prueba que falla
si se confunden.

---

## 4.55 Asignaciones: quien esta obligado a que

Cuatro piezas que se confunden entre si porque las cuatro hablan de "a quien". Se distinguen por
lo que HACEN:

| Pieza | Tabla | Que es | ¿Obliga por si sola? |
|---|---|---|---|
| **Audiencia** | `audiences` | Un GRUPO definido por reglas (cargo, tipo de cargo, area, regional, tipo de contrato, servicio). Se recalcula solo: quien entra y cumple la regla, entra al grupo | **No.** Es el "a quienes" reutilizable |
| **Requisito** | `assignment_rules` | La REGLA permanente: *a esta audiencia · esta formacion · disparada por X · vence en N dias · se repite cada M meses* | **Si**, y ademas hacia el futuro |
| **Matriz** | `activity_job_titles` | La matriz de competencia: que formacion exige cada CARGO | Si, a traves del motor |
| **Obligacion** | `assignments` | El RESULTADO: una fila por persona y formacion, con vencimiento, estado y origen (`RULE`, `PLAN`, `MANUAL`) | Es lo unico que se mide |

**Quienes**, en la ficha de la formacion, crea obligaciones `MANUAL`: el atajo para cuando no hay
regla que lo cubra.

**Y la convocatoria (`offerings`) es otra cosa**: la JORNADA —cuando, donde, quien dicta,
modalidad, intensidad horaria, proyectados—. La inscripcion (`enrollments`) cuelga de ella.

> **Obligacion ≠ convocatoria.** Una dice *a quien se le exige y para cuando*; la otra, *cuando se
> dicta*. Por eso una formacion tiene UNA lista de obligados y VARIAS jornadas.

### Estados de una obligacion, y el que mas confunde

`PENDING` · `IN_PROGRESS` · `OVERDUE` son las abiertas: son las que salen en "lo pendiente" de la
persona. `COMPLETED` cierra. `WAIVED` la exime alguien con motivo.

**`WITHDRAWN_LEFT_AUDIENCE` es la que produce la pregunta "¿por que no aparece?"**: la persona
dejo de pertenecer a la audiencia que se la exigia —se retiro el requisito, o cambio de cargo— asi
que la obligacion se retira. El AVISO que se mando en su dia se queda, porque un aviso es el
registro de algo que paso y no un espejo del estado de hoy. Por eso pulsar un aviso viejo puede
llevar a una formacion que ya no esta entre las tuyas, y por eso la pantalla lo DICE en vez de
quedarse muda (`(learner)/formacion/[activityId]`).

### Lo que el tipo de formacion ya sabe y todavia nadie usa

`activity_types.config` trae `defaultAssignmentMode` (`ON_HIRE` | `BY_JOB_TITLE` | `MANUAL`),
`participatesInPlan`, `requiresBeforeHire`, `defaultRecurrenceMonths`… y **ninguna consulta lo
lee**. Es la tercera semilla del proyecto que se guarda y no se aplica, despues de
`analyst_scopes` y `norms.annual_hours_required`. Lo que deberia gobernar esta escrito en
`docs/HANDOFF.md` (sesion del 2026-08-30) y es el trabajo que sigue.

---

## 4.6 El plan anual de capacitacion

El plan es una **entidad empresarial propia**, no una vista de las convocatorias: tiene objetivo,
metas, aprobacion, indicadores y un ciclo de vida. Sus renglones REFERENCIAN convocatorias; el plan
no posee las capacitaciones, de modo que reprogramar una jornada o partirla en dos sedes no
reescribe el plan.

### Las dos tablas

| Tabla | Que guarda |
|---|---|
| `training_plans` | El programa del ano: `year`, `name`, objetivo, metas, alcance, `status`, quien y cuando aprobo |
| `plan_items` | Cada renglon: a que `offering` apunta, `planned_month`, su `status` y el `projected_snapshot` congelado |

Un renglon **no** guarda a quien obliga: eso son `assignments` con `source = PLAN` y
`plan_item_id` apuntando al renglon. Esa columna es la que sostiene la regla de oro 2.

### Los cuatro estados

```
BORRADOR ──aprobar──> APROBADO ──activar──> EN EJECUCION ──cerrar──> CERRADO
   │                      │                      │                      │
   se compone        ya obliga              ya obliga            es la evidencia
   libremente        a personas             a personas           del ano (final)
```

- **BORRADOR**: se arma. Agregar, quitar y reordenar renglones no tiene consecuencias para nadie.
- **APROBAR** hace dos cosas irreversibles y por eso pide `plans:approve` y confirmacion:
  1. **congela** el proyectado de cada renglon (`projected_snapshot`), que es el DENOMINADOR de la
     cobertura, y
  2. **materializa** las obligaciones: crea un `assignment` por persona alcanzada, con vencimiento
     al ultimo dia del mes programado.
  No se aprueba un plan vacio ni uno con convocatorias en borrador: sin publicar no hay proyectados
  que congelar.
- **EN EJECUCION** es el mismo plan, marcado como el que esta corriendo.
- **CERRADO**: el ano termino. No admite renglones nuevos, no se edita, no se borra y **no se
  reabre**: cerrar es exactamente lo que lo convierte en evidencia ante un auditor.

### Materializar: la operacion central

`materialize()` (en `plans.service.ts`) es lo que de verdad hace "aprobar", renglon a renglon, y
vive aparte porque tambien lo necesita **agregar una jornada a un plan ya aprobado** (Decision #55):
un renglon que entra en agosto tiene que obligar igual que los que entraron en enero.

Es **idempotente a proposito**: mira que asignaciones ya existen antes de crear. Aprobar dos veces,
o agregar y reintentar, no puede duplicar obligaciones — duplicarlas corrompe todo indicador de
cumplimiento.

### Los indicadores, y por que son estables

```
Cumplimiento = renglones EJECUTADOS / renglones PROGRAMADOS      ← ¿se hizo lo que se dijo?
Cobertura    = personas CAPACITADAS / proyectado CONGELADO       ← ¿llego a quien tenia que llegar?
```

Ambos se calculan **exclusivamente** sobre las obligaciones del propio plan (`source = PLAN` +
`plan_item_id`), nunca sobre las inscripciones de la convocatoria. Es la regla de oro 2: lo que se
asigne por fuera del plan —una inscripcion voluntaria, una obligacion manual— **no mueve** sus
numeros. Sin eso, el cumplimiento del ano cambiaria solo porque alguien se inscribio por su cuenta.

El denominador se congela al aprobar por la misma razon: si se recalculara en vivo, contratar gente
en octubre bajaria el cumplimiento de una jornada que se hizo bien en marzo.

**Quien pregunta ve su parte.** Un analista con alcance no abre "el plan de la empresa con 52
renglones": abre los suyos, y las metricas se calculan sobre los renglones VISIBLES. Ensenarle el
62% global junto a sus ocho jornadas seria un numero que no puede explicar ni mover.

### Que se puede cambiar, y cuando

| Accion | Borrador | Aprobado / En ejecucion | Cerrado |
|---|---|---|---|
| Agregar renglon | si | si, **con motivo**; nace obligando (#55) | no |
| Quitar renglon | si (si no genero obligaciones) | no — se **cancela** con motivo | no |
| Mover de mes | si | si; el renglon pasa a **REPROGRAMADA** | no |
| Ajustar el proyectado congelado | — | si, con motivo auditado (#56) | no |
| Corregir nombre / objetivo / metas / alcance | si | si, **con motivo** (#63) | no |
| Cambiar el ANO | si | **no** (#63) | no |
| **Borrar el plan** | si | **solo si nadie EMPEZO** (#62) | no |

**Por que el ano no.** Identifica al plan junto al nombre (`@@unique [tenant, year, name]`) y ancla
el vencimiento de cada renglon al ultimo dia de su mes: cambiarlo despues de aprobar moveria la
fecha limite de gente que ya tiene la obligacion encima.

**Por que "quien empezo" y no el estado, para borrar** (Decision #62). Lo que hay que proteger no es
el plan: es lo que la GENTE ya hizo contra el. Un plan aprobado por error el viernes y detectado el
lunes es un error, no historia, y arrastrarlo todo el ano ensucia el cumplimiento de la empresa
entera. Pero en cuanto una sola persona abrio una de sus formaciones, ese avance es suyo y borrarlo
seria borrarselo. La regla vive pura y probada en `plans/plan-deletion.ts`:

```
CERRADO                          → PLAN_CLOSED_IS_EVIDENCE
alguien empezo (>= 1 enrollment) → PLAN_HAS_EVIDENCE (dice cuantos son)
resto                            → se borra, revocando N obligaciones
```

Borrar **revoca**: las asignaciones `source = PLAN` del plan se borran en la misma transaccion que
el plan. No pueden quedar huerfanas —apuntan al renglon por clave foranea— ni vivas: una obligacion
sin plan que la explique es justo lo que el plan existe para evitar. Los renglones caen solos
(`ON DELETE CASCADE`). Las capacitaciones y convocatorias que el plan referenciaba **no se tocan**.

Exige `plans:approve` y no `plans:manage`: borrar el plan del ano es al menos tan grave como
aprobarlo.

### Los archivos

| Archivo | Que resuelve |
|---|---|
| `api/src/plans/plans.service.ts` | Ciclo de vida, renglones, materializacion, borrado |
| `api/src/plans/plan-metrics.ts` | Cumplimiento y cobertura, puro |
| `api/src/plans/plan-deletion.ts` | Que plan se puede borrar y que revoca, puro |
| `web/app/(admin)/plan/page.tsx` | Listado, crear y eliminar |
| `web/app/(admin)/plan/[id]/page.tsx` | El plan del ano: cronograma, renglones, indicadores, editar |

---

## 5. Donde vive cada cosa

```
apps/api/src/
  auth/          Ingreso, renovacion, activacion de cuenta
  common/        Guards, decoradores, filtro de errores, auditoria, permisos, Sentry
  prisma/        Acceso a datos con aislamiento por empresa
  tenants/       Datos publicos de la empresa y sus preferencias
  catalogs/      Los 8 catalogos maestros (un solo motor para los ocho)
  roles/         Roles y sus permisos
  users/         Personas, contrasenas generadas, carga masiva
  approvals/     Solicitudes del analista y su aplicacion al aprobar
  notifications/ Bandeja de salida, bandeja interna y envio de correo
  storage/       Archivos con adaptador y validacion por firma binaria
  activities/    Catalogo formativo y MOTOR DE VERSIONADO
  lessons/       Lecciones y tarjetas
  assessments/   Banco de preguntas y constructor de examenes
  offerings/     Convocatorias y sus proyectados congelados
  assignments/   Audiencias, requisitos y MOTOR DE OBLIGACIONES
  plans/         Plan anual y sus metricas aisladas
  learning/      EL LADO DEL APRENDIZ: reproductor, intentos y cierre del ciclo
  engagement/    Repeticion espaciada, racha, puntos y cadencia de avisos
  workers/       Tareas programadas: obligaciones y avisos de pildora

apps/web/
  public/sw.js   Service worker propio: cache sin senal y cola de reenvio
  public/icons/  Iconos de la PWA (se generan con scripts/generate-icons.mjs)
  src/app/(admin)/    Panel de administracion (escritorio)
  src/app/(learner)/  Superficie del aprendiz (movil, barra inferior)
  src/app/(player)/   Reproductor y examenes (pantalla completa, sin chrome)
  src/components/ui/  Biblioteca del sistema de diseno "Pulso"
  src/components/layout/  Estructura: barra lateral, barra superior, sesion
  src/lib/            Clientes HTTP tipados

packages/shared/src/schemas/   Contratos Zod: fuente unica de la verdad
```

### Una presentacion se convierte; no se sirve

Subir un PPT y entregarlo tal cual seria lo comodo y no dejaria evidencia de nada: en un visor la
persona hace scroll y la plataforma no sabe si leyo. Por eso una presentacion pasa por un
conversor y se reproduce como una secuencia de imagenes, que si se puede medir (ver *Presentacion*
en el glosario).

```
PPT/PPTX/ODP --LibreOffice--> PDF --pdf.js + lienzo nativo--> N imagenes WebP --> manifiesto
                                ^
                        un PDF entra por aqui
```

- **El PDF es el camino que siempre esta disponible**: se rasteriza en proceso con `pdfjs-dist` y
  `@napi-rs/canvas`, sin binarios del sistema. **PPT/PPTX/ODP exigen LibreOffice** en modo consola;
  si no esta, la pantalla lo dice ANTES de que alguien elija el archivo
  (`GET /media/presentation/capabilities`) y la salida es exportar a PDF, que es un clic.
- **WebP, no PNG.** Una diapositiva lleva fotos y degradados: en PNG pesaba 1,4 MB cada una —doce
  megas por una presentacion de once—, y eso en un telefono en carretera no se abre.
- **El original se guarda igual.** Es el documento que entrego la ARL o el proveedor y una
  auditoria puede pedirlo tal cual; lo que se reproduce son siempre las diapositivas.
- **Las diapositivas no son paquetes propios.** Cuelgan de la clave del original
  (`<clave>.slides/NNN.webp`) y su lista vive en el `manifest` del paquete padre. Eso obliga a
  decidir a mano si una clave se sirve: la regla vive en `storage/slide-storage.ts`, pura y
  probada, porque es una frontera de seguridad.
- **Se completa viendolas todas.** No hay barra que arrastrar, asi que un umbral por debajo del
  100% no significaria nada. La regla esta en `learning/progress-rules.ts`.

### El reproductor: tres columnas y una sola cosa que se desplaza

Lo que ve quien cursa en escritorio, desde el 2026-08-28 (Decision #49):

```
[ carril 64px ] [           escenario            ] [ indice 340px ]
   iconos,        video / diapositivas / tarjetas    la formacion
   plegado        + accion + pestanas                entera
                  ^ lo unico que se desplaza
```

- **La raiz es `h-screen overflow-hidden`, no `min-h-screen`.** Es lo que hace que bajar a leer el
  resumen no se lleve por delante la barra y el indice, que son justo lo que hay que tener a la
  vista mientras se cursa.
- **El indice va a la derecha** para que al plegarlo el escenario crezca hacia ese lado y su borde
  izquierdo no se mueva. A la izquierda, mostrarlo u ocultarlo desplazaria el video de sitio.
- **El indice dice el TAMANO de cada parte en la unidad de su tipo** —8 tarjetas, 11 diapositivas,
  5 min— y nunca inventa minutos: de un video subido no se conoce la duracion hasta reproducirlo,
  y un numero redondo inventado es peor que no decir nada. Los datos salen de
  `openEnrollment`, que cuenta las tarjetas de la leccion y las diapositivas del manifiesto.
- **Debajo del escenario, pestanas fijas con contenido de la pieza actual:** Resumen (de que va,
  que se exige para darla por vista, de que proceso y norma sale) y Material de apoyo (los
  documentos de la formacion, por URL firmada). Fijas para que se aprenda donde esta cada cosa;
  su contenido cambia con la pieza para que no sean los datos de la formacion repetidos.
- **La evaluacion NO usa este armazon** (Decision #50): se rinde a pantalla completa, sin indice ni
  material a la vista. Un examen con el contenido al lado es un examen a libro abierto.
- En **movil** no hay carril ni indice: queda la barra superior con el titulo y la salida.

### Archivos que conviene conocer

| Archivo | Por que importa |
|---|---|
| `prisma/prisma.service.ts` | El aislamiento por empresa. Todo pasa por aqui |
| `activities/versioning.service.ts` | El motor de inmutabilidad. La pieza mas delicada |
| `assessments/question-payload.ts` | **El unico lugar** que sabe donde vive la respuesta correcta |
| `approvals/approvals.service.ts` | La compuerta del flujo del analista |
| `learning/completion.service.ts` | Cierra el ciclo ejecucion -> obligacion -> cobertura del plan |
| `engagement/nudge.ts` | El limite entre recordar y hostigar. Funcion pura, probada aparte |
| `offerings/version-migration.ts` | El limite entre actualizar el contenido y borrarle el avance a alguien. Funcion pura, probada aparte |
| `storage/slide-converter.service.ts` | Convierte una presentacion en diapositivas. Los dos caminos (PDF siempre; Office solo con LibreOffice) y por que |
| `storage/slide-storage.ts` | Que imagen de una presentacion se puede servir con una firma valida. Frontera de seguridad. Funcion pura, probada aparte |
| `learning/progress-rules.ts` | Cuando una pieza cuenta como cumplida y que queda escrito de ella. Funcion pura, probada aparte |
| `web: modules/learner/player-chrome.tsx` | El armazon del reproductor: carril plegable, barra superior y contencion del desplazamiento |
| `web: modules/learner/course-index.tsx` | El indice de la formacion y las reglas de a donde se puede saltar |
| `apps/web/public/sw.js` | Que se guarda en el telefono y que se reintenta sin senal |
| `prisma/sql/rls.sql` | Las politicas de la base de datos |
| `.claude/skills/pulse-ui/SKILL.md` | El contrato de diseno de toda la interfaz |

---

## 6. Seguridad aplicada

| Riesgo | Como se ataja |
|---|---|
| Ver datos de otra empresa | Dos capas independientes + prueba automatica en integracion continua |
| Robo del token | El token de acceso vive solo en memoria, dura 15 minutos; la renovacion va en cookie httpOnly con rotacion en cada uso |
| Fuerza bruta | Bloqueo por cuenta, no solo por IP. Auditado |
| Ver las respuestas del examen | Un solo modulo las conoce; la vista del aprendiz las elimina, y una prueba falla si se filtran |
| Subir un ejecutable disfrazado | Validacion por **firma binaria**, no por extension ni por lo que declare el navegador |
| Saltarse la secuencia por API | Las validaciones viven en el servidor, no en la interfaz |
| Enumerar certificados | El codigo publico de verificacion es aleatorio, nunca el consecutivo |
| Filtrar datos personales a terceros | Sentry configurado sin datos personales |
| Leer la formacion de otro en un telefono compartido | Al cerrar sesion se borran el cache sin senal y la cola pendiente del dispositivo |
| Perder el avance de alguien por un token vencido | La cola de reenvio usa el token vigente que le pasa la pagina, no el que se guardo horas antes; un rechazo por sesion caducada CONSERVA el envio en vez de descartarlo |
| Que alguien lea los archivos de otra empresa | Los archivos se sirven por URL FIRMADA: pedirla exige sesion y comprueba el tenant; usarla no, porque una etiqueta `<img>` o `<video>` no puede autenticarse. La firma ata clave + caducidad + secreto del servidor, y se compara en tiempo constante |
| Servir un archivo cualquiera acertando una clave bajo la carpeta de una presentacion | Las diapositivas no estan registradas una a una: se autorizan comprobando que el paquete padre existe, es de esta empresa y que esa imagen figura DE VERDAD en su manifiesto. Una clave inventada bajo esa carpeta no se sirve |
| Que el nombre de un archivo subido llegue a la linea de comandos | LibreOffice recibe el archivo a convertir como argumento. El nombre se reescribe antes (`safeTempName`): sin separadores de ruta, comillas ni nada fuera de `a-z0-9._-` |
| Ejecutar lo que venga dentro de un PDF subido | El rasterizado corre con `isEvalSupported: false` y sin fuentes del sistema |
| Dar por visto un video que nadie vio | Con archivo propio **y con YouTube** (a traves de su API de reproductor) se cuentan los SEGUNDOS DISTINTOS reproducidos —adelantar deja huecos y no suma— y el avance se bloquea hasta el minimo exigido. Donde no se puede medir se registra como declaracion, dicho en pantalla, y el avance viaja marcado (`MEASURED` / `DECLARED`) para que el auditor sepa como se supo |

---

## 7. Calidad: que corre y cuando

| Nivel | Que cubre | Cuando |
|---|---|---|
| **Unitarias** | Logica pura y delicada: generacion de contrasenas, traduccion de preguntas (incluida la que falla si se filtra una respuesta), validacion de archivos | En cada cambio |
| **Aislamiento** | Que una empresa no vea ni escriba datos de otra | Compuerta dura de integracion continua |
| **De extremo a extremo** | El flujo real en navegador, un archivo por sprint, acumulativo | Antes de cerrar cada sprint |
| **Humo por HTTP** | Flujos completos contra la API real (versionado, aprobaciones) | Al construir cada motor |

Integracion continua: un trabajo de calidad estatica (lint, tipos, compilacion, unitarias) y otro
de integracion (base de datos real, politicas de seguridad, datos semilla, aislamiento y pruebas
de navegador, con reporte adjunto si falla).

---

## 8. Entorno de desarrollo

```
pnpm docker:up      Base de datos y Redis (puertos propios; ver docs/02-aislamiento-proyectos.md)
pnpm db:migrate     Migraciones
pnpm db:rls         Politicas de seguridad de la base
pnpm db:seed        Datos semilla de Transprensa
pnpm db:verify-rls  Prueba de aislamiento
pnpm dev            API y web
pnpm lint / typecheck / test / build
pnpm test:e2e       Pruebas de navegador
```

**Se ejecuta con Node nativo de Windows, no desde WSL.** Medido: los mismos comandos tardan de 10
a 30 veces mas a traves del puente de WSL hacia el disco de Windows (la compilacion de la API
paso de mas de 5 minutos a 22 segundos). Detalle en `docs/RUNBOOK.md`.

---

## 9. Produccion

Decidido y analizado en `docs/03-infraestructura-produccion.md`. En resumen:

- **VPS propio** con todo en contenedores. No comparte nada con el entorno de SAC-NEO.
- **Cloudflare R2 para archivos**, por su trafico de salida sin costo: es la decision que evita
  que el video dispare la factura.
- **AWS descartado** para esta etapa: se paga el ecosistema sin usarlo y su trafico de salida
  castiga justo lo que mas consume el producto.
- Copias de seguridad diarias con copia fuera del servidor, y **restauracion probada** antes de
  salir a produccion.

- **La imagen de la API necesita LibreOffice** si se quiere aceptar PowerPoint: sin el, solo se
  podran subir presentaciones en PDF y la pantalla lo dira. En Debian/Ubuntu basta
  `libreoffice-impress` (arrastra bastante; es el precio de convertir PPTX en el servidor).

**Lo que falta antes de desplegar:** el adaptador de R2 (hoy lanza un error explicito a proposito,
para que sea imposible desplegar sin completarlo), la definicion de contenedores de produccion,
los guiones de despliegue y respaldo, el dominio con subdominios comodin, y el monitoreo de
disponibilidad.

---

## 10. Deuda tecnica conocida

Honesta y priorizada:

| Deuda | Impacto | Cuando resolverla |
|---|---|---|
| Adaptador de almacenamiento en la nube | Bloquea el despliegue (a proposito) | Sprint de produccion |
| El despachador de correo recorre todas las empresas cada 30 segundos | Irrelevante con una empresa; con decenas conviene una cola real | Cuando haya varias empresas |
| La integracion continua nunca se ha ejecutado de verdad (no hay repositorio remoto) | El flujo esta escrito pero no probado | Al publicar el repositorio |
| Redis sin usar: sin cache de permisos ni colas | Rendimiento bajo carga; hoy el envio de correo y el motor de obligaciones usan tareas programadas en proceso | Cuando el volumen lo pida |
| El ciclo de obligaciones recorre requisito por requisito y persona por persona | Correcto y legible, pero con miles de personas y decenas de requisitos conviene resolverlo por lotes en la base | Cuando una pasada tarde mas de unos segundos |
| Un requisito solo puede exigir una **actividad** (no rutas ni certificaciones) | El modelo ya las soporta; el motor no. Devuelve un error explicito en vez de fingir | Sprints 4-5 |
| El cache sin senal guarda lo que la persona **ya visito**; no descarga por adelantado las lecciones que tiene asignadas | Quien nunca abrio la pildora con senal no puede cursarla sin senal | Cuando se sepa el peso real del contenido de Transprensa: es una precarga al entrar a los pendientes |
| Los videos y documentos no se cachean para uso sin senal | Un video de 3 minutos multiplica lo que se guarda en el telefono. La leccion de tarjetas —el formato principal— si funciona sin senal | Segun el peso del contenido real |
| Sin notificaciones push: el aviso de pildora sale por correo y bandeja in-app | El recordatorio llega, pero no al bloqueo de pantalla | Exige claves VAPID y permiso del usuario; se decide con el cliente |
| Un video de **Vimeo o de cualquier otro enlace** que no sea YouTube no se puede verificar: queda como declaracion de la persona | Baja: YouTube —el caso real del cliente— ya se mide desde el 2026-08-27; para el resto, la pantalla lo dice y la recomendacion es subir el archivo | Cada plataforma exige su propio SDK. Se cierra cuando exista una formacion que de verdad viva en Vimeo |
| Al migrar una convocatoria a la version nueva, un examen **ya aprobado sigue aprobado**: la version N+1 hereda el mismo `assessment_version_id` | Baja: es lo correcto mientras el examen no cambie. Si cambia, es otra version de evaluacion y hay que volver a rendirlo | Nada que hacer hoy; se documenta para que nadie lo lea como un fallo de `RESTART_NEW` |
| La franja horaria del aviso se deduce en cada pasada de los ultimos 60 dias de eventos (tope 5.000) | Suficiente para el piloto | Con miles de personas, materializar la hora en una columna |
| Las **diapositivas** de una presentacion no se cachean para uso sin senal, como los videos y documentos | Una presentacion de 20 diapositivas en WebP pesa poco comparada con un video, pero sigue siendo peso en el telefono | Con el mismo criterio que el video: segun el peso del contenido real |
| La imagen de produccion de la API todavia no incluye LibreOffice | Sin el, PPT/PPTX/ODP se rechazan con un mensaje que dice que suban el PDF. No rompe nada, limita | Al definir los contenedores de produccion |
| No hay prueba de navegador que cubra una PRESENTACION | Baja: se verifico a mano de punta a punta el 2026-08-28 (subir, convertir, publicar, migrar y reproducir 6 diapositivas), pero nada impide que una regresion pase sin que salte | Exige un PDF de prueba en el repositorio; el generador esta escrito y cabe en un script del seed |
| La LECCION de tarjetas no lleva las pestanas de Resumen y Material: la pila ocupa el alto de la pantalla | Baja: la descripcion de una leccion no tiene donde mostrarse hoy | Cuando se decida donde va sin pelear con la lectura de la pila: probablemente un desplegable en la barra superior, no una franja debajo |
| Especificacion de API generada desde los contratos | Util al integrar terceros | Baja |
| Plantillas de notificacion editables desde la interfaz | Hoy los textos viven en el codigo | Baja |
| SCORM sin motor | Solo importa si el cliente tiene contenido comprado en ese formato | Segun respuesta del cliente |

---

*Este documento se corrige cuando cambia la arquitectura. La historia de como se llego aqui esta
en `docs/sprints/`.*
