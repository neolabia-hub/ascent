# Recorridos de punta a punta, por tipo de formacion

Scripts que hacen el camino COMPLETO de un tipo de formacion contra la base real, por HTTP y con
sesion: catalogos -> ficha -> contenido -> examen -> publicar -> convocatoria -> persona ->
inscripcion -> curso -> examen -> constancia.

No sustituyen a la suite e2e de Playwright, que prueba la PANTALLA. Estos prueban el CAMINO: que
las piezas encajan entre si y que lo que el tipo promete (examen, constancia, encuesta) de verdad
ocurre. Encuentran otra clase de fallo — los de "esto no llega hasta alli".

## Como se corren

Con el stack levantado (`.\scripts\mirar.ps1`, api en 3012):

```
node scripts/recorridos/induccion-general.mjs
node scripts/recorridos/induccion-especifica.mjs
node scripts/recorridos/reinduccion.mjs   # OJO: obliga a la plantilla entera y la retira al final
node scripts/recorridos/reinduccion-ciclos.mjs      # la ronda SIGUIENTE: cierra y abre
node scripts/recorridos/capacitacion-del-plan.mjs   # crea y APRUEBA un plan en un ano libre
node scripts/recorridos/varias-convocatorias.mjs    # dos convocatorias de la misma formacion
node scripts/recorridos/pildora.mjs
node scripts/recorridos/extraordinaria.mjs          # crea un plan tapadera y lo borra al final
node scripts/recorridos/recertificacion.mjs         # aniversario por persona, y jornada dictada por un tercero
node scripts/recorridos/tajadas.mjs                 # jornadas acotadas: 6 tipos x 7 facetas, y 2 reglas
node scripts/recorridos/proyectados-ajuste.mjs      # congelar, que cambie la plantilla, ajustar con motivo
node scripts/recorridos/asistencia.mjs              # las tres vias de evidencia, "el papel manda", 2 reglas y acotamiento
node scripts/recorridos/estandar.mjs                # TODOS los tipos contra su propia configuracion
node scripts/recorridos/estandar.mjs REINDUCCION    # ... o uno solo
```

**Los nueve de tipo cruzan ademas el SEGUIMIENTO** al terminar (`seguimiento.mjs`): comprueban que
el informe dice lo mismo que paso. Se anadio el 2026-09-04, despues de descubrir que el motor podia
estar bien y el informe mintiendo. Ojo al escribir uno: `/assignments` topa en `pageSize=100` y
pedir mas devuelve 422 con la lista vacia.

Imprime OK/MAL paso a paso y sale con codigo 1 si algo fallo. Al final dice que creo, con su
sufijo, para poder limpiarlo.

## Limpiar despues

Cada corrida deja una formacion, una persona, una leccion, un examen y una convocatoria. Se borran
por prefijo (ver el RUNBOOK, entrada del 2026-09-03). **Ojo con no borrar lo de Playwright**: sus
nombres tambien llevan "E2E", pero con un espacio detras ("Bienvenida E2E 12345678"); los de estos
recorridos no lo llevan ("Bienvenida E2E123456").

## Lo que ya encontraron

- La pestana "A quienes" no se refrescaba al publicar: el requisito automatico nacia y la pantalla
  seguia diciendo que no se le exigia a nadie.
- "Ajustar" el disparador de una induccion no levantaba el corte de "solo a quien entre desde
  ahora", asi que era un boton que se guardaba y no hacia nada.
- **La encuesta salia la PRIMERA del temario**: la formacion empezaba preguntando que te parecio
  algo que aun no habias visto.
- En Programacion, con el contenido en borrador salian **dos avisos contradictorios**: uno decia que
  estaba en borrador y el otro que "el contenido esta publicado".
- **La matriz por cargo se saltaba la Decision #76**: marcar la casilla de una capacitacion del plan
  creaba un requisito que disparaba solo y hacia nacer 143 obligaciones de golpe.
- **Con dos convocatorias publicadas, la misma persona se inscribia DOS veces** a la misma
  formacion: al terminar una, la otra inscripcion se quedaba viva para siempre.
- **El PLAN proyectaba a la misma gente dos veces**: dos jornadas de lo mismo daban 26 proyectados
  con 13 obligados reales, y la cobertura del ano no podia pasar del 50%.
- **Cualquier formacion entraba al PLAN por la API**: el filtro de la Decision #78 solo vivia en la
  pantalla. Meter una induccion general en un plan subio sus proyectados de 22 a 819.
- **Cancelar una jornada no cancelaba un renglon REPROGRAMADO**: seguia contando como programado.
- **`pnpm db:seed` borraba la parametrizacion del tenant** en los tipos de formacion (las encuestas
  que el cliente habia activado desde la interfaz).
- **Las obligaciones nacian VENCIDAS** cuando la audiencia era mas vieja que el requisito — que es
  el caso normal, porque las audiencias se reutilizan. Medido: 7 de 7, con fecha de hacia un mes.
  Es el mas grave de todos: la plantilla entera en rojo el dia que se publica la reinduccion.
- **El informe de Seguimiento contaba lo RETIRADO como "sin empezar"**: no filtraba por estado
  ninguno. Medido: **96.246 obligaciones retiradas** contra 24.477 vivas, todas en el denominador.
  El avance global salia 0,18% cuando lo real es 0,89%. Y la ronda cerrada como NO REALIZADA salia
  tambien como "sin empezar", que dice justo lo contrario: era la mitad que faltaba de la Decision
  #142, que llevaba un dia escrita en el motor y no habia llegado al informe.

## Lo comprobado, que es lo que no hay que volver a averiguar

| | |
|---|---|
| Al publicar nacen **dos cosas solas** | el requisito (a quien se le exige) y, si el tipo es `PERMANENT`, la convocatoria |
| La convocatoria automatica **no se duplica** | si ya hay una —aunque sea BORRADOR— no se crea otra. Ojo: si la tuya se queda en borrador, la formacion queda publicada y **cerrada** |
| El examen **no se publica aparte** | publicar la formacion congela una COPIA; el aprendiz responde la copia |
| El vencimiento **no esta en la convocatoria** | esta en el requisito (pestana "A quienes"): "vence a los N dias del disparador" |
| Ajustar el plazo **no mueve lo ya asignado** | rige para las obligaciones que nazcan desde entonces |
| Lo vencido **no desaparece** | pasa a VENCIDO, el aprendiz la sigue viendo como ATRASADA y la puede hacer |

### Y de la ESPECIFICA (2026-09-03)

Lo que cambia cuando el alcance lo deciden los cargos y no la empresa entera:

| | |
|---|---|
| Publicar **NO exige nada** | el automatismo de la general no se dispara: solo mira `defaultAssignmentMode: ON_HIRE`. La convocatoria permanente **si** se abre sola: son dos automatismos distintos y solo uno depende del cargo |
| La ficha y la matriz son **la misma casilla** | exigirla desde "Quienes" enciende la casilla de la matriz, y encenderla en la matriz crea el requisito. Una audiencia por cargo, reutilizada: no hay dos registros que puedan discrepar |
| Cada cargo, **su requisito** | anadir un cargo no toca el del otro (mismo id, mismas obligaciones); apagarlo tampoco |
| El corte de "solo nuevos" **aqui se elige** | sin marcarlo, exigirla crea la obligacion a quien YA tiene el cargo. Es lo que quiere TRANSPRENSA |
| **Cambiar de cargo** se resuelve al instante | la del cargo viejo pasa a `WITHDRAWN_LEFT_AUDIENCE` (no se borra) y la del nuevo nace en el mismo `PATCH`, sin esperar al cron. El aprendiz la ve una vez, no dos |
| **Lo que ya CUMPLIO no se le vuelve a pedir** (2026-09-05) | si el cargo nuevo exige la misma formacion y ya la tiene hecha: si no se repite, no le nace nunca; si sigue vigente, le nacera en su ventana **con SU vencimiento**; si caduco, como a cualquiera. Medido: antes 1 CUMPLIDA, despues 1 CUMPLIDA y **ninguna viva** |

### Y de la REINDUCCION (2026-09-03)

| | |
|---|---|
| Publicar obliga a **TODA la plantilla** | 791 de 791, **sin** el corte de "solo los nuevos": lo contrario que la general. Y tarda ~2 s |
| Todas vencen **el mismo dia** | es una CAMPANA anual, no un aniversario por persona |
| Pero la PRIMERA **no cae el 31 de marzo** | el automatismo pone `ON_JOIN` y la fecha fija solo la usa `SCHEDULED`: la primera vence a los 30 dias de publicarla, y la campana rige desde la 2a ronda |
| La ronda siguiente **no se abre al terminar** | solo al entrar en la ventana de la proxima (60 dias antes) |

### Y de la RONDA SIGUIENTE de la reinduccion (2026-09-04)

Lo que estaba probado solo con unitarias y ahora se ejerce de verdad. **No hace falta esperar un ano
ni tocar fechas en la base**: la ventana esta fijada en 60 dias, asi que con una recurrencia de UN
MES ya esta abierta el dia que nace la ronda 1. Es el mismo codigo que correra en 2027.

| | |
|---|---|
| La ronda 1 sin hacer, al llegar la ventana | pasa a **EXPIRED_NOT_DONE** |
| La ronda 2 | nace PENDING, venciendo despues que la anterior |
| Lo que debe el aprendiz | **una sola**: la del periodo en curso |
| Lo que lee el auditor | **"No realizada"**, con su cifra propia en el resumen |
| **ABIERTO** | quien tiene una cerrada y otra viva sale **dos veces** en el informe. Decision del cliente: un renglon por ronda (historial) o por persona (campana en curso) |

### Y de la EXTRAORDINARIA (2026-09-04)

El tipo que se define por lo que NO hace solo, y en el todo salio en verde a la primera:

| | |
|---|---|
| Publicar | **ni requisito ni convocatoria**: las dos las decide una persona |
| Las facetas del alcance **se cruzan** | cargo 256 · area 142 · **las dos: 51**. No es la suma |
| Programar la jornada | **no crea renglon** de plan — al reves que la del plan |
| Colarla en un plan por la API | **409 ACTIVITY_NOT_PLANNABLE**, con el motivo escrito |
| El aprendiz | **no se apunta solo**: con fecha y cupo lo convocan |
| Despues | **una sola ronda**: no vuelve |

**Una trampa del propio recorrido:** el motivo de un 409 viaja en `title`, no en `message` — el
filtro global mueve alli el mensaje de la excepcion y nunca reenvia `message` crudo. Leerlo mal da
vacio y parece que el servidor no explica nada.

### Y de la CAPACITACION DEL PLAN (2026-09-04)

Es la que rompe todas las costumbres de las tres anteriores:

| | |
|---|---|
| Publicar | **ni requisito ni convocatoria**: las dos las decide una persona |
| El requisito de "Quienes" | queda en `PLAN` aunque se pida `ON_HIRE`, con plazo 0 y sin recurrencia — lo fuerza el servidor — y **no genera nada** |
| Programar la jornada | crea el renglon del plan **solo** si el plan esta en BORRADOR. Aprobado, hay que anadirlo **con motivo** (409 sin el) |
| Publicar la convocatoria | **congela** los proyectados, y sigue sin obligar a nadie |
| **Aprobar el plan** | aqui nacen: `source = PLAN`, todas el **ultimo dia del mes** del renglon |
| Dos jornadas de lo mismo | **no duplican** la obligacion de nadie **ni los proyectados del plan** |
| La tajada reparte de verdad | acotar la segunda jornada a un area la bajo de 14 proyectados a 1 |
| Reprogramar el mes | renglon a `RESCHEDULED`, y **no** mueve la fecha de quien ya la tiene |
| El aprendiz | **no se apunta solo** (409 `OFFERING_NOT_SELF_SERVICE`): lo convoca quien la programa |
| Cancelar la jornada | retira lo abierto y cancela el renglon |

**Dos trampas del propio recorrido:** el vencimiento se lee en **hora de Colombia** (el ultimo dia
del mes a las 23:59 de Bogota es el dia siguiente en UTC), y hay que usar un **ano libre por
corrida**, porque hay un plan por ano y aprobarlo no se deshace.

### Y de la PILDORA (2026-09-04)

Es el tipo que se define por lo que NO hace, y en el todo salio en verde a la primera:

| | |
|---|---|
| **Se publica SIN examen** | y sin aviso, porque su tipo no lo pide. **CORREGIDO el 2026-09-04:** aqui decia que "en los otros cuatro publicar sin evaluacion se RECHAZA", y es falso — la Decision #74 lo dejo en AVISO, que queda en la auditoria, no en compuerta. Lo caza `estandar.mjs` |
| El temario | **una sola pieza**: la leccion |
| Publicar **no la exige a nadie** | `MANUAL`: a quien le llega lo marca una persona |
| **CUMPLIDA con ver el contenido** | sin examen no hay nada mas que hacer |
| **No emite constancia** ni **entra al plan** | las dos mitades de lo que promete el tipo |

### Y de las TAJADAS (2026-09-04)

Varias jornadas de la misma formacion, cada una acotada a un grupo. Encontro el fallo mas caro del
dia: **cada jornada acotada proyectaba a TODOS** —area 405 y 405 donde son 198 y 207— por una
colision de claves. Y una tajada sin obligados devolvia el total en vez de cero.

| | |
|---|---|
| Dentro de una faceta se SUMA | dos areas en un requisito alcanzan a la suma de las dos |
| Entre facetas se CRUZA | cargo + area son los de ese cargo EN esa area |
| Dos tajadas complementarias | **suman el total exacto**, sin repetir a nadie |
| Una tajada sin obligados | **cero**, y no cae al total |
| Solo fallaba ANTES de aprobar el plan | el escalon de los ya obligados usa otra clave y no chocaba |

Y contestando lo que se pregunto despues —"¿solo en el plan, o en las demas tambien?"—: se prueban
**los siete tipos**. El acotamiento no mira el tipo (`projected-audience.service.ts` recibe una
actividad y una tajada), pero eso era leer el codigo y no medirlo, que es como se colo el fallo de
arriba. Medido: identico en los siete —la Recertificacion se anadio el mismo dia que el tipo, y
salio igual: 623 = 416 + 207, sin nadie repetido—, y ejerciendo los DOS escalones de derivacion —por reglas
(antes de que haya obligaciones) y por obligados (despues)—, que son codigo distinto.

**Y con DOS reglas sobre la misma formacion**, los proyectados son la UNION y no la suma: area 211 +
cargo 294 con **89 personas compartidas** dan **416**, no 505. Quien cumple las dos reglas cuenta una
vez, que es lo unico que puede ser: sigue siendo una persona a la que capacitar.

### Y de la RECERTIFICACION (2026-09-04)

El septimo tipo, y el primero creado DESPUES de la suite estandar — que lo cubrio sola, sin tocarla.
Es la habilitacion del puesto que caduca (montacargas, alturas, manipulacion de alimentos).

| | |
|---|---|
| Publicar | **ni requisito ni convocatoria**: los cargos los eliges tu, y la fecha la pone una persona |
| Vence por **ANIVERSARIO** | `everyMonths` **sin** `fixedDate`: cada quien vence el dia que le toca, no todos a la vez |
| **No entra al plan**, y es obligatorio | el servidor fuerza recurrencia NULA a lo del plan: un `true` ahi mataria el aniversario **en silencio** |
| `onExpiry: ESPERA`, al reves que la reinduccion | una habilitacion vencida **sigue siendo la que hay que renovar**: no se pasa pagina |
| Sin gracia por ingreso reciente | a quien lleva un mes se le perdona la charla anual, no el permiso para operar |
| La constancia | aqui **ES el certificado**, no un extra |
| La jornada | admite `executedBy` (la ARL, un centro externo) **sin** que cambie de quien es el registro |

**Y una advertencia sobre lo que una prueba dice que prueba.** El paso 5 afirmaba que "dos personas
certificadas en meses distintos no vencen el mismo dia", pero creaba las dos con segundos de
diferencia: las dos vencian el mismo dia, con razon. La asercion **pasaba sin comprobar lo que
decia**. Se reescribio para comprobar la CAUSA (`everyMonths` sin `fixedDate`, y
`computeNextCycleDueAt` anclando en `completedAt`) en vez de simular ocho meses. Una asercion que
pasa siempre es un comentario con sintaxis de codigo.

### Y de LAS TRES VIAS DE EVIDENCIA (2026-09-05)

`asistencia.mjs`. Lo que cierra el agujero mas grande que quedaba: hasta hoy una formacion solo se
podia dar por cumplida de UNA forma —la persona entrando a la plataforma— y en una empresa bajo
SG-SST la mayor parte del plan anual se dicta en salon.

| | |
|---|---|
| La asistencia va con el `kind` | `EVENT` se cierra por lista, la dicte como la dicte —presencial o virtual en vivo—; una `PERMANENT` la rechaza con 409. Atarlo a PRESENCIAL dejaria fuera el webinar de la ARL |
| Quien asistio | queda CUMPLIDO **sin tocar el contenido**, y el examen que exige el tipo no lo responde nadie: la evidencia es OTRA, no es un atajo |
| Quien NO vino | **la sigue debiendo**. No se cierra ni se retira nada — es el punto entero de tomar asistencia |
| Con papel de un tercero | **no** se emite constancia propia: dos papeles con dos numeros para un hecho es peor que ninguno |
| Sin papel | **si** se emite: una charla presencial que no certifica nada deja a la persona sin nada mas |
| **EL PAPEL MANDA** | su fecha se copia a `assignments.valid_until_override` y es la que decide cuando vuelve |
| La compuerta del tipo | `tracksExternalCertificate`, comprobada contra el SERVIDOR (409) y no solo en la pantalla |

**Y lo que se anadio el mismo dia, que pidio el cliente:** la falta JUSTIFICADA (que explica pero
**no exime** — la formacion se sigue debiendo), **dos reglas** sobre la misma persona (le nacen dos
obligaciones y asistir cierra UNA), el **acotamiento** por facetas (se cruzan: cargo 100 · area 240
· las dos, 9) y que una lista **no alcanza fuera de su jornada**.

**Y sobre hacer un recorrido por tipo:** no. Cerrar por asistencia no depende del tipo sino del
`kind` de la jornada, asi que siete archivos serian siete copias del mismo camino desincronizandose
una a una. Lo propio de cada tipo —constancia, examen, plan— ya lo deriva `estandar.mjs` de su
configuracion. Es la misma decision que ya tomo `tajadas.mjs`.

**Como se mide "el papel manda" sin tocar el reloj:** un certificado que vence dentro de **30 dias**
sobre una formacion con recurrencia de **12 meses**. Es el mismo truco de comprimir — la ventana esta
fijada en 60 dias, asi que un papel a 30 la tiene abierta hoy. Si el papel manda, nace la ronda 2
venciendo el dia del papel; si mandara la recurrencia, no naceria ninguna. **Medido: nace, y con la
fecha del papel.**

**Y una trampa que ya habia mordido al recorrido del plan y volvio a morder aqui:** el vencimiento se
guarda al fin del dia en Bogota, que en UTC es el DIA SIGUIENTE a las 04:59. Comparar el
`slice(0, 10)` del ISO contra la fecha que se mando da un dia de diferencia y parece un fallo del
sistema cuando esta en la asercion.

## La suite ESTANDAR, y como convive con estos

`estandar.mjs` es la respuesta a "¿como pruebo que un cambio no rompio ningun tipo?". Recorre
**todos los tipos que existan en el tenant** —los siete de fabrica y los que cree el cliente desde
Configuracion— y comprueba de punta a punta que el sistema hace lo que el tipo dice que hace.

**No hay una tabla de expectativas escrita aparte**, porque una tabla escrita aparte es justo lo que
se desincroniza. Las expectativas se DERIVAN de `activity_types.config`:

| Lo que dice el config | Lo que la suite comprueba |
|---|---|
| `requiresAssessment` | el temario lleva examen y el aprendiz lo aprueba |
| `requiresSurvey` | lleva encuesta, y va la ULTIMA |
| `issuesCertificate` | al aprobar hay constancia — o NO la hay, si el tipo no la promete |
| `defaultAssignmentMode` | `ON_HIRE` obliga solo al publicar; el resto no obliga a nadie |
| `defaultOfferingKind` | `PERMANENT` abre convocatoria sola y el aprendiz entra solo |
| `participatesInPlan` | entra al plan, o da 409 `ACTIVITY_NOT_PLANNABLE` |
| — | y el **Seguimiento** dice lo mismo que paso |

Asi, cambiar la configuracion desde la pantalla cambia lo que se espera y la prueba sigue siendo
cierta sin tocarla. Lo que comprueba no es "la induccion general hace X", sino algo mas fuerte:
**el sistema honra su propia configuracion**.

**Como conviven:**

| | |
|---|---|
| `estandar.mjs` | todos los tipos · lo COMUN · derivado de la configuracion |
| `<tipo>.mjs` | un tipo · lo SUYO · escrito a mano |

Al tocar el motor o anadir un tipo, se corre la estandar. Al tocar algo propio de un tipo —el
renglon del plan, la ronda de la reinduccion, el cambio de cargo de la especifica— se corre el suyo.

**Lo que ya encontro:** que este mismo LEEME afirmaba que publicar sin evaluacion se rechazaba, y
entonces no se rechazaba. La Decision #74 lo habia dejado como aviso en la auditoria por dos motivos
—que el config del tipo no se podia editar desde la interfaz, y que ninguna prueba anadia
evaluacion— y los dos habian dejado de ser ciertos. **Ya es compuerta** (2026-09-04): publicar sin
lo que el tipo promete devuelve **409 `TYPE_REQUIREMENTS_MISSING`** con la lista de lo que falta.
Y cobro su primera pieza el mismo dia: el tipo RECERTIFICACION recien creado traia `requiresSurvey`
sin encuesta asignada, y la compuerta lo paro — cinco pasos en rojo por una configuracion
incompleta, no por un fallo.

## Lo que estos recorridos NO pueden probar, y conviene no fingir que si

El truco que usa todo este directorio para probar "el ano que viene" es **comprimir la recurrencia**
—poner un mes donde iria un ano— porque la ventana esta fijada en 60 dias y con un periodo de 30 ya
esta abierta el primer dia. Funciona con `everyMonths`, que es un numero.

**No funciona con una CAMPANA.** Su periodo es el ano del calendario, no un numero que se pueda
bajar: para que el caso aparezca hacen falta 60 dias reales entre crear la regla y la fecha de
campana. Ahi es donde se escondio el fallo del 2026-09-05 —la ronda 2 naciendo con el mismo
vencimiento que se acababa de cumplir, y solo para quien cumplia— que ningun recorrido vio ni vera.

La regla: **todo lo que dependa de una FECHA DEL CALENDARIO** —campana anual, ultimo dia del mes de
un renglon del plan— se prueba en la logica pura (`due-date.spec.ts`, `next-cycle.spec.ts`), sobre
las funciones reales. Y se dice aqui, para que nadie lea "12 recorridos en verde" como si cubrieran
tambien eso.

## Lo que sigue

**Nada: los siete tipos tienen recorrido.** Y el septimo —RECERTIFICACION, creado el 2026-09-04—
entro en `estandar.mjs` **sin tocarla**, que era lo que faltaba por comprobar de la Decision #8: el
contrato se deriva del `config` del tipo, no de una lista escrita a mano. Un cliente que cree su
propio tipo desde Configuracion queda cubierto el mismo dia.

Lo que queda son decisiones del cliente, no comprobaciones (ver `docs/modulos/formaciones/`).
