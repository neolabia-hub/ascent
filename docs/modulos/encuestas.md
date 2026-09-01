# Encuestas

Cómo se mide si una capacitación **estuvo bien** (satisfacción) y si **sirvió de algo** (eficacia).

Decisiones #114, #116, #118, #119 y #121.

---

## 1. Dos instrumentos, no dos variantes

| | Satisfacción | Eficacia |
|---|---|---|
| **Quién responde** | Quien se formó, al terminar | **El jefe del área**, semanas después |
| **Qué pregunta** | ¿Se entendió? ¿Sirvió? ¿El instructor explicó bien? | ¿Aplica en su puesto lo que aprendió? |
| **Nivel de Kirkpatrick** | 1 — reacción | 3 — transferencia |
| **Quién lo exige** | BASC e ISO, como «evaluación de la capacitación» | ISO 9001, como «evaluación de la eficacia» |
| **Cuándo** | En el momento, dentro del reproductor | A los 30 días |
| **Consecuencia** | Alimenta el indicador | Un resultado negativo puede disparar un refuerzo |

Comparten tabla porque comparten forma —preguntas, respuestas, versión— y se separan en la interfaz
porque mezclarlas haría que alguien mandara a un jefe una encuesta escrita para el alumno.
«¿Le gustó la capacitación?» no se le puede preguntar a un jefe **sobre otra persona**.

> **Hoy la eficacia está apagada en todo.** El cliente pidió que por ahora los jefes no encuesten.
> El interruptor existe en Tipos de formación, apagado, para que la función quede cerrada: otro
> cliente la enciende y funciona, sin tocar código.

---

## 2. La satisfacción es UN instrumento de la empresa

**Una encuesta, reutilizada por todas las formaciones.** No una por formación.

Si cada formación tuviera preguntas distintas, «la satisfacción del plan 2026» no se podría
calcular: no habría nada comparable que promediar. Las mismas preguntas en todo es lo que hace que
los resultados signifiquen algo.

Lo normal es que una empresa tenga **una sola**. Tendría dos únicamente si de verdad pregunta cosas
distintas — por ejemplo una para formación virtual y otra para jornada presencial con instructor.

### Cómo llega a una formación

```
Configuración → Tipos de formación
  [x] Lleva encuesta   →   ¿cuál?  [Satisfacción de la formación ▾]
                                        │
        ┌───────────────────────────────┴───────────────────────────────┐
        │                                                               │
  AL CREAR la formación                                    AL PUBLICAR (red de seguridad)
  se añade como última pieza                     si el borrador no la trae, se engancha
  → se ve en Contenido desde el día uno          → cubre borradores viejos y quitados por error
```

**Se añade al crear** porque engancharla solo al publicar la hacía invisible: quien armaba la
formación veía su lista de contenido sin ella y no tenía forma de saber que iba a aparecer. Una
pieza que se añade sola sin avisar es una sorpresa, aunque sea correcta.

**Va la última** porque se responde después de haber visto todo. Una encuesta en mitad del contenido
pregunta por algo que aún no ha pasado.

**No es obligatoria** (`isRequired: false`), y esto es lo más importante del diseño: si lo fuera,
quien no responde se queda con la formación **sin terminar y sin constancia**. Se le negaría la
evidencia de una capacitación que sí hizo por no haber dado su opinión. Se pide y se agradece; no se
cobra.

### La evaluación NO se siembra igual, y es deliberado

Una encuesta es *el* instrumento de la empresa, idéntico en todas partes: sembrarla es poner algo
terminado. Una evaluación tiene sus propias preguntas en cada formación, así que sembrarla dejaría
un cascarón vacío que alguien tiene que rellenar — y una evaluación vacía publicada es peor que no
tener ninguna. La regla de publicación ya avisa de que falta.

---

## 3. Los tipos de pregunta

| Tipo | Cuenta para el indicador | Para qué |
|---|---|---|
| **Escala** 1–5 o 1–10 | **Sí**, se promedia | El 90% de una encuesta. Sin al menos una, no produce ningún número |
| **Sí / No** | **Sí**, y manda | Para lo binario de verdad. En eficacia es la que decide |
| **Una opción entre varias** | No | Segmenta, no mide. Se cuenta por opción |
| **Texto libre** | No | Donde aparece lo que nadie pensó preguntar |

**No hay opción múltiple** a propósito: una respuesta con tres marcas no se puede meter en un
indicador sin decidir arbitrariamente cuánto pesa cada una, y lo que no se puede agregar acaba
siendo una columna que nadie mira.

### Cómo se pinta una escala

`caras` · `estrellas` · `números`. **Es solo presentación**: el dato guardado es el mismo número en
las tres, así que una respondida con estrellas y otra con caras **se promedian juntas**.

- **Caras** — la mejor para personal operativo: se entiende sin leer. Son iconos, **nunca emoji**
  (regla dura del sistema de diseño).
- **Estrellas** — lo que la gente ya reconoce de otras aplicaciones. Se rellenan *hasta* la elegida.
- **Números** — la única honesta cuando la pregunta no es de agrado sino de cantidad.

Los **extremos van escritos** («Muy mal» / «Muy bien»): sin ellos, una cara sonriente puede leerse
como «me gustó» o como «mucho», y en una pregunta de cantidad son cosas distintas.

### La observación general

Va **siempre y al final**, y es **opcional**. Es donde aparece lo que nadie anticipó —«el video no
se oía en la bodega»—. Obligarla convertiría una encuesta de treinta segundos en un trámite, y lo
que se escribe por obligación es «ninguna».

---

## 4. Cómo se califica una respuesta

`apps/api/src/surveys/survey-grading.ts`

| Tipo | Cuenta | Umbral |
|---|---|---|
| Sí / No | **Manda** | Cualquier «no» → **NEGATIVA** |
| Escala | Se promedia sobre 5 | Media **< 3** → NEGATIVA |
| Texto | No cuenta | — |

**El binario manda sobre el promedio**, y ese orden importa. Un jefe que dice «no aplica lo
aprendido» pero puntúa 4 en las escalas —porque la formación en sí estuvo bien— tiene que dar
**negativo**: lo que se mide es la transferencia al puesto, no si la clase gustó. Con el promedio
mandando, ese caso saldría positivo y nadie reforzaría nada.

**Menos de 3 sobre 5 es negativo, no menos de 2,5.** En una escala de 1 a 5 el 3 es «regular», y una
capacitación regular no cumplió su objetivo. Poner el corte en la mitad exacta convertiría en
aprobado todo lo mediocre — que es justo lo que hay que detectar.

**NA** cuando no hay nada que medir (solo texto, o ninguna respondida). Es distinto de POSITIVO: un
indicador que cuenta los NA como buenos miente.

---

## 5. Quién responde la de eficacia

`apps/api/src/surveys/efficacy-evaluator.ts`

La pregunta no es técnica —«¿aplica lo que aprendió?»— es una **observación del trabajo diario**. Así
que el evaluador correcto no es quien más sabe del tema, es **quien la ve trabajar**.

```
1. Responsable del ÁREA de la persona          ← manda
2. Subiendo por el árbol de áreas               ← Bodega no tiene jefe → el de Logística
3. Responsable del PROCESO de la formación      ← respaldo
4. Nadie → no se programa, y se ve
```

### Por qué el área y no el proceso

| | Jefe del área | Responsable del proceso |
|---|---|---|
| ¿La ve trabajar? | Sí, todos los días | No |
| ¿A cuánta gente evaluaría? | A su equipo | A las 600 de la empresa |
| ¿Sabe del tema? | No necesariamente | Sí |

El coordinador de SST es dueño del proceso de casi toda la formación obligatoria. Si evaluara la
eficacia tendría que decir de seiscientas personas si aplican lo aprendido, y de la mayoría no ha
visto ni un turno. Lo que sale de ahí son seiscientos «sí» pulsados en fila — peor que no medir.

**Nadie se evalúa a sí mismo**: un jefe de área también hace sus formaciones, y su propia área lo
tiene a él como responsable. En ese caso se sube un nivel.

> Esto obligó a añadir `areas.responsible_user_id` (Decisión #115). Son **10 filas** que se llenan
> una vez, frente a un campo «jefe inmediato» por persona que habría que llenar 600 veces y mantener
> en cada traslado. Lo que no se mantiene queda viejo en silencio, y una encuesta enviada al jefe
> equivocado es peor que no enviarla.

---

## 6. La eficacia se decide por FORMACIÓN, no por tipo

Al revés que la satisfacción, y lo destapó el cliente: *«en el plan puede haber situaciones donde no
se requiere y en otras sí; pero si el plan la tiene marcada aplicará a todos»*.

Dentro del mismo tipo «Capacitación del plan» conviven:

| | ¿Eficacia? |
|---|---|
| Trabajo seguro en alturas | **Sí** — o usa el arnés como le enseñaron, o no |
| Actualización documental | **No** — preguntarle al jefe a los 30 días no dice nada |

Marcarla en el tipo mandaría las dos, y la segunda es ruido. Un jefe que recibe cuarenta encuestas
al mes las responde en fila.

**Cascada de tres estados**, la misma que la constancia: `null` hereda del tipo, `true`/`false`
deciden, y al publicar se congela en la versión. Por defecto **no** se mide: la eficacia es la
excepción, no la regla.

---

## 7. Versiones: por qué las preguntas son un JSON

Una encuesta se responde **tal como estaba el día que se respondió**. Con las preguntas en su propia
tabla, editar una redacción reescribiría el pasado: las respuestas guardadas apuntarían a un texto
que nadie leyó.

Cada respuesta congela `templateVersion`. **La versión sube cuando cambian las preguntas**, no
cuando se corrige el nombre — subirla en cada guardado llenaría el historial de versiones idénticas
y haría imposible saber cuál fue el cambio real.

Es la misma razón por la que la constancia guarda un snapshot (Decisión #14).

---

## 8. Reglas que no se pueden perder

- **Se responde UNA vez.** Volver a mostrarla en blanco invitaría a una segunda respuesta que
  contaría doble en el indicador. Es idempotente en el servidor: reenviar el mismo formulario no
  crea otra fila.
- **Lo incompleto se rechaza en el SERVIDOR**, no solo en la pantalla. Una encuesta a medias
  guardada como completa cuenta en el denominador como si se hubiera evaluado, y el auditor vería un
  porcentaje de evaluación que no es real.
- **No se puede borrar una encuesta con respuestas.** Esas respuestas son la evidencia de que se
  evaluó la capacitación. Se desactiva.
- **Solo se responde la propia.** Las rutas cuelgan de `/me` y operan sobre la sesión: no reciben un
  id de persona, que es lo que impide responder por otro.
- **Saltarla es una opción visible.** Esconderla obligaría a cerrar el navegador, y entonces la
  formación se queda a medias por una encuesta opcional.

---

## 9. Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Esquema de preguntas y respuestas | `packages/shared/src/schemas/survey.ts` |
| Calificación (positiva / negativa / NA) | `apps/api/src/surveys/survey-grading.ts` |
| Quién responde la de eficacia | `apps/api/src/surveys/efficacy-evaluator.ts` |
| Plantillas y respuestas | `apps/api/src/surveys/surveys.service.ts` |
| Enganche al crear y al publicar | `apps/api/src/activities/versioning.service.ts` |
| Constructor con vista previa | `apps/web/src/app/(admin)/configuracion/encuestas/page.tsx` |
| Cómo la ve quien responde | `apps/web/src/components/modules/learner/survey-runner.tsx` |
| Escenario de prueba | `apps/api/scripts/demo-encuesta.ts` |

**El componente que responde es UNO** y lo usan el reproductor y la vista previa del constructor.
Nunca duplicarlo: si fueran dos, la vista previa mentiría en cuanto una cambiara y quien diseña
publicaría confiando en ella.

---

## 10. Lo que falta

| Pendiente | Criticidad | Nota |
|---|---|---|
| La pantalla del **jefe** para responder la de eficacia | Media | El motor está; falta la bandeja y el aviso. No urge: la eficacia está apagada |
| El **programador** que crea la cita de eficacia a los N días | Media | `EfficacySchedule` existe en el esquema y nadie la escribe todavía |
| El **refuerzo automático** cuando la eficacia sale negativa | Baja | `SurveyResponse.followUpAssignmentId` está sembrado y sin usar |
| Agregación de resultados (satisfacción media por formación, por mes) | Media | Hoy se ve una a una en Seguimiento; falta el promedio |
