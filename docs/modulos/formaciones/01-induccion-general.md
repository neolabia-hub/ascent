# Inducción general

*La formación del INGRESO. Lo común a todos los tipos está en `00-el-motor.md`; aquí solo lo que
distingue a ésta.*

Verificado de punta a punta por `scripts/recorridos/induccion-general.mjs` (10 pasos, en verde).
Los números son de la base de desarrollo.

---

## 1. Qué es

Lo que toda persona que entra a la empresa tiene que hacer **antes de empezar a trabajar**. D1072
art. 2.2.4.6.11 no dice "el primer día": dice **previa** al inicio de labores, y esa palabra
gobierna todo el comportamiento de este tipo.

**No es** la reinducción. La reinducción es la actualización anual de todos, otra formación con
contenido propio.

## 2. La configuración del tipo

```
requiresAssessment: true      requiresBeforeHire: true
issuesCertificate: true       defaultAssignmentMode: ON_HIRE
defaultOfferingKind: PERMANENT
```

`requiresBeforeHire: true` es la que decide casi todo lo de abajo.

## 3. Al publicar pasan DOS cosas solas

Nadie pulsa nada para ninguna de las dos:

1. **Nace UN requisito**, con `ON_HIRE`, vencimiento **−1 día** y **el corte de "solo a quien entre
   desde ahora"** puesto.
2. **Se abre UNA convocatoria permanente**, y el aprendiz puede empezar en el acto.

Son dos automatismos distintos. Si la convocatoria automática ya existe —aunque esté en
BORRADOR— no se crea otra; y si esa se queda en borrador, la formación queda publicada y **cerrada**,
porque inscribirse da `409 OFFERING_NOT_OPEN`.

En la pestaña **Quiénes** no hay botón de exigir, ni antes ni después de publicar: antes adelantaría
la obligación a una formación sin contenido, y después confirmaría lo único posible. Solo aparece al
pulsar **Ajustar**.

## 4. A quién obliga, y el corte

| | |
|---|---|
| Alcance | Toda la empresa |
| Corte de "solo nuevos" | **Puesto**, siempre |
| A cuántos obliga hoy | **Cero** — todos los que están entraron antes del corte |

**El corte es lo que la define.** Quien lleva siete años no está ingresando, así que no se le exige:
su inducción se hizo cuando entró, en papel, fuera del sistema. Decir que "la reinducción se la
cubre" era falso y estuvo escrito en cuatro pantallas hasta el 2026-09-04.

Por eso la pantalla **no** enseña "a cuántos alcanza" en este tipo: ese número sería el tamaño de la
audiencia, no a cuántos va a obligar —que es cero—, y las dos frases juntas se contradicen.

## 5. El orden de la carga inicial decide a quién le nace

Es la palanca del cliente, y no hay ninguna casilla que la controle:

- **Formaciones primero, personas después** (el plan del piloto de TRANSPRENSA): las personas se
  dan de alta *después* del corte, así que **a todas les nace la inducción general**, nuevas y
  antiguas. Es lo que el cliente pidió.
- **Personas primero, publicar después**: el corte deja fuera a toda la plantilla y solo la deben
  los ingresos futuros.

Conviene decirlo en voz alta antes de la carga: después no se deshace sin tocar la base.

## 6. Cuándo vence

Ancla en la **fecha de ingreso de cada persona**, no en una fecha común: es individual por
definición, porque tiene que ser antes de *su* primer día.

- Quien ingresa el 1 de diciembre → vence el **30 de noviembre**.
- Quien ingresa el 15 de marzo → vence el **14 de marzo**.

**La gracia.** A quien lleva años en la empresa, su fecha de ingreso ya pasó, así que la obligación
nacería vencida. No es cierto —la empresa no estaba incumpliendo, es que el sistema no existía— y
por eso, cuando la fecha calculada cae antes de que la obligación exista, se sustituye por **30 días
desde ahora**. A quien entra mañana no le afecta.

*Trampa de fecha, aprendida rompiéndola:* `hired_at` es columna de **solo fecha**. Aplicarle el
desfase de Bogotá como si fuera un instante la corre un día, y "ingresa el 1 de diciembre" se leía
como 30 de noviembre. Hay dos funciones separadas a propósito en `due-date.ts`.

## 7. El camino del aprendiz

1. La inducción le aparece en **sus pendientes** en cuanto se le crea la cuenta.
2. Se inscribe en la convocatoria permanente.
3. El temario llega con sus piezas — hoy **lección, examen y encuesta**, la encuesta la última: se
   opina después de hacerla, no antes.
4. Responde el **examen congelado**: publicar la formación congeló una COPIA, y el aprendiz responde
   la copia. Usar el id del borrador da `409 ASSESSMENT_NOT_PUBLISHED`.
5. Al aprobar se emite la **constancia** con su código de verificación.

## 8. Lo comprobado

| | |
|---|---|
| Con 770 personas en la base, el requisito obliga a | **cero** |
| Una persona creada **después** de publicar | recibe la obligación **sola** |
| Al aprobar | se emite la constancia con su código |
| La ronda siguiente | no existe: este tipo **no se repite** |

## 9. Lo que falta

Nada abierto de este tipo. Los pendientes que lo tocan son del motor
(`00-el-motor.md`, §9).
