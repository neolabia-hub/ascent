# Reinducción

*La CAMPAÑA anual de toda la empresa. Lo común a todos los tipos está en `00-el-motor.md`.*

Verificado de punta a punta por dos recorridos, los dos en verde:

- `scripts/recorridos/reinduccion.mjs` (12 pasos) — la PRIMERA ronda: publicar, obligar a la
  plantilla, cursarla, la constancia. **Ojo al correrlo:** obliga a la plantilla entera a propósito,
  y el último paso retira el requisito para no dejar 884 obligaciones vivas en desarrollo.
- `scripts/recorridos/reinduccion-ciclos.mjs` (10 pasos) — la ronda SIGUIENTE: «cierra y abre»
  (§6). Trabaja sobre una persona sola.

---

## 1. Qué es

La actualización **anual** de todo el mundo: los cambios del año en el sistema de gestión, las
novedades, lo que cambió en las políticas. Cae igual sobre quien entró ayer y sobre quien lleva
quince años.

**Lo que NO es**, y es el error que se cometió una vez en este proyecto (2026-08-31): *no* es la
inducción repetida a los doce meses de que cada quien la hiciera. Con ese modelo, alguien que nunca
hizo una inducción **no tiene de dónde contar** sus doce meses y se queda sin reinducción para
siempre.

**Tampoco sustituye a la inducción.** A quien lleva años, su inducción se le hizo cuando entró; la
reinducción es otra cosa, y esa frase estuvo mal escrita en cuatro pantallas hasta el 2026-09-04.

Y su **contenido es propio**: se crea, se le pone contenido y se publica como cualquier otra
formación. Cada año, una versión nueva con los cambios del año.

## 2. La configuración del tipo

```
requiresAssessment: true      defaultAssignmentMode: ON_HIRE
issuesCertificate: true       defaultOfferingKind: PERMANENT
requiresBeforeHire: (sin poner) -> false
defaultAnnualDate: 03-31      defaultOnExpiry: CIERRA
```

`requiresBeforeHire: false` es la que la vuelve **lo contrario** de la inducción general, aunque
compartan `ON_HIRE` como modo de asignación.

## 3. Al publicar

Igual que la general, pasan dos cosas solas: nace **un requisito** y se abre **una convocatoria
permanente**. Pero el requisito es el opuesto:

| | Inducción general | Reinducción |
|---|---|---|
| Disparador | `ON_HIRE` (fecha de ingreso de cada uno) | `ON_JOIN` ("desde ahora") |
| Vence | −1 día del ingreso | **a los 30 días** |
| Corte de "solo nuevos" | **puesto** | **NO** |
| Obliga hoy a | **cero** | **todos** |

**Medido: 796 de 796, en ~2 s.** No hace falta arreglar nada antes del piloto.

Dejar fuera a la plantilla actual vaciaría de sentido la reinducción, y por eso el corte no se
ofrece: no hay decisión que tomar.

## 4. Campaña, no aniversario

**Todas vencen el mismo día.** Medido: 796 obligaciones, **una sola fecha**.

No tiene nada que ver con ninguna "fecha de ejecución": la formación es permanente, siempre abierta,
no hay sesión. Lo que manda es el **vencimiento**, y es común.

Es también como lo pregunta el auditor: *"¿hicieron la reinducción de 2026?"*, no *"¿cuándo la hizo
cada uno?"*.

## 5. La primera ronda SÍ cae el 31 de marzo, si da tiempo (cambiado el 2026-09-04)

Antes vencía **siempre** a los 30 días de publicarla: `computeFirstDueAt` solo usaba la fecha fija
con disparador `SCHEDULED`, y el automatismo pone `ON_JOIN`. La pantalla decía "cada año el 31 de
marzo" y la primera no vencía ese día — lo que el auditor lee y lo que el sistema hace no coincidían
el primer año.

Y la razón para dejarlo así era buena: estrenar la reinducción el 15 de marzo con vencimiento el 31
da dos semanas para que 1.060 personas la hagan. No había que elegir una de las dos, sino mirar
**cuánto falta**:

| Falta | Vence |
|---|---|
| más que la ventana (60 días) | **en la fecha de la campaña** |
| menos | a los 30 días de gracia |

El umbral es la **ventana de la propia recurrencia** y no un número suelto: es la misma antelación
con la que el motor abre las rondas siguientes, así que la primera se comporta como las demás en vez
de tener su propia excepción.

**Medido:** publicada el 2026-09-04, la primera ronda vence el **31 de marzo de 2027**.

## 6. Cuándo vuelve, y qué pasa si no la hizo

La ronda siguiente **no nace al terminar la anterior**: nace al entrar en la **ventana**, 60 días
antes de la fecha. Si naciera al completarla, quien la hace en abril tendría encima la de 2027 desde
abril.

Y si la anterior **no se hizo**, manda `defaultOnExpiry`. TRANSPRENSA usa **`CIERRA`**:

1. La de 2026 se cierra como **NO REALIZADA** — que **sí** cuenta como incumplimiento de ese
   periodo, a diferencia de retirada o eximida.
2. La de 2027 nace para todos.

Una sola obligación viva a la vez, y el historial guarda el incumplimiento del año que se falló. Las
otras dos políticas y el porqué, en `00-el-motor.md` §6.

**Medido de punta a punta el 2026-09-04** (`reinduccion-ciclos.mjs`), y ya no hace falta esperar a
2027 para verlo. El truco: la ventana en que nace la ronda siguiente está fijada en **60 días**, así
que con una recurrencia de **un mes** la ventana de la ronda 2 ya está abierta el día en que nace la
ronda 1. Es el mismo código que correrá en la campaña de 2027 —`generateForRule` no sabe si la
recurrencia es de un mes o de un año, solo compara `now` con `cycleOpensAt`—, sin tocar ninguna
fecha en la base ni simular ningún reloj.

| | |
|---|---|
| Ronda 1, sin hacer, al llegar la ventana | pasa a **`EXPIRED_NOT_DONE`** |
| Ronda 2 | nace `PENDING`, venciendo después que la anterior |
| Lo que debe el aprendiz | **una sola**: la del periodo en curso |
| Lo que lee el auditor | **«No realizada»**, y con su cifra propia en el resumen |

Lo que había antes —no abrir nada hasta que hiciera la anterior— hacía que **quien nunca la hace
desaparezca del denominador** de todos los años siguientes: el peor incumplidor salía de la cuenta y
la cobertura del año siguiente se veía mejor de lo que era.

### Y a quien SÍ la hacía le pasaba lo contrario (arreglado el 2026-09-05)

Ese recorrido prueba el camino de la que **no** se hizo. El de la que sí se hizo tenía un fallo que
solo tocaba a quien cumplía, y por eso es el más difícil de ver.

La ronda siguiente se contaba desde `completedAt`. En una campaña eso es falso: quien hace la
reinducción **el 20 de marzo la hace para el periodo que vence el 31**, no para el día 20. Con el
ancla en el día 20, la ocurrencia siguiente es el **31 de marzo del mismo año** —once días después—,
la ventana de 60 días ya está abierta, y al día siguiente de cumplir le nacía la **ronda 2 con el
mismo vencimiento que acababa de satisfacer**. Vencía el 1 de abril y se cerraba como NO REALIZADA
diez meses más tarde.

| Quién | Qué le pasaba |
|---|---|
| La hizo antes del 31 de marzo — **cumplió** | ronda 2 el 31, vencida el 1 de abril, NO REALIZADA en enero |
| La hizo tarde, o no la hizo | su ancla caía después del 31: la siguiente era la de 2027, **correcto** |

Ahora la campaña **ancla en el vencimiento de la ronda**, no en la fecha de completado
(`cycleAnchor`): lo que se satisface es el periodo. El aniversario —la recertificación— sigue
anclando en `completedAt`, que es su sentido entero.

**Esto no lo cubre ningún recorrido, y no puede.** Comprimir la recurrencia a un mes solo funciona
con `everyMonths`; el periodo de una campaña es el año del calendario. Lo prueban cinco unitarias
sobre las funciones reales de fecha (`due-date.spec.ts`).

## 7. El camino del aprendiz

Idéntico al de las otras dos: pendientes → inscripción → temario (lección, examen y encuesta al
final) → examen congelado → constancia.

## 8. Lo comprobado

| | |
|---|---|
| Publicar sobre 796 personas | **~2 s**, 796 de 796 obligadas |
| Sin corte de "solo nuevos" | correcto: lo contrario que la general |
| Una sola fecha de vencimiento | campaña, no aniversario |
| Ninguna nace vencida | guardia del recorrido, tras el fallo del 2026-09-03 |
| Quien entra después | también la debe, sola |
| Al aprobar | constancia con su código |
| Tras completarla | sigue con **una** ronda: la siguiente se abre cuando toque |

## 9. La configuración, que ya tiene pantalla

Desde el 2026-09-04, en **Configuración → Tipos de formación**:

- **Cómo se repite**: no se repite / cada año en fecha fija / **cada N meses desde que cada quien la
  hizo**. Lo tercero es la respuesta para un cliente que **no** trabaja por campaña, que los hay.
- **La fecha** de la campaña (03-31 para TRANSPRENSA), editable.
- **Qué pasa si llega la siguiente y no hizo la anterior**: cierra / acumula / espera.

Va en el TIPO y no en cada formación porque es política de **empresa**: si cada reinducción eligiera
su fecha, no habría "la reinducción de 2026" que enseñarle a un auditor. Una formación suelta puede
apartarse en Quiénes → Ajustar, y ahí queda con su novedad.

Y el aviso de Quiénes **lee esa configuración**, no la tiene fija: comprobado cambiando la fecha a
06-30 y viendo que la ficha de una reinducción la trae.

## 10. Lo que queda

Las dos primeras se **cerraron el 2026-09-04**:

1. ~~La primera ronda no cae en la fecha de la campaña~~ → ahora sí, si faltan más de 60 días (§5).
2. ~~La campaña alcanza a quien acaba de ingresar~~ → **quien ingresó hace menos de N meses queda
   fuera** (`exemptRecentHiresMonths` en el tipo; 6 para TRANSPRENSA). Su inducción **es** su
   actualización de ese año. Solo afecta a su PRIMERA ronda: a quien ya tiene historia con la regla
   la campaña anterior sí le tocó. **Medido:** de 1.071 personas, obliga a 747; 324 quedan fuera.
3. **Un renglón por ronda o por persona** en el Seguimiento (sigue abierta). Quien tiene una
   ronda cerrada y otra viva sale **dos veces**, y cuenta dos en el denominador del avance. Las dos
   lecturas se defienden:
   - *Por ronda* (lo de hoy): el informe es el historial de la formación y el incumplimiento del año
     pasado se ve. Precio: mezcla periodos, y quien lleve tres campañas sin hacerla arrastra hacia
     abajo el número del año en curso con historia vieja.
   - *Por persona*, la ronda vigente: responde "¿cómo va la campaña de ESTE año?", que es como
     pregunta el auditor. Precio: el incumplimiento cerrado desaparece de esta pantalla y hace falta
     un informe por periodo, que hoy no existe (Sprint 6).

Ninguna de las tres bloquea el piloto. Las tres cambian lo que el auditor lee, así que las decide el
cliente y no el código.

## 11. Estado: CERRADA

Los dos recorridos en verde, la configuración con pantalla, el aviso leyendo del tipo, y el fallo de
las obligaciones vencidas arreglado con su guardia permanente. Lo abierto son las tres decisiones de
arriba, ninguna de código.

**Ya no hay salvedad sobre "cierra y abre".** Estuvo probada solo con unitarias
(`next-cycle.spec.ts`, diez casos) hasta el 2026-09-04, con la nota de que haría falta esperar un
año o manipular fechas. Ni una cosa ni la otra: `reinduccion-ciclos.mjs` la ejerce de punta a punta
comprimiendo la recurrencia, no el reloj (§6).

Y al ejercerla apareció lo que las unitarias no podían ver: **el motor escribía NO REALIZADA y el
informe lo leía como "sin empezar"**, que dice justo lo contrario. Arreglado el mismo día — el
detalle, en `00-el-motor.md` §7 y en el RUNBOOK.
