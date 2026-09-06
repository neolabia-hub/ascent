# Las tres vías de evidencia

*Cómo consta que una persona cumplió. Documento común a todos los tipos, como `00-el-motor.md`.*

Verificado de punta a punta por dos recorridos: `asistencia.mjs` (18 pasos, seguimiento incluido)
y `asistencia-matriz.mjs` (los siete tipos × tres modalidades, las cinco facetas del acotamiento y
la corrección de una lista ya tomada). Decisión #157, del 2026-09-05, ampliada el 2026-09-06.

---

## 1. El agujero que cierra

Hasta el 2026-09-05 una formación solo se podía dar por cumplida de **una** forma: la persona
entrando a la plataforma y completando el contenido. `CompletionService.evaluate` —lo único que
cerraba una obligación— solo lo llamaban el reproductor y los intentos de examen, los dos del lado
del aprendiz. No existía ningún camino de administrador.

En una empresa bajo SG-SST la mayor parte del plan anual se dicta **en salón**: charlas de seguridad
vial, manejo defensivo, brigadas, lo que trae la ARL. De eso no queda contenido que completar —
queda una **lista de asistencia firmada**, que es la evidencia que pide el auditor.

Así que todo lo dictado presencialmente contaba como incumplido. Y encima de esa capa está
construido todo lo demás: los siete tipos, el plan con sus proyectados y sus tajadas, la cobertura,
las constancias, el Seguimiento. **El indicador de cumplimiento, que es la razón de ser del
producto, enseñaba cero de todo lo que de verdad se hizo.**

## 2. Las tres vías

| | Cuándo | Qué queda registrado |
|---|---|---|
| **A. En plataforma** | contenido + examen, la persona entra sola | progreso, nota, constancia propia |
| **B. Lista de asistencia** | jornada con fecha, la dicte quien la dicte | quién asistió, quién no, y quién lo marcó |
| **C. Papel de un tercero** | el certificado lo emite un organismo acreditado | entidad, número, expedición, **vencimiento** |

Las tres cierran **la misma obligación** y valen lo mismo para el indicador. Y se combinan:

- Inducción general virtual → **A**
- Capacitación del plan que dicta la ARL y no certifica nada → **B sola**
- Recertificación de montacargas con la ARL → **B + C** (y su constancia propia, que no se suprime)
- Quien llega con un certificado vigente de otro empleo → **C sola** (todavía no implementado: ver §10)

**No van atadas al tipo de formación.** Es la respuesta a «¿cómo consta que cumplió?», y cada
empresa la contesta distinto según la formación. Atarlo al tipo habría dejado fuera la mitad de los
casos reales.

## 3. Cómo se cierra una jornada: se pregunta, no se adivina

Esta sección es la que más ha cambiado del documento, y merece contarse con las dos versiones
anteriores a la vista — porque la lección no está en la regla final sino en por qué dejó de haber
regla.

| Versión | La regla | El caso real que la rompió |
|---|---|---|
| 1 (05-09) | por el `kind`: toda jornada `EVENT` lleva lista | una **capacitación del plan con fecha, virtual y con contenido**: se convoca, sí, pero la persona hace el temario en la plataforma |
| 2 (06-09) | por la **modalidad**: presencial e híbrida llevan lista | una **capacitación que dicta la ARL por videollamada en vivo**: es virtual y sí tiene lista de quién se conectó |

**La respuesta depende de cómo se dictó esa sesión concreta, y eso solo lo sabe quien la programa.**
Cualquier regla que lo deduzca acierta para unos tenants y falla para otros — y este producto es
multi-tenant: una empresa de logística dicta casi todo en salón y una consultora casi todo en la
plataforma, con la misma configuración.

### Lo que sí se puede deducir: el defecto

No preguntar nada obliga a adivinar; preguntarlo todo cansa y se rellena mal. Así que se pregunta
con un defecto que acierta en la inmensa mayoría:

| Modalidad | Por defecto | Por qué |
|---|---|---|
| `PRESENCIAL` | **lista** | hay salón y hoja firmada; en la plataforma no queda nada |
| `HIBRIDA` | **lista** | hay sesión y además contenido (CLAUDE.md §3.7) |
| `VIRTUAL` | **plataforma** | cada quien entra y hace el temario, y el sistema lo anota |

`offerings.closes_by_attendance` se pone explícito solo para lo que no encaja: la videollamada en
vivo con lista, o el taller presencial que en realidad se acredita con lo que cada quien haga
después.

### Y la condición que no se negocia

Una convocatoria **PERMANENTE** no lleva lista, se marque lo que se marque: es autoservicio, la
persona entra cuando puede y no hay ninguna sesión a la que asistir. Una permanente con la casilla
puesta es un dato mal capturado, no un caso de uso, y dejarlo pasar convertiría el error de alguien
en asistencias inventadas.

La lógica vive en `cierre-de-la-jornada.ts` —pura, sin base de datos, 11 unitarias— y **la pantalla
no la reimplementa**: el detalle de la jornada trae `admiteAsistencia` ya resuelto. Una condición
que ya cambió dos veces es justo la que no puede vivir en dos sitios.

### La lección de método

Cuando una regla derivada se rompe dos veces seguidas, el problema no es la regla: es que se está
deduciendo algo que hay que preguntar. **La señal de alarma es tener que justificarla con un caso
inventado** — la versión 1 se defendió con «el webinar en vivo», que este cliente no tenía, y ese
mismo caso inventado acabó siendo el que rompió la versión 2.

### Y entonces, ¿qué pasa con una inducción específica presencial?

Es la pregunta que arrancó todo esto, y ahora tiene respuesta simple. La modalidad de la **ficha**
es solo el valor por defecto de sus convocatorias; lo que decide es la convocatoria. Ese tipo abre
una convocatoria PERMANENTE sola al publicar, pero puedes programarle **además** una jornada
presencial: la permanente se cierra por la plataforma y la jornada por lista, y las dos conviven.

Lo que sí obliga eso es a que **una persona no acabe con dos ejecuciones vivas de la misma
formación**. Convocar a una jornada a quien ya estaba en la permanente **retira** aquella
(`WITHDRAWN`, con su rastro) y crea la de la jornada — reutilizarla dejaría a esa persona fuera de
la lista a la que se le está convocando. Medido en `permanente-y-jornada.mjs`.
## 4. Cerrar por asistencia no pasa por `evaluate`, y eso hay que registrarlo

`evaluate` recalcula desde los hechos guardados en la plataforma: contenidos vistos y exámenes
aprobados. Para una jornada de salón esos hechos no existen ni van a existir —el temario lo dio un
instructor y el examen, si lo hubo, lo puso en papel— así que llamarla siempre respondería «faltan
contenidos». **No es un atajo alrededor de la regla: es que la evidencia es otra.**

Lo comprueba el recorrido con el caso más duro: la formación es de tipo Recertificación, que
**exige evaluación**, y nadie responde el examen en la plataforma. La obligación queda igualmente
CUMPLIDA.

Y por eso cerrar así **salta la evaluación que el tipo exige**, que es exactamente lo que un auditor
cuestionaría. Queda `attendance_records.marked_by` —quién respondió por ello, con su método y su sello de
tiempo— además de la fila de auditoría `OFFERING_ATTENDANCE_MARKED`. Sin eso sería una puerta trasera para dar por cumplido lo
que no se hizo.

## 5. Los tres estados, y el cuarto que es no haber mirado

**PRESENT / ABSENT / JUSTIFIED**, los del diseño (CLAUDE.md §3.7). Y `null` = **todavía sin
revisar**, que no es lo mismo que ausente: la primera es trabajo pendiente y la segunda es evidencia
de que se le convocó y no fue. Un dato que se lee por lo que le falta acaba significando dos cosas.

| Se marca | Qué pasa con su formación |
|---|---|
| **PRESENT** | queda **cumplida**; si el tipo entrega constancia, se emite sola |
| **ABSENT** | **la sigue debiendo**, y queda escrito que se le convocó y no fue |
| **JUSTIFIED** | **también la sigue debiendo**, con el motivo escrito. Irá a la siguiente jornada |

**JUSTIFIED no exime, y es deliberado.** «Estaba incapacitado» explica por qué no vino a *esa*
jornada, no que ya no tenga que formarse. Eximir es otro acto, con su propio motivo y su propia
auditoría; mezclarlos convertiría una incapacidad en un permiso permanente para no capacitarse. Y
por eso la justificación **exige motivo** (422 sin él): una justificación sin explicación no
justifica nada, y es lo primero que lee quien audita.

Medido en los pasos 9 y 12 del recorrido: de dos convocados uno queda CUMPLIDO y el otro sigue
PENDIENTE; al justificarle la falta, **sigue igual de pendiente**.

En la pantalla **todos empiezan como PRESENT**. Lo normal es que quien fue convocado asista, y en
una lista de cuarenta eso obliga a cambiar tres en vez de marcar treinta y siete.

### Dónde vive, y la corrección que costó

En **`attendance_records`**, con `method: INSTRUCTOR`. No es una tabla nueva: **ya estaba en el
esquema desde el Sprint 0**, con los tres estados, el método, la justificación, la firma y quien
marcó — vacía, porque nadie la escribía. Al lado, `session_acts` para el acta generada.

La primera versión de esta decisión le puso columnas propias a `enrollments` sin verla. Dos casas
para el mismo hecho es exactamente el problema que este proyecto ya conoce por el otro lado —el
informe de Vencimientos leyendo `certification_grants`, que tampoco escribe nadie— así que se
corrigió el mismo día, con la tabla todavía vacía y no cuando hubiera un año de asistencias
repartidas entre dos sitios.

**La lección es de método:** antes de añadir una columna, mirar si el modelo ya la tiene. Este
esquema se diseñó entero al principio y lleva partes esperando.

### Los tres mecanismos, y cuántos hay construidos

El diseño (CLAUDE.md §3.7) prevé tres formas de marcar a alguien, combinables:

| # | Mecanismo | Estado |
|---|---|---|
| 1 | **Lista del instructor** — presente / ausente / justificado | **Construido** (`method: INSTRUCTOR`) |
| 2 | **QR de sesión** rotativo: la persona lo escanea y queda su sello de tiempo | Diseñado. `offerings.session_code` y `method: QR` esperan |
| 3 | **Firma en pantalla** + acta PDF con hash | Diseñado. `SessionAct` y `method: SIGNATURE` esperan |

Los tres escriben en la **misma tabla** y solo cambian de `method`, que es lo que permite construir
el segundo y el tercero sin tocar lo que ya funciona.

## 5 bis. Quién puede tomarla

**`attendance:take`**, y no `offerings:manage`, que era lo que parecía natural. El permiso existía
desde el Sprint 1 sin que nadie lo usara, y existe por una razón que se ve en cuanto se piensa en
quién hace este trabajo: **el instructor** (CLAUDE.md §1: *«dicta convocatorias: toma asistencia,
firma actas»*). Quien dicta la jornada tiene que poder decir quién vino **sin poder además programar,
publicar ni cancelar convocatorias**, que es lo que le daría `offerings:manage`.

ADMIN y ANALISTA lo traen de fábrica, así que no cambia nada de lo que ya funcionaba.

## 6. La constancia propia la decide el tipo, y el papel de un tercero no la suprime

Aquí decía lo contrario: que con papel de un organismo acreditado no se emitía la propia, porque
«dos documentos con dos números para un mismo hecho es peor en una auditoría que no tener ninguno».
Sonaba bien y estaba mal. Lo cazó el cliente el 2026-09-06: *«que un externo genere certificación no
quiere decir que no deba generarse la interna; la constancia interna la decide el TIPO»*.

Dos motivos, y el segundo pesa más que el primero:

**No son el mismo hecho.** La constancia de la empresa dice *«esta persona asistió a esta formación
el día X»* — es su registro. El papel de la ARL dice *«esta persona está habilitada hasta Y»* — es la
habilitación legal. Un auditor puede pedir cualquiera de los dos, y no tener el propio deja un hueco
en el expediente que no tapa el ajeno.

**Y era una excepción cableada que le quitaba la decisión al tenant.** Si una empresa no quiere las
dos, ya tiene dónde decirlo: `issuesCertificate`, con su cascada de tipo y ficha (Decisión #111).
Una regla nuestra encima anulaba esa configuración sin que nadie pudiera verla.

> **La regla que queda:** lo que dependa de cómo trabaja una empresa se configura; lo que no, se
> deduce del modelo. Una regla que suena razonable y no se puede apagar es una decisión tomada por
> el equipo en nombre de un cliente que no la pidió.

Así que cerrar por asistencia emite exactamente lo que emitiría cerrar por contenido: lo que diga
`issuesCertificate`. Medido en el paso 10 del recorrido y en la parte A de la matriz, para los siete
tipos.

## 7. El papel manda

Es la única parte con consecuencias sobre el motor, y contradice a propósito una regla anterior.

La regla general (Decisión #111) es que **la vigencia sale de la recurrencia**: si hay que repetirla
cada 12 meses, la constancia vale 12 meses, y pedir la vigencia aparte sería pedir el mismo dato dos
veces y garantizar que algún día no coincidan.

La excepción es el certificado de un tercero, y no es una preferencia: **la fecha no la pone la
empresa**. Si la ARL certifica en alturas por tres años y el tipo dice doce meses, reclamarla al año
es inventar un incumplimiento sobre alguien que tiene su habilitación vigente y el papel para
probarlo.

```
proximoVencimiento(recurrencia, ronda, respaldo)     due-date.ts
  1. si hay validUntilOverride  -> ESA fecha         el papel
  2. si es campaña              -> desde su dueAt    el periodo
  3. si es aniversario          -> desde completedAt la persona
```

La fecha se copia del certificado a **`assignments.valid_until_override`** y no se queda solo en la
inscripción: es el motor quien la necesita, y la obligación es la fila que el auditor ya rastrea.

Y **no es un ancla a la que sumarle meses** — es el vencimiento mismo. Tratarlo como ancla daría
«tres años después de que caduque», justo al revés de lo que dice el documento.

**Medido de punta a punta** (paso 11), y sin tocar el reloj: se registra un certificado que vence
dentro de **30 días** sobre una formación con recurrencia de **12 meses**. Es el mismo truco de
comprimir que usa `reinduccion-ciclos.mjs` — la ventana está fijada en 60 días, así que un papel a
30 la tiene abierta hoy. Resultado: nace la ronda 2 venciendo **el día que dice el papel**, no
dentro de doce meses. Con la recurrencia mandando, no habría nacido ninguna.

## 8. Lo que decide la empresa: por formación, con el tipo de respaldo

**«¿La acredita un tercero?»** es el único ajuste, y desde el 2026-09-06 vive en **dos niveles**, la
misma cascada que ya gobiernan la constancia y la eficacia (#111, #118):

| Nivel | Dónde | Qué dice |
|---|---|---|
| **Tipo** | `activity_types.config.tracksExternalCertificate` | el punto de partida de toda su clase |
| **Formación** | `activities.tracks_external_certificate` | puede desviarse. `null` = lo que diga su tipo |

**Por qué no basta el tipo**, que es como nació: dentro de *Capacitación del plan* conviven la charla
de seguridad vial que dicta la ARL y no certifica nada, y el curso de alturas que dicta la ARL y sí.
Lo mismo en *Extraordinaria*. Preguntarlo solo por clase de formación obliga a elegir mal en la mitad
de los casos — y lo que se elige mal se rellena a mano o se salta.

**Por qué no se congela en la versión**, al revés que `issuesCertificate`: aquello queda estampado en
un papel que hay que poder explicar dentro de dos años; esto solo decide qué campos pide la lista de
asistencia el día de la jornada.

El tipo **Recertificación** nace encendido; los otros seis, apagados. Pedir un número de certificado
en una charla de quince minutos llena el expediente de campos vacíos y enseña a saltárselos.

La compuerta la aplica el **servidor** (409 `TYPE_DOES_NOT_TRACK_EXTERNAL_CERT`), no solo la
pantalla: un control que solo vive en el navegador no es un control.

### Si la dicta la empresa, no hay tercero que certifique

Un certificado **externo** es por definición el de alguien de fuera. Con `executedBy: PROPIOS` no
hay fuera, así que la lista no pide su número — un campo que no se puede llenar se aprende a
saltar. Se decide por **jornada**, porque es la jornada la que sabe quién la dictó: la misma
habilitación la puede dar la ARL en marzo y un instructor propio en septiembre.

**Pero es un defecto de pantalla, no una compuerta**, y la diferencia importa: la API sigue
aceptando el papel si la formación lo lleva. Hay tenants —un centro de entrenamiento acreditado—
para los que «propios» y «certificado oficial» conviven, y poner ahí un rechazo sería convertir una
suposición nuestra sobre cómo trabajan las empresas en una regla del producto.

### Y el emisor no se teclea

Lo que cambia por persona es **el número** de su certificado, y su vencimiento. La **entidad sale de
la jornada** (`executedByOther` / `executedBy`): quien la dicta ya está en la convocatoria, así que
escribirlo cuarenta veces es copiar a mano un dato que el sistema tiene, y garantizar que la fila 23
diga «ARL sura». `issuer` sigue admitiéndose en la API para el día que exista el caso de quien llega
con un papel de otra entidad, sacado en otro empleo.

### Dónde NO aparece la lista

En jornadas en **BORRADOR** —todavía no se ha citado a nadie— y en **CANCELADAS**, donde dar por
cumplida a alguien sería escribir que asistió a algo que no ocurrió. El servidor lo rechaza con 409
`OFFERING_NOT_ATTENDABLE` y la pantalla ya no enseña el botón: un botón que solo falla al pulsarlo
no es una compuerta, es una trampa.

## 8 bis. Lo que ahorra clics, que también es diseño

Lo pidió el cliente —*«por si son muchos… cómo se puede ayudar a ser más automático»*— y son cuatro
decisiones sobre lo mismo: **que una jornada normal se cierre sin tocar la lista**.

| | |
|---|---|
| Todos empiezan **PRESENT** | lo normal es que quien fue convocado asista: en una lista de cuarenta se cambian tres, no se marcan treinta y siete |
| La fecha viene de la **jornada**, no de hoy | se toma asistencia al día siguiente más veces de las que se toma en el salón, y fechar el cumplimiento el día que se teclea es fecharlo mal |
| **Todos asistieron / Nadie asistió** | para la jornada que fue como debía, y para la que de hecho no se dictó |
| El **emisor** no se teclea | sale de quien dicta la jornada |

## 9. Lo que se midió con varias reglas y con acotamiento

Lo pidió el cliente, y da dos respuestas que conviene tener escritas:

| | |
|---|---|
| Una formación exigida por **dos reglas** que alcanzan a la misma persona | le nacen **dos** obligaciones (la deduplicación del motor es por REGLA), y asistir a una jornada cierra **una**. La otra sigue viva |
| Las **facetas** del alcance | se **cruzan**, no se suman: cargo 100 · área 240 · las dos, **9** |
| Una lista de asistencia con la inscripción de **otra** jornada | se **ignora**. Una lista no cierra la formación de quien no estuvo en esa sala |

Sobre lo primero: no se cambió. Que asistir a una jornada cerrara las dos obligaciones haría que una
sola sesión cubriera dos requisitos distintos, y no cerrar ninguna dejaría en rojo a quien sí fue.
Cerrar una es lo correcto; que existan dos es una decisión anterior (`00-el-motor.md` §9).

### Y lo que se destapó midiéndolo

Al cruzar el Seguimiento con cinco obligaciones —dos cumplidas, tres pendientes— el informe decía
**cuatro terminadas**. Los tres informes pegaban la inscripción por **(persona, formación)** en vez
de por ronda, y como `resolverEstadoEjecucion` pregunta primero por el resultado, **quien completó la
ronda 1 salía con la ronda 2 también como TERMINADA**.

Es el hermano del fallo del 2026-09-04 —el informe contando lo retirado como «sin empezar»— pero al
revés: aquel inflaba el incumplimiento y este infla el **cumplimiento**, que es el que no se
descubre solo, porque nadie reclama un número que le favorece. En producción es la reinducción de
796 personas figurando hecha el 2 de enero de cada año.

Arreglado con `inscripcionDeCadaRonda` (`execution-state.ts`), que usa los enlaces que ya existían
en las dos direcciones desde el Sprint 3 (Decisión #2). **Medido: el mismo escenario pasó de 80% de
avance a 40%**, que es el real.

## 10. Lo que falta

1. **El archivo escaneado no se sube todavía.** Las columnas están (`ext_cert_file_key`,
   `offerings.attendance_sheet_key`) y la API las acepta, pero no hay pantalla que suba el PDF ni el
   acta firmada. Es lo siguiente natural y lo que completa la evidencia.
2. **La segunda puerta**, para cuando el papel llega después de la jornada — que es lo normal: la
   ARL manda los certificados a los quince días. Hoy hay que volver a la jornada; falta poder
   hacerlo desde la ficha de la persona.
3. **Quien llega con un certificado de otro empleo** (vía C sola, sin jornada) no tiene por dónde
   registrarse.
4. **El QR de sesión y la firma en pantalla**: los mecanismos 2 y 3, diseñados y con su sitio en el
   modelo. Con ellos llega `attendance:sign`, que CLAUDE.md nombra y `permissions.ts` todavía no
   tiene.
5. **El informe de Vencimientos sigue leyendo `certification_grants`**, una tabla que nadie escribe,
   así que su serie de «Certificación» sale en cero. Ahora que existe `valid_until_override` y que
   `certificates.valid_until` ya se escribía, tiene con qué llenarse. Ver `seguimiento.md` §7 quater.
6. **La constancia propia y el papel del tercero llevan fechas de vigencia distintas**, y es
   coherente pero conviene mirarlo con un caso real delante: la constancia caduca según la
   recurrencia (Decisión #111) y la habilitación según lo que diga el papel
   (`valid_until_override`). Son dos documentos que dicen dos cosas, así que dos fechas no es un
   error — pero si un cliente lee la constancia como si acreditara la habilitación, lo será para él.
   No se ha visto todavía; queda anotado como algo que mirar, no como un fallo.
