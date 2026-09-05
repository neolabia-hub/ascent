# El motor de la obligación formativa

*Documento común a todos los tipos. Cada tipo tiene el suyo: ver §3.*

Este documento explica **el concepto**, no el módulo: qué significa que una persona "deba" una
formación, quién lo decide, cuándo nace esa obligación y cuándo deja de existir. Lo que hace cada
archivo lo cuenta el código; aquí está el porqué.

Se escribió al terminar los recorridos de punta a punta de inducción general, inducción específica
y reinducción (`scripts/recorridos/`), y recoge lo que esos recorridos **midieron**, no lo que se
suponía. Donde hay un número, es un número real de la base de desarrollo.

---

## 1. Las tres piezas, y por qué son tres

| Pieza | Qué es | Ejemplo de TRANSPRENSA |
|---|---|---|
| **Audiencia** | Un grupo definido por su FORMA, no por su lista: "los conductores", "toda la empresa" | `Cargo: Conductor` — 408 personas hoy, las que sean mañana |
| **Requisito** | "A esta audiencia se le exige esta formación, con este disparador y este plazo" | "A los conductores se les exige Manejo defensivo, al ingresar, un día antes" |
| **Obligación** | La fila concreta de UNA persona: su fecha, su estado, su ronda | "Juan debe Manejo defensivo, vence el 4 de octubre, PENDIENTE" |

**No se fusionan a propósito.** La audiencia se recalcula sola cuando alguien cambia de cargo; el
requisito es la política; la obligación es la evidencia, y la evidencia **nunca se borra** — se
retira, se exime o se cierra, siempre con su motivo (Decisión #11).

Y las audiencias **se reutilizan entre formaciones**: si "los conductores" ya existe, exigir una
segunda formación a los conductores cuelga de la misma audiencia. Es deliberado —si no, acabarían
siendo cinco audiencias gemelas y nadie sabría cuál es la buena— y tiene una consecuencia que costó
un fallo entero: **la audiencia puede ser mucho más vieja que el requisito** (ver §5).

---

## 2. Quién decide a quién se le exige: lo decide el TIPO

`activity_types.config.defaultAssignmentMode` gobierna la pestaña **Quiénes** de la ficha:

| Modo | Tipos | Qué se pregunta en Quiénes |
|---|---|---|
| `ON_HIRE` | Inducción general, Reinducción | **Nada.** Es para toda la empresa: se aplica sola al publicar |
| `BY_JOB_TITLE` | Inducción específica, **Recertificación** | Los **cargos**. Es la matriz de inducciones |
| `MANUAL` | Plan, Extraordinaria, Píldora | Lo marca el analista: cargos, áreas, regionales, servicios |

La razón de que no se pregunte en el primer caso: **marcar a mano a 796 personas solo puede salir
mal**, y no hay ninguna decisión que tomar — el tipo ya sabe la respuesta. Lo que sí hace la
pantalla es **anunciar lo que va a pasar** antes de publicar: a cuántos va a obligar, cuándo vence
y si se repite. No tener que rellenar un campo no es lo mismo que no tener derecho a saberlo.

---

## 3. Cada tipo tiene su documento

Lo de arriba es lo COMUN. Lo que cambia de un tipo a otro —a quien obliga, desde cuando, si se
repite, que emite— vive en su propio documento, porque quien va a montar una induccion especifica
no deberia tener que leer las otras seis:

| Tipo | Documento | Estado |
|---|---|---|
| Induccion general | `01-induccion-general.md` | Recorrido en verde |
| Induccion especifica | `02-induccion-especifica.md` | Recorrido en verde |
| Reinduccion | `03-reinduccion.md` | Recorrido en verde (mas el de la ronda siguiente) |
| Capacitacion del plan | `04-capacitacion-del-plan.md` | Recorrido en verde |
| Extraordinaria | `05-extraordinaria.md` | Recorrido en verde |
| Pildora | `06-pildora.md` | Recorrido en verde |
| Recertificacion | `07-recertificacion.md` | Recorrido en verde (mas la suite estandar) |

---

## 4. Cuándo nace una obligación

Tres enganches, y ninguno es el cron:

1. **Al publicar** la formación, si el tipo la exige sola (`aplicarExigenciaAutomatica`).
2. **Al crear o cambiar una persona** (`syncPerson`): alta, cambio de cargo, de área, de regional,
   de vinculación o de fecha de ingreso. En la misma petición.
3. **Al crear o reactivar un requisito** (`createRule` → `generate`).

El cron nocturno hace la pasada completa: marca lo vencido, retira a quien salió de una audiencia y
abre las rondas que toquen. **No es de quien depende que las obligaciones existan** — eso sería
depender de que alguien se acuerde.

---

## 5. Cuándo vence: el ancla, y el fallo que costó

`computeFirstDueAt` (en `due-date.ts`, puro y probado) decide la fecha de la primera ronda:

- `ON_HIRE` → ancla en la **fecha de ingreso**. Plazo negativo = antes de empezar a trabajar.
- `ON_JOIN` → ancla en **cuando la obligación nace**.
- La **gracia** de 30 días: si la fecha calculada cae antes de que la obligación exista —quien lleva
  años en la empresa cuando se estrena el requisito—, se sustituye por "desde ahora, con 30 días".
  Sin eso, estrenar un requisito produce 116 vencidas el primer día, y **eso no es cierto**: la
  empresa no estaba incumpliendo, es que el sistema no existía.

**El fallo (2026-09-03, arreglado).** Ese "cuando la obligación nace" era `joinedAt`, el instante en
que la persona entró a la **audiencia**. Y las audiencias se reutilizan: "toda la empresa" puede
llevar meses creada. Así que al estrenar un requisito nuevo, la gente ya llevaba meses *dentro del
grupo* y su plazo se contaba desde entonces — y con una audiencia lo bastante vieja, la fecha caía
en el pasado. La gracia no se disparaba nunca porque comparaba contra el mismo `joinedAt` viejo.

Medido, atrasando 60 días una audiencia de 7 personas y creando un requisito de 30 días:

```
    hoy     |   vence    | obligaciones | nacidas_ya_vencidas
 2026-09-04 | 2026-08-05 |            7 |                   7
```

Siete de siete, vencidas un mes antes de existir. En producción son 600 personas en rojo el día que
se publique la reinducción, y un indicador que arranca inventando un incumplimiento.

**El arreglo:** la obligación ancla en el **máximo** entre la creación de la regla y la entrada a la
audiencia. A quien entra mañana no le cambia nada. El recorrido de reinducción lleva la guardia:
*ninguna obligación puede nacer vencida*.

---

## 6. Cuándo se repite, y qué pasa si no la hizo

La recurrencia tiene dos formas y **solo una a la vez**:

- **Cada N meses**, contados desde que cada persona la completó. La fecha de cada uno cae donde
  caiga.
- **Cada año en una fecha fija**: la campaña. Todos vencen el mismo día.

Y **el ancla no es la misma en las dos** (`cycleAnchor`, 2026-09-05). Una campaña se satisface por
**periodo**: quien hace la reinducción el 20 de marzo la hace para el periodo que vence el 31, así
que la siguiente se cuenta desde el 31 de marzo, no desde el 20. Un aniversario se satisface por
**fecha de cumplimiento**: quien se certifica el 20 de marzo vence el 20 de marzo del año que viene,
y adelantarse le gana esos días de vigencia, que es lo correcto — el certificado es suyo.

Anclar las dos en `completedAt` costó un fallo que solo castigaba a quien cumplía: ver §6 bis.

La ronda siguiente **no nace al terminar la anterior**: nace cuando se entra en la **ventana** —60
días antes de la fecha—. Si naciera al completarla, quien la hace en abril tendría encima la de 2027
desde abril.

### El fallo de la campaña que acusaba de incumplir a quien cumplía (2026-09-05)

El ancla era `completedAt` para las dos formas de repetir. Con una campaña eso es falso, y el
efecto es el peor posible: **solo le pasaba a quien cumplía**.

Quien hacía la reinducción el 20 de marzo dejaba el ancla en el día 20. `nextFixedDate` devuelve la
ocurrencia siguiente al ancla — que es **el 31 de marzo del mismo año**, once días después—, la
ventana de 60 días ya estaba abierta, y **al día siguiente de cumplir le nacía la ronda 2 con el
mismo vencimiento que acababa de satisfacer**. Esa ronda pasaba a VENCIDA el 1 de abril y se cerraba
como NO REALIZADA diez meses más tarde.

| Quién | Qué le pasaba |
|---|---|
| Hizo la reinducción antes del 31 de marzo | ronda 2 el 31 de marzo, vencida el 1 de abril, **NO REALIZADA** en enero |
| La hizo tarde, o no la hizo | el ancla caía después del 31 y su siguiente era la del año que viene: **correcto** |

Un indicador que castiga cumplir está al revés, y de la forma más difícil de ver: el informe acusa
a la gente que sí se formó.

**Por qué no lo vio ningún recorrido.** `reinduccion-ciclos.mjs` comprime la recurrencia a un mes
(`everyMonths`) para no esperar un año, y prueba el camino de la que **no** se hizo. El caso solo
aparece con `fixedDate` y completando dentro de la ventana — que es cuando la hace todo el mundo.
Y no se puede comprimir: el periodo de una campaña es el año, no un número que se pueda bajar. Está
cubierto por unitarias sobre las funciones reales de fecha (`due-date.spec.ts`), no por un recorrido.

### Las tres políticas (`config.defaultOnExpiry`)

Qué pasa cuando llega la ronda siguiente y la anterior **no se hizo**. Lo decide la empresa, en el
tipo de formación, porque no todas lo resuelven igual:

| Política | Qué hace | Para quién |
|---|---|---|
| `ESPERA` | No nace la siguiente hasta que haga la anterior | Era lo único que había. **Casi nadie lo quiere**: ver abajo |
| `ACUMULA` | Nace la siguiente y la anterior sigue pendiente: debe las dos | Quien exige ponerse al día antes de seguir. A los tres años debe tres |
| `CIERRA` | La anterior se cierra como **NO REALIZADA** y la siguiente nace para todos | **Cumplimiento por calendario**: cada campaña es su periodo, y el periodo cierra. Es lo que pregunta el auditor, año por año |

**Por qué `ESPERA` estaba mal como única opción:** quien nunca la hace **desaparece del denominador**
de todos los años siguientes. El peor incumplidor sale de la cuenta y la cobertura del año que viene
se ve mejor de lo que es. Un indicador que mejora cuando alguien incumple está roto.

`CIERRA` necesitó un estado nuevo, `EXPIRED_NOT_DONE` ("NO REALIZADA"), porque ninguno de los que
había sirve: **retirada** y **eximida** NO cuentan como incumplimiento, y esto **sí**. Lo cumplido
nunca se cierra, y una eximida o una retirada no se pisan: ya tienen su explicación escrita.

La decisión es lógica pura y vive aparte del motor (`next-cycle.ts`), probada sin tocar la base.

**La semilla pone `CIERRA` en Reinducción** y deja `ESPERA` por defecto en el resto, para no
cambiarle el comportamiento a lo que ya existe.

---

## 7. Los estados, y cuáles cuentan

| Estado | Vive | Cuenta como incumplimiento |
|---|---|---|
| `PENDING` / `IN_PROGRESS` / `OVERDUE` | Sí | `OVERDUE`, sí |
| `COMPLETED` | No | No: es cumplimiento |
| `WITHDRAWN_LEFT_AUDIENCE` | No | **No.** Cambió de cargo o salió: ya no le aplicaba |
| `WITHDRAWN_PLAN_ITEM_CANCELLED` | No | **No.** La jornada no se dictó |
| `WAIVED` | No | **No.** Se le eximió, con motivo y autor |
| `EXPIRED_NOT_DONE` | No | **Sí.** Cerró el periodo y no la hizo |

Lo abierto se consulta por **lista blanca** (`PENDING`/`IN_PROGRESS`/`OVERDUE`), así que un estado
terminal nuevo cae solo de esas consultas.

### Y eso era cierto a medias, que es lo peor que puede ser (2026-09-04)

Aquí decía que por eso añadir `EXPIRED_NOT_DONE` **no obligaba a tocar ninguna consulta**. Es falso,
y salió caro: los informes de Seguimiento **no filtraban por estado en absoluto** —traían todas las
obligaciones de la formación— y ahí una lista blanca no protege de nada. El estado nuevo no se caía:
caía en el cajón por defecto, `SIN_EMPEZAR`.

Lo encontró `reinduccion-ciclos.mjs` el primer día que alguien miró qué enseña el informe de una
ronda cerrada. Dos cosas, las dos medidas:

| Lo que el motor escribía | Lo que el informe enseñaba |
|---|---|
| Ronda cerrada **NO REALIZADA** | «Sin empezar» — lo contrario de lo que es |
| **96.246 obligaciones RETIRADAS** | «Sin empezar», y sumando al denominador |

El avance global salía **224/121.819 = 0,18%** cuando lo real es **224/25.164 = 0,89%**: cinco veces
peor de lo que era, porque contaba como pendientes 96.000 obligaciones que ya no se le piden a
nadie. Tras el arreglo el informe pasó de **121.819 renglones a 25.208** — sobraba el 79%.

La regla que queda, y que no depende de acordarse: **quien lea obligaciones para un informe filtra
por `ESTADOS_RETIRADOS`** (`execution-state.ts`), y `resolverEstadoEjecucion` recibe el estado de la
obligación además del de la inscripción. Los dos terminales que no dejan huella en la inscripción
—`EXPIRED_NOT_DONE` y `WAIVED`— tienen ahora su propio estado de lectura: **No realizada** y
**Eximida**. La eximida sale del denominador del avance —dejarla dentro pondría techo al indicador y
castigaría una decisión legítima y escrita—; la no realizada se queda, porque es exactamente el
incumplimiento que hay que ver.

Es el mismo argumento que ya estaba escrito para quien deja la empresa —«su obligación murió con su
salida, y dejarlo infla el denominador con gente que no va a formarse»— que nunca se aplicó al
estado de la obligación.

**Eximir** es por persona y por obligación, con motivo de diez caracteres mínimo que queda en el
registro de auditoría. Está en dos sitios —Asignaciones y la pestaña Quiénes de la ficha— con la
misma ventana y el mismo endpoint: dos formularios para escribir la misma evidencia acaban pidiendo
cosas distintas.

---

## 7 bis. Como se prueba todo esto (2026-09-04)

Dos capas, y no se sustituyen:

| | |
|---|---|
| `scripts/recorridos/estandar.mjs` | **todos** los tipos · lo COMUN · las expectativas se DERIVAN de `activity_types.config` |
| `scripts/recorridos/<tipo>.mjs` | **un** tipo · lo SUYO · escrito a mano |

La estandar no lleva una tabla de expectativas escrita aparte —eso es justo lo que se
desincroniza—: lee el config del tipo y comprueba que el sistema lo honra. Cambiar el tipo desde
Configuracion cambia lo que se espera, sin tocar la prueba. Y recorre **los tipos que existan**, asi
que un tipo nuevo creado por el cliente queda cubierto solo.

Ademas hay tres recorridos transversales:

| | |
|---|---|
| `tajadas.mjs` | jornadas acotadas: 6 tipos x 7 facetas x los 2 escalones de derivacion, y dos reglas solapadas |
| `proyectados-ajuste.mjs` | congelar, que cambie la plantilla, ajustar con motivo |
| `seguimiento.mjs` | no es un recorrido: lo llaman los otros para cruzar el informe contra la base |

**Todos los recorridos de tipo cruzan el Seguimiento** antes de limpiar. Se anadio despues de
descubrir que el motor podia estar bien y el informe mintiendo (§7).

---

## 8. Lo que los recorridos midieron

| | |
|---|---|
| Publicar una reinducción sobre 796 personas | **~2 s** |
| Alta individual de una persona | **0,4 s** (era 9,0 s antes del 2026-09-03) |
| Carga masiva por archivo | **180 ms/persona** — 600 personas en 1-2 min |
| Obligaciones de una campaña | **una sola fecha de vencimiento** para todas |

Y los fallos que encontraron, todos reproducidos antes de arreglarse: la encuesta que salía la
primera del temario, la matriz que se saltaba la Decisión #76 creando 143 obligaciones de golpe, los
dos plazos por defecto para la misma casilla, y las obligaciones que nacían vencidas.

---

## 9. Lo que falta, dicho

1. **La primera ronda de una campaña no cae en la fecha de la campaña** (ver `03-reinduccion.md`).
   Decisión del cliente.
2. **La campaña alcanza a quien acaba de ingresar** y aún no terminó su inducción
   (`03-reinduccion.md`).
3. **Una formación exigida por DOS reglas vivas a la vez le nace dos veces a la misma persona.**
   Solo puede pasar en los tipos de alcance `MANUAL`, donde una formación se puede exigir a un
   cargo *y* a un área que se solapan; con `BY_JOB_TITLE` es imposible, porque una persona tiene un
   cargo. Lo CUMPLIDO ya no se repite (punto 4 de abajo), pero dos obligaciones **vivas** siguen
   naciendo. No se ha visto en la práctica.

### Y lo que se cerró (2026-09-05)

4. ~~Quien completó y cambia a un cargo que exige lo mismo, la vuelve a deber~~ — **cerrado**:
   `decidirPrimeraRonda`. Ver `02-induccion-especifica.md` §10.
5. ~~La fecha de la campaña no se puede cambiar desde ninguna pantalla~~ — **falso desde el
   2026-09-04 por la noche**: está en Configuración → Tipos de formación → Configurar, junto a
   `defaultOnExpiry` y a la gracia por ingreso reciente. Este documento se quedó atrás un día.
6. ~~`defaultOnExpiry` tampoco tiene pantalla~~ — **la misma**: se cambia desde ahí.
