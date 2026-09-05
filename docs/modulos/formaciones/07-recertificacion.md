# Recertificación

*Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por `scripts/recorridos/recertificacion.mjs` (11 pasos, seguimiento
incluido) y por la suite estándar `estandar.mjs`, que lo tomó **sin tocarle una línea**: es el primer
tipo creado después de la suite, y el hecho de que la suite lo cubriera sola es la prueba de que el
contrato se deriva de `config` y no de una lista de tipos escrita a mano.

Creado el 2026-09-04. Es el primer tipo que no venía en el diseño original — y por eso es la
comprobación de la Decisión #8: `activity_types` es una tabla por tenant, y montar un tipo nuevo no
debería costar código. **No costó código.** Solo una fila en la tabla y una fila en el seed.

---

## 1. Qué es, y por qué no es una inducción específica que se repite

Las dos cuelgan del **cargo** y usan el mismo motor. Técnicamente bastaba con poner "cada 12 meses"
en una inducción específica. Se creó un tipo aparte porque **el tipo es lo que lee el auditor**, y
las dos responden preguntas distintas:

| | Pregunta que responde | Naturaleza |
|---|---|---|
| Inducción específica | «¿le hicieron la inducción del puesto cuando llegó?» | Hecho **pasado** |
| Recertificación | «¿está **vigente hoy** su habilitación?» | Estado de **hoy**, que caduca |

Una específica vencida es una tarea pendiente. Una recertificación vencida es **una persona que no
puede hacer su trabajo**. Meterlas en el mismo cajón obliga a leer el nombre de cada formación para
saber cuál es cuál.

## 2. La configuración del tipo

```
requiresAssessment: true      issuesCertificate: true
defaultAssignmentMode: BY_JOB_TITLE
defaultOfferingKind: EVENT
defaultRecurrenceMonths: 12   defaultAnnualDate: (ninguna)
defaultOnExpiry: ESPERA       exemptRecentHiresMonths: 0
participatesInPlan: false
```

Cada uno de esos valores está elegido, y tres de ellos son lo que hace útil al tipo:

**`defaultRecurrenceMonths: 12` y NO `defaultAnnualDate`.** Un certificado vence el día de cada
persona. Quien se habilitó en agosto vence en agosto. Si fuera campaña —todos el 31 de marzo— quien
se certificó en agosto figuraría al día hasta marzo con la habilitación caducada desde agosto: el
indicador mentiría justo donde más importa. Es la diferencia de fondo con la reinducción, que sí es
campaña porque la norma habla del año, no de la persona.

**`participatesInPlan: false` — y aquí es obligatorio, no una preferencia.** El servidor fuerza
recurrencia **nula** a todo lo que participa del plan (la del año que viene es otro plan, no otra
ronda). Poner `true` aquí mataría el aniversario **en silencio** y el tipo dejaría de servir sin que
nadie viera un error. El recorrido lo comprueba dos veces: en la config del tipo (paso 1) y contra
el servidor (paso 9, 409 `ACTIVITY_NOT_PLANNABLE`).

**`defaultOnExpiry: ESPERA`, al revés que la reinducción.** En reinducción, dejar pasar el año cierra
la ronda como `NO_REALIZADA` y se abre la del año siguiente: son periodos distintos y el
incumplimiento de 2026 es un hecho de 2026. Aquí no: una habilitación vencida **sigue siendo la que
hay que renovar**. No se pasa página ni se abre una segunda; la obligación queda **atrasada** y roja
hasta que se renueve, que es exactamente lo que pasa en la realidad.

**`exemptRecentHiresMonths: 0`, al revés que la reinducción.** A quien lleva un mes en la empresa se
le puede perdonar la reinducción anual. La habilitación para operar un montacargas no: o la tiene o
no puede operar. Sin gracia.

## 3. Lo comprobado (`recertificacion.mjs`)

| | |
|---|---|
| La config del tipo | emite constancia, cuelga del cargo, aniversario y no fecha fija, y **no participa del plan** |
| Publicar | **no exige a nadie** (`BY_JOB_TITLE`: los cargos los eliges tú) y **no abre convocatoria** (`EVENT`: la fecha la pone una persona) |
| El requisito por cargo | nace con `everyMonths=12` y **sin** `fixedDate` — que es lo que hace que la ronda siguiente se cuente desde que cada quien completó |
| Dos personas del mismo cargo | a las dos les nace sola, cada una en **su** ronda 1 |
| La jornada | con fecha, y **`executedBy: 'ARL'`**: que la dicte un tercero no cambia de quién es el registro |
| El aprendiz | ve 3 piezas (lección, examen, encuesta), aprueba con 100 |
| La constancia | **se emite con código verificable** — en este tipo la constancia no es un extra, ES el certificado |
| Al terminar | **no le vuelve a caer**: sigue con una sola obligación. La del año que viene se abre 60 días antes de su vencimiento, no al terminar |
| El plan | la rechaza con 409, y eso es lo que protege el aniversario |
| El seguimiento | las filas del informe cuadran con la base, lo retirado no cuenta, los estados suman el total y el avance cuadra (1/2 = 50%) |

**Lo que este recorrido NO prueba, y conviene saberlo:** las dos personas de la prueba se crean con
segundos de diferencia, así que su **primer** plazo cae el mismo día — y está bien, porque ambas
entraron a la vez. La divergencia real aparece en la ronda 2, anclada en `completedAt` de cada una.
Probarla de verdad exige completar con meses de diferencia, que es lo que hace
`reinduccion-ciclos.mjs` comprimiendo la recurrencia. Aquí se comprueba la **causa** (la regla tiene
`everyMonths` sin `fixedDate`, y `computeNextCycleDueAt` cuenta desde `completedAt`) en vez de
simular ocho meses.

## 4. Cuándo lo usaría TRANSPRENSA

Es una empresa de logística: no certifica en alturas, pero sí opera **montacargas**, y esa
habilitación caduca. También aplicaría a manipulación de alimentos o transporte de mercancías
peligrosas si entra ese servicio. Y para otros tenants —una constructora, un operador de alimentos—
es el tipo con más peso del catálogo.

Si la certificación la emite un tercero (ARL, centro de formación) el tipo **sigue sirviendo**: el
papel lo tiene el tercero, pero quien necesita saber cuándo vence es la empresa. Por eso la jornada
admite `executedBy` sin que cambie de quién es el registro.

## 5. Lo que falta

Nada abierto de este tipo. Lo natural más adelante —cuando haya un caso real que lo pida— es guardar
el número y la fecha del certificado externo en la obligación, para que el informe pueda enseñar el
documento del tercero además del vencimiento. Hoy no hay quien lo pida, y se anota como idea, no
como pendiente.
